/**
 * SuperFun — 2048 engine (v0.9)
 *
 * A size×size grid. Tiles slide and equal neighbours merge (once per move).
 * Difficulty maps to the winning target tile (Easy 1024 · Medium 2048 · Hard 4096).
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

function randInt(rng, n) { return (rng() * n) | 0; }

function emptyCells(board) {
  var e = [];
  for (var i = 0; i < board.length; i++) if (board[i] === 0) e.push(i);
  return e;
}

// Spawn a 2 (90%) or 4 (10%) on a random empty cell. Mutates board.
// Returns the index it spawned on, or -1 if the board was full.
function addTile(board, rng) {
  var e = emptyCells(board);
  if (!e.length) return -1;
  var idx = e[randInt(rng, e.length)];
  board[idx] = rng() < 0.9 ? 2 : 4;
  return idx;
}

function maxTile(board) {
  var m = 0;
  for (var i = 0; i < board.length; i++) if (board[i] > m) m = board[i];
  return m;
}

function newGame(size, rng) {
  rng = rng || Math.random;
  var board = new Array(size * size).fill(0);
  addTile(board, rng);
  addTile(board, rng);
  return board;
}

// Compress+merge one line toward index 0. Returns {line, gained, moved}.
function slideLine(line) {
  var xs = line.filter(function (v) { return v; });
  var out = [], gained = 0;
  for (var i = 0; i < xs.length; i++) {
    if (i + 1 < xs.length && xs[i] === xs[i + 1]) { out.push(xs[i] * 2); gained += xs[i] * 2; i++; }
    else out.push(xs[i]);
  }
  while (out.length < line.length) out.push(0);
  var moved = false;
  for (var k = 0; k < line.length; k++) if (line[k] !== out[k]) { moved = true; break; }
  return {line: out, gained: gained, moved: moved};
}

// Indices of a row/column, ordered so slideLine moves in `dir`.
function lineIndices(size, dir, i) {
  var idx = [];
  for (var k = 0; k < size; k++) {
    if (dir === 'L') idx.push(i * size + k);
    else if (dir === 'R') idx.push(i * size + (size - 1 - k));
    else if (dir === 'U') idx.push(k * size + i);
    else idx.push((size - 1 - k) * size + i); // 'D'
  }
  return idx;
}

/** Apply a move. dir ∈ L|R|U|D. Returns {board, moved, gained}. */
function move(board, size, dir) {
  var nb = board.slice(), gained = 0, moved = false;
  for (var i = 0; i < size; i++) {
    var idx = lineIndices(size, dir, i);
    var line = idx.map(function (j) { return board[j]; });
    var r = slideLine(line);
    if (r.moved) moved = true;
    gained += r.gained;
    for (var k = 0; k < size; k++) nb[idx[k]] = r.line[k];
  }
  return {board: nb, moved: moved, gained: gained};
}

function hasWon(board, target) {
  for (var i = 0; i < board.length; i++) if (board[i] >= target) return true;
  return false;
}

function canMove(board, size) {
  if (emptyCells(board).length) return true;
  for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
    var v = board[r * size + c];
    if (c + 1 < size && board[r * size + c + 1] === v) return true;
    if (r + 1 < size && board[(r + 1) * size + c] === v) return true;
  }
  return false;
}

module.exports = {
  newGame: newGame, addTile: addTile, move: move, maxTile: maxTile,
  hasWon: hasWon, canMove: canMove, emptyCells: emptyCells,
};
