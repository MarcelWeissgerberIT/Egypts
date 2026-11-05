// Production levels. base: bottom tier edge length of the pyramid (tiers shrink by 2 down to 3x3;
// the golden capstone is the reward). graniteTiers: how many top tiers need red granite from the far
// bank. deadline: the pharaoh's reign in game seconds, tuned with tools/balance_sim.mjs.
const BASIC = ['house', 'farm', 'bakery', 'quarry', 'mason'];
const TOOLS = [...BASIC, 'mine', 'smithy'];
const ALL = [...TOOLS, 'granite', 'quay'];

export const LEVELS = [
  { base: 5, startDeben: 170, tools: false, flood: null, storm: null, allowed: BASIC, transports: ['porter', 'sledge'],
    prebuilt: [['house', 'd1'], ['quarry', 'r1'], ['mason', 'd2']], deadline: 390 },
  { base: 7, startDeben: 200, tools: false, flood: { first: 80, every: 110, dur: 18 }, storm: null, allowed: BASIC, transports: ['porter', 'sledge', 'ox'],
    prebuilt: [['house', 'd1'], ['quarry', 'r1'], ['mason', 'd2']], deadline: 580 },
  { base: 7, startDeben: 220, tools: true, flood: { first: 80, every: 110, dur: 18 }, storm: null, allowed: TOOLS, transports: ['porter', 'sledge', 'ox'],
    prebuilt: [['house', 'd1'], ['quarry', 'r1'], ['mason', 'd2']], deadline: 690 },
  { base: 9, startDeben: 260, tools: true, flood: { first: 70, every: 100, dur: 20 }, storm: null, allowed: ALL, transports: ['porter', 'sledge', 'ox', 'boat'],
    graniteTiers: 1, prebuilt: [['house', 'd1'], ['quarry', 'r1'], ['mason', 'd2']], deadline: 1130 },
  { base: 9, startDeben: 260, tools: true, flood: { first: 60, every: 90, dur: 22 }, storm: { first: 90, every: 85, dur: 14 }, allowed: ALL, transports: ['porter', 'sledge', 'ox', 'boat'],
    graniteTiers: 2, prebuilt: [['house', 'd1'], ['quarry', 'r1']], deadline: 1340 },
];

export function tierSizes(base) {
  const s = [];
  for (let n = base; n >= 3; n -= 2) s.push(n);
  return s;
}
