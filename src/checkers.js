/**
 * SuperFun — Checkers / draughts engine + AI (English/American rules) (v0.12)
 *
 * 8×8 on dark squares. Player 1 = you (bottom, moves up), 2 = the Supernote
 * (top, moves down). Values: 0 empty, 1 man(you), 2 man(AI), 3 king(you),
 * 4 king(AI). Men step/capture diagonally forward; kings any diagonal.
 * Captures are mandatory and chain (multi-jumps); reaching the far row crowns
 * a man and ends the move. AI = alpha-beta negamax on material + advancement.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

var ALL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var MAN1 = [[-1, -1], [-1, 1]]; // you move up
var MAN2 = [[1, -1], [1, 1]];   // AI moves down

function owner(v) { return (v === 1 || v === 3) ? 1 : (v === 2 || v === 4) ? 2 : 0; }
function isKing(v) { return v === 3 || v === 4; }
function opp(p) { return p === 1 ? 2 : 1; }

function initBoard() {
  var b = new Array(64).fill(0);
  for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
    if ((r + c) % 2 === 1) {
      if (r < 3) b[r * 8 + c] = 2;
      else if (r > 4) b[r * 8 + c] = 1;
    }
  }
  return b;
}

function dirsFor(v, player) { return isKing(v) ? ALL : (player === 1 ? MAN1 : MAN2); }

// All terminal capture sequences starting at `cur` for `player`.
function captureSeqs(b, cur, player) {
  var r = (cur / 8) | 0, c = cur % 8, pc = b[cur];
  var dirs = dirsFor(pc, player), seqs = [];
  for (var d = 0; d < dirs.length; d++) {
    var dr = dirs[d][0], dc = dirs[d][1];
    var mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
    if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
    var mid = mr * 8 + mc, land = lr * 8 + lc;
    if (b[mid] !== 0 && owner(b[mid]) === opp(player) && b[land] === 0) {
      var nb = b.slice();
      nb[land] = nb[cur]; nb[cur] = 0; nb[mid] = 0;
      var promo = false;
      if (nb[land] === 1 && lr === 0) { nb[land] = 3; promo = true; }
      if (nb[land] === 2 && lr === 7) { nb[land] = 4; promo = true; }
      if (promo) { seqs.push({to: land, captures: [mid], promo: true}); continue; } // crownhead ends
      var sub = captureSeqs(nb, land, player);
      if (sub.length) {
        for (var s = 0; s < sub.length; s++) seqs.push({to: sub[s].to, captures: [mid].concat(sub[s].captures), promo: sub[s].promo});
      } else {
        seqs.push({to: land, captures: [mid], promo: false});
      }
    }
  }
  return seqs;
}

function legalMoves(b, player) {
  var caps = [], i, r, c, pc, dirs, d;
  for (i = 0; i < 64; i++) {
    if (owner(b[i]) !== player) continue;
    var seqs = captureSeqs(b, i, player);
    for (var s = 0; s < seqs.length; s++) caps.push({from: i, to: seqs[s].to, captures: seqs[s].captures, promo: seqs[s].promo});
  }
  if (caps.length) return caps; // captures are mandatory
  var simples = [];
  for (i = 0; i < 64; i++) {
    if (owner(b[i]) !== player) continue;
    pc = b[i]; r = (i / 8) | 0; c = i % 8; dirs = dirsFor(pc, player);
    for (d = 0; d < dirs.length; d++) {
      var nr = r + dirs[d][0], nc = c + dirs[d][1];
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      var t = nr * 8 + nc;
      if (b[t] === 0) simples.push({from: i, to: t, captures: [], promo: (pc === 1 && nr === 0) || (pc === 2 && nr === 7)});
    }
  }
  return simples;
}

function applyMove(b, mv) {
  var nb = b.slice(), pc = nb[mv.from];
  nb[mv.from] = 0;
  for (var i = 0; i < mv.captures.length; i++) nb[mv.captures[i]] = 0;
  nb[mv.to] = pc;
  var lr = (mv.to / 8) | 0;
  if (nb[mv.to] === 1 && lr === 0) nb[mv.to] = 3;
  if (nb[mv.to] === 2 && lr === 7) nb[mv.to] = 4;
  return nb;
}

function evalBoard(b, player) {
  var s = 0;
  for (var i = 0; i < 64; i++) {
    var v = b[i]; if (v === 0) continue;
    var r = (i / 8) | 0;
    var val = isKing(v) ? 175 : 100;
    if (v === 1) val += (7 - r) * 4;
    else if (v === 2) val += r * 4;
    s += owner(v) === player ? val : -val;
  }
  return s;
}

function negamax(b, toMove, depth, alpha, beta) {
  var moves = legalMoves(b, toMove);
  if (moves.length === 0) return -100000 - depth; // no move = loss (prefer later losses)
  if (depth === 0) return evalBoard(b, toMove);
  var best = -Infinity;
  for (var i = 0; i < moves.length; i++) {
    var v = -negamax(applyMove(b, moves[i]), opp(toMove), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function aiMove(b, player, difficulty) {
  var moves = legalMoves(b, player);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  var depth = difficulty === 'hard' ? 5 : difficulty === 'easy' ? 2 : 4;
  var best = -Infinity, bm = moves[0];
  for (var i = 0; i < moves.length; i++) {
    var v = -negamax(applyMove(b, moves[i]), opp(player), depth - 1, -Infinity, Infinity);
    if (v > best) { best = v; bm = moves[i]; }
  }
  return bm;
}

module.exports = {
  owner: owner, isKing: isKing, opp: opp, initBoard: initBoard,
  legalMoves: legalMoves, applyMove: applyMove, aiMove: aiMove,
};
