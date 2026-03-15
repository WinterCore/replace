use flate2::read::{GzDecoder, MultiGzDecoder};
use std::fs::File;
use std::io::BufReader;

fn main() {
    let file = File::open("/Users/winter/Documents/rplace-2022/2022_place_canvas_history-000000000001.csv.gzip").expect("Should read file");
    let decoder = MultiGzDecoder::new(BufReader::new(file));

    let mut rdr = csv::ReaderBuilder::new().from_reader(decoder);

    for result in rdr.records().count() {
        let record = result.expect("Should read record");

        println!("{:?}", record);
    }
}
