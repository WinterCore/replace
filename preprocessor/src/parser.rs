use std::path::PathBuf;

use chrono::{DateTime, NaiveDateTime, Utc};

use crate::year::{ActionKind, Point, RPlace2022, RPlace2023, RawAction, Year, detect_year};

pub trait PixelParser: Send + Sync {
    fn parse(&self, input: Vec<&str>) -> RawAction;
    fn dimensions(&self) -> (u16, u16);
}

pub fn create_parser(year: &Year) -> Box<dyn PixelParser> {
    match year {
        Year::RPlace2022 => Box::new(RPlace2022::default()),
        Year::RPlace2023 => Box::new(RPlace2023::default()),
    }
}

impl PixelParser for RPlace2022 {
    fn parse(&self, input: Vec<&str>) -> RawAction {
        let raw_timestamp = input.get(0).expect("Should read timestamp");
        let user_id = input.get(1).expect("Should read user ID").to_string();
        let color = input.get(2).expect("Should read color").to_string();
        let raw_coordinates = input.get(3).expect("Should read coordinates").trim_matches('"');

        let coords: Vec<&str> = raw_coordinates.split(',').collect();

        let timestamp = NaiveDateTime::parse_from_str(raw_timestamp, "%Y-%m-%d %H:%M:%S%.f UTC")
            .expect("Should parse timestamp")
            .and_utc()
            .timestamp_millis();

        // Single pixel placement
        if coords.len() == 2 {
            let x = coords[0].parse().expect("Should parse x coord");
            let y = coords[1].parse().expect("Should parse y coord");

            return RawAction {
                timestamp,
                user_id: user_id,
                action: ActionKind::Pixel { position: Point { x, y }, color: color }
            }
        }

        // Moderation rect
        if coords.len() == 4 {
            let x1 = coords[0].parse().expect("Should parse x1 coord");
            let y1 = coords[1].parse().expect("Should parse y1 coord");
            let x2 = coords[2].parse().expect("Should parse x2 coord");
            let y2 = coords[3].parse().expect("Should parse y2 coord");

            return RawAction {
                timestamp,
                user_id: user_id,
                action: ActionKind::RectFill {
                    top_left: Point { x: x1, y: y1 },
                    bottom_right: Point { x: x2, y: y2 },
                    color: color,
                },
            }
        }

        panic!("Unsupported record");
    }

    fn dimensions(&self) -> (u16, u16) {
        (self.width, self.height)
    }
}

impl PixelParser for RPlace2023 {
    fn parse(&self, input: Vec<&str>) -> RawAction {
        let raw_timestamp = input.get(0).expect("Should read timestamp");
        let user_id = input.get(1).expect("Should read user ID").to_string();
        let raw_coordinates = input
            .get(2)
            .expect("Should read coordinates")
            .trim_matches(|c| c == '{' || c == '}' || c == '"');
        let color = input.get(3).expect("Should read color").to_string();

        let timestamp = NaiveDateTime::parse_from_str(raw_timestamp, "%Y-%m-%d %H:%M:%S%.f UTC")
            .expect("Should parse timestamp")
            .and_utc()
            .timestamp_millis();

        let coords: Vec<&str> = raw_coordinates.split(',').collect();

        // Single pixel
        if coords.len() == 2 {
            let x = coords[0].parse::<i16>().expect("Should parse x") + self.origin.x as i16;
            let y = coords[1].parse::<i16>().expect("Should parse y") + self.origin.y as i16;
            assert!(x >= 0 && y >= 0);

            return RawAction {
                timestamp,
                user_id,
                action: ActionKind::Pixel { position: Point { x: x as u16, y: y as u16 }, color },
            }
        }

        // Moderation circle
        if coords.len() == 3 {
            let mut x = 0i16;
            let mut y = 0i16;
            let mut r = 0i16;

            for part in coords.iter() {
                let (key, val) = part.split_once(':').unwrap();
                let val = val.trim().parse().unwrap();
                match key.trim() {
                    "X" => x = val,
                    "Y" => y = val,
                    "R" => r = val,
                    _ => {}
                }
            }

            x += self.origin.x as i16;
            y += self.origin.y as i16;

            assert!(x >= 0 && y >= 0 && r >= 0);

            return RawAction {
                timestamp,
                user_id,
                action: ActionKind::CircleFill {
                    center: Point { x: x as u16, y: y as u16 },
                    radius: r as u16,
                    color,
                },
            }
        }

        // Moderation rect
        if coords.len() == 4 {
            let x1 = coords[0].parse::<i16>().expect("Should parse x1") + self.origin.x as i16;
            let y1 = coords[1].parse::<i16>().expect("Should parse y1") + self.origin.y as i16;
            let x2 = coords[2].parse::<i16>().expect("Should parse x2") + self.origin.x as i16;
            let y2 = coords[3].parse::<i16>().expect("Should parse y2") + self.origin.y as i16;

            assert!(x1 >= 0 && y1 >= 0 && x2 >= 0 && y2 >= 0);

            return RawAction {
                timestamp,
                user_id,
                action: ActionKind::RectFill {
                    top_left: Point { x: x1 as u16, y: y1 as u16 },
                    bottom_right: Point { x: x2 as u16, y: y2 as u16 },
                    color,
                },
            }
        }

        panic!("Unsupported record");
    }

    fn dimensions(&self) -> (u16, u16) {
        (self.width, self.height)
    }
}

pub fn expand(action: RawAction, width: u16, height: u16) -> Vec<PixelRecord> {
    match action.action {
        ActionKind::Pixel { position, color } => {
            if position.x >= width || position.y >= height {
                return vec![];
            }
            vec![PixelRecord {
                timestamp: action.timestamp,
                user_id: action.user_id,
                color,
                x: position.x,
                y: position.y,
            }]
        }
        ActionKind::RectFill { top_left, bottom_right, color } => {
            let mut records = Vec::new();
            let max_x = bottom_right.x.min(width - 1);
            let max_y = bottom_right.y.min(height - 1);
            for y in top_left.y..=max_y {
                for x in top_left.x..=max_x {
                    records.push(PixelRecord {
                        timestamp: action.timestamp,
                        user_id: action.user_id.clone(),
                        color: color.clone(),
                        x,
                        y,
                    });
                }
            }
            records
        }
        ActionKind::CircleFill { center, radius, color } => {
            let mut records = Vec::new();
            let r = radius as i32;
            let cx = center.x as i32;
            let cy = center.y as i32;
            for dy in -r..=r {
                for dx in -r..=r {
                    if dx * dx + dy * dy <= r * r {
                        let x = cx + dx;
                        let y = cy + dy;
                        if x >= 0 && y >= 0 && (x as u16) < width && (y as u16) < height {
                            records.push(PixelRecord {
                                timestamp: action.timestamp,
                                user_id: action.user_id.clone(),
                                color: color.clone(),
                                x: x as u16,
                                y: y as u16,
                            });
                        }
                    }
                }
            }
            records
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
pub struct PixelRecord {
    pub timestamp: i64,
    pub user_id: String,
    pub color: String,
    pub x: u16,
    pub y: u16,
}

impl PixelRecord {
    pub fn parse_intermediate(input: Vec<&str>) -> Option<PixelRecord> {
        let timestamp: i64 = input.get(0)?.parse().ok()?;
        let user_id = input.get(1)?;
        let color = input.get(2)?;
        let raw_coordinates = input.get(3)?;
        let (raw_x, raw_y) = raw_coordinates.split_once(',')?;

        Some(Self {
            timestamp,
            x: raw_x.parse().ok()?,
            y: raw_y.parse().ok()?,
            user_id: user_id.to_string(),
            color: color.to_string(),
        })
    }
}

pub struct ColorIndex(pub Vec<String>);

impl ColorIndex {
    pub fn new() -> Self {
        Self(Vec::with_capacity(128))
    }

    pub fn find_index(&self, needle: &str) -> Option<u8> {
        let normalized_needle = needle.to_lowercase();

        for (i, color) in self.0.iter().enumerate() {
            if normalized_needle == *color {
                return Some(i as u8);
            }
        }

        None
    }

    pub fn add(&mut self, color: &str) -> u8 {
        let normalized_color = color.to_lowercase();

        if let Some(index) = self.find_index(&normalized_color) {
            return index;
        }

        let index = self.0.len();
        self.0.push(normalized_color);

        return index as u8;
    }
}
