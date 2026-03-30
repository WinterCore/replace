use flate2::read::MultiGzDecoder;
use std::fs::{File, read_dir};
use std::io::BufReader;
use std::path::PathBuf;

/**
 * This file is needed because the format of the raw data between
 * 2022 and 2023 is different which requires us to have two separate
 * code paths for certain things.
 */

#[derive(Debug, Copy, Clone)]
pub enum Year {
  RPlace2022,
  RPlace2023
}

pub fn detect_year(folder: PathBuf) -> Year {
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

    if timestamp.starts_with("2023") { Year::RPlace2023 }
    else if timestamp.starts_with("2022") { Year::RPlace2022 }
    else { panic!("Unsupported data: {}", timestamp) }
}

pub fn get_dimensions(year: &Year) -> (u32, u32) {
    match year {
        Year::RPlace2023 => (3000, 2000),
        Year::RPlace2022 => (2000, 2000),
    }
}
