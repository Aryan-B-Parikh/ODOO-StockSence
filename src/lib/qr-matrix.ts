/**
 * StockSense — deterministic pseudo-QR dot matrix (FNV-1a seeded).
 *
 * The same seed always renders the same 12×12 matrix, so a rack's on-screen
 * "QR sticker" (dashboard rack floor plan) and its printed label are
 * identical. Purely decorative in this demo — a real deployment would encode
 * the location URL, but the plan only requires printable stickers that map to
 * the zone/rack/shelf hierarchy.
 */

const SIZE = 12
const CELLS = SIZE * SIZE

/** Finder-pattern corner regions (top-left, top-right, bottom-left). */
function isFinder(r: number, c: number): boolean {
  return (r < 3 && c < 3) || (r < 3 && c > SIZE - 4) || (r > SIZE - 4 && c < 3)
}

/**
 * Generate a deterministic 144-cell boolean matrix for a seed string.
 * `true` = ink (dark module), `false` = paper (light module).
 */
export function generateQrMatrix(seed: string): boolean[] {
  // FNV-1a hash of the seed
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  // xorshift-ish stream → pseudo-random but stable dots
  const cells: boolean[] = []
  let a = h >>> 0
  for (let i = 0; i < CELLS; i++) {
    a = (Math.imul(a ^ (a >>> 15), 1 | a) | 0) >>> 0
    cells.push(((a ^ (a >>> 13)) & 1) === 1)
  }
  // Carve the three finder corners: solid blocks with white separation gaps.
  return cells.map((on, i) => {
    const r = Math.floor(i / SIZE)
    const c = i % SIZE
    if (!isFinder(r, c)) return on
    const gap =
      (r === 1 && c > 0 && c < SIZE - 1) || c === 1 || (r === SIZE - 2 && c < 3)
    return !gap
  })
}

export const QR_SIZE = SIZE
