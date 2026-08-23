/**
 * SuperFun — Reversi / Othello engine + AI (v0.12)
 *
 * 8×8. Player 1 = you (moves first), 2 = the Supernote. Placing a disc must
 * outflank ≥1 opponent line; those discs flip. No legal move = pass; both pass
 * = game over, most discs wins. AI = alpha-beta negamax with a positional table.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
var WT = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

function opp(p) { return p === 1 ? 2 : 1; }

function initBoard() {
  var b = new Array(64).fill(0);
  b[3 * 8 + 3] = 2; b[3 * 8 + 4] = 1; b[4 * 8 + 3] = 1; b[4 * 8 + 4] = 2;
  return b;
}

function flipsFor(b, idx, p) {
  if (b[idx] !== 0) return [];
  var r = (idx / 8) | 0, c = idx % 8, o = opp(p), all = [];
  for (var d = 0; d < 8; d++) {
    var dr = DIRS[d][0], dc = DIRS[d][1], line = [], rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === o) { line.push(rr * 8 + cc); rr += dr; cc += dc; }
    if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === p) all = all.concat(line);
  }
  return all;
}

function legalMoves(b, p) {
  var m = [];
  for (var i = 0; i < 64; i++) if (b[i] === 0 && flipsFor(b, i, p).length) m.push(i);
  return m;
}

function applyMove(b, idx, p) {
  var nb = b.slice(), fl = flipsFor(b, idx, p);
  nb[idx] = p;
  for (var i = 0; i < fl.length; i++) nb[fl[i]] = p;
  return nb;
}

function counts(b) {
  var a = 0, c = 0;
  for (var i = 0; i < 64; i++) { if (b[i] === 1) a++; else if (b[i] === 2) c++; }
  return {p1: a, p2: c};
}

function isOver(b) { return legalMoves(b, 1).length === 0 && legalMoves(b, 2).length === 0; }

function evalBoard(b, p) {
  var o = opp(p), s = 0;
  for (var i = 0; i < 64; i++) { if (b[i] === p) s += WT[i]; else if (b[i] === o) s -= WT[i]; }
  s += 3 * (legalMoves(b, p).length - legalMoves(b, o).length);
  return s;
}

function negamax(b, p, depth, alpha, beta) {
  if (depth === 0 || isOver(b)) return evalBoard(b, p);
  var moves = legalMoves(b, p);
  if (moves.length === 0) return -negamax(b, opp(p), depth - 1, -beta, -alpha); // pass
  var best = -Infinity;
  for (var i = 0; i < moves.length; i++) {
    var v = -negamax(applyMove(b, moves[i], p), opp(p), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function aiMove(b, p, difficulty) {
  var moves = legalMoves(b, p);
  if (!moves.length) return -1;
  if (difficulty === 'easy') { // greedy: most flips
    var bi = moves[0], bf = -1;
    for (var i = 0; i < moves.length; i++) { var f = flipsFor(b, moves[i], p).length; if (f > bf) { bf = f; bi = moves[i]; } }
    return bi;
  }
  // Depth kept low: eval calls legalMoves twice, and Hermes is ~90× slower than
  // desktop V8. depth 3 ≈ ~2s worst on device; depth 4 was ~13s (too slow).
  var depth = difficulty === 'hard' ? 3 : 2;
  var best = -Infinity, bm = moves[0];
  for (var j = 0; j < moves.length; j++) {
    var v = -negamax(applyMove(b, moves[j], p), opp(p), depth - 1, -Infinity, Infinity);
    if (v > best) { best = v; bm = moves[j]; }
  }
  return bm;
}

module.exports = {
  opp: opp, initBoard: initBoard, flipsFor: flipsFor, legalMoves: legalMoves,
  applyMove: applyMove, counts: counts, isOver: isOver, aiMove: aiMove,
};
