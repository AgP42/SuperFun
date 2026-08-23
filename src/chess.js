/**
 * SuperFun — Chess engine + AI.
 *
 * Board = string[64], index = row*8 + col, row 0 = rank 8 (top), col 0 = file a.
 * Pieces: white UPPERCASE 'PNBRQK', black lowercase 'pnbrqk', '' = empty.
 * White (player 1) plays up the board (row decreasing); Black plays down.
 *
 * State = {board, turn:'w'|'b', castle:{K,Q,k,q}, ep:-1}. Full rules: castling,
 * en passant, promotion, check / checkmate / stalemate, basic insufficient
 * material draw. AI = alpha-beta negamax with material + piece-square eval.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

function isWhite(p) { return !!p && p >= 'A' && p <= 'Z'; }
function isBlack(p) { return !!p && p >= 'a' && p <= 'z'; }
function sameSide(p, white) { return white ? isWhite(p) : isBlack(p); }
function onBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function initBoard() {
  var back = 'rnbqkbnr';
  var b = new Array(64).fill('');
  for (var c = 0; c < 8; c++) {
    b[0 * 8 + c] = back[c];          // black back rank (row 0)
    b[1 * 8 + c] = 'p';              // black pawns
    b[6 * 8 + c] = 'P';             // white pawns
    b[7 * 8 + c] = back[c].toUpperCase(); // white back rank (row 7)
  }
  return {board: b, turn: 'w', castle: {K: true, Q: true, k: true, q: true}, ep: -1};
}

function clone(st) {
  return {board: st.board.slice(), turn: st.turn, castle: {K: st.castle.K, Q: st.castle.Q, k: st.castle.k, q: st.castle.q}, ep: st.ep};
}

var KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
var KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
var BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Is square (r,c) attacked by the given side (white=true)? board only, no state.
function attacked(board, r, c, byWhite) {
  // pawns: a white pawn attacks up-left/up-right (from below)
  var pr = byWhite ? 1 : -1; // attacker sits one row toward its own side
  var pawn = byWhite ? 'P' : 'p';
  if (onBoard(r + pr, c - 1) && board[(r + pr) * 8 + (c - 1)] === pawn) return true;
  if (onBoard(r + pr, c + 1) && board[(r + pr) * 8 + (c + 1)] === pawn) return true;
  var i, nr, nc;
  var kn = byWhite ? 'N' : 'n';
  for (i = 0; i < 8; i++) { nr = r + KNIGHT[i][0]; nc = c + KNIGHT[i][1]; if (onBoard(nr, nc) && board[nr * 8 + nc] === kn) return true; }
  var kg = byWhite ? 'K' : 'k';
  for (i = 0; i < 8; i++) { nr = r + KING[i][0]; nc = c + KING[i][1]; if (onBoard(nr, nc) && board[nr * 8 + nc] === kg) return true; }
  var B = byWhite ? 'B' : 'b', Q = byWhite ? 'Q' : 'q', R = byWhite ? 'R' : 'r';
  for (i = 0; i < 4; i++) { // diagonals: bishop/queen
    nr = r + BISHOP[i][0]; nc = c + BISHOP[i][1];
    while (onBoard(nr, nc)) { var p = board[nr * 8 + nc]; if (p) { if (p === B || p === Q) return true; break; } nr += BISHOP[i][0]; nc += BISHOP[i][1]; }
  }
  for (i = 0; i < 4; i++) { // orthogonals: rook/queen
    nr = r + ROOK[i][0]; nc = c + ROOK[i][1];
    while (onBoard(nr, nc)) { var p2 = board[nr * 8 + nc]; if (p2) { if (p2 === R || p2 === Q) return true; break; } nr += ROOK[i][0]; nc += ROOK[i][1]; }
  }
  return false;
}

function kingIdx(board, white) {
  var k = white ? 'K' : 'k';
  for (var i = 0; i < 64; i++) if (board[i] === k) return i;
  return -1;
}

function inCheck(st, white) {
  var ki = kingIdx(st.board, white);
  if (ki < 0) return false;
  return attacked(st.board, (ki / 8) | 0, ki % 8, !white);
}

// Pseudo-legal moves for the side to move (may leave own king in check).
function pseudo(st) {
  var b = st.board, white = st.turn === 'w', moves = [], i, r, c, nr, nc, d, p;
  for (i = 0; i < 64; i++) {
    p = b[i]; if (!p || !sameSide(p, white)) continue;
    r = (i / 8) | 0; c = i % 8;
    var lp = p.toLowerCase();
    if (lp === 'p') {
      var dir = white ? -1 : 1, start = white ? 6 : 1, promo = white ? 0 : 7;
      // forward 1
      nr = r + dir;
      if (onBoard(nr, c) && !b[nr * 8 + c]) {
        pushPawn(moves, i, nr * 8 + c, nr === promo);
        // forward 2 from start
        if (r === start && !b[(r + 2 * dir) * 8 + c]) moves.push({from: i, to: (r + 2 * dir) * 8 + c, flag: '2pawn'});
      }
      // captures
      for (d = -1; d <= 1; d += 2) {
        nc = c + d; nr = r + dir;
        if (!onBoard(nr, nc)) continue;
        var t = nr * 8 + nc;
        if (b[t] && !sameSide(b[t], white)) pushPawn(moves, i, t, nr === promo);
        else if (t === st.ep) moves.push({from: i, to: t, flag: 'ep'});
      }
    } else if (lp === 'n') {
      for (d = 0; d < 8; d++) { nr = r + KNIGHT[d][0]; nc = c + KNIGHT[d][1]; if (onBoard(nr, nc) && !sameSide(b[nr * 8 + nc], white)) moves.push({from: i, to: nr * 8 + nc}); }
    } else if (lp === 'k') {
      for (d = 0; d < 8; d++) { nr = r + KING[d][0]; nc = c + KING[d][1]; if (onBoard(nr, nc) && !sameSide(b[nr * 8 + nc], white)) moves.push({from: i, to: nr * 8 + nc}); }
      // castling
      castleMoves(st, white, i, moves);
    } else {
      var dirs = lp === 'b' ? BISHOP : lp === 'r' ? ROOK : KING; // queen uses KING dirs (all 8)
      var slide = lp !== 'k';
      for (d = 0; d < dirs.length; d++) {
        nr = r + dirs[d][0]; nc = c + dirs[d][1];
        while (onBoard(nr, nc)) {
          var q = b[nr * 8 + nc];
          if (!q) moves.push({from: i, to: nr * 8 + nc});
          else { if (!sameSide(q, white)) moves.push({from: i, to: nr * 8 + nc}); break; }
          if (!slide) break;
          nr += dirs[d][0]; nc += dirs[d][1];
        }
      }
    }
  }
  return moves;
}

function pushPawn(moves, from, to, isPromo) {
  if (isPromo) { moves.push({from: from, to: to, promo: 'Q'}); }
  else moves.push({from: from, to: to});
}

function castleMoves(st, white, ki, moves) {
  var b = st.board, row = white ? 7 : 0, base = row * 8;
  if (ki !== base + 4) return; // king must be on its home square
  if (inCheck(st, white)) return;
  var opp = !white;
  // king side
  var cK = white ? st.castle.K : st.castle.k;
  if (cK && !b[base + 5] && !b[base + 6] && (white ? b[base + 7] === 'R' : b[base + 7] === 'r')) {
    if (!attacked(b, row, 5, opp) && !attacked(b, row, 6, opp)) moves.push({from: ki, to: base + 6, flag: 'castleK'});
  }
  var cQ = white ? st.castle.Q : st.castle.q;
  if (cQ && !b[base + 3] && !b[base + 2] && !b[base + 1] && (white ? b[base + 0] === 'R' : b[base + 0] === 'r')) {
    if (!attacked(b, row, 3, opp) && !attacked(b, row, 2, opp)) moves.push({from: ki, to: base + 2, flag: 'castleQ'});
  }
}

// Apply a move → new state (assumes the move came from legalMoves/pseudo).
function applyMove(st, m) {
  var n = clone(st), b = n.board, white = st.turn === 'w', p = b[m.from];
  n.ep = -1;
  b[m.to] = p; b[m.from] = '';
  var lp = p.toLowerCase();
  if (m.flag === 'ep') { // remove the pawn that was passed
    var capRow = ((m.to / 8) | 0) + (white ? 1 : -1);
    b[capRow * 8 + (m.to % 8)] = '';
  } else if (m.flag === '2pawn') {
    n.ep = ((m.from + m.to) / 2) | 0; // square jumped over
  } else if (m.flag === 'castleK') {
    var row = (m.to / 8) | 0; b[row * 8 + 5] = b[row * 8 + 7]; b[row * 8 + 7] = '';
  } else if (m.flag === 'castleQ') {
    var row2 = (m.to / 8) | 0; b[row2 * 8 + 3] = b[row2 * 8 + 0]; b[row2 * 8 + 0] = '';
  }
  if (m.promo) b[m.to] = white ? m.promo : m.promo.toLowerCase();
  // castling rights
  if (lp === 'k') { if (white) { n.castle.K = false; n.castle.Q = false; } else { n.castle.k = false; n.castle.q = false; } }
  if (m.from === 60 || m.to === 60) n.castle.Q = false; // a1
  if (m.from === 63 || m.to === 63) n.castle.K = false; // h1
  if (m.from === 0 || m.to === 0) n.castle.q = false;   // a8
  if (m.from === 7 || m.to === 7) n.castle.k = false;   // h8
  n.turn = white ? 'b' : 'w';
  return n;
}

function legalMoves(st) {
  var ps = pseudo(st), out = [], white = st.turn === 'w';
  for (var i = 0; i < ps.length; i++) {
    var n = applyMove(st, ps[i]);
    if (!inCheck(n, white)) out.push(ps[i]);
  }
  return out;
}

function insufficient(board) {
  var pieces = [];
  for (var i = 0; i < 64; i++) { var p = board[i]; if (p && p.toLowerCase() !== 'k') pieces.push(p.toLowerCase()); }
  if (pieces.length === 0) return true;                      // K vs K
  if (pieces.length === 1 && (pieces[0] === 'n' || pieces[0] === 'b')) return true; // K+minor vs K
  return false;
}

// {over, result:'w'|'b'|'draw'|null, reason}
function status(st) {
  var moves = legalMoves(st), white = st.turn === 'w';
  if (moves.length === 0) {
    if (inCheck(st, white)) return {over: true, result: white ? 'b' : 'w', reason: 'checkmate'};
    return {over: true, result: 'draw', reason: 'stalemate'};
  }
  if (insufficient(st.board)) return {over: true, result: 'draw', reason: 'insufficient material'};
  return {over: false, result: null, reason: ''};
}

// ---- AI ------------------------------------------------------------------
var VAL = {p: 100, n: 320, b: 330, r: 500, q: 900, k: 0};
// piece-square tables (from white's view, index row0=top/rank8). Small nudges.
var PST_P = [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0];
var PST_N = [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50];
var PST_B = [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20];
function pst(lp, idx, white) {
  var j = white ? idx : (63 - idx); // mirror for black
  if (lp === 'p') return PST_P[j];
  if (lp === 'n') return PST_N[j];
  if (lp === 'b') return PST_B[j];
  return 0;
}

// Evaluation from the perspective of the side to move.
function evaluate(st) {
  var s = 0, b = st.board;
  for (var i = 0; i < 64; i++) {
    var p = b[i]; if (!p) continue;
    var lp = p.toLowerCase(), w = isWhite(p);
    var v = VAL[lp] + pst(lp, i, w);
    s += w ? v : -v;
  }
  return st.turn === 'w' ? s : -s;
}

function orderMoves(st, moves) {
  var b = st.board;
  moves.sort(function (a, c) {
    var ca = b[a.to] ? VAL[b[a.to].toLowerCase()] : 0;
    var cc = b[c.to] ? VAL[b[c.to].toLowerCase()] : 0;
    return cc - ca; // captures of valuable pieces first
  });
  return moves;
}

function negamax(st, depth, alpha, beta) {
  if (depth === 0) return evaluate(st);
  var moves = legalMoves(st);
  if (moves.length === 0) return inCheck(st, st.turn === 'w') ? (-100000 - depth) : 0; // mate (prefer sooner) / stalemate
  orderMoves(st, moves);
  var best = -Infinity;
  for (var i = 0; i < moves.length; i++) {
    var v = -negamax(applyMove(st, moves[i]), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// difficulty: 'easy'|'medium'|'hard' → search depth. Returns a move or null.
function aiMove(st, difficulty, rng) {
  rng = rng || Math.random;
  var depth = difficulty === 'hard' ? 3 : difficulty === 'medium' ? 2 : 1;
  var moves = legalMoves(st);
  if (!moves.length) return null;
  orderMoves(st, moves);
  var best = -Infinity, pick = [], i;
  for (i = 0; i < moves.length; i++) {
    var v = -negamax(applyMove(st, moves[i]), depth - 1, -Infinity, Infinity);
    if (difficulty === 'easy') v += (rng() * 60 - 30); // sprinkle mistakes on easy
    if (v > best + 1e-6) { best = v; pick = [moves[i]]; }
    else if (v > best - 1e-6) pick.push(moves[i]);
  }
  return pick[(rng() * pick.length) | 0];
}

function idxToSquare(i) { return 'abcdefgh'[i % 8] + (8 - ((i / 8) | 0)); }

module.exports = {
  initBoard: initBoard, clone: clone, legalMoves: legalMoves, applyMove: applyMove,
  inCheck: inCheck, status: status, aiMove: aiMove, attacked: attacked, kingIdx: kingIdx,
  isWhite: isWhite, isBlack: isBlack, idxToSquare: idxToSquare,
};
