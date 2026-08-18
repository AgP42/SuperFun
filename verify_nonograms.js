/* Dev-only: verify every shipped nonogram picture is UNIQUELY solvable from its
 * clues. Prints each picture with its solution count (must be 1). Run: node verify_nonograms.js
 */
'use strict';
var N = require('./src/nonogram');

// All binary patterns of `length` matching a run-length clue ([0] = empty line).
function patterns(clue, length) {
  if (clue.length === 0 || (clue.length === 1 && clue[0] === 0)) {
    return [new Array(length).fill(false)];
  }
  var res = [];
  function rec(pos, ci, arr) {
    if (ci === clue.length) {
      var p = arr.slice();
      for (var i = pos; i < length; i++) p[i] = false;
      res.push(p);
      return;
    }
    var run = clue[ci];
    var need = 0;
    for (var k = ci; k < clue.length; k++) need += clue[k];
    need += clue.length - 1 - ci; // gaps between the remaining runs
    var maxStart = length - need;
    for (var s = pos; s <= maxStart; s++) {
      var p = arr.slice();
      for (var i2 = pos; i2 < s; i2++) p[i2] = false;
      for (var j = 0; j < run; j++) p[s + j] = true;
      var next = s + run;
      if (ci < clue.length - 1) { p[next] = false; next++; }
      rec(next, ci + 1, p);
    }
  }
  rec(0, 0, new Array(length).fill(false));
  return res;
}

// Count solutions (up to `limit`) of a nonogram given its clues.
function countSolutions(rowClues, colClues, size, limit) {
  var rowPats = rowClues.map(function (cl) { return patterns(cl, size); });
  var colPats = colClues.map(function (cl) { return patterns(cl, size); });
  var count = 0;
  function dfs(r, colCand) {
    if (count >= limit) return;
    if (r === size) { count++; return; }
    var pats = rowPats[r];
    for (var pi = 0; pi < pats.length; pi++) {
      var rowPat = pats[pi];
      var next = new Array(size);
      var ok = true;
      for (var c = 0; c < size; c++) {
        var cand = colCand[c], filtered = [];
        for (var k = 0; k < cand.length; k++) if (cand[k][r] === rowPat[c]) filtered.push(cand[k]);
        if (filtered.length === 0) { ok = false; break; }
        next[c] = filtered;
      }
      if (ok) dfs(r + 1, next);
      if (count >= limit) return;
    }
  }
  dfs(0, colPats);
  return count;
}

var sizes = Object.keys(N.PICTURES);
var bad = 0;
sizes.forEach(function (sk) {
  var size = parseInt(sk, 10);
  console.log('=== ' + size + '×' + size + ' ===');
  N.PICTURES[size].forEach(function (pic) {
    var sol = N.pictureToSolution(pic.rows, size);
    // sanity: rows must all be length `size`
    var dimOk = pic.rows.length === size && pic.rows.every(function (r) { return r.length === size; });
    var cl = N.cluesFor(sol, size);
    var n = countSolutions(cl.rowClues, cl.colClues, size, 2);
    var status = !dimOk ? 'BAD DIMS' : n === 1 ? 'unique ✓' : n >= 2 ? 'AMBIGUOUS (≥2)' : 'NO SOLUTION?!';
    if (n !== 1 || !dimOk) bad++;
    console.log('  ' + pic.name.padEnd(10) + ' ' + status);
  });
});
console.log('\n' + (bad === 0 ? 'ALL UNIQUE ✓' : bad + ' picture(s) need fixing'));
process.exit(bad === 0 ? 0 : 1);
