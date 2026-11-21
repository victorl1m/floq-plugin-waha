// Dependency-free QR code encoder: byte mode (UTF-8), error correction level M, versions 1-20. Returns the module matrix (true = dark).
// Follows ISO/IEC 18004: Reed-Solomon over GF(256) with 0x11D, interleaved blocks, zigzag placement, eight masks scored by the four penalty rules.

/** Error correction codewords per block and number of blocks, indexed by version (level M). */
const EC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
export const QR_MAX_VERSION = 20;

const rawModules = (v: number): number => {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) { const a = Math.floor(v / 7) + 2; n -= (25 * a - 10) * a - 55; if (v >= 7) n -= 36; }
  return n;
};
const dataWords = (v: number) => Math.floor(rawModules(v) / 8) - EC_PER_BLOCK[v] * BLOCKS[v];

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsRemainder(data: number[], degree: number): number[] {
  let gen = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(gen.length + 1).fill(0);
    gen.forEach((c, j) => { next[j] ^= mul(c, EXP[i]); next[j + 1] ^= c; });
    gen = next;
  }
  // gen is lowest degree first with an implicit leading 1 at the end
  const rem = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[degree - 1 - i], f);
  }
  return rem;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) === 1;

/** Version needed for `n` bytes, or 0 when it does not fit. */
export function qrVersionFor(n: number): number {
  for (let v = 1; v <= QR_MAX_VERSION; v++) if (4 + (v < 10 ? 8 : 16) + 8 * n <= dataWords(v) * 8) return v;
  return 0;
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const lines: string[] = [];
  for (let y = 0; y < n; y++) lines.push(m[y].map((d) => (d ? "1" : "0")).join(""));
  for (let x = 0; x < n; x++) lines.push(m.map((r) => (r[x] ? "1" : "0")).join(""));
  for (const s of lines) {
    for (const r of s.matchAll(/0{5,}|1{5,}/g)) score += 3 + r[0].length - 5;
    for (const p of ["10111010000", "00001011101"]) for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) score += 40;
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  let dark = 0;
  for (const r of m) for (const d of r) if (d) dark++;
  const total = n * n;
  return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The QR matrix of `text` (UTF-8 bytes, level M). `mask` forces one of the eight masks (tests); otherwise the lowest penalty wins. Throws when the text is too long. */
export function qrMatrix(text: string, opts: { mask?: number } = {}): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  const v = qrVersionFor(bytes.length);
  if (!v) throw new Error("QR text too long");
  const size = 17 + 4 * v;

  // 1. data codewords
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  const cap = dataWords(v) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // 2. blocks, error correction, interleave
  const nb = BLOCKS[v], ec = EC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8), shortLen = Math.floor(raw / nb), nShort = nb - (raw % nb);
  const blocks: number[][] = [], eccs: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen - ec + (i < nShort ? 0 : 1);
    const d = data.slice(k, k + len); k += len;
    blocks.push(d); eccs.push(rsRemainder(d, ec));
  }
  const out: number[] = [];
  for (let i = 0; i < blocks[nb - 1].length; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of eccs) out.push(e[i]);

  // 3. function patterns
  const m: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  if (v > 1) {
    const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    pos.forEach((cy, i) => pos.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
  }
  const format = (mask: number) => {
    let rem = mask; // level M = 0b00
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((mask << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true);
  };
  format(0);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (v << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); }
  }

  // 4. zigzag data placement
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < out.length * 8) { m[y][x] = bit(out[i >>> 3], 7 - (i & 7)); i++; }
    }
  }

  // 5. mask
  const apply = (mask: number) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x]; };
  let best = opts.mask !== undefined && opts.mask >= 0 && opts.mask < 8 ? opts.mask : -1, lowest = Infinity;
  if (best < 0) {
    for (let mask = 0; mask < 8; mask++) {
      apply(mask); format(mask);
      const p = penalty(m);
      if (p < lowest) { lowest = p; best = mask; }
      apply(mask);
    }
  }
  apply(best); format(best);
  return m;
}

/** SVG path data of the dark modules (one run per row), offset by the quiet zone. Draw it on a white square of side matrix.length + 2 * quiet. */
export function qrPath(m: boolean[][], quiet = 4): string {
  let d = "";
  m.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let n = 1;
      while (x + n < row.length && row[x + n]) n++;
      d += `M${x + quiet} ${y + quiet}h${n}v1h-${n}z`;
      x += n;
    }
  });
  return d;
}
