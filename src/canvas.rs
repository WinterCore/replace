use chrono::{DateTime, Utc};

use crate::parser::{ColorIndex, PixelRecord};

#[derive(Debug, Clone)]
pub struct CanvasPixelPlacement {
    pub offset: i64,
    pub color_index: u8,
    pub x: u16,
    pub y: u16,
}

pub struct Canvas {
    pub start_timestamp: Option<i64>,
    pub width: u32,
    pub height: u32,

    // Current state of the canvas
    pub pixels: Vec<u8>,

    pub color_index: ColorIndex,

    pub pixel_placements_buffer: Vec<CanvasPixelPlacement>,
}


impl Canvas {
    pub fn new(width: u32, height: u32) -> Self {
        let mut color_index = ColorIndex::new();
        let white_index = color_index.add("#ffffff");

        let pixels = vec![white_index; (width as usize) * (height as usize)];

        Self {
            start_timestamp: None,
            pixels,
            color_index,
            pixel_placements_buffer: Vec::with_capacity(50_000),
            width,
            height,
        }
    }
    
    pub fn process_pixel_record(&mut self, record: &PixelRecord) -> CanvasPixelPlacement {
        let start_timestamp = match self.start_timestamp {
            None => {
                let ts = record.timestamp.timestamp_millis();
                self.start_timestamp = Some(ts);
                ts
            },
            Some(start_timestamp) => start_timestamp,
        };

        let color_index = self.color_index.add(&record.color);
        let placement = CanvasPixelPlacement {
            offset: record.timestamp.timestamp_millis() - start_timestamp,
            x: record.x,
            y: record.y,
            color_index,
        };

        self.pixel_placements_buffer.push(placement.clone());

        return placement;
    }

    pub fn apply_placements_buffer(&mut self) {
        for item in self.pixel_placements_buffer.iter() {
            let idx = item.y as usize * self.width as usize + item.x as usize;
            self.pixels[idx] = item.color_index;
            // println!("x: {:?}, y: {:?}, index: {:?} = {:?} | {:?}", item.x, item.y, item.color_index, self.pixels[idx], idx);
        }

        self.pixel_placements_buffer.truncate(0);
    }
}

#[cfg(test)]
mod tests {
    // Import everything from outer scope
    use super::*;

    #[test]
    fn test_add() {
        let canvas = Canvas::new(4, 4);
    }
}
