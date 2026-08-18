/**
 * SuperSudoku — grid generator (v0.1)
 *
 * Pure JS, no dependencies. Works both under Node (CommonJS require) and inside
 * the RN/Hermes PluginHost runtime (imported by App.tsx via Babel ESM interop).
 *
 * A puzzle is a Int8Array(81), row-major, 0 = empty cell, 1..9 = digit.
 *
 * Strategy:
 *   1. generateFull()  — build a complete, valid solution by randomized
 *      backtracking with an MRV (minimum-remaining-values) heuristic.
 *   2. digHoles()      — remove givens in 180°-symmetric pairs, keeping the
 *      puzzle uniquely solvable at every step (revert a removal that would
 *      create a second solution). Difficulty = target number of givens.
 *
 * Uniqueness is the expensive part (a bounded solution-count on every removal),
 * and that cost is exactly what we want to measure on-device.
 */

'use strict';

var ALL = 0b1111111110; // bits 1..9 set (bit 0 unused)

// Difficulty presets. `givens` is the target number of clues kept.
// Fewer givens ⇒ generally harder AND slower to generate (more uniqueness
// checks fail and get reverted). These are proxies; true technique-based
// difficulty rating is out of scope for v0.1.
var DIFFICULTIES = {
  easy:   {label: 'Easy',   givens: 40},
  medium: {label: 'Medium', givens: 32},
  hard:   {label: 'Hard',   givens: 26},
};

function popcount(x) {
  var c = 0;
  while (x) { x &= x - 1; c++; }
  return c;
}

// digit (1..9) encoded by a single set bit -> its value
function bitToDigit(bit) {
  return 31 - Math.clz32(bit);
}

function boxOf(i) {
  var r = (i / 9) | 0, c = i % 9;
  return ((r / 3) | 0) * 3 + ((c / 3) | 0);
}

// Fisher–Yates, using the provided rng (defaults to Math.random)
function shuffle(arr, rng) {
  rng = rng || Math.random;
  for (var i = arr.length - 1; i > 0; i--) {
    var j = (rng() * (i + 1)) | 0;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/**
 * Count solutions of `grid`, stopping early once `limit` is reached.
 * Returns min(actualSolutions, limit). Non-destructive (restores grid).
 * Also increments the caller-provided stats.nodes counter if given.
 */
function countSolutions(grid, limit, stats) {
  var rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
  for (var i = 0; i < 81; i++) {
    var v = grid[i];
    if (v) {
      var b = 1 << v;
      var r = (i / 9) | 0, c = i % 9, bx = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
    }
  }
  var count = 0;

  function recurse() {
    if (stats) stats.nodes++;
    // Pick the empty cell with the fewest candidates (MRV).
    var best = -1, bestMask = 0, bestCount = 10;
    for (var i = 0; i < 81; i++) {
      if (grid[i]) continue;
      var r = (i / 9) | 0, c = i % 9, bx = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      var mask = ALL & ~(rows[r] | cols[c] | boxes[bx]);
      if (mask === 0) return;              // dead end, no candidate
      var cnt = popcount(mask);
      if (cnt < bestCount) {
        bestCount = cnt; best = i; bestMask = mask;
        if (cnt === 1) break;              // can't do better
      }
    }
    if (best === -1) { count++; return; }  // no empty cell => a full solution

    var rr = (best / 9) | 0, cc = best % 9, bbx = ((rr / 3) | 0) * 3 + ((cc / 3) | 0);
    var m = bestMask;
    while (m) {
      var bit = m & -m; m ^= bit;
      var d = bitToDigit(bit);
      grid[best] = d; rows[rr] |= bit; cols[cc] |= bit; boxes[bbx] |= bit;
      recurse();
      grid[best] = 0; rows[rr] &= ~bit; cols[cc] &= ~bit; boxes[bbx] &= ~bit;
      if (count >= limit) return;
    }
  }

  recurse();
  return count;
}

/**
 * Build a complete valid grid via randomized MRV backtracking.
 * Returns a filled Int8Array(81).
 */
function generateFull(rng) {
  rng = rng || Math.random;
  var grid = new Int8Array(81);
  var rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);

  function fill() {
    // MRV cell selection
    var best = -1, bestMask = 0, bestCount = 10;
    for (var i = 0; i < 81; i++) {
      if (grid[i]) continue;
      var r = (i / 9) | 0, c = i % 9, bx = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      var mask = ALL & ~(rows[r] | cols[c] | boxes[bx]);
      if (mask === 0) return false;
      var cnt = popcount(mask);
      if (cnt < bestCount) { bestCount = cnt; best = i; bestMask = mask; if (cnt === 1) break; }
    }
    if (best === -1) return true; // filled

    var rr = (best / 9) | 0, cc = best % 9, bbx = ((rr / 3) | 0) * 3 + ((cc / 3) | 0);
    // candidate digits in random order
    var cands = [];
    var m = bestMask;
    while (m) { var bit = m & -m; m ^= bit; cands.push(bit); }
    shuffle(cands, rng);
    for (var k = 0; k < cands.length; k++) {
      var b = cands[k], d = bitToDigit(b);
      grid[best] = d; rows[rr] |= b; cols[cc] |= b; boxes[bbx] |= b;
      if (fill()) return true;
      grid[best] = 0; rows[rr] &= ~b; cols[cc] &= ~b; boxes[bbx] &= ~b;
    }
    return false;
  }

  fill();
  return grid;
}

/**
 * Remove givens in symmetric pairs while keeping a unique solution.
 * Mutates and returns `puzzle` (a copy of the full solution).
 */
function digHoles(puzzle, targetGivens, rng, stats) {
  rng = rng || Math.random;
  var order = [];
  for (var i = 0; i <= 40; i++) order.push(i); // 0..40, each paired with 80-i
  shuffle(order, rng);

  var givens = 81;
  for (var idx = 0; idx < order.length; idx++) {
    if (givens <= targetGivens) break;
    var a = order[idx];
    var b = 80 - a;
    if (puzzle[a] === 0) continue;
    var removeTwo = (b !== a) && puzzle[b] !== 0;
    var backA = puzzle[a], backB = puzzle[b];

    puzzle[a] = 0;
    if (b !== a) puzzle[b] = 0;

    if (stats) stats.checks++;
    if (countSolutions(puzzle, 2, stats) !== 1) {
      // reverting: removal broke uniqueness
      puzzle[a] = backA;
      if (b !== a) puzzle[b] = backB;
    } else {
      givens -= removeTwo ? 2 : 1;
    }
  }
  return {puzzle: puzzle, givens: givens};
}

/**
 * Full generate: solution + uniquely-solvable puzzle for a difficulty.
 * `opts.rng` optional deterministic rng; `opts.stats` collects node/check counts.
 * Returns {puzzle, solution, givens, target}.
 */
function generate(difficulty, opts) {
  opts = opts || {};
  var preset = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
  var rng = opts.rng || Math.random;
  var stats = opts.stats;

  var solution = generateFull(rng);
  var puzzle = solution.slice();
  var res = digHoles(puzzle, preset.givens, rng, stats);

  return {
    puzzle: puzzle,
    solution: solution,
    givens: res.givens,
    target: preset.givens,
  };
}

module.exports = {
  ALL: ALL,
  DIFFICULTIES: DIFFICULTIES,
  generate: generate,
  generateFull: generateFull,
  digHoles: digHoles,
  countSolutions: countSolutions,
  popcount: popcount,
  boxOf: boxOf,
};
