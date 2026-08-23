/**
 * SuperFun — International Draughts ("jeu de dames") engine + AI (v0.16)
 *
 * 10×10, 20 pieces each on dark squares. Player 1 = you (bottom, men move up),
 * 2 = the Supernote (top). International rules:
 *   - Men move one square diagonally forward, but CAPTURE in any diagonal
 *     direction (forward or backward).
 *   - Kings are FLYING: move/capture any distance along a diagonal.
 *   - Capture is compulsory and you must take the MAXIMUM number of pieces.
 *   - Captured pieces stay on the board as blockers until the move ends, and a
 *     piece is never jumped twice.
 *   - A man promotes to King only if it ENDS its move on the last row.
 *
 * Values: 0 empty, 1 man(you), 2 man(AI), 3 king(you), 4 king(AI).
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

var ALL4 = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var MAN1 = [[-1, -1], [-1, 1]]; // you move up
var MAN2 = [[1, -1], [1, 1]];   // AI moves down

function owner(v) { return (v === 1 || v === 3) ? 1 : (v === 2 || v === 4) ? 2 : 0; }
function isKing(v) { return v === 3 || v === 4; }
function opp(p) { return p === 1 ? 2 : 1; }

function initBoard() {
  var b = new Array(100).fill(0);
  for (var r = 0; r < 10; r++) for (var c = 0; c < 10; c++) {
    if ((r + c) % 2 === 1) {
      if (r < 4) b[r * 10 + c] = 2;
      else if (r > 5) b[r * 10 + c] = 1;
    }
  }
  return b;
}

// All terminal capture sequences from `from`. Captured pieces stay on the
// board (as blockers) until the sequence ends; `bb` is a working copy with the
// moving piece lifted off `from`.
function captureSeqsFrom(board, from) {
  var piece = board[from], player = owner(piece), king = isKing(piece);
  function rec(bb, cur, captured) {
    var r = (cur / 10) | 0, c = cur % 10, results = [];
    for (var d = 0; d < 4; d++) {
      var dr = ALL4[d][0], dc = ALL4[d][1];
      if (king) {
        var seen = -1;
        for (var j = 1; ; j++) {
          var pr = r + j * dr, pc = c + j * dc;
          if (pr < 0 || pr > 9 || pc < 0 || pc > 9) break;
          var pos = pr * 10 + pc, val = bb[pos];
          if (val === 0) {
            if (seen >= 0) results = collect(results, bb, cur, pos, seen, captured);
            continue;
          }
          if (seen >= 0) break; // a second piece blocks
          if (owner(val) === opp(player) && captured.indexOf(pos) === -1) { seen = pos; continue; }
          break; // own piece, or already-captured blocker
        }
      } else {
        var mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (lr < 0 || lr > 9 || lc < 0 || lc > 9) continue;
        var mid = mr * 10 + mc, land = lr * 10 + lc;
        if (bb[mid] !== 0 && owner(bb[mid]) === opp(player) && captured.indexOf(mid) === -1 && bb[land] === 0) {
          results = collect(results, bb, cur, land, mid, captured);
        }
      }
    }
    return results;
  }
  function collect(results, bb, cur, land, mid, captured) {
    var bb2 = bb.slice();
    bb2[cur] = 0; bb2[land] = piece; // jumped piece (at mid) stays on board as blocker
    var nc = captured.concat([mid]);
    var subs = rec(bb2, land, nc);
    if (subs.length) { for (var i = 0; i < subs.length; i++) results.push(subs[i]); }
    else results.push({to: land, captured: nc});
    return results;
  }
  var bb0 = board.slice(); bb0[from] = 0;
  return rec(bb0, from, []);
}

function legalMoves(board, player) {
  var caps = [], i, r, c, pc, d;
  for (i = 0; i < 100; i++) {
    if (owner(board[i]) !== player) continue;
    var seqs = captureSeqsFrom(board, i);
    for (var s = 0; s < seqs.length; s++) caps.push({from: i, to: seqs[s].to, captured: seqs[s].captured});
  }
  if (caps.length) {
    var max = 0;
    for (i = 0; i < caps.length; i++) if (caps[i].captured.length > max) max = caps[i].captured.length;
    return caps.filter(function (m) { return m.captured.length === max; });
  }
  var simples = [];
  for (i = 0; i < 100; i++) {
    if (owner(board[i]) !== player) continue;
    pc = board[i]; r = (i / 10) | 0; c = i % 10;
    if (isKing(pc)) {
      for (d = 0; d < 4; d++) {
        for (var j = 1; ; j++) {
          var pr = r + j * ALL4[d][0], pcx = c + j * ALL4[d][1];
          if (pr < 0 || pr > 9 || pcx < 0 || pcx > 9) break;
          var pos = pr * 10 + pcx;
          if (board[pos] !== 0) break;
          simples.push({from: i, to: pos, captured: []});
        }
      }
    } else {
      var mdirs = player === 1 ? MAN1 : MAN2;
      for (d = 0; d < 2; d++) {
        var nr = r + mdirs[d][0], nc = c + mdirs[d][1];
        if (nr < 0 || nr > 9 || nc < 0 || nc > 9) continue;
        var t = nr * 10 + nc;
        if (board[t] === 0) simples.push({from: i, to: t, captured: []});
      }
    }
  }
  return simples;
}

function applyMove(board, mv) {
  var nb = board.slice(), pc = nb[mv.from];
  nb[mv.from] = 0;
  for (var i = 0; i < mv.captured.length; i++) nb[mv.captured[i]] = 0;
  nb[mv.to] = pc;
  var lr = (mv.to / 10) | 0;
  if (nb[mv.to] === 1 && lr === 0) nb[mv.to] = 3; // promote only at move end
  if (nb[mv.to] === 2 && lr === 9) nb[mv.to] = 4;
  return nb;
}

function evalBoard(b, player) {
  var s = 0;
  for (var i = 0; i < 100; i++) {
    var v = b[i]; if (v === 0) continue;
    var r = (i / 10) | 0;
    var val = isKing(v) ? 300 : 100;
    if (v === 1) val += (9 - r) * 3;
    else if (v === 2) val += r * 3;
    s += owner(v) === player ? val : -val;
  }
  return s;
}

function negamax(b, toMove, depth, alpha, beta) {
  var moves = legalMoves(b, toMove);
  if (moves.length === 0) return -100000 - depth;
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
  var depth = difficulty === 'hard' ? 4 : difficulty === 'easy' ? 2 : 3;
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
