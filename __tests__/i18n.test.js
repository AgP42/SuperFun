/**
 * Every English string the UI can show must have a French entry in
 * src/i18n.fr.ts (a missing one silently falls back to English).
 * Collects: literal tr('…') calls in App.tsx, the English tables App.tsx
 * translates at render time, and the labels coming from the game engines.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
const FR_SRC = fs.readFileSync(path.join(ROOT, 'src/i18n.fr.ts'), 'utf8');

// JS string literal ('…' or "…") → its value.
const LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
const unq = m => (m[1] !== undefined ? m[1] : m[2]).replace(/\\(.)/g, '$1');

function literalsIn(src) {
  const out = [];
  let m;
  LIT.lastIndex = 0;
  while ((m = LIT.exec(src))) out.push(unq(m));
  return out;
}
// The source of a top-level `const NAME … = …;` table (up to its closing `};` / `];`).
function tableSrc(name) {
  const start = APP.indexOf('const ' + name);
  if (start < 0) throw new Error('table not found: ' + name);
  const rest = APP.slice(start);
  return rest.slice(0, rest.search(/\n[\]}];\n/));
}

// src/i18n.fr.ts is `const FR: … = {…JSON…};`
function frKeys() {
  return new Set(Object.keys(JSON.parse(FR_SRC.slice(FR_SRC.indexOf('= {') + 2, FR_SRC.lastIndexOf('}') + 1))));
}

function englishStrings() {
  const out = new Set();
  // 1) literal tr('…') / tr("…") calls (a literal followed by `+` is a key prefix, not a key)
  const call = /\btr\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")\s*[,)]/g;
  let m;
  while ((m = call.exec(APP))) out.add(literalsIn(m[1])[0]);
  // 2) English tables translated at render time
  const IGNORE = /^(easy|medium|hard|ai|2p|multi|sudoku|ttt|c4|mines|nono|uttt|words|2048|taquin|mm|peg|memory|reversi|checkers|dots|pig|snakes|dames|battle|chess|dice)$/;
  ['WIN_MSGS', 'LOSE_MSGS', 'DRAW_MSGS', 'C4_WIN', 'C4_LOSE', 'MINE_WIN', 'MINE_LOSE', 'RULES', 'GAME_META', 'SOLO_SECTIONS', 'MULTI_SECTIONS', 'DIFF_HINT', 'TAQ_TIPS', 'SNL_LADDER_LINES', 'SNL_SNAKE_LINES']
    .forEach(t => literalsIn(tableSrc(t)).forEach(s => { if (!IGNORE.test(s) && /[a-z]{2}/i.test(s) && !/^\p{Extended_Pictographic}/u.test(s)) out.add(s); }));
  // 3) engine labels
  const {DIFFICULTIES} = require('../src/sudoku');
  Object.values(DIFFICULTIES).forEach(d => out.add(d.label));
  Object.values(require('../src/wordsearch').TIERS).forEach(d => out.add(d.label));
  const STATS = require('../src/stats');
  Object.values(STATS.BEST).forEach(b => out.add(b.label));
  STATS.BADGES.forEach(b => { out.add(b.label); out.add(b.hint); });
  require('../src/battleship').FLEET.forEach(f => out.add('ship:' + f.name));
  Object.values(require('../src/pegsolitaire').BOARDS).forEach(sp => out.add(sp.name));
  const PICS = require('../src/nonogram').PICTURES;
  Object.values(PICS).forEach(list => list.forEach(p => out.add(p.name)));
  ['checkmate', 'stalemate', 'insufficient material'].forEach(r => out.add(r));
  return out;
}

test('every English UI string has a French translation', () => {
  const fr = frKeys();
  const missing = [...englishStrings()].filter(s => !fr.has(s)).sort();
  expect(missing).toEqual([]);
});
