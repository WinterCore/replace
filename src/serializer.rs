use std::{fs::{File, create_dir_all}, io::BufWriter, path::Path};

use crate::parser::ColorIndex;

pub struct Serializer<'a> {
    out_folder: &'a str,
    index: u64,
}

impl<'a> Serializer<'a> {
    pub fn new(out_folder: &'a str) -> Self {
        create_dir_all(out_folder).expect("Should create output folder");

        Self {
            out_folder,
            index: 0,
        }
    }

    pub fn write_checkpoint(
        &mut self,
        color_index: &ColorIndex,
        width: u32,
        height: u32,
        pixels: &[u8]
    ) {
        let filename = format!("{:04}.png", self.index);
        let path = Path::new(self.out_folder).join(filename);
        let file = File::create(path).expect("Should create file");
        let ref mut w = BufWriter::new(file);

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
    }
}
