use chrono::{DateTime, NaiveDateTime, Utc};

use crate::detect::{Year, get_dimensions};

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

    pub fn parse(year: &Year, input: Vec<&str>) -> Option<PixelRecord> {
        match year {
            Year::RPlace2022 => {
                let raw_timestamp = input.get(0).expect("Should read timestamp");
                let user_id = input.get(1).expect("Should read user ID");
                let color = input.get(2).expect("Should read color");
                let raw_coordinates = input.get(3).expect("Should read coordinates");

                let (raw_x, raw_y) = raw_coordinates.split_once(',').expect("Should contain x/y coordinates");

                Some(Self {
                    x: raw_x.parse().unwrap_or(0),
                    y: raw_y.parse().unwrap_or(0),
                    timestamp: NaiveDateTime::parse_from_str(raw_timestamp, "%Y-%m-%d %H:%M:%S%.f UTC")
                        .expect("Should parse timestamp").and_utc()
                        .timestamp_millis(),
                    user_id: user_id.to_string(),
                    color: color.to_string(),
                })
            },
            Year::RPlace2023 => {
                let raw_timestamp = input.get(0).expect("Should read timestamp");
                let user_id = input.get(1).expect("Should read user ID");
                let raw_coordinates = input.get(2).expect("Should read coordinates").trim_matches('"');
                let color = input.get(3).expect("Should read color");

                let coords: Vec<&str> = raw_coordinates.split(',').collect();

                // Skip moderation writes
                if coords.len() != 2 {
                  return None
                }

                let (width, height) = get_dimensions(year);

                let x = coords[0].parse::<i16>().unwrap_or(0) + (width as i32 / 2) as i16;
                let y = coords[1].parse::<i16>().unwrap_or(0) + (height as i32 / 2) as i16;

                assert!(x >= 0 && y >= 0);

                Some(Self {
                    x: x as u16,
                    y: y as u16,
                    timestamp: NaiveDateTime::parse_from_str(raw_timestamp, "%Y-%m-%d %H:%M:%S%.f UTC")
                        .expect("Should parse timestamp").and_utc()
                        .timestamp_millis(),
                    user_id: user_id.to_string(),
                    color: color.to_string(),
                })
            },
        }
    }
}

pub struct ColorIndex(pub Vec<String>);

impl ColorIndex {
    pub fn new() -> Self {
        Self (Vec::with_capacity(128))
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
