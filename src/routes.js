// Route geometry in screen-aligned island coordinates (u: right, v: back). Pure math, shared by the
// economy (route lengths) and the 3D world (where vehicles walk).
export const RIVER = { near: 14.7, far: 17.8 };

const l1 = (p) => Math.abs(p.u) + Math.abs(p.v);
const dist = (a, b) => Math.hypot(a.u - b.u, a.v - b.v);

export function pathLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

function crosses(a, b, R) {
  for (let k = 1; k < 16; k++) {
    const t = k / 16;
    if (l1({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t }) < R) return true;
  }
  return false;
}

// land path around the pyramid footprint (|u| + |v| < R)
export function landPath(a, b, R) {
  if (!crosses(a, b, R)) return [a, b];
  const r = R + 1.1;
  const cs = [{ u: r, v: 0 }, { u: 0, v: r }, { u: -r, v: 0 }, { u: 0, v: -r }];
  let best = null, bl = Infinity;
  for (const c of cs) {
    if (crosses(a, c, R) || crosses(c, b, R)) continue;
    const l = dist(a, c) + dist(c, b);
    if (l < bl) { bl = l; best = [a, c, b]; }
  }
  if (best) return best;
  for (let i = 0; i < 4; i++) for (const j of [(i + 1) % 4, (i + 3) % 4]) {
    const c1 = cs[i], c2 = cs[j];
    if (crosses(a, c1, R) || crosses(c2, b, R)) continue;
    const l = dist(a, c1) + dist(c1, c2) + dist(c2, b);
    if (l < bl) { bl = l; best = [a, c1, c2, b]; }
  }
  return best || [a, b];
}

// boats sail straight across the Nile between a far-bank landing and a near-bank quay
export function riverPath(far, quay) {
  return [{ u: far.u, v: RIVER.far - 0.1 }, { u: quay.u, v: RIVER.near + 0.5 }];
}

export const crossesRiver = (a, b) => (a.v > RIVER.far) !== (b.v > RIVER.far);

// the construction ramp runs along the pyramid's back-right face; blocks are delivered to its foot
export function siteDock(base) {
  const h = base / 2;
  const x = -h - 2.3, z = -(h + 1.0);
  return { u: (x - z) / Math.SQRT2, v: -(x + z) / Math.SQRT2 };
}
export const pyramidRadius = (base) => base * Math.SQRT2 / 2 + 0.6;
