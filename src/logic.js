// Pure puzzle logic for one pyramid tier.
export const EMPTY = 0, STONE = 1, GOLD = 2, GRANITE = 3;

export class Tier {
  constructor(size, index) {
    this.size = size;
    this.index = index;
    this.cells = new Uint8Array(size * size);
    this.ankhs = new Set();
    this.rowsDone = new Set();
    this.colsDone = new Set();
  }
  idx(i, j) { return j * this.size + i; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.size && j < this.size; }
  get(i, j) { return this.cells[this.idx(i, j)]; }
  emptyCount() { let n = 0; for (const c of this.cells) if (c === EMPTY) n++; return n; }
  full() { return this.emptyCount() === 0; }

  canPlace(cells, ai, aj) {
    for (const [x, y] of cells) {
      const i = ai + x, j = aj + y;
      if (!this.inside(i, j) || this.get(i, j) !== EMPTY) return false;
    }
    return true;
  }

  anyFit(cells) {
    for (let aj = 0; aj < this.size; aj++)
      for (let ai = 0; ai < this.size; ai++)
        if (this.canPlace(cells, ai, aj)) return [ai, aj];
    return null;
  }

  // Place and report what the move achieved.
  place(cells, ai, aj, kind) {
    const placed = [];
    const ankhs = [];
    for (const [x, y] of cells) {
      const i = ai + x, j = aj + y, k = this.idx(i, j);
      this.cells[k] = kind;
      placed.push([i, j]);
      if (this.ankhs.has(k)) { this.ankhs.delete(k); ankhs.push([i, j]); }
    }
    const rows = [], cols = [];
    for (const [i, j] of placed) {
      if (!this.rowsDone.has(j)) {
        let ok = true;
        for (let x = 0; x < this.size; x++) if (this.get(x, j) === EMPTY) { ok = false; break; }
        if (ok) { this.rowsDone.add(j); rows.push(j); }
      }
      if (!this.colsDone.has(i)) {
        let ok = true;
        for (let y = 0; y < this.size; y++) if (this.get(i, y) === EMPTY) { ok = false; break; }
        if (ok) { this.colsDone.add(i); cols.push(i); }
      }
    }
    return { placed, ankhs, rows, cols, complete: this.full() };
  }

  // Seeded layout of granite blocks and ankh tiles.
  setup(granite, ankhs, rnd) {
    const n = this.size;
    const free = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) free.push([i, j]);
    const take = () => free.splice(Math.floor(rnd() * free.length), 1)[0];
    for (let g = 0; g < granite && free.length > 4; g++) {
      const [i, j] = take();
      this.cells[this.idx(i, j)] = GRANITE;
    }
    // granite might already complete a line (only possible on tiny tiers) - mark it as done
    for (let j = 0; j < n; j++) { let ok = true; for (let i = 0; i < n; i++) if (!this.get(i, j)) ok = false; if (ok) this.rowsDone.add(j); }
    for (let i = 0; i < n; i++) { let ok = true; for (let j = 0; j < n; j++) if (!this.get(i, j)) ok = false; if (ok) this.colsDone.add(i); }
    for (let a = 0; a < ankhs && free.length > 1; a++) {
      const [i, j] = take();
      this.ankhs.add(this.idx(i, j));
    }
  }
}

export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
