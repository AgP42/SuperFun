/**
 * SuperFun — Tic-Tac-Toe engine (v0.2)
 *
 * The human is 'O' and always moves first; the Supernote is 'X'.
 * Board: Array(9) of 'O' | 'X' | '' (empty), indices 0..8 row-major.
 *
 * Difficulty tunes the AI:
 *   easy   — random legal move
 *   medium — win/block heuristics, otherwise ~50% perfect play, else random
 *   hard   — perfect minimax (unbeatable; best the human can get is a draw)
 *
 * CommonJS so it runs under both Node (tests) and the RN/Hermes runtime.
 */
'use strict';

var LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

function winner(b) {
  for (var i = 0; i < LINES.length; i++) {
    var L = LINES[i];
    if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) {
      return {player: b[L[0]], line: L};
    }
  }
  for (var k = 0; k < 9; k++) if (!b[k]) return null; // still playing
  return {player: 'draw', line: null};
}

function empties(b) {
  var e = [];
  for (var i = 0; i < 9; i++) if (!b[i]) e.push(i);
  return e;
}

// Minimax: X maximizes, O minimizes. Returns {score, move}. depth favours
// faster wins / slower losses so the AI plays the most decisive line.
function minimax(b, turn, depth) {
  var w = winner(b);
  if (w) {
    if (w.player === 'X') return {score: 10 - depth, move: -1};
    if (w.player === 'O') return {score: depth - 10, move: -1};
    return {score: 0, move: -1};
  }
  var e = empties(b);
  var best = {score: turn === 'X' ? -Infinity : Infinity, move: e[0]};
  for (var i = 0; i < e.length; i++) {
    var idx = e[i];
    b[idx] = turn;
    var res = minimax(b, turn === 'X' ? 'O' : 'X', depth + 1);
    b[idx] = '';
    if (turn === 'X') {
      if (res.score > best.score) best = {score: res.score, move: idx};
    } else {
      if (res.score < best.score) best = {score: res.score, move: idx};
    }
  }
  return best;
}

function perfectMove(b) {
  return minimax(b.slice(), 'X', 0).move;
}

// Immediate win for `p`, else null.
function winningMove(b, p) {
  var e = empties(b);
  for (var i = 0; i < e.length; i++) {
    var t = b.slice();
    t[e[i]] = p;
    var w = winner(t);
    if (w && w.player === p) return e[i];
  }
  return null;
}

function randomMove(b, rng) {
  var e = empties(b);
  if (!e.length) return -1;
  return e[Math.floor((rng || Math.random)() * e.length)];
}

/**
 * Choose X's move for the given difficulty. Returns a board index (0..8),
 * or -1 if the board is full.
 */
function aiMove(b, difficulty, rng) {
  rng = rng || Math.random;
  if (empties(b).length === 0) return -1;

  if (difficulty === 'easy') {
    return randomMove(b, rng);
  }

  if (difficulty === 'medium') {
    var win = winningMove(b, 'X');
    if (win != null) return win;         // take a win
    var block = winningMove(b, 'O');
    if (block != null) return block;     // block a loss
    if (rng() < 0.5) return perfectMove(b);
    return randomMove(b, rng);
  }

  // hard — perfect play
  return perfectMove(b);
}

module.exports = {
  LINES: LINES,
  winner: winner,
  empties: empties,
  aiMove: aiMove,
  perfectMove: perfectMove,
  winningMove: winningMove,
};
