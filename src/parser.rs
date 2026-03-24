use chrono::{DateTime, NaiveDateTime, Utc};

pub struct PixelRecord {
    pub timestamp: DateTime<Utc>,
    pub user_id: String,
    pub color: String,
    pub x: u16,
    pub y: u16,
}

impl PixelRecord {
    pub fn parse(input: Vec<&str>) -> PixelRecord {
        let raw_timestamp = input.get(0).expect("Should read timestamp");
        let user_id = input.get(1).expect("Should read user ID");
        let color = input.get(2).expect("Should read color");
        let raw_coordinates = input.get(3).expect("Should read coordinates");

        let (raw_x, raw_y) = raw_coordinates.split_once(',').expect("Should contain x/y coordinates");

        Self {
            x: raw_x.parse().expect("Should parse x coordinate"),
            y: raw_y.parse().expect("Should parse y coordinate"),
            timestamp: NaiveDateTime::parse_from_str(
                raw_timestamp,
                "%Y-%m-%d %H:%M:%S%.3f UTC"
            ).expect("Should parse timestamp").and_utc(),
            user_id: user_id.to_string(),
            color: color.to_string(),
        }
    }
}

pub struct ColorIndex(Vec<String>);

impl ColorIndex {
    pub fn new() -> Self {
        Self (Vec::with_capacity(128))
    }

    pub fn find_index(&self, needle: &str) -> Option<u8> {
        for (i, color) in self.0.iter().enumerate() {
            if needle == color {
                return Some(i as u8);
            }
        }
        
        None
    }

    pub fn add(&mut self, color: &str) -> u8 {
        if let Some(index) = self.find_index(color) {
            return index;
        }
        
        let index = self.0.len();
        self.0.push(color.to_owned());

        return index as u8;
    }
}
