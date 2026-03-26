mod parser;
mod canvas;
mod serializer;

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

fn main() {
    let args: Vec<String> = env::args().collect();

     if args.len() < 2 {
        println!("Usage: program <raw r/place data folder>");
        return;
    }

    let folder = &args[1];
    let cwd = env::current_dir().unwrap();
    let full_path = cwd.join(folder);

    let mut files: Vec<String> = read_dir(full_path)
        .expect("Folder should be accessible")
        .filter_map(|entry| entry.ok())             // skip errors
        .map(|entry| entry.path())                  // get PathBuf
        .filter(|path| path.is_file())              // only files
        .filter(|path| path.extension().unwrap_or(OsStr::new("")) == "gzip")
        .filter_map(|path| canonicalize(path).ok()) // resolve full path
        .filter_map(|path| path.to_str().map(|s| s.to_string())) // convert to String
        .collect();

    files.sort();

    let width: u32 = 2000;
    let height: u32 = 2000;
    let mut serializer = Serializer::new("./data");
    let mut canvas = Canvas::new(2000, 2000);

    for path in files {
        let file = File::open(&path).expect("Should read file");
        let decoder = MultiGzDecoder::new(BufReader::new(file));

        let mut rdr = csv::ReaderBuilder::new().from_reader(decoder);
        
        // You would expect that whoever dumped the r/place data from reddit would at least sort 
        // the rows by timestamp but no!!! I had to spend 2 hours trying to figure out why my code
        // doesn't work because they turned out to be unsorted.
        let mut records: Vec<PixelRecord> = rdr.records()
            .map(|x| x.expect("Should read record"))
            .map(|x| PixelRecord::parse(x.into_iter().collect()))
            .collect();

        // Sort the pixel placements by timestamp. Wow, very hard!!!!!
        records.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        
        let mut last_timestamp: i64 = 0;

        for record in records {
            let delta_since_last_checkpoint = record.timestamp.timestamp_millis() - last_timestamp;
            if delta_since_last_checkpoint > 60 * 1000 || canvas.pixel_placements_buffer.len() >= 50_000 {
                let delta_changes_len = canvas.pixel_placements_buffer.len();
                serializer.write_delta(&canvas.pixel_placements_buffer);
                canvas.apply_placements_buffer();

                let index = serializer.write_checkpoint(&canvas.color_index, width, height, &canvas.pixels);
                last_timestamp = record.timestamp.timestamp_millis();
                println!("Wrote checkpoint {:?}, changes: {:?}, timestamp: {:?}", index, delta_changes_len, Utc.timestamp_millis_opt(last_timestamp));
            }

            canvas.process_pixel_record(&record);
        }

        let remaining_changes = canvas.pixel_placements_buffer.len();
        // Flush any remaining changes
        if remaining_changes > 0 {
            serializer.write_delta(&canvas.pixel_placements_buffer);
            canvas.apply_placements_buffer();
            let index = serializer.write_checkpoint(&canvas.color_index, width, height, &canvas.pixels);
            println!("Wrote checkpoint {:?}, changes: {:?}, timestamp: {:?}", index, remaining_changes, Utc.timestamp_millis_opt(last_timestamp));
        }

        println!("---------------------------------------------------\nFinished {:?}", Path::new(&path).file_name().unwrap());
    }
}
