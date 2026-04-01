import type { Template, TemplateCoord, VariantType } from "./types";

const SURROUNDING = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

function calculateContext(
  coords: readonly TemplateCoord[]
): { x: number; y: number }[] {
  const context: { x: number; y: number }[] = [];
  const coordSet = new Set(coords.map((c) => `${c.x},${c.y}`));
  const seen = new Set<string>();

  for (const coord of coords) {
    for (const s of SURROUNDING) {
      const x = coord.x + s.x;
      const y = coord.y + s.y;
      const key = `${x},${y}`;
      if (seen.has(key) || coordSet.has(key)) continue;
      seen.add(key);
      context.push({ x, y });
    }
  }

  return context;
}

function createTemplate(
  type: VariantType,
  coords: readonly TemplateCoord[]
): Template {
  return { type, coords, context: calculateContext(coords) };
}

function flip(base: Template, flippedType: VariantType): Template {
  const maxX = Math.max(
    ...base.coords.filter((c) => c.y === 0).map((c) => c.x)
  );
  const flippedCoords = base.coords.map((c) => ({
    x: Math.abs(c.x - maxX),
    y: c.y,
    c: c.c,
  }));
  return createTemplate(flippedType, flippedCoords);
}

// --- Base template coordinates ---

const TRADITIONAL_COORDS: readonly TemplateCoord[] = [
  { x: 0, y: 0, c: "body" },
  { x: 1, y: 0, c: "body" },
  { x: 2, y: 0, c: "body" },
  { x: -1, y: 1, c: "body" },
  { x: 0, y: 1, c: "body" },
  { x: 1, y: 1, c: "visor" },
  { x: 2, y: 1, c: "visor" },
  { x: -1, y: 2, c: "body" },
  { x: 0, y: 2, c: "body" },
  { x: 1, y: 2, c: "body" },
  { x: 2, y: 2, c: "body" },
  { x: 0, y: 3, c: "body" },
  { x: 1, y: 3, c: "body" },
  { x: 2, y: 3, c: "body" },
  { x: 0, y: 4, c: "body" },
  { x: 2, y: 4, c: "body" },
];

const TRADITIONAL_GLASSES_COORDS: readonly TemplateCoord[] = [
  { x: 0, y: 0, c: "body" },
  { x: 1, y: 0, c: "body" },
  { x: 2, y: 0, c: "body" },
  { x: -1, y: 1, c: "body" },
  { x: 0, y: 1, c: "body" },
  { x: 1, y: 1, c: "visor" },
  { x: 2, y: 1, c: "accent" },
  { x: -1, y: 2, c: "body" },
  { x: 0, y: 2, c: "body" },
  { x: 1, y: 2, c: "body" },
  { x: 2, y: 2, c: "body" },
  { x: 0, y: 3, c: "body" },
  { x: 1, y: 3, c: "body" },
  { x: 2, y: 3, c: "body" },
  { x: 0, y: 4, c: "body" },
  { x: 2, y: 4, c: "body" },
];

const TRADITIONAL_BACKPACK_COORDS: readonly TemplateCoord[] = [
  { x: 0, y: 0, c: "body" },
  { x: 1, y: 0, c: "body" },
  { x: 2, y: 0, c: "body" },
  { x: -1, y: 1, c: "accent" },
  { x: 0, y: 1, c: "body" },
  { x: 1, y: 1, c: "visor" },
  { x: 2, y: 1, c: "visor" },
  { x: -1, y: 2, c: "accent" },
  { x: 0, y: 2, c: "body" },
  { x: 1, y: 2, c: "body" },
  { x: 2, y: 2, c: "body" },
  { x: 0, y: 3, c: "body" },
  { x: 1, y: 3, c: "body" },
  { x: 2, y: 3, c: "body" },
  { x: 0, y: 4, c: "body" },
  { x: 2, y: 4, c: "body" },
];

const SHORT_COORDS: readonly TemplateCoord[] = [
  { x: 0, y: 0, c: "body" },
  { x: 1, y: 0, c: "body" },
  { x: 2, y: 0, c: "body" },
  { x: -1, y: 1, c: "body" },
  { x: 0, y: 1, c: "body" },
  { x: 1, y: 1, c: "visor" },
  { x: 2, y: 1, c: "visor" },
  { x: -1, y: 2, c: "body" },
  { x: 0, y: 2, c: "body" },
  { x: 1, y: 2, c: "body" },
  { x: 2, y: 2, c: "body" },
  { x: 0, y: 3, c: "body" },
  { x: 2, y: 3, c: "body" },
];

const SHORT_GLASSES_COORDS: readonly TemplateCoord[] = [
  { x: 0, y: 0, c: "body" },
  { x: 1, y: 0, c: "body" },
  { x: 2, y: 0, c: "body" },
  { x: -1, y: 1, c: "body" },
  { x: 0, y: 1, c: "body" },
  { x: 1, y: 1, c: "visor" },
  { x: 2, y: 1, c: "accent" },
  { x: -1, y: 2, c: "body" },
  { x: 0, y: 2, c: "body" },
  { x: 1, y: 2, c: "body" },
  { x: 2, y: 2, c: "body" },
  { x: 0, y: 3, c: "body" },
  { x: 2, y: 3, c: "body" },
];

const SHORT_BACKPACK_COORDS: readonly TemplateCoord[] = [
  { x: 0, y: 0, c: "body" },
  { x: 1, y: 0, c: "body" },
  { x: 2, y: 0, c: "body" },
  { x: -1, y: 1, c: "accent" },
  { x: 0, y: 1, c: "body" },
  { x: 1, y: 1, c: "visor" },
  { x: 2, y: 1, c: "visor" },
  { x: -1, y: 2, c: "accent" },
  { x: 0, y: 2, c: "body" },
  { x: 1, y: 2, c: "body" },
  { x: 2, y: 2, c: "body" },
  { x: 0, y: 3, c: "body" },
  { x: 2, y: 3, c: "body" },
];

// --- Assemble templates ---

const traditional = createTemplate("traditional", TRADITIONAL_COORDS);
const traditionalGlasses = createTemplate("traditional_glasses", TRADITIONAL_GLASSES_COORDS);
const traditionalBackpack = createTemplate("traditional_backpack", TRADITIONAL_BACKPACK_COORDS);
const short = createTemplate("short", SHORT_COORDS);
const shortGlasses = createTemplate("short_glasses", SHORT_GLASSES_COORDS);
const shortBackpack = createTemplate("short_backpack", SHORT_BACKPACK_COORDS);

// Order matters: check larger variants first to avoid partial matches.
export const VARIANTS: readonly Template[] = [
  traditional,
  flip(traditional, "traditional_flipped"),
  short,
  flip(short, "short_flipped"),
  traditionalGlasses,
  flip(traditionalGlasses, "traditional_glasses_flipped"),
  shortGlasses,
  flip(shortGlasses, "short_glasses_flipped"),
  traditionalBackpack,
  flip(traditionalBackpack, "traditional_backpack_flipped"),
  shortBackpack,
  flip(shortBackpack, "short_backpack_flipped"),
];
