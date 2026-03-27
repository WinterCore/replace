export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + (value - inMin) / (inMax - inMin) * (outMax - outMin);
}
