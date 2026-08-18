/**
 * SuperFun — Nonogram (Picross) generation + validation (v0.3)
 *
 * A puzzle is a random filled picture; the player reconstructs any picture that
 * satisfies the row/column clues (the proper win condition — not necessarily
 * the exact generated one). CommonJS.
 */
'use strict';

// Run-length clue for a boolean line, e.g. [true,true,false,true] -> [2,1].
// An empty line is represented as [0].
function lineClue(line) {
  var runs = [], run = 0;
  for (var i = 0; i < line.length; i++) {
    if (line[i]) run++;
    else if (run > 0) { runs.push(run); run = 0; }
  }
  if (run > 0) runs.push(run);
  return runs.length ? runs : [0];
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Generate a size×size puzzle. Returns {size, solution:boolean[], rowClues, colClues}.
 * Density ~0.55; retries to avoid any fully-empty row or column (nicer puzzles).
 */
function generate(size, rng) {
  rng = rng || Math.random;
  var n = size * size, sol;
  for (var attempt = 0; attempt < 40; attempt++) {
    sol = new Array(n);
    for (var i = 0; i < n; i++) sol[i] = rng() < 0.55;
    if (ok(sol, size)) break;
  }
  var rowClues = [], colClues = [], r, c;
  for (r = 0; r < size; r++) {
    var row = [];
    for (c = 0; c < size; c++) row.push(sol[r * size + c]);
    rowClues.push(lineClue(row));
  }
  for (c = 0; c < size; c++) {
    var col = [];
    for (r = 0; r < size; r++) col.push(sol[r * size + c]);
    colClues.push(lineClue(col));
  }
  return {size: size, solution: sol, rowClues: rowClues, colClues: colClues};
}

function ok(sol, size) {
  var r, c, any;
  for (r = 0; r < size; r++) { any = false; for (c = 0; c < size; c++) if (sol[r * size + c]) any = true; if (!any) return false; }
  for (c = 0; c < size; c++) { any = false; for (r = 0; r < size; r++) if (sol[r * size + c]) any = true; if (!any) return false; }
  return true;
}

/** True when `fill` (boolean[]) satisfies every row and column clue. */
function validate(fill, rowClues, colClues, size) {
  var r, c;
  for (r = 0; r < size; r++) {
    var row = [];
    for (c = 0; c < size; c++) row.push(!!fill[r * size + c]);
    if (!arraysEqual(lineClue(row), rowClues[r])) return false;
  }
  for (c = 0; c < size; c++) {
    var col = [];
    for (r = 0; r < size; r++) col.push(!!fill[r * size + c]);
    if (!arraysEqual(lineClue(col), colClues[c])) return false;
  }
  return true;
}

var SIZES = {easy: 5, medium: 8, hard: 10};

module.exports = {lineClue: lineClue, generate: generate, validate: validate, SIZES: SIZES};
