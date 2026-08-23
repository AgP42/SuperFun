/**
 * SuperFun — Peg Solitaire engine, multi-shape (v0.13)
 *
 * Difficulty = board SHAPE (not just a goal):
 *   Easy   Triangle (15 holes) — apex starts empty
 *   Medium English cross (33)  — centre starts empty
 *   Hard   Wiegleb big cross (45) — centre starts empty
 * A peg jumps over an adjacent peg into the empty hole two steps away; the
 * jumped peg is removed. Square boards jump orthogonally; the triangle jumps
 * along its three axes (6 directions). Clear down to a single peg to solve.
 *
 * A board `spec` is static (cells + precomputed jumps + start hole); the peg
 * `state` is a plain 0/1 array indexed by cell id.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

function buildSquare(name, N, validFn, startRC) {
  var cells = [], cellAt = {};
  for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
    if (validFn(r, c)) { cellAt[r + ',' + c] = cells.length; cells.push({r: r, c: c}); }
  }
  var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]], jumps = [];
  for (var i = 0; i < cells.length; i++) {
    var r0 = cells[i].r, c0 = cells[i].c;
    for (var d = 0; d < 4; d++) {
      var o = cellAt[(r0 + dirs[d][0]) + ',' + (c0 + dirs[d][1])];
      var t = cellAt[(r0 + 2 * dirs[d][0]) + ',' + (c0 + 2 * dirs[d][1])];
      if (o !== undefined && t !== undefined) jumps.push([i, o, t]);
    }
  }
  return {name: name, layout: 'square', N: N, cells: cells, cellAt: cellAt, jumps: jumps, start: cellAt[startRC]};
}

function buildTriangle(name, rows, startRC) {
  var cells = [], cellAt = {};
  for (var r = 0; r < rows; r++) for (var c = 0; c <= r; c++) { cellAt[r + ',' + c] = cells.length; cells.push({r: r, c: c}); }
  // the six triangular jump directions (delta to the jumped-over cell)
  var dirs = [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, 0], [1, 1]], jumps = [];
  for (var i = 0; i < cells.length; i++) {
    var r0 = cells[i].r, c0 = cells[i].c;
    for (var d = 0; d < 6; d++) {
      var dr = dirs[d][0], dc = dirs[d][1];
      var o = cellAt[(r0 + dr) + ',' + (c0 + dc)];
      var t = cellAt[(r0 + 2 * dr) + ',' + (c0 + 2 * dc)];
      if (o !== undefined && t !== undefined) jumps.push([i, o, t]);
    }
  }
  return {name: name, layout: 'triangle', rows: rows, cells: cells, cellAt: cellAt, jumps: jumps, start: cellAt[startRC]};
}

var BOARDS = {
  easy: buildTriangle('Triangle (15)', 5, '0,0'),
  medium: buildSquare('Cross (33)', 7, function (r, c) { return (r >= 2 && r <= 4) || (c >= 2 && c <= 4); }, '3,3'),
  hard: buildSquare('Big cross (45)', 9, function (r, c) { return (r >= 3 && r <= 5) || (c >= 3 && c <= 5); }, '4,4'),
};

function initPegs(spec) { var p = new Array(spec.cells.length).fill(1); p[spec.start] = 0; return p; }
function legalMoves(spec, pegs) {
  var m = [];
  for (var i = 0; i < spec.jumps.length; i++) { var j = spec.jumps[i]; if (pegs[j[0]] === 1 && pegs[j[1]] === 1 && pegs[j[2]] === 0) m.push(j); }
  return m;
}
function movesFrom(spec, pegs, from) { return legalMoves(spec, pegs).filter(function (j) { return j[0] === from; }); }
function applyJump(pegs, j) { var np = pegs.slice(); np[j[0]] = 0; np[j[1]] = 0; np[j[2]] = 1; return np; }
function pegCount(pegs) { var n = 0; for (var i = 0; i < pegs.length; i++) if (pegs[i] === 1) n++; return n; }

module.exports = {
  BOARDS: BOARDS, initPegs: initPegs, legalMoves: legalMoves,
  movesFrom: movesFrom, applyJump: applyJump, pegCount: pegCount,
};
