// Level design: base = edge length of the bottom tier (tiers shrink by 2 until 3x3, the 1x1
// capstone is placed automatically as the reward).
// secPerCell: sun-time budget per cell of a tier (+3 s per tier; lines add 1 s, ankhs 3 s).
// New stones arrive only after all three are used. Balanced with tools/balance_sim.mjs to about
// 4 s per move on level 1 down to 2.6 s on level 6 (plus forced shuffles, which cost time).
// ankhs/granite: per tier (bottom -> top). fair: chance a fresh set holds at least one stone that fits.
export const LEVELS = [
  { base: 5, secPerCell: 1.1, ankhs: [1, 1],       granite: [0, 0],       set: 'easy',   fair: 1.0,  gold: 0.06 },
  { base: 7, secPerCell: 0.65, ankhs: [2, 1, 1],    granite: [1, 1, 0],    set: 'normal', fair: 0.9, gold: 0.07 },
  { base: 7, secPerCell: 0.5, ankhs: [2, 2, 1],    granite: [3, 2, 1],    set: 'hard',   fair: 0.85, gold: 0.08 },
  { base: 9, secPerCell: 0.5, ankhs: [3, 2, 2, 1], granite: [4, 3, 1, 0], set: 'hard',   fair: 0.8,  gold: 0.08 },
  { base: 9, secPerCell: 0.42, ankhs: [3, 3, 2, 1], granite: [6, 4, 2, 0], set: 'expert', fair: 0.75, gold: 0.09 },
  { base: 9, secPerCell: 0.38, ankhs: [4, 3, 2, 1], granite: [8, 5, 3, 1], set: 'expert', fair: 0.7,  gold: 0.1 },
];

export function tierSizes(base) {
  const s = [];
  for (let n = base; n >= 3; n -= 2) s.push(n);
  return s;
}
