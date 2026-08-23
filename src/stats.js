/**
 * SuperFun — persistent stats (records, gallery, badges, prefs) (v0.17)
 *
 * Motivation without stress: every "best" is a COUNT (moves, guesses, pegs,
 * flips, score) — never a timer. We keep the TOP 3 per game per difficulty.
 * A `showBest` flag lets the user hide their bests in-game.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

// dir: which way is better. label: shown on the Records screen.
var BEST = {
  '2048': {dir: 'high', label: 'Highest tile'},
  taquin: {dir: 'low', label: 'Fewest moves'},
  mm: {dir: 'low', label: 'Fewest guesses'},
  peg: {dir: 'low', label: 'Fewest pegs left'},
  memory: {dir: 'low', label: 'Fewest flips'},
  sudoku: {dir: 'low', label: 'Fewest hints'},
};

var STATS_VER = 2; // bump when a record's meaning changes (needs migration)

function emptyStats() { return {best: {}, gallery: [], counters: {}, showBest: true, names: {}, emojis: {}, ver: STATS_VER}; }
function normalize(s) {
  s = s || {};
  var out = {
    best: s.best && typeof s.best === 'object' ? s.best : {},
    gallery: Array.isArray(s.gallery) ? s.gallery : [],
    counters: s.counters && typeof s.counters === 'object' ? s.counters : {},
    showBest: s.showBest !== false,
    names: s.names && typeof s.names === 'object' ? s.names : {},
    emojis: s.emojis && typeof s.emojis === 'object' ? s.emojis : {},
    ver: s.ver || 0,
  };
  // v2: the 2048 record switched from SCORE to HIGHEST TILE — drop legacy score entries once.
  if (out.ver < 2 && out.best['2048']) delete out.best['2048'];
  out.ver = STATS_VER;
  return out;
}
function clone(s) { return JSON.parse(JSON.stringify(s)); }

function topOf(stats, game, diff) {
  var g = stats.best[game];
  return (g && g[diff]) ? g[diff] : [];
}
function bestValue(stats, game, diff) { var a = topOf(stats, game, diff); return a.length ? a[0] : null; }

// Merge `value` into the top-3 for game/diff. Returns {stats, isBest, made}.
function recordBest(stats, game, diff, value) {
  var meta = BEST[game];
  if (!meta || typeof value !== 'number' || isNaN(value)) return {stats: stats, isBest: false, made: false};
  var ns = clone(stats);
  if (!ns.best[game]) ns.best[game] = {};
  var arr = (ns.best[game][diff] || []).slice();
  var prevTop = arr.length ? arr[0] : null;
  arr.push(value);
  arr.sort(function (a, b) { return meta.dir === 'high' ? b - a : a - b; });
  arr = arr.slice(0, 3);
  ns.best[game][diff] = arr;
  var made = arr.indexOf(value) !== -1;
  var isBest = prevTop === null || (meta.dir === 'high' ? value > prevTop : value < prevTop);
  return {stats: ns, isBest: isBest, made: made};
}

function addGallery(stats, key) {
  if (stats.gallery.indexOf(key) !== -1) return stats;
  var ns = clone(stats); ns.gallery.push(key); return ns;
}
function bumpCounter(stats, key) {
  var ns = clone(stats); ns.counters[key] = (ns.counters[key] || 0) + 1; return ns;
}
function setShowBest(stats, v) { var ns = clone(stats); ns.showBest = !!v; return ns; }

// Achievement badges, derived live from stats. ctx.nonoTotal = picture count.
var BADGES = [
  {id: 'r2048', label: 'Reached 2048', hint: 'Make the 2048 tile', test: function (s) { return anyBestAtLeast(s, '2048', 2048); }},
  {id: 'pegperfect', label: 'Peg-perfect', hint: 'Finish on one peg on all 3 shapes', test: function (s) { return bestValue(s, 'peg', 'easy') === 1 && bestValue(s, 'peg', 'medium') === 1 && bestValue(s, 'peg', 'hard') === 1; }},
  {id: 'nonoall', label: 'Gallery complete', hint: 'Solve every Nonogram picture', test: function (s, ctx) { return s.gallery.length >= (ctx && ctx.nonoTotal ? ctx.nonoTotal : 66); }},
  {id: 'minesweeper', label: 'Bomb squad', hint: 'Clear a minefield on every level', test: function (s) { return (s.counters.mines_easy || 0) > 0 && (s.counters.mines_medium || 0) > 0 && (s.counters.mines_hard || 0) > 0; }},
  {id: 'sudokuflaw', label: 'Flawless Sudoku', hint: 'Solve a Hard Sudoku with no hints', test: function (s) { return bestValue(s, 'sudoku', 'hard') === 0; }},
  {id: 'mmhard', label: 'Codebreaker', hint: 'Crack a Hard Mastermind code', test: function (s) { return topOf(s, 'mm', 'hard').length > 0; }},
  {id: 'wordsmith', label: 'Wordsmith', hint: 'Finish 10 Word Search grids', test: function (s) { return (s.counters.words || 0) >= 10; }},
];
function anyBestAtLeast(s, game, v) {
  var g = s.best[game]; if (!g) return false;
  for (var k in g) if (g[k] && g[k][0] >= v) return true;
  return false;
}
function computeBadges(stats, ctx) {
  return BADGES.map(function (b) { return {id: b.id, label: b.label, hint: b.hint, earned: !!b.test(stats, ctx || {})}; });
}

module.exports = {
  BEST: BEST, emptyStats: emptyStats, normalize: normalize,
  topOf: topOf, bestValue: bestValue, recordBest: recordBest,
  addGallery: addGallery, bumpCounter: bumpCounter, setShowBest: setShowBest,
  BADGES: BADGES, computeBadges: computeBadges,
};
