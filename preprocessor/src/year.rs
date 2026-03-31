use flate2::read::MultiGzDecoder;
use std::fs::{read_dir, File};
use std::io::BufReader;
use std::path::PathBuf;

/**
 * This file is needed because the format of the raw data between
 * 2022 and 2023 is different which requires us to have two separate
 * code paths for certain things.
 */

#[derive(Debug)]
pub struct Point {
  pub x: u16,
  pub y: u16,
}

#[derive(Debug)]
pub struct RPlace2022 {
  pub width: u16,
  pub height: u16,
}

#[derive(Debug)]
pub struct RPlace2023 {
  pub width: u16,
  pub height: u16,
  pub origin: Point,
}

impl Default for RPlace2022 {
  fn default() -> Self {
      Self { width: 2000, height: 2000 }
  }
}

impl Default for RPlace2023 {
  fn default() -> Self {
      Self {
        width: 3000,
        height: 2000,
        origin: Point {
          x: 1500,
          y: 1000,
        },
      }
  }
}

#[derive(Debug, Copy, Clone)]
pub enum Year {
    RPlace2022,
    RPlace2023,
}

impl Year {
    pub fn get_folder_name(&self) -> String {
        match self {
            Self::RPlace2022 => "2022-data".to_string(),
            Self::RPlace2023 => "2023-data".to_string(),
        }
    }
}

#[derive(Debug)]
pub struct RawAction {
    pub timestamp: i64,
    pub user_id: String,
    pub action: ActionKind,
}

#[derive(Debug)]
pub enum ActionKind {
    Pixel { position: Point, color: String },
    CircleFill { center: Point, radius: u16, color: String },
    RectFill { top_left: Point, bottom_right: Point, color: String },
}

pub fn detect_year(folder: &PathBuf) -> Year {
    let first_file = read_dir(folder)
        .expect("Should read folder")
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.extension().map_or(false, |ext| ext == "gzip"))
        .expect("Should find at least one gzip file");

    let file = File::open(first_file).expect("Should open file");
    let decoder = MultiGzDecoder::new(BufReader::new(file));
    let mut rdr = csv::ReaderBuilder::new().from_reader(decoder);
    let record = rdr.records().next().unwrap().unwrap();
    let timestamp: &str = &record[0];

    if timestamp.starts_with("2023") {
        Year::RPlace2023
    } else if timestamp.starts_with("2022") {
        Year::RPlace2022
    } else {
        panic!("Unsupported data: {}", timestamp)
    }
}
