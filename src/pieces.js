// Polyomino stones. Cells are [x, y] grid offsets; x -> world X, y -> world Z.
export const SHAPES = {
  o1: [[0, 0]],
  i2: [[0, 0], [1, 0]],
  i3: [[0, 0], [1, 0], [2, 0]],
  l3: [[0, 0], [1, 0], [0, 1]],
  o4: [[0, 0], [1, 0], [0, 1], [1, 1]],
  i4: [[0, 0], [1, 0], [2, 0], [3, 0]],
  l4: [[0, 0], [0, 1], [0, 2], [1, 2]],
  j4: [[1, 0], [1, 1], [1, 2], [0, 2]],
  t4: [[0, 0], [1, 0], [2, 0], [1, 1]],
  s4: [[1, 0], [2, 0], [0, 1], [1, 1]],
  z4: [[0, 0], [1, 0], [1, 1], [2, 1]],
  p5: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
  v5: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
};

const SETS = {
  easy:   { o1: 3, i2: 4, i3: 3, l3: 4, o4: 1 },
  normal: { o1: 2, i2: 3, i3: 3, l3: 3, o4: 2, i4: 1, l4: 2, j4: 2, t4: 2 },
  hard:   { o1: 2, i2: 2, i3: 3, l3: 3, o4: 2, i4: 2, l4: 2, j4: 2, t4: 2, s4: 1, z4: 1, p5: 1 },
  expert: { o1: 1, i2: 2, i3: 2, l3: 3, o4: 2, i4: 2, l4: 2, j4: 2, t4: 2, s4: 2, z4: 2, p5: 2, v5: 1 },
};

export function normalize(cells) {
  let mx = Infinity, my = Infinity;
  for (const [x, y] of cells) { mx = Math.min(mx, x); my = Math.min(my, y); }
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export function rotate(cells) {
  // 90 degree turn in grid space
  return normalize(cells.map(([x, y]) => [-y, x]));
}

export function extent(cells) {
  let w = 0, h = 0;
  for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
  return [w, h];
}

export function makePiece(key, rot = 0, gold = false) {
  let cells = normalize(SHAPES[key]);
  for (let i = 0; i < rot; i++) cells = rotate(cells);
  return { key, cells, gold, id: Math.random().toString(36).slice(2) };
}

export function rotatePiece(p) {
  p.cells = rotate(p.cells);
  return p;
}

function weightedPick(weights, rnd) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rnd() * total;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}

// Returns weights adapted to the current tier: shapes that can never fit are dropped and
// small stones become likelier as the tier fills up.
export function weightsFor(setName, tierSize, emptyCount) {
  const base = SETS[setName];
  const w = {};
  for (const k in base) {
    const [a, b] = extent(SHAPES[k]);
    if (Math.max(a, b) > tierSize) continue;
    if (SHAPES[k].length > emptyCount) continue;
    let v = base[k];
    if (emptyCount <= 10 && SHAPES[k].length <= 2) v *= 2.2;
    if (emptyCount <= 5 && SHAPES[k].length >= 4) v *= 0.4;
    w[k] = v;
  }
  if (!Object.keys(w).length) w.o1 = 1;
  return w;
}

export function randomPiece(setName, tierSize, emptyCount, goldChance, rnd = Math.random) {
  const key = weightedPick(weightsFor(setName, tierSize, emptyCount), rnd);
  const rot = Math.floor(rnd() * 4);
  return makePiece(key, rot, key !== 'o1' && rnd() < goldChance);
}
