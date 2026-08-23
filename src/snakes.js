/**
 * SuperFun — Snakes & Ladders board (v0.15)
 *
 * 100 squares, boustrophedon numbering (1 bottom-left, snaking up). A classic
 * ladder/snake layout. resolve(n) sends a token up a ladder or down a snake.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

var LADDERS = {1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100};
var SNAKES = {16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78};

function resolve(n) {
  if (LADDERS[n] !== undefined) return LADDERS[n];
  if (SNAKES[n] !== undefined) return SNAKES[n];
  return n;
}

// Square number at grid (r,c) with r=0 the TOP row.
function squareNum(r, c) {
  var rowFromBottom = 9 - r, base = rowFromBottom * 10;
  return (rowFromBottom % 2 === 0) ? base + c + 1 : base + (9 - c) + 1;
}

module.exports = {LADDERS: LADDERS, SNAKES: SNAKES, resolve: resolve, squareNum: squareNum};
