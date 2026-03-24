use chrono::{DateTime, Utc};

use crate::parser::{ColorIndex, PixelRecord};

pub struct CanvasPixelPlacement {
    pub timestamp: DateTime<Utc>,
    pub user_id: String,
    pub color: String,
    pub x: u16,
    pub y: u16,
}

impl From<PixelRecord> for CanvasPixelPlacement {
    fn from(value: PixelRecord) -> Self {
        Self {
            timestamp: value.timestamp,
            user_id: value.user_id,
            color: value.color,
            x: value.x,
            y: value.y,
        }
    }
}

pub struct Canvas {
    width: u16,
    height: u16,

    // Current state of the canvas
    pixels: Vec<u8>,

    color_index: ColorIndex,

    pixel_placements_buffer: Vec<CanvasPixelPlacement>,
}


impl Canvas {
    pub fn new(width: u16, height: u16) -> Self {
        Self {
            pixels: Vec::with_capacity(2000 * 2000),
            color_index: ColorIndex::new(),
            pixel_placements_buffer: Vec::with_capacity(50_000),
            width,
            height,
        }
    }
    
    pub fn process_pixel_record(&mut self, record: PixelRecord) {        
        self.pixel_placements_buffer.push(CanvasPixelPlacement {
            timestamp: record.timestamp,
            user_id: record.user_id,
            color: record.color,
            x: record.x,
            y: record.y,
        });
    }

    pub fn apply_placements_buffer(&mut self) {
        for item in self.pixel_placements_buffer.iter() {
            let index = self.color_index.add(&item.color);

            self.pixels[(item.y * self.width + item.x) as usize] = index;
        }

        self.pixel_placements_buffer.truncate(0);
    }
}


