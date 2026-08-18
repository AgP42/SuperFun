/* Node baseline benchmark + correctness self-check for the generator.
 * Run: node bench.js [iterationsPerDifficulty]
 * This is NOT the device measurement — it validates the algorithm and gives a
 * desktop reference. Device (Manta / A5X, Hermes) will be several× slower.
 */
'use strict';
var S = require('./src/sudoku');

var ITERS = parseInt(process.argv[2] || '30', 10);

function isValidComplete(g) {
  for (var unit = 0; unit < 9; unit++) {
    var rowMask = 0, colMask = 0, boxMask = 0;
    for (var k = 0; k < 9; k++) {
      var rv = g[unit * 9 + k];
      var cv = g[k * 9 + unit];
      var br = ((unit / 3) | 0) * 3 + ((k / 3) | 0);
      var bc = (unit % 3) * 3 + (k % 3);
      var bv = g[br * 9 + bc];
      if (rv < 1 || cv < 1 || bv < 1) return false;
      rowMask |= 1 << rv; colMask |= 1 << cv; boxMask |= 1 << bv;
    }
    if (rowMask !== S.ALL || colMask !== S.ALL || boxMask !== S.ALL) return false;
  }
  return true;
}

// puzzle must be a subset of solution and be uniquely solvable
function puzzleConsistent(puzzle, solution) {
  var givens = 0;
  for (var i = 0; i < 81; i++) {
    if (puzzle[i] !== 0) {
      givens++;
      if (puzzle[i] !== solution[i]) return {ok: false, why: 'given mismatch'};
    }
  }
  var copy = Int8Array.from(puzzle);
  var n = S.countSolutions(copy, 2);
  if (n !== 1) return {ok: false, why: 'not unique (' + n + ')'};
  return {ok: true, givens: givens};
}

function pct(sorted, p) {
  var idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

console.log('SuperSudoku generator — Node baseline, ' + ITERS + ' iters/difficulty');
console.log('node ' + process.version + '\n');

var order = ['easy', 'medium', 'hard'];
for (var d = 0; d < order.length; d++) {
  var diff = order[d];
  var times = [], givensArr = [], checksArr = [], nodesArr = [];
  var failures = 0;

  for (var it = 0; it < ITERS; it++) {
    var stats = {checks: 0, nodes: 0};
    var t0 = process.hrtime.bigint();
    var r = S.generate(diff, {stats: stats});
    var t1 = process.hrtime.bigint();
    var ms = Number(t1 - t0) / 1e6;

    if (!isValidComplete(r.solution)) { failures++; continue; }
    var chk = puzzleConsistent(r.puzzle, r.solution);
    if (!chk.ok) { failures++; console.log('  FAIL(' + diff + '): ' + chk.why); continue; }

    times.push(ms);
    givensArr.push(chk.givens);
    checksArr.push(stats.checks);
    nodesArr.push(stats.nodes);
  }

  times.sort(function (a, b) { return a - b; });
  var avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
  var avgGivens = givensArr.reduce(function (a, b) { return a + b; }, 0) / givensArr.length;
  var avgChecks = checksArr.reduce(function (a, b) { return a + b; }, 0) / checksArr.length;
  var avgNodes = nodesArr.reduce(function (a, b) { return a + b; }, 0) / nodesArr.length;

  console.log(
    S.DIFFICULTIES[diff].label.padEnd(7) +
    ' target=' + S.DIFFICULTIES[diff].givens +
    '  givens~' + avgGivens.toFixed(1) +
    '  |  ms  min=' + pct(times, 0).toFixed(1) +
    ' med=' + pct(times, 50).toFixed(1) +
    ' p90=' + pct(times, 90).toFixed(1) +
    ' max=' + pct(times, 100).toFixed(1) +
    ' avg=' + avg.toFixed(1) +
    '  |  checks~' + avgChecks.toFixed(0) +
    ' searchNodes~' + avgNodes.toFixed(0) +
    (failures ? '  FAILURES=' + failures : '')
  );
}
console.log('\nAll puzzles verified unique-solution & consistent with their solution unless FAILURES shown.');
