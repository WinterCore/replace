export type VariantType =
  | "traditional"
  | "traditional_flipped"
  | "traditional_glasses"
  | "traditional_glasses_flipped"
  | "traditional_backpack"
  | "traditional_backpack_flipped"
  | "short"
  | "short_flipped"
  | "short_glasses"
  | "short_glasses_flipped"
  | "short_backpack"
  | "short_backpack_flipped";

export interface TemplateCoord {
  readonly x: number;
  readonly y: number;
  readonly c: "body" | "visor" | "accent";
}

export interface Template {
  readonly type: VariantType;
  readonly coords: readonly TemplateCoord[];
  readonly context: readonly { readonly x: number; readonly y: number }[];
}

export interface PixelPosition {
  readonly x: number;
  readonly y: number;
}

export interface DetectedAmongi {
  readonly pixels: PixelPosition[];
  readonly certainty: number;
  readonly completeness: number;
}

export interface DetectionResult {
  readonly amongi: Record<VariantType, DetectedAmongi[]>;
}

export interface DetectRequest {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}
