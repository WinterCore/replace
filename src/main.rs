mod parser;
mod canvas;

use flate2::read::{GzDecoder, MultiGzDecoder};
use std::fs::File;
use std::io::BufReader;

fn main() {
    let file = File::open("/home/winter/Downloads/2022_place_canvas_history-000000000000.csv.gzip").expect("Should read file");
    let decoder = MultiGzDecoder::new(BufReader::new(file));

    let mut rdr = csv::ReaderBuilder::new().from_reader(decoder);
    println!("{:?}", rdr.headers().expect("exists"));

    for result in rdr.records().skip(1000).take(1) {
        let record = result.expect("Should read record");
        let columns: Vec<&str> = record.into_iter().collect();

        println!("{:?}", record);
    }
}
