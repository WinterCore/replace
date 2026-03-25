mod parser;
mod canvas;
mod serializer;

use flate2::read::MultiGzDecoder;
use std::fs::File;
use std::io::BufReader;
use std::thread::sleep;
use std::time::Duration;

use crate::canvas::Canvas;
use crate::parser::{ColorIndex, PixelRecord};
use crate::serializer::Serializer;

const CHECKPOINT_INTERVAL: u64 = 5 * 1000; // 5 seconds

fn main() {
    let file = File::open("/home/winter/Downloads/2022_place_canvas_history-000000000001.csv.gzip").expect("Should read file");
    let decoder = MultiGzDecoder::new(BufReader::new(file));

    let mut rdr = csv::ReaderBuilder::new().from_reader(decoder);

    let mut serializer = Serializer::new("./data");
    let width: u32 = 2000;
    let height: u32 = 2000;
    let mut canvas = Canvas::new(2000, 2000);
    
    let mut offset: i64 = 0;
    let mut next_checkpoint: i64 = 0;

    for result in rdr.records() {
        if offset >= next_checkpoint {
            println!("Creating checkpoint with {:?} placements.", canvas.pixel_placements_buffer.len());
            println!("Offset: {:?}, Next Checkpoint: {:?}", offset, next_checkpoint);
            canvas.apply_placements_buffer();

            serializer.write_checkpoint(&canvas.color_index, width, height, &canvas.pixels);
            next_checkpoint += CHECKPOINT_INTERVAL as i64;
        }

        let raw_record = result.expect("Should read record");
        let columns: Vec<&str> = raw_record.into_iter().collect();
        let pixel_record = PixelRecord::parse(columns);

        let placement = canvas.process_pixel_record(&pixel_record);
        // canvas.apply_placements_buffer();
        // println!("xy: {:?} | {:?}", canvas.pixels[1048 * 2000 + 826], 65210);
        // println!("color index: {:?}", canvas.color_index.0);
        // sleep(Duration::from_millis(100));
        offset = placement.offset;
    }
    
    println!("Len: {:?}", canvas.pixel_placements_buffer.len())
}
