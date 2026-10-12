/** Deterministic mulberry32 generator, so RANSAC runs are reproducible in tests and demos. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fills `out` with distinct indices in [0, size). Assumes out.length is much smaller than size. */
export function sampleDistinct(size: number, random: () => number, out: Int32Array): void {
  for (let i = 0; i < out.length; i += 1) {
    let candidate: number;
    let duplicate: boolean;
    do {
      candidate = Math.floor(random() * size);
      duplicate = false;
      for (let j = 0; j < i; j += 1) {
        if (out[j] === candidate) {
          duplicate = true;
          break;
        }
      }
    } while (duplicate);
    out[i] = candidate;
  }
}
