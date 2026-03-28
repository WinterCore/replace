use std::{fs::{File, create_dir_all}, io::{BufWriter, Write}, path::Path};

use crate::{canvas::CanvasPixelPlacement, parser::ColorIndex};

#[derive(Debug)]
pub struct PlaybackManifest {
    checkpoint_offsets: Vec<u64>, // in milliseconds
}

#[derive(Debug)]
pub struct Serializer<'a> {
    manifest: PlaybackManifest,
    out_folder: &'a str,
    index: u64,
    offset: u64,
}

impl<'a> Serializer<'a> {
    pub fn new(out_folder: &'a str) -> Self {
        create_dir_all(out_folder).expect("Should create output folder");

        Self {
            manifest: PlaybackManifest {
                checkpoint_offsets: vec![],
            },
            out_folder,
            index: 0,
            offset: 0,
        }
    }

    pub fn write_delta(
        &mut self,
        placements: &[CanvasPixelPlacement],
    ) {
        if placements.is_empty() || self.index == 0 {
          return;
        }

        let filename = format!("{:06}-delta.bin", self.index - 1);
        let path = Path::new(self.out_folder).join(filename);
        let file = File::create(path).expect("Should create file");
        let mut w = BufWriter::new(file);

        let mut last_offset = self.offset;

        for placement in placements {
            assert!(placement.relative_offset >= 0);
            let relative_offset = placement.relative_offset as u64 - self.offset;
            assert!(relative_offset <= u32::MAX as u64);
            let relative_offset_u32 = relative_offset as u32;

            w.write(&relative_offset_u32.to_le_bytes()).expect("Should write timestamp");
            w.write(&placement.x.to_le_bytes()).expect("Should write x");
            w.write(&placement.y.to_le_bytes()).expect("Should write y");
            w.write(&[placement.color_index]).expect("Should write color index");
            last_offset = placement.relative_offset as u64;
        }

        self.offset = last_offset;
    }

    pub fn write_checkpoint(
        &mut self,
        relative_offset: u64,
        pixels: &[u8]
    ) -> u64 {
        let filename = format!("{:06}.bin", self.index);
        let path = Path::new(self.out_folder).join(filename);
        let file = File::create(path).expect("Should create file");
        let mut wtr = BufWriter::new(file);

        wtr.write_all(pixels).expect("Should write checkpoint file");

        self.index += 1;
        self.manifest.checkpoint_offsets.push(relative_offset);
        self.offset = relative_offset;

        return self.index - 1;
    }

    pub fn write_manifest(&self, color_index: &ColorIndex) {
        let path = Path::new(self.out_folder).join("manifest.json");
        let file = File::create(path).expect("Should create manifest file");
        let mut w = BufWriter::new(file);

        let offsets: Vec<String> = self.manifest.checkpoint_offsets
            .iter()
            .map(|o| o.to_string())
            .collect();

        let colors: Vec<String> = color_index.0
          .iter()
          .map(|c| format!("\"{}\"", c))
          .collect();


        write!(w, "{{\"checkpoints\":[{}], \"color_index\":[{}]}}", offsets.join(","), colors.join(","))
            .expect("Should write manifest");
    }
}
