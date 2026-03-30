use std::{
    fs::{create_dir_all, File},
    io::{BufWriter, Write},
    path::Path,
};

use crate::{
    canvas::CanvasPixelPlacement,
    detect::{get_dimensions, Year},
    parser::ColorIndex,
};

#[derive(Debug)]
pub struct PlaybackManifest {
    checkpoint_offsets: Vec<u64>, // in milliseconds
}

#[derive(Debug)]
pub struct Serializer<'a, 'b> {
    year: &'b Year,
    manifest: PlaybackManifest,
    out_folder: &'a str,
    index: u64,
    offset: u64,
}

impl<'a, 'b> Serializer<'a, 'b> {
    pub fn new(year: &'b Year, out_folder: &'a str) -> Self {
        create_dir_all(out_folder).expect("Should create output folder");

        Self {
            year,
            out_folder,
            index: 0,
            offset: 0,
            manifest: PlaybackManifest {
                checkpoint_offsets: vec![],
            },
        }
    }

    pub fn write_delta(&mut self, placements: &[CanvasPixelPlacement]) {
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

            w.write(&relative_offset_u32.to_le_bytes())
                .expect("Should write timestamp");
            w.write(&placement.x.to_le_bytes()).expect("Should write x");
            w.write(&placement.y.to_le_bytes()).expect("Should write y");
            w.write(&[placement.color_index])
                .expect("Should write color index");
            last_offset = placement.relative_offset as u64;
        }

        self.offset = last_offset;
    }

    pub fn write_checkpoint(
        &mut self,
        relative_offset: u64,
        color_index: &ColorIndex,
        pixels: &[u8],
    ) -> u64 {
        let filename = format!("{:06}", self.index);

        let bin_path = Path::new(self.out_folder).join(format!("{}.bin", filename));
        let file = File::create(bin_path).expect("Should create file");
        let mut wtr = BufWriter::new(file);

        wtr.write_all(pixels).expect("Should write checkpoint file");

        let png_path = Path::new(self.out_folder).join(format!("{}.png", filename));
        let png_file = File::create(png_path).expect("Should create debug PNG file");
        let png_writer = BufWriter::new(png_file);

        let (width, height) = get_dimensions(self.year);
        let mut encoder = png::Encoder::new(png_writer, width, height);

        let mut palette: Vec<u8> = Vec::with_capacity(color_index.0.len() * 3);
        for color in color_index.0.iter() {
            assert!(color.starts_with('#'));
            assert!(color.len() == 7);

            let red = u8::from_str_radix(&color[1..3], 16).expect("Should parse red");
            let green = u8::from_str_radix(&color[3..5], 16).expect("Should parse green");
            let blue = u8::from_str_radix(&color[5..7], 16).expect("Should parse blue");

            palette.extend_from_slice(&[red, green, blue]);
        }

        encoder.set_color(png::ColorType::Indexed);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_palette(palette);

        let mut writer = encoder
            .write_header()
            .expect("Should write checkpoint PNG header");
        writer
            .write_image_data(pixels)
            .expect("Should write checkpoint PNG data");

        self.index += 1;
        self.manifest.checkpoint_offsets.push(relative_offset);
        self.offset = relative_offset;

        return self.index - 1;
    }

    pub fn write_manifest(&self, color_index: &ColorIndex) {
        let path = Path::new(self.out_folder).join("manifest.json");
        let file = File::create(path).expect("Should create manifest file");
        let mut w = BufWriter::new(file);

        let offsets: Vec<String> = self
            .manifest
            .checkpoint_offsets
            .iter()
            .map(|o| o.to_string())
            .collect();

        let colors: Vec<String> = color_index.0.iter().map(|c| format!("\"{}\"", c)).collect();

        let (width, height) = get_dimensions(&self.year);

        let length = self.manifest.checkpoint_offsets.last().copied().unwrap_or(0);

        write!(
            w,
            "{{\"checkpoints\":[{}], \"color_index\":[{}], \"width\": {}, \"height\": {}, \"length\": {}}}",
            offsets.join(","),
            colors.join(","),
            width,
            height,
            length
        )
        .expect("Should write manifest");
    }
}
