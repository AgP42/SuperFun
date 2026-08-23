/**
 * SuperFun — 15-puzzle / taquin engine (v0.9)
 *
 * size×size sliding tiles numbered 1..n with one blank (0). Slide a tile that
 * neighbours the blank into it. Shuffled by random legal moves so it's always
 * solvable. Difficulty = board size (Easy 3×3 · Medium 4×4 · Hard 5×5).
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

function randInt(rng, n) { return (rng() * n) | 0; }

function solved(size) {
  var b = [];
  for (var i = 1; i < size * size; i++) b.push(i);
  b.push(0);
  return b;
}

function isSolved(board) {
  for (var i = 0; i < board.length - 1; i++) if (board[i] !== i + 1) return false;
  return board[board.length - 1] === 0;
}

function blankIndex(board) { return board.indexOf(0); }

// Neighbour indices of the blank (the tiles you could slide).
function movable(board, size) {
  var b = blankIndex(board), r = (b / size) | 0, c = b % size, m = [];
  if (r > 0) m.push(b - size);
  if (r < size - 1) m.push(b + size);
  if (c > 0) m.push(b - 1);
  if (c < size - 1) m.push(b + 1);
  return m;
}

// Slide the tile at idx into the blank if they are adjacent. Returns new board or null.
function slide(board, size, idx) {
  if (movable(board, size).indexOf(idx) === -1) return null;
  var nb = board.slice(), b = blankIndex(board);
  nb[b] = board[idx];
  nb[idx] = 0;
  return nb;
}

/** A shuffled, solvable, non-solved board. */
function newGame(size, rng) {
  rng = rng || Math.random;
  var board = solved(size), prev = -1;
  var steps = size * size * 40;
  for (var s = 0; s < steps; s++) {
    var m = movable(board, size).filter(function (i) { return i !== prev; });
    var pick = m[randInt(rng, m.length)];
    prev = blankIndex(board); // the cell the blank leaves = don't immediately undo
    board = slide(board, size, pick);
  }
  if (isSolved(board)) { // extremely unlikely, nudge once
    board = slide(board, size, movable(board, size)[0]);
  }
  return board;
}

// Sum of Manhattan distances of every tile to its home cell.
function manhattan(board, size) {
  var h = 0;
  for (var i = 0; i < board.length; i++) {
    var v = board[i];
    if (v === 0) continue;
    var home = v - 1;
    h += Math.abs(((i / size) | 0) - ((home / size) | 0)) + Math.abs((i % size) - (home % size));
  }
  return h;
}

/**
 * Weighted A* hint. Returns the BOARD POSITION of the tile to slide next toward
 * a solution (not necessarily optimal — a valid nudge), or -1 if already solved
 * or no solution found within `cap` expansions (heavy 5×5 scrambles).
 */
function solveNext(board, size, cap, w) {
  cap = cap || 45000;
  if (isSolved(board)) return -1;
  var W = w || 2; // >1 → fast, non-optimal — fine for a hint
  var heap = [];
  function push(node) {
    heap.push(node);
    var i = heap.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; }
  }
  function pop() {
    var top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; var i = 0, n = heap.length;
      for (;;) { var l = 2 * i + 1, r = 2 * i + 2, m = i;
        if (l < n && heap[l].f < heap[m].f) m = l;
        if (r < n && heap[r].f < heap[m].f) m = r;
        if (m === i) break; var t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; }
    }
    return top;
  }
  push({board: board.slice(), g: 0, f: W * manhattan(board, size), first: -1});
  var seen = {}; seen[board.join(',')] = 0;
  var expand = 0;
  while (heap.length && expand < cap) {
    var cur = pop(); expand++;
    if (isSolved(cur.board)) return cur.first;
    var mv = movable(cur.board, size);
    for (var k = 0; k < mv.length; k++) {
      var idx = mv[k], nb = slide(cur.board, size, idx), key = nb.join(','), ng = cur.g + 1;
      if (seen[key] !== undefined && seen[key] <= ng) continue;
      seen[key] = ng;
      push({board: nb, g: ng, f: ng + W * manhattan(nb, size), first: cur.first === -1 ? idx : cur.first});
    }
  }
  return -1;
}

module.exports = {
  solved: solved, isSolved: isSolved, blankIndex: blankIndex,
  movable: movable, slide: slide, newGame: newGame,
  manhattan: manhattan, solveNext: solveNext,
};
