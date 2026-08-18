/**
 * SuperFun — Nonogram (Picross) generation + validation (v0.5)
 *
 * The solved grid is a real, hand‑drawn pixel‑art picture (not random noise).
 * A puzzle picks one picture of the right size, derives its row/column clues,
 * and the player reconstructs it. Win = every clue satisfied. Each shipped
 * picture is verified to be *uniquely* solvable (see verify_nonograms.js), so
 * the only clue‑satisfying grid is the intended drawing.
 *
 * CommonJS — runs under Node (tests) and the RN/Hermes runtime.
 */
'use strict';

// '#' = filled, '.' = empty. Each entry: {name, rows:[...]}.
// Every picture must be square (size×size). Only uniquely‑solvable ones ship —
// the list below is the verified set.
var PICTURES = {
  5: [
    {name: 'heart', rows: ['.#.#.', '#####', '#####', '.###.', '..#..']},
    {name: 'cross', rows: ['..#..', '..#..', '#####', '..#..', '..#..']},
    {name: 'diamond', rows: ['..#..', '.###.', '#####', '.###.', '..#..']},
    {name: 'arrow', rows: ['..#..', '.###.', '#.#.#', '..#..', '..#..']},
    {name: 'boat', rows: ['...#.', '...#.', '#..#.', '#####', '.###.']},
  ],
  8: [
    {name: 'heart', rows: ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........']},
    {name: 'diamond', rows: ['...##...', '..####..', '.######.', '########', '########', '.######.', '..####..', '...##...']},
    {name: 'smiley', rows: ['.######.', '##....##', '#.#..#.#', '#......#', '#......#', '#.####.#', '##....##', '.######.']},
    {name: 'house', rows: ['...##...', '..####..', '.######.', '########', '#.####.#', '#.#..#.#', '#.#..#.#', '########']},
    {name: 'mushroom', rows: ['..####..', '.######.', '########', '########', '...##...', '...##...', '..####..', '..####..']},
    {name: 'star', rows: ['...##...', '...##...', '.######.', '########', '.######.', '..####..', '.##..##.', '##....##']},
    {name: 'key', rows: ['.####...', '.#..#...', '.####...', '..##....', '..##....', '..###...', '..##....', '..###...']},
    {name: 'invader', rows: ['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#']},
  ],
  10: [
    {name: 'heart', rows: ['.##....##.', '####..####', '##########', '##########', '##########', '.########.', '..######..', '...####...', '....##....', '..........']},
    {name: 'diamond', rows: ['....##....', '...####...', '..######..', '.########.', '##########', '##########', '.########.', '..######..', '...####...', '....##....']},
    {name: 'star', rows: ['....##....', '....##....', '...####...', '.########.', '##########', '.########.', '..######..', '.##.##.##.', '##......##', '..........']},
    {name: 'rocket', rows: ['....##....', '...####...', '...####...', '..######..', '..######..', '..######..', '.########.', '##.####.##', '#..#..#..#', '...#..#...']},
    {name: 'fish', rows: ['..........', '...####...', '..######.#', '.#######.#', '.########.', '.#######.#', '..######.#', '...####...', '..........', '..........']},
    {name: 'umbrella', rows: ['...####...', '..######..', '.########.', '##########', '#.######.#', '....##....', '....##....', '....##....', '...###....', '..###.....']},
    {name: 'tree', rows: ['....##....', '...####...', '..######..', '.########.', '##########', '.########.', '..######..', '....##....', '....##....', '...####...']},
    {name: 'cat', rows: ['##......##', '####..####', '##########', '#.#....#.#', '##########', '##########', '##.####.##', '#........#', '.########.', '..######..']},
    {name: 'invader', rows: ['..........', '..#....#..', '...#..#...', '..######..', '.##.##.##.', '##########', '#.######.#', '#.#....#.#', '...#..#...', '..........']},
  ],
};

function lineClue(line) {
  var runs = [], run = 0;
  for (var i = 0; i < line.length; i++) {
    if (line[i]) run++;
    else if (run > 0) { runs.push(run); run = 0; }
  }
  if (run > 0) runs.push(run);
  return runs.length ? runs : [0];
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Convert a picture's rows to a flat boolean[size*size].
function pictureToSolution(rows, size) {
  var sol = new Array(size * size);
  for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) sol[r * size + c] = rows[r][c] === '#';
  return sol;
}

function cluesFor(sol, size) {
  var rowClues = [], colClues = [], r, c;
  for (r = 0; r < size; r++) {
    var row = [];
    for (c = 0; c < size; c++) row.push(sol[r * size + c]);
    rowClues.push(lineClue(row));
  }
  for (c = 0; c < size; c++) {
    var col = [];
    for (r = 0; r < size; r++) col.push(sol[r * size + c]);
    colClues.push(lineClue(col));
  }
  return {rowClues: rowClues, colClues: colClues};
}

/**
 * Generate a puzzle: pick a random picture of `size`, derive its clues.
 * Returns {size, solution, rowClues, colClues, name}.
 */
function generate(size, rng) {
  rng = rng || Math.random;
  var bank = PICTURES[size] || PICTURES[8];
  var pic = bank[Math.floor(rng() * bank.length)];
  var sol = pictureToSolution(pic.rows, size);
  var cl = cluesFor(sol, size);
  return {size: size, solution: sol, rowClues: cl.rowClues, colClues: cl.colClues, name: pic.name};
}

/** True when `fill` (boolean[]) satisfies every row and column clue. */
function validate(fill, rowClues, colClues, size) {
  var r, c;
  for (r = 0; r < size; r++) {
    var row = [];
    for (c = 0; c < size; c++) row.push(!!fill[r * size + c]);
    if (!arraysEqual(lineClue(row), rowClues[r])) return false;
  }
  for (c = 0; c < size; c++) {
    var col = [];
    for (r = 0; r < size; r++) col.push(!!fill[r * size + c]);
    if (!arraysEqual(lineClue(col), colClues[c])) return false;
  }
  return true;
}

var SIZES = {easy: 5, medium: 8, hard: 10};

module.exports = {
  PICTURES: PICTURES,
  lineClue: lineClue,
  cluesFor: cluesFor,
  pictureToSolution: pictureToSolution,
  generate: generate,
  validate: validate,
  SIZES: SIZES,
};
