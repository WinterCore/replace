use std::{cmp::Ordering, collections::BinaryHeap, env, ffi::OsStr, fs::{File, canonicalize, create_dir_all, read_dir, remove_dir_all}, io::{BufReader, BufWriter}, path::{Path, PathBuf}, thread, time::{SystemTime, UNIX_EPOCH}};

use chrono::DateTime;
use csv::{Reader, StringRecord};
use flate2::read::MultiGzDecoder;

use crate::parser::PixelRecord;

pub struct Sorter {
    input_folder: PathBuf,
    working_folder: PathBuf
}

impl Sorter {
    pub fn new(input_folder: PathBuf) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();

        let tmp_root = Path::new("./tmp");
        let _ = remove_dir_all(tmp_root);
        let working_folder = tmp_root.join(unique.to_string());
        create_dir_all(&working_folder).expect("Should create working folder");

        Self {
            input_folder,
            working_folder,
        }
    }

    fn get_input_file_paths(&self) -> Vec<PathBuf> {
        let cwd = env::current_dir().unwrap();
        let full_path = cwd.join(&self.input_folder);

        let files: Vec<PathBuf> = read_dir(full_path)
            .expect("Folder should be accessible")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| path.is_file())
            .filter(|path| path.extension().unwrap_or(OsStr::new("")) == "gzip")
            .filter_map(|path| canonicalize(path).ok())
            .collect();

        return files;
    }

    fn sort_file(&self, file: &PathBuf) -> PathBuf {
        println!("Sorting file {:?}", file.file_name().unwrap());
        let file_name = file.file_name().expect("Should get filename");
        let input_file = File::open(&file).expect("Should open input file");
        let decoder = MultiGzDecoder::new(BufReader::new(input_file));
        let mut rdr = csv::ReaderBuilder::new().from_reader(decoder);

        let output_file_path = Path::new(&self.working_folder).join(&file_name);
        let output_file = File::create(&output_file_path).expect("Should open output file");
        let writer = BufWriter::new(output_file);
        let mut wtr = csv::WriterBuilder::new().from_writer(writer);

        // Read
        let mut pixel_records: Vec<PixelRecord> = rdr.records()
            .map(|x| x.expect("Should read record"))
            .map(|x| PixelRecord::parse(x.into_iter().collect()))
            .collect();

        // Sort
        pixel_records.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));


        // Write
        for pixel_record in pixel_records {
            let mut record = StringRecord::new();

            let coords = format!("{},{}", pixel_record.x, pixel_record.y);
            let timestamp = DateTime::from_timestamp_millis(pixel_record.timestamp).expect("Should create timestamp").format("%Y-%m-%d %H:%M:%S%.f UTC");
            record.push_field(&timestamp.to_string());
            record.push_field(&pixel_record.user_id);
            record.push_field(&pixel_record.color);
            record.push_field(&coords);

            wtr.write_record(&record).expect("Should write sorted record");
        }


        output_file_path
    }

    fn stream_merge_sort(&self, sorted_files: &[PathBuf]) -> impl Iterator<Item = PixelRecord> {
        // Open all sorted files
        let files: Vec<Reader<BufReader<File>>> = sorted_files
            .iter()
            .map(|path| File::open(path).expect("Should open sorted file"))
            .map(|file| BufReader::new(file))
            .map(|reader| csv::ReaderBuilder::new().from_reader(reader))
            .collect();

        MergedRecords::new(files)
    }

    pub fn run(&self) -> impl Iterator<Item = PixelRecord> {
        let files = self.get_input_file_paths();

        let mut sorted_files: Vec<PathBuf> = vec![];
        let batch_size = 20;
        let batch_count = files.len().div_ceil(batch_size);

        for batch in 0..batch_count {
            let chunk: Vec<&PathBuf> = files.iter().skip(batch * batch_size).take(batch_size).collect();

            let chunk_output = thread::scope(|s| {
                let handles: Vec<_> = chunk.iter().map(|file| s.spawn(|| self.sort_file(file))).collect();
                let results: Vec<PathBuf> = handles
                  .into_iter()
                  .map(|h| h.join().unwrap())
                  .collect();

                results
            });

            sorted_files.extend_from_slice(&chunk_output);
        }

        self.stream_merge_sort(&sorted_files)
    }
}

#[derive(Debug, Eq, PartialEq)]
struct HeapEntry {
    record: PixelRecord,
    file_index: usize,
}

impl Ord for HeapEntry {
    fn cmp(&self, other: &Self) -> Ordering {
        other.record.timestamp.cmp(&self.record.timestamp)
    }
}

impl PartialOrd for HeapEntry {
  fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
      Some(self.cmp(other))
  }
}


struct MergedRecords {
    files: Vec<Reader<BufReader<File>>>,
    heap: BinaryHeap<HeapEntry>
}

impl MergedRecords {
    pub fn new(mut files: Vec<Reader<BufReader<File>>>) -> Self {
        let mut heap = BinaryHeap::new();

        for (index, file) in files.iter_mut().enumerate() {
            let record = match Self::read_record(file) {
                None => continue,
                Some(x) => x,
            };

            heap.push(HeapEntry {
                record,
                file_index: index,
            });
        }

        Self {
            files,
            heap,
        }
    }

    pub fn read_record(reader: &mut Reader<BufReader<File>>) -> Option<PixelRecord> {
        let mut record = StringRecord::new();
        match reader.read_record(&mut record) {
            Ok(true) => Some(PixelRecord::parse(record.into_iter().collect())),
            _ => None,
        }
    }
}

impl Iterator for MergedRecords {
    type Item = PixelRecord;

    fn next(&mut self) -> Option<Self::Item> {
        let HeapEntry { record, file_index } = match self.heap.pop() {
            None => return None, // We're done
            Some(x) => x,
        };
        
        // Replace removed entry
        if let Some(record) = Self::read_record(&mut self.files[file_index]) {
            self.heap.push(HeapEntry {
                record,
                file_index
            });
        }

        Some(record)
    }
}
