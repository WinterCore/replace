import type {
  DetectedAmongi,
  DetectionResult,
  PixelPosition,
  Template,
  VariantType,
} from "./types";
import { VARIANTS } from "./templates";

type UsedMatrix = Record<number, Record<number, true>>;

function getRgb(data: Uint8Array, width: number, x: number, y: number): number {
  const offset = (y * width + x) * 3;
  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

function isInBounds(
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

interface MatchResult {
  positions: PixelPosition[];
  bodyColor: number;
  completeness: number;
}

const MIN_COMPLETENESS = 0.5;

/** Original fast bail-early exact matching */
function tryExactMatch(
  data: Uint8Array,
  width: number,
  height: number,
  template: Template,
  startX: number,
  startY: number,
  used: UsedMatrix,
): MatchResult | null {
  if (!isInBounds(startX, startY, width, height)) return null;

  const slotColors = new Map<string, number>();
  const assignedColors = new Set<number>();
  const positions: PixelPosition[] = [];

  for (const coord of template.coords) {
    const x = startX + coord.x;
    const y = startY + coord.y;

    if (!isInBounds(x, y, width, height)) return null;
    if (used[x]?.[y]) return null;

    const color = getRgb(data, width, x, y);

    const slot = coord.c;
    if (!slotColors.has(slot) && !assignedColors.has(color)) {
      slotColors.set(slot, color);
      assignedColors.add(color);
    }
    if (slotColors.get(slot) !== color) return null;

    positions.push({ x, y });
  }

  return { positions, bodyColor: slotColors.get("body")!, completeness: 1.0 };
}

/** Tolerant matching with color voting — allows partial pixel mismatches */
function tryTolerantMatch(
  data: Uint8Array,
  width: number,
  height: number,
  template: Template,
  startX: number,
  startY: number,
  used: UsedMatrix,
): MatchResult | null {
  if (!isInBounds(startX, startY, width, height)) return null;

  // All pixels must be in bounds and unused
  for (const coord of template.coords) {
    const x = startX + coord.x;
    const y = startY + coord.y;
    if (!isInBounds(x, y, width, height)) return null;
    if (used[x]?.[y]) return null;
  }

  // Vote on most frequent color per slot
  const slotColorCounts = new Map<string, Map<number, number>>();

  for (const coord of template.coords) {
    const x = startX + coord.x;
    const y = startY + coord.y;
    const color = getRgb(data, width, x, y);
    const slot = coord.c;

    let counts = slotColorCounts.get(slot);
    if (!counts) {
      counts = new Map();
      slotColorCounts.set(slot, counts);
    }
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }

  const slotColors = new Map<string, number>();
  const assignedColors = new Set<number>();

  for (const [slot, counts] of slotColorCounts) {
    let bestColor = -1;
    let bestCount = 0;
    for (const [color, count] of counts) {
      if (count > bestCount) {
        bestColor = color;
        bestCount = count;
      }
    }
    if (bestColor === -1) continue;
    if (assignedColors.has(bestColor)) return null;
    slotColors.set(slot, bestColor);
    assignedColors.add(bestColor);
  }

  if (!slotColors.has("body")) return null;

  // Count color matches
  const positions: PixelPosition[] = [];
  let matched = 0;

  for (const coord of template.coords) {
    const x = startX + coord.x;
    const y = startY + coord.y;
    const color = getRgb(data, width, x, y);

    if (slotColors.get(coord.c) === color) {
      positions.push({ x, y });
      matched++;
    }
  }

  const completeness = matched / template.coords.length;
  if (completeness < MIN_COMPLETENESS) return null;

  return { positions, bodyColor: slotColors.get("body")!, completeness };
}

function markUsed(used: UsedMatrix, positions: PixelPosition[]): void {
  for (const { x, y } of positions) {
    if (!used[x]) used[x] = {};
    used[x][y] = true;
  }
}

function calculateCertainty(
  data: Uint8Array,
  width: number,
  height: number,
  template: Template,
  startX: number,
  startY: number,
  bodyColor: number
): number {
  let total = 0;
  let bodyCount = 0;

  for (const offset of template.context) {
    const x = startX + offset.x;
    const y = startY + offset.y;
    if (!isInBounds(x, y, width, height)) continue;

    if (getRgb(data, width, x, y) === bodyColor) bodyCount++;
    total++;
  }

  if (total === 0) return 0;
  return (total - bodyCount) / total;
}

type MatchFn = (
  data: Uint8Array,
  width: number,
  height: number,
  template: Template,
  startX: number,
  startY: number,
  used: UsedMatrix,
) => MatchResult | null;

function scanPass(
  data: Uint8Array,
  width: number,
  height: number,
  used: UsedMatrix,
  result: Record<VariantType, DetectedAmongi[]>,
  matchFn: MatchFn,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (used[x]?.[y]) continue;

      for (const template of VARIANTS) {
        const match = matchFn(data, width, height, template, x, y, used);
        if (match === null) continue;

        markUsed(used, match.positions);

        const certainty = calculateCertainty(
          data, width, height, template, x, y, match.bodyColor
        );

        result[template.type].push({
          pixels: match.positions,
          certainty,
          completeness: match.completeness,
        });
        break;
      }
    }
  }
}

export function detect(
  data: Uint8Array,
  width: number,
  height: number
): DetectionResult {
  const used: UsedMatrix = {};
  const result: Record<VariantType, DetectedAmongi[]> = {
    short: [],
    short_backpack: [],
    short_backpack_flipped: [],
    short_flipped: [],
    short_glasses: [],
    short_glasses_flipped: [],
    traditional: [],
    traditional_backpack: [],
    traditional_backpack_flipped: [],
    traditional_flipped: [],
    traditional_glasses: [],
    traditional_glasses_flipped: [],
  };

  // Pass 1: exact matches (fast bail-early) claim pixels first
  scanPass(data, width, height, used, result, tryExactMatch);
  // Pass 2: tolerant matches (color voting) on remaining pixels
  scanPass(data, width, height, used, result, tryTolerantMatch);

  return { amongi: result };
}
