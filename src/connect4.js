/**
 * SuperFun — Connect Four engine (v0.3)
 *
 * 7 columns × 6 rows. Human is 'O' and moves first; the Supernote is 'X'.
 * Board: Array(42) of 'O' | 'X' | '', index = row*7 + col, row 0 = top.
 * Difficulty = alpha-beta search depth (easy also just win/block + random).
 *
 * CommonJS — runs under Node (tests) and the RN/Hermes runtime.
 */
'use strict';

var COLS = 7, ROWS = 6;

function moves(b) {
  var m = [];
  for (var c = 0; c < COLS; c++) if (b[c] === '') m.push(c); // top cell empty
  return m;
}

// Drop piece p in column c on a copy; returns {board, row} or null if full.
function drop(b, c, p) {
  var nb = b.slice();
  for (var r = ROWS - 1; r >= 0; r--) {
    if (nb[r * COLS + c] === '') { nb[r * COLS + c] = p; return {board: nb, row: r}; }
  }
  return null;
}

var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function winner(b) {
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var p = b[r * COLS + c];
      if (!p) continue;
      for (var d = 0; d < DIRS.length; d++) {
        var dr = DIRS[d][0], dc = DIRS[d][1];
        var cells = [r * COLS + c];
        var ok = true;
        for (var k = 1; k < 4; k++) {
          var rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== p) { ok = false; break; }
          cells.push(rr * COLS + cc);
        }
        if (ok) return {player: p, cells: cells};
      }
    }
  }
  for (var i = 0; i < 42; i++) if (b[i] === '') return null;
  return {player: 'draw', cells: null};
}

// Heuristic value of a 4-window from X's perspective.
function windowScore(a, bb, cc, dd) {
  var x = 0, o = 0;
  var arr = [a, bb, cc, dd];
  for (var i = 0; i < 4; i++) { if (arr[i] === 'X') x++; else if (arr[i] === 'O') o++; }
  if (x && o) return 0;
  if (x) return x === 3 ? 50 : x === 2 ? 10 : 1;
  if (o) return o === 3 ? -60 : o === 2 ? -10 : -1;
  return 0;
}

function evalBoard(b) {
  var s = 0, r, c, base;
  // center column preference
  for (r = 0; r < ROWS; r++) if (b[r * COLS + 3] === 'X') s += 3; else if (b[r * COLS + 3] === 'O') s -= 3;
  // horizontal windows
  for (r = 0; r < ROWS; r++) for (c = 0; c < COLS - 3; c++) { base = r * COLS + c; s += windowScore(b[base], b[base + 1], b[base + 2], b[base + 3]); }
  // vertical
  for (r = 0; r < ROWS - 3; r++) for (c = 0; c < COLS; c++) { base = r * COLS + c; s += windowScore(b[base], b[base + COLS], b[base + 2 * COLS], b[base + 3 * COLS]); }
  // diagonal down-right
  for (r = 0; r < ROWS - 3; r++) for (c = 0; c < COLS - 3; c++) { base = r * COLS + c; s += windowScore(b[base], b[base + COLS + 1], b[base + 2 * COLS + 2], b[base + 3 * COLS + 3]); }
  // diagonal down-left
  for (r = 0; r < ROWS - 3; r++) for (c = 3; c < COLS; c++) { base = r * COLS + c; s += windowScore(b[base], b[base + COLS - 1], b[base + 2 * COLS - 2], b[base + 3 * COLS - 3]); }
  return s;
}

var ORDER = [3, 2, 4, 1, 5, 0, 6]; // center-first move ordering

function minimax(b, depth, alpha, beta, maximizing) {
  var w = winner(b);
  if (w) {
    if (w.player === 'X') return {score: 100000 + depth};
    if (w.player === 'O') return {score: -100000 - depth};
    return {score: 0};
  }
  if (depth === 0) return {score: evalBoard(b)};

  var avail = moves(b);
  var ordered = [];
  for (var oi = 0; oi < ORDER.length; oi++) if (avail.indexOf(ORDER[oi]) !== -1) ordered.push(ORDER[oi]);

  var bestCol = ordered[0], i, res;
  if (maximizing) {
    var best = -Infinity;
    for (i = 0; i < ordered.length; i++) {
      res = minimax(drop(b, ordered[i], 'X').board, depth - 1, alpha, beta, false).score;
      if (res > best) { best = res; bestCol = ordered[i]; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return {score: best, col: bestCol};
  } else {
    var worst = Infinity;
    for (i = 0; i < ordered.length; i++) {
      res = minimax(drop(b, ordered[i], 'O').board, depth - 1, alpha, beta, true).score;
      if (res < worst) { worst = res; bestCol = ordered[i]; }
      if (worst < beta) beta = worst;
      if (alpha >= beta) break;
    }
    return {score: worst, col: bestCol};
  }
}

function immediate(b, p) {
  var m = moves(b);
  for (var i = 0; i < m.length; i++) {
    var w = winner(drop(b, m[i], p).board);
    if (w && w.player === p) return m[i];
  }
  return -1;
}

// X to move. Returns a column 0..6, or -1 if the board is full.
function aiMove(b, difficulty, rng) {
  rng = rng || Math.random;
  var m = moves(b);
  if (!m.length) return -1;

  if (difficulty === 'easy') {
    var win = immediate(b, 'X'); if (win >= 0) return win;
    var block = immediate(b, 'O'); if (block >= 0) return block;
    return m[Math.floor(rng() * m.length)];
  }
  var depth = difficulty === 'hard' ? 5 : 4; // depth 5 stays strong but responsive on Hermes
  return minimax(b, depth, -Infinity, Infinity, true).col;
}

module.exports = {COLS: COLS, ROWS: ROWS, moves: moves, drop: drop, winner: winner, aiMove: aiMove, evalBoard: evalBoard};
