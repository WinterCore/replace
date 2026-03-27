mod parser;
mod canvas;
mod serializer;
mod sorter;

use chrono::{TimeZone, Utc};
use csv::StringRecord;
use flate2::read::MultiGzDecoder;
use std::env;
use std::ffi::OsStr;
use std::fs::{File, canonicalize, read_dir};
use std::io::BufReader;
use std::path::Path;
use std::thread::sleep;
use std::time::Duration;

use crate::canvas::Canvas;
use crate::parser::PixelRecord;
use crate::serializer::Serializer;
use crate::sorter::Sorter;

fn main() {
    let args: Vec<String> = env::args().collect();

     if args.len() < 2 {
        println!("Usage: program <raw r/place data folder>");
        return;
    }

    let folder = &args[1];

    let sorter = Sorter::new(folder.into());
    let iter = sorter.run();

    let width: u32 = 2000;
    let height: u32 = 2000;
    let mut serializer = Serializer::new("./data");
    let mut canvas = Canvas::new(2000, 2000);

    let mut last_checkpoint_absolute_timestamp: i64 = 0;

    for record in iter {
        let delta_since_last_checkpoint = record.timestamp - last_checkpoint_absolute_timestamp;

        if delta_since_last_checkpoint > 60 * 1000 || canvas.pixel_placements_buffer.len() >= 50_000 {
            let delta_changes_len = canvas.pixel_placements_buffer.len();
            serializer.write_delta(&canvas.pixel_placements_buffer);
            canvas.apply_placements_buffer();

            // End of gap
            let checkpoint_offset = record.timestamp - canvas.start_timestamp.unwrap_or(record.timestamp);

            let index = serializer.write_checkpoint(
                checkpoint_offset as u64,
                &canvas.color_index,
                width,
                height,
                &canvas.pixels
            );
            last_checkpoint_absolute_timestamp = record.timestamp;
            println!("Wrote checkpoint {:?}, changes: {:?}, timestamp: {:?}", index, delta_changes_len, Utc.timestamp_millis_opt(last_checkpoint_absolute_timestamp));
        }

        canvas.process_pixel_record(&record);


        // println!("---------------------------------------------------\nFinished {:?}", Path::new(&path).file_name().unwrap());
    }

    let remaining_changes = canvas.pixel_placements_buffer.len();
    // Flush any remaining changes
    if remaining_changes > 0 {
        serializer.write_delta(&canvas.pixel_placements_buffer);
        let last_offset = canvas.pixel_placements_buffer.last().unwrap().relative_offset;
        canvas.apply_placements_buffer();
        let index = serializer.write_checkpoint(
            last_offset as u64,
            &canvas.color_index,
            width,
            height,
            &canvas.pixels
        );
        println!("Wrote checkpoint {:?}, changes: {:?}, timestamp: {:?}", index, remaining_changes, Utc.timestamp_millis_opt(last_checkpoint_absolute_timestamp));
    }

    serializer.write_manifest(&canvas.color_index);
    println!("Done!");
}
