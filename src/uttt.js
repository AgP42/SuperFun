/**
 * SuperFun — Ultimate Tic-Tac-Toe engine + MCTS AI (v0.6)
 *
 * A 3×3 grid of 3×3 boards. Your move sends the opponent to the small board
 * matching the cell you played; if that board is already decided, they play
 * anywhere. Win a small board to claim its meta-cell; three claimed in a row
 * wins the game.
 *
 * Players: 1 = O (first / human / P1), 2 = X (second / AI / P2).
 * State: {cells: Uint8Array(81), sub: Uint8Array(9), active: -1|0..8, turn: 1|2}
 *   cells[b*9 + c] = value of cell c in sub-board b
 *   sub[b] = 0 undecided, 1 O-won, 2 X-won, 3 draw
 *   active = sub-board the current player must play in, or -1 for free choice
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

var LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function initState() {
  return {cells: new Uint8Array(81), sub: new Uint8Array(9), active: -1, turn: 1};
}
function cloneState(s) {
  return {cells: s.cells.slice(), sub: s.sub.slice(), active: s.active, turn: s.turn};
}

// Winner (1/2) of a small board's 9 cells starting at offset, else 0.
function smallWinner(cells, off) {
  for (var i = 0; i < LINES.length; i++) {
    var L = LINES[i], a = cells[off + L[0]];
    if (a && a === cells[off + L[1]] && a === cells[off + L[2]]) return a;
  }
  return 0;
}
function subFull(cells, off) {
  for (var c = 0; c < 9; c++) if (!cells[off + c]) return false;
  return true;
}

// Legal moves as flat indices (b*9 + c).
function legalMoves(s) {
  var m = [], b, c;
  if (s.active !== -1 && s.sub[s.active] === 0) {
    var off = s.active * 9;
    for (c = 0; c < 9; c++) if (!s.cells[off + c]) m.push(off + c);
    return m;
  }
  for (b = 0; b < 9; b++) {
    if (s.sub[b] !== 0) continue;
    for (c = 0; c < 9; c++) if (!s.cells[b * 9 + c]) m.push(b * 9 + c);
  }
  return m;
}

// Apply move in place; returns undo record.
function applyMove(s, idx) {
  var b = (idx / 9) | 0, c = idx % 9, off = b * 9;
  var prevSub = s.sub[b], prevActive = s.active, prevTurn = s.turn;
  s.cells[idx] = s.turn;
  if (s.sub[b] === 0) {
    var w = smallWinner(s.cells, off);
    if (w) s.sub[b] = w;
    else if (subFull(s.cells, off)) s.sub[b] = 3;
  }
  s.active = s.sub[c] === 0 ? c : -1; // next board = the cell just played, unless decided
  s.turn = s.turn === 1 ? 2 : 1;
  return {idx: idx, b: b, prevSub: prevSub, prevActive: prevActive, prevTurn: prevTurn};
}
function undoMove(s, u) {
  s.cells[u.idx] = 0;
  s.sub[u.b] = u.prevSub;
  s.active = u.prevActive;
  s.turn = u.prevTurn;
}

// Overall winner: 1/2 win, 3 draw, 0 ongoing.
function winner(s) {
  for (var i = 0; i < LINES.length; i++) {
    var L = LINES[i], a = s.sub[L[0]];
    if (a === 1 || a === 2) {
      if (a === s.sub[L[1]] && a === s.sub[L[2]]) return a;
    }
  }
  for (var b = 0; b < 9; b++) if (s.sub[b] === 0) return 0; // still boards to decide
  return 3; // all decided, no line → draw
}

function randInt(rng, n) { return (rng() * n) | 0; }

// Random playout from a cloned state; returns winner (1/2/3).
function playout(s, rng) {
  var w = winner(s);
  while (w === 0) {
    var m = legalMoves(s);
    applyMove(s, m[randInt(rng, m.length)]);
    w = winner(s);
  }
  return w;
}

/**
 * MCTS. Returns the best flat move index for s.turn. `iters` playouts.
 */
function mcts(root, iters, rng) {
  rng = rng || Math.random;
  var rootMoves = legalMoves(root);
  if (rootMoves.length === 1) return rootMoves[0];

  // node: {move, parent, children, N, W, untried, justMoved}
  var rootNode = {move: -1, parent: null, children: [], N: 0, W: 0,
    untried: rootMoves.slice(), justMoved: root.turn === 1 ? 2 : 1};

  for (var it = 0; it < iters; it++) {
    var s = cloneState(root);
    var node = rootNode;

    // 1. Selection
    while (node.untried.length === 0 && node.children.length > 0) {
      var best = null, bestVal = -Infinity;
      var lnN = Math.log(node.N + 1);
      for (var i = 0; i < node.children.length; i++) {
        var ch = node.children[i];
        var uct = ch.W / ch.N + 1.4 * Math.sqrt(lnN / ch.N);
        if (uct > bestVal) { bestVal = uct; best = ch; }
      }
      node = best;
      applyMove(s, node.move);
    }

    // 2. Expansion
    if (node.untried.length > 0 && winner(s) === 0) {
      var mi = randInt(rng, node.untried.length);
      var mv = node.untried[mi];
      node.untried.splice(mi, 1);
      var mover = s.turn;
      applyMove(s, mv);
      var child = {move: mv, parent: node, children: [], N: 0, W: 0,
        untried: legalMoves(s), justMoved: mover};
      node.children.push(child);
      node = child;
    }

    // 3. Simulation
    var w = playout(s, rng);

    // 4. Backprop
    while (node) {
      node.N++;
      if (w === 3) node.W += 0.5;
      else if (w === node.justMoved) node.W += 1;
      node = node.parent;
    }
  }

  // pick most-visited child
  var pick = rootNode.children[0];
  for (var k = 1; k < rootNode.children.length; k++) if (rootNode.children[k].N > pick.N) pick = rootNode.children[k];
  return pick.move;
}

// Immediate helpers for the 'easy' tier.
function winningMove(s, player) {
  var m = legalMoves(s);
  for (var i = 0; i < m.length; i++) {
    var u = applyMove(s, m[i]);
    // did this claim a small board that completes a meta line? just check overall winner
    var w = winner(s);
    undoMove(s, u);
    if (w === player) return m[i];
  }
  return -1;
}

/** AI move for the current player (s.turn). Difficulty = search budget. */
function aiMove(s, difficulty, rng) {
  rng = rng || Math.random;
  var m = legalMoves(s);
  if (m.length === 0) return -1;
  if (difficulty === 'easy') {
    var win = winningMove(s, s.turn);
    if (win >= 0) return win;
    if (rng() < 0.6) return m[randInt(rng, m.length)]; // mostly random
    return mcts(s, 120, rng);
  }
  // budgets tuned so a move stays ~<1s on the device (Hermes ≈ 90× desktop);
  // even 400 playouts already crush random play.
  var iters = difficulty === 'hard' ? 600 : 300;
  return mcts(s, iters, rng);
}

module.exports = {
  LINES: LINES, initState: initState, cloneState: cloneState,
  legalMoves: legalMoves, applyMove: applyMove, undoMove: undoMove,
  winner: winner, smallWinner: smallWinner, mcts: mcts, aiMove: aiMove,
};
