// Production levels. base: bottom tier edge length of the pyramid (tiers shrink by 2 down to 3x3;
// the golden capstone is the reward). deadline: the pharaoh's reign in game seconds, tuned with
// tools/balance_sim.mjs: about 1.6x (level 1) down to 1.25x (level 5) of a scripted builder's time.
const BASIC = ['house', 'farm', 'bakery', 'quarry', 'mason'];
const ALL = ['house', 'farm', 'bakery', 'quarry', 'mason', 'mine', 'smithy'];

export const LEVELS = [
  { base: 5, startDeben: 90, tools: false, flood: null, storm: null, allowed: BASIC,
    prebuilt: [['house', 'd1'], ['quarry', 'r1'], ['mason', 'd2']], deadline: 240 },
  { base: 7, startDeben: 110, tools: false, flood: { first: 70, every: 110, dur: 18 }, storm: null, allowed: BASIC,
    prebuilt: [['house', 'd1'], ['quarry', 'r1']], deadline: 320 },
  { base: 7, startDeben: 130, tools: true, flood: { first: 70, every: 110, dur: 18 }, storm: null, allowed: ALL,
    prebuilt: [['house', 'd1'], ['quarry', 'r1'], ['mason', 'd2']], deadline: 480 },
  { base: 9, startDeben: 140, tools: true, flood: { first: 60, every: 100, dur: 20 }, storm: null, allowed: ALL,
    prebuilt: [['house', 'd1'], ['quarry', 'r1']], deadline: 690 },
  { base: 9, startDeben: 120, tools: true, flood: { first: 50, every: 90, dur: 22 }, storm: { first: 80, every: 85, dur: 14 }, allowed: ALL,
    prebuilt: [['house', 'd1']], deadline: 720 },
];

export function tierSizes(base) {
  const s = [];
  for (let n = base; n >= 3; n -= 2) s.push(n);
  return s;
}
