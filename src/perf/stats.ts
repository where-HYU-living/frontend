export type FrameSummary = { p50: number; p95: number; fps: number };

const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

export function summarizeFrames(ms: number[]): FrameSummary {
  if (!ms.length) return { p50: 0, p95: 0, fps: 0 };
  const s = [...ms].sort((a, b) => a - b);
  const p50 = at(s, 0.5);
  return { p50, p95: at(s, 0.95), fps: 1000 / p50 };
}
