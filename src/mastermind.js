/**
 * SuperFun — Mastermind engine (v0.9)
 *
 * Guess the hidden code of `pegs` symbols (0..symbols-1, duplicates allowed).
 * Feedback: black = right symbol AND right spot, white = right symbol wrong spot.
 * Difficulty sets the challenge:
 *   Easy   4 pegs · 6 colours · 12 guesses  (+ per-position hints)
 *   Medium 4 pegs · 6 colours · 10 guesses  (the classic standard Mastermind)
 *   Hard   5 pegs · 8 colours · 12 guesses  (Super Mastermind)
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

var TIERS = {
  easy:   {pegs: 4, symbols: 6, guesses: 12},
  medium: {pegs: 4, symbols: 6, guesses: 10}, // standard Mastermind: 4 positions, 6 colours, 10 tries
  hard:   {pegs: 5, symbols: 8, guesses: 12},
};

function randInt(rng, n) { return (rng() * n) | 0; }

function newCode(tier, rng) {
  rng = rng || Math.random;
  var cfg = TIERS[tier] || TIERS.easy, code = [];
  for (var i = 0; i < cfg.pegs; i++) code.push(randInt(rng, cfg.symbols));
  return code;
}

/** Standard black/white scoring, correct with duplicate symbols. */
function score(code, guess) {
  var black = 0, n = code.length, cc = {}, gc = {};
  for (var i = 0; i < n; i++) {
    if (code[i] === guess[i]) black++;
    else { cc[code[i]] = (cc[code[i]] || 0) + 1; gc[guess[i]] = (gc[guess[i]] || 0) + 1; }
  }
  var white = 0;
  for (var k in gc) if (cc[k]) white += Math.min(cc[k], gc[k]);
  return {black: black, white: white};
}

/**
 * Per-position feedback (Easy / Wordle-style): for each guess slot returns
 * 'exact' (right symbol, right spot), 'close' (symbol is in the code elsewhere),
 * or 'absent'. Duplicate-correct: exact matches are consumed first, then each
 * 'close' consumes one remaining occurrence so counts never over-report.
 */
function scoreEach(code, guess) {
  var n = code.length, out = new Array(n).fill('absent'), left = {};
  for (var i = 0; i < n; i++) {
    if (code[i] === guess[i]) out[i] = 'exact';
    else left[code[i]] = (left[code[i]] || 0) + 1;
  }
  for (var j = 0; j < n; j++) {
    if (out[j] === 'exact') continue;
    var g = guess[j];
    if (left[g] > 0) { out[j] = 'close'; left[g]--; }
  }
  return out;
}

module.exports = {TIERS: TIERS, newCode: newCode, score: score, scoreEach: scoreEach};
