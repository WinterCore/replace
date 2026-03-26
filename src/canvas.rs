use crate::parser::{ColorIndex, PixelRecord};

#[derive(Debug, Clone, Eq, PartialEq)]
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
    use chrono::{Duration, Utc};

    // Import everything from outer scope
    use super::*;

    #[test]
    fn test_process_pixel_record_adds_it_to_buffer() {
        let mut canvas = Canvas::new(4, 4);

        let now = Utc::now();

        canvas.process_pixel_record(&PixelRecord {
            timestamp: now,
            user_id: "a".to_string(),
            color: "#ff0000".to_string(),
            x: 1,
            y: 1,
        });

        canvas.process_pixel_record(&PixelRecord {
            timestamp: now + Duration::seconds(2),
            user_id: "b".to_string(),
            color: "#000000".to_string(),
            x: 1,
            y: 1,
        });

        canvas.process_pixel_record(&PixelRecord {
            timestamp: now + Duration::seconds(4),
            user_id: "c".to_string(),
            color: "#FFFFFF".to_string(),
            x: 0,
            y: 0,
        });
        
        assert_eq!(canvas.color_index.0, vec!["#ffffff", "#ff0000", "#000000"]);
        assert_eq!(canvas.pixel_placements_buffer[0],
            CanvasPixelPlacement {
                offset: 0,
                color_index: 1,
                x: 1,
                y: 1,
            },
        );
        assert_eq!(canvas.pixel_placements_buffer[1],
            CanvasPixelPlacement {
                offset: 2000,
                color_index: 2,
                x: 1,
                y: 1,
            },
        );
        assert_eq!(canvas.pixel_placements_buffer[2],
            CanvasPixelPlacement {
                offset: 4000,
                color_index: 0,
                x: 0,
                y: 0,
            },
        );

        canvas.apply_placements_buffer();

        assert_eq!(canvas.pixel_placements_buffer.len(), 0);

        assert_eq!(canvas.pixels, vec![
            0, 0, 0, 0,
            0, 2, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
        ]);

        canvas.process_pixel_record(&PixelRecord {
            timestamp: now + Duration::seconds(5),
            user_id: "c".to_string(),
            color: "#0000FF".to_string(),
            x: 3,
            y: 3,
        });

        canvas.apply_placements_buffer();

        assert_eq!(canvas.pixels, vec![
            0, 0, 0, 0,
            0, 2, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 3,
        ]);
    }
}
