// Production levels. base: bottom tier edge length of the pyramid (tiers shrink by 2 down to 3x3;
// the golden capstone is the reward). graniteTiers: how many top tiers need red granite from the far
// bank. bricks: the ramp must be raised with mud bricks before each new tier. ox: sledge teams of fully upgraded buildings become ox carts. Every level starts with one
// workers' house; quarries must be opened on limestone deposits and joined by roads.
// deadline: the pharaoh's reign in game seconds, tuned with tools/balance_sim.mjs.
const BASIC = ['house', 'farm', 'bakery', 'quarry', 'mason'];
const TOOLS = [...BASIC, 'mine', 'smithy'];
const ALL = [...TOOLS, 'granite', 'quay'];
const add = (list, t) => [...list, t];

export const LEVELS = [
  { base: 5, startDeben: 260, tools: false, flood: null, storm: null, allowed: BASIC, ox: false,
    prebuilt: [['house', 'd8']], deadline: 360 },
  { base: 7, startDeben: 260, tools: false, bricks: true, flood: { first: 80, every: 110, dur: 18 }, storm: null, allowed: add(BASIC, 'brickworks'), ox: true,
    prebuilt: [['house', 'd8']], deadline: 560 },
  { base: 7, startDeben: 280, tools: true, bricks: true, flood: { first: 80, every: 110, dur: 18 }, storm: null, allowed: add(TOOLS, 'brickworks'), ox: true,
    prebuilt: [['house', 'd8']], deadline: 790 },
  { base: 9, startDeben: 320, tools: true, bricks: true, flood: { first: 70, every: 100, dur: 20 }, storm: null, allowed: add(ALL, 'brickworks'), ox: true,
    graniteTiers: 1, prebuilt: [['house', 'd8']], deadline: 1110 },
  { base: 9, startDeben: 320, tools: true, bricks: true, flood: { first: 60, every: 90, dur: 22 }, storm: { first: 90, every: 85, dur: 14 }, allowed: add(ALL, 'brickworks'), ox: true,
    graniteTiers: 2, prebuilt: [['house', 'd8']], deadline: 1200 },
];

export function tierSizes(base) {
  const s = [];
  for (let n = base; n >= 3; n -= 2) s.push(n);
  return s;
}
