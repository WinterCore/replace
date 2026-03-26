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
        let filename = format!("{:04}-delta.bin", self.index);
        let path = Path::new(self.out_folder).join(filename);
        let file = File::create(path).expect("Should create file");
        let mut w = BufWriter::new(file);

        let mut last_offset = self.offset;

        for placement in placements {
            if placement.offset < 0 {
                println!("UNEXPECTED PLACEMENT {:?}", placement);
            }
            assert!(placement.offset >= 0);
            let relative_offset = placement.offset as u64 - self.offset;
            assert!(relative_offset <= u16::MAX as u64);

            w.write(&placement.offset.to_le_bytes()).expect("Should write timestamp");
            w.write(&placement.x.to_le_bytes()).expect("Should write x");
            w.write(&placement.y.to_le_bytes()).expect("Should write y");
            w.write(&[placement.color_index]).expect("Should write color index");
            last_offset = placement.offset as u64;
        }

        self.offset = last_offset;
    }

    pub fn write_checkpoint(
        &mut self,
        color_index: &ColorIndex,
        width: u32,
        height: u32,
        pixels: &[u8]
    ) -> u64 {
        let filename = format!("{:04}.png", self.index);
        let path = Path::new(self.out_folder).join(filename);
        let file = File::create(path).expect("Should create file");
        let w = BufWriter::new(file);

        let mut encoder = png::Encoder::new(w, width, height);

        let mut palette: Vec<u8> = vec![];
        for color in color_index.0.iter() {
            assert!(color.starts_with("#"));
            assert!(color.len() == 7);
            let red = u8::from_str_radix(&color[1..3], 16).expect("Should parse red");
            let green = u8::from_str_radix(&color[3..5], 16).expect("Should parse red");
            let blue = u8::from_str_radix(&color[5..7], 16).expect("Should parse red");

            palette.extend_from_slice(&[red, green, blue]);
        }

        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_palette(palette); // flat [R,G,B,R,G,B,...] for each color

        let mut writer = encoder.write_header().expect("Should write checkpoint PNG header");
        writer.write_image_data(&pixels).expect("Should write checkpoint file");
        self.index += 1;
        self.manifest.checkpoint_offsets.push(self.offset);

        return self.index - 1;
    }
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};

    // Import everything from outer scope
    use super::*;

    #[test]
    fn test_write_png() {
        
    }
}
