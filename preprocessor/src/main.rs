mod canvas;
mod year;
mod parser;
mod serializer;
mod sorter;

use chrono::{TimeZone, Utc};
use std::env;
use std::path::PathBuf;

use crate::canvas::Canvas;
use crate::parser::create_parser;
use crate::serializer::Serializer;
use crate::sorter::Sorter;
use crate::year::detect_year;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        println!("Usage: program [raw data folder]");
        return;
    }

    let folder = PathBuf::from(&args[1]);
    let year = detect_year(&folder);
    let parser = create_parser(&year);
    let (width, height) = parser.dimensions();

    let sorter = Sorter::new(parser.as_ref(), folder);
    let iter = sorter.run();

    let output_folder = format!("../app/public/{}", year.get_folder_name());
    let mut serializer = Serializer::new(width, height, &output_folder);
    let mut canvas = Canvas::new(width as u32, height as u32);

    let mut last_checkpoint_absolute_timestamp: i64 = 0;

    for record in iter {
        let delta_since_last_checkpoint = record.timestamp - last_checkpoint_absolute_timestamp;

        if delta_since_last_checkpoint > 3 * 60 * 1000
            || canvas.pixel_placements_buffer.len() >= 200_000
        {
            let delta_changes_len = canvas.pixel_placements_buffer.len();
            serializer.write_delta(&canvas.pixel_placements_buffer);
            canvas.apply_placements_buffer();

            // End of gap
            let checkpoint_offset =
                record.timestamp - canvas.start_timestamp.unwrap_or(record.timestamp);

            let index = serializer.write_checkpoint(
                checkpoint_offset as u64,
                &canvas.color_index,
                &canvas.pixels,
            );
            last_checkpoint_absolute_timestamp = record.timestamp;
            println!(
                "Wrote checkpoint {:?}, changes: {:?}, timestamp: {:?}",
                index,
                delta_changes_len,
                Utc.timestamp_millis_opt(last_checkpoint_absolute_timestamp)
            );
        }

        canvas.process_pixel_record(&record);

        // println!("---------------------------------------------------\nFinished {:?}", Path::new(&path).file_name().unwrap());
    }

    let remaining_changes = canvas.pixel_placements_buffer.len();
    // Flush any remaining changes
    if remaining_changes > 0 {
        serializer.write_delta(&canvas.pixel_placements_buffer);
        let last_offset = canvas
            .pixel_placements_buffer
            .last()
            .unwrap()
            .relative_offset;
        canvas.apply_placements_buffer();
        let index =
            serializer.write_checkpoint(last_offset as u64, &canvas.color_index, &canvas.pixels);
        println!(
            "Wrote checkpoint {:?}, changes: {:?}, timestamp: {:?}",
            index,
            remaining_changes,
            Utc.timestamp_millis_opt(last_checkpoint_absolute_timestamp)
        );
    }

    serializer.write_manifest(&canvas.color_index);
    sorter.cleanup();
    println!("Done!");
}
