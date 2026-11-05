// Building plots around the pyramid site, in screen-aligned (u: right, v: back) island coordinates.
// Portrait layout: fields along the Nile at the top, quays on the riverbank, the granite quarries
// across the Nile, workshops and houses on the left and at the bottom, the rocky ridge on the right.
export const PLOTS = [
  { id: 'd1', terrain: 'desert', u: -5.6, v: 6.2 },
  { id: 'd2', terrain: 'desert', u: -6.6, v: 2.3 },
  { id: 'd3', terrain: 'desert', u: -6.6, v: -2.3 },
  { id: 'd4', terrain: 'desert', u: -5.6, v: -6.2 },
  { id: 'd5', terrain: 'desert', u: -2.4, v: -9.6 },
  { id: 'd6', terrain: 'desert', u: 2.4, v: -9.6 },
  { id: 'd7', terrain: 'desert', u: -5.8, v: -11.0 },
  { id: 'd8', terrain: 'desert', u: 5.8, v: -11.0 },
  { id: 'r1', terrain: 'rock', u: 5.6, v: 6.2 },
  { id: 'r2', terrain: 'rock', u: 6.6, v: 2.3 },
  { id: 'r3', terrain: 'rock', u: 6.6, v: -2.3 },
  { id: 'r4', terrain: 'rock', u: 5.6, v: -6.2 },
  { id: 'f1', terrain: 'fertile', u: -7.2, v: 11.6 },
  { id: 'f2', terrain: 'fertile', u: -3.4, v: 12.4 },
  { id: 'f3', terrain: 'fertile', u: 3.4, v: 12.4 },
  { id: 'f4', terrain: 'fertile', u: 7.2, v: 11.6 },
  { id: 'q1', terrain: 'bank', u: -6.4, v: 15.1 },
  { id: 'q2', terrain: 'bank', u: 6.4, v: 15.1 },
  { id: 'g1', terrain: 'farbank', u: -4.6, v: 19.8 },
  { id: 'g2', terrain: 'farbank', u: 4.6, v: 19.8 },
];
