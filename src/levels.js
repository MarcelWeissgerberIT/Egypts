// Level design: base = edge length of the bottom tier (tiers shrink by 2 until 3x3, the 1x1
// capstone is placed automatically as the reward).
// secPerCell: sun-time budget per cell of a tier (+4 s per tier; lines add 1 s, ankhs 4 s).
// Balanced with a greedy bot (see tools/) to roughly 5.5 s per move on level 1 down to 3.2 s on level 6. ankhs/granite: per tier (bottom -> top).
export const LEVELS = [
  { base: 5, secPerCell: 1.9, ankhs: [1, 1],       granite: [0, 0],       set: 'easy',   fair: 1.0,  gold: 0.06 },
  { base: 7, secPerCell: 1.15, ankhs: [2, 1, 1],    granite: [0, 0, 0],    set: 'normal', fair: 0.95, gold: 0.07 },
  { base: 7, secPerCell: 1.0, ankhs: [2, 2, 1],    granite: [3, 2, 0],    set: 'normal', fair: 0.85, gold: 0.08 },
  { base: 9, secPerCell: 0.9, ankhs: [3, 2, 2, 1], granite: [3, 2, 1, 0], set: 'hard',   fair: 0.8,  gold: 0.08 },
  { base: 9, secPerCell: 0.78, ankhs: [3, 3, 2, 1], granite: [5, 3, 2, 0], set: 'hard',  fair: 0.7,  gold: 0.09 },
  { base: 9, secPerCell: 0.62, ankhs: [4, 3, 2, 1], granite: [6, 4, 2, 1], set: 'expert', fair: 0.6,  gold: 0.1 },
];

export function tierSizes(base) {
  const s = [];
  for (let n = base; n >= 3; n -= 2) s.push(n);
  return s;
}
