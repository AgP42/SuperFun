/**
 * SuperFun — Dots & Boxes engine + a casual AI (v0.12)
 *
 * R×C boxes. Players take turns drawing one edge; completing a box scores it
 * and grants another turn. Most boxes wins. Edges:
 *   h (horizontal): (R+1) rows × C  → index r*C + c,  r∈0..R, c∈0..C-1
 *   v (vertical):   R rows × (C+1)  → index r*(C+1)+c, r∈0..R-1, c∈0..C
 * owner[box] : 0 none, else player number.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

function initState(R, C) {
  return {
    R: R, C: C,
    h: new Array((R + 1) * C).fill(false),
    v: new Array(R * (C + 1)).fill(false),
    owner: new Array(R * C).fill(0),
  };
}

function clone(st) {
  return {R: st.R, C: st.C, h: st.h.slice(), v: st.v.slice(), owner: st.owner.slice()};
}

function has(st, kind, idx) { return kind === 'h' ? st.h[idx] : st.v[idx]; }

function legalEdges(st) {
  var e = [];
  for (var i = 0; i < st.h.length; i++) if (!st.h[i]) e.push({kind: 'h', idx: i});
  for (var j = 0; j < st.v.length; j++) if (!st.v[j]) e.push({kind: 'v', idx: j});
  return e;
}

// Boxes touching an edge.
function boxesOfEdge(st, kind, idx) {
  var R = st.R, C = st.C, res = [];
  if (kind === 'h') {
    var r = (idx / C) | 0, c = idx % C;
    if (r - 1 >= 0) res.push((r - 1) * C + c);
    if (r < R) res.push(r * C + c);
  } else {
    var r2 = (idx / (C + 1)) | 0, c2 = idx % (C + 1);
    if (c2 - 1 >= 0) res.push(r2 * C + (c2 - 1));
    if (c2 < C) res.push(r2 * C + c2);
  }
  return res;
}

function boxSides(st, box) {
  var C = st.C, r = (box / C) | 0, c = box % C, n = 0;
  if (st.h[r * C + c]) n++;
  if (st.h[(r + 1) * C + c]) n++;
  if (st.v[r * (C + 1) + c]) n++;
  if (st.v[r * (C + 1) + c + 1]) n++;
  return n;
}

// Draw an edge for `player`; returns number of boxes completed (0/1/2). Mutates st.
function applyEdge(st, kind, idx, player) {
  if (kind === 'h') st.h[idx] = true; else st.v[idx] = true;
  var boxes = boxesOfEdge(st, kind, idx), done = 0;
  for (var i = 0; i < boxes.length; i++) {
    if (st.owner[boxes[i]] === 0 && boxSides(st, boxes[i]) === 4) { st.owner[boxes[i]] = player; done++; }
  }
  return done;
}

function isOver(st) {
  for (var i = 0; i < st.owner.length; i++) if (st.owner[i] === 0) return false;
  return true;
}

function scores(st) {
  var s = {};
  for (var i = 0; i < st.owner.length; i++) { var o = st.owner[i]; if (o) s[o] = (s[o] || 0) + 1; }
  return s;
}

// How many boxes an edge would immediately complete (without mutating).
function completes(st, kind, idx) {
  var boxes = boxesOfEdge(st, kind, idx), n = 0;
  for (var i = 0; i < boxes.length; i++) if (boxSides(st, boxes[i]) === 3) n++;
  return n;
}

// Would this edge leave some box with exactly 3 sides (a gift to the opponent)?
function isUnsafe(st, kind, idx) {
  var boxes = boxesOfEdge(st, kind, idx);
  for (var i = 0; i < boxes.length; i++) if (boxSides(st, boxes[i]) === 2) return true; // 2→3 after drawing
  return false;
}

function randInt(rng, n) { return (rng() * n) | 0; }

/** Casual greedy AI: complete boxes, else play safe, else give the least away. */
function aiEdge(st, rng) {
  rng = rng || Math.random;
  var edges = legalEdges(st);
  if (!edges.length) return null;
  // 1. complete a box (prefer completing 2)
  var best = null, bestN = 0;
  for (var i = 0; i < edges.length; i++) { var n = completes(st, edges[i].kind, edges[i].idx); if (n > bestN) { bestN = n; best = edges[i]; } }
  if (best) return best;
  // 2. a safe edge (doesn't create a 3-sided box)
  var safe = edges.filter(function (e) { return !isUnsafe(st, e.kind, e.idx); });
  if (safe.length) return safe[randInt(rng, safe.length)];
  // 3. forced to give away — pick any
  return edges[randInt(rng, edges.length)];
}

module.exports = {
  initState: initState, clone: clone, has: has, legalEdges: legalEdges,
  boxesOfEdge: boxesOfEdge, boxSides: boxSides, applyEdge: applyEdge,
  isOver: isOver, scores: scores, completes: completes, isUnsafe: isUnsafe, aiEdge: aiEdge,
};
