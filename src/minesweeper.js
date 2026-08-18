/**
 * SuperFun — Minesweeper board generation (v0.3)
 *
 * Pure helpers; reveal flood-fill lives in the component. CommonJS.
 */
'use strict';

function neighbors(i, rows, cols) {
  var r = (i / cols) | 0, c = i % cols, out = [];
  for (var dr = -1; dr <= 1; dr++) {
    for (var dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
    }
  }
  return out;
}

/**
 * Build a board with `mines` mines, keeping `safe` (and its neighbours) clear
 * so the first tap never explodes and usually opens an area.
 * Returns {mine: boolean[], count: Int8Array}.
 */
function generate(rows, cols, mines, safe, rng) {
  rng = rng || Math.random;
  var n = rows * cols;
  var forbidden = {};
  forbidden[safe] = true;
  var nb = neighbors(safe, rows, cols);
  for (var k = 0; k < nb.length; k++) forbidden[nb[k]] = true;

  var pool = [];
  for (var i = 0; i < n; i++) if (!forbidden[i]) pool.push(i);
  // if too many mines for the pool, relax the neighbour ring
  if (mines > pool.length) {
    pool = [];
    for (i = 0; i < n; i++) if (i !== safe) pool.push(i);
  }
  // Fisher–Yates partial shuffle to pick mine cells
  for (i = 0; i < mines && i < pool.length; i++) {
    var j = i + Math.floor(rng() * (pool.length - i));
    var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  var mine = new Array(n).fill(false);
  for (i = 0; i < mines && i < pool.length; i++) mine[pool[i]] = true;

  var count = new Int8Array(n);
  for (i = 0; i < n; i++) {
    if (mine[i]) { count[i] = -1; continue; }
    var c = 0, ns = neighbors(i, rows, cols);
    for (k = 0; k < ns.length; k++) if (mine[ns[k]]) c++;
    count[i] = c;
  }
  return {mine: mine, count: count};
}

// Difficulty presets: grid size + mine count.
var PRESETS = {
  easy: {rows: 8, cols: 8, mines: 10},
  medium: {rows: 10, cols: 10, mines: 18},
  hard: {rows: 12, cols: 12, mines: 30},
};

module.exports = {neighbors: neighbors, generate: generate, PRESETS: PRESETS};
