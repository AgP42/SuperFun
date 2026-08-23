/**
 * SuperFun — Battleship engine + AI (v0.20)
 *
 * Solo vs the Supernote. Each side has a grid with a fleet of ships; players
 * alternate firing one shot at the other's grid. Sink the whole enemy fleet to
 * win. Difficulty sets grid size + fleet, and the AI's targeting smarts.
 *
 * A board = {size, ship: Int8Array(size*size) [ship index or -1], ships:
 *   [{cells:[idx], size, hits}]}.
 *
 * CommonJS — Node (tests) and RN/Hermes.
 */
'use strict';

// The classic fleet, used on every difficulty (17 cells on a 10×10 board).
var FLEET = [
  {name: 'Carrier', size: 5},
  {name: 'Battleship', size: 4},
  {name: 'Cruiser', size: 3},
  {name: 'Submarine', size: 3},
  {name: 'Destroyer', size: 2},
];
// Same big 10×10 board everywhere; difficulty only sharpens the Supernote's aim.
var CFG = {
  easy: {size: 10, ai: 'easy'},
  medium: {size: 10, ai: 'medium'},
  hard: {size: 10, ai: 'hard'},
};

function randInt(rng, n) { return (rng() * n) | 0; }

// `fleet` is a list of {name, size}. Returns {size, ship, ships:[{cells,size,hits,name}]}.
function placeFleet(size, fleet, rng) {
  rng = rng || Math.random;
  var ship = new Int8Array(size * size).fill(-1), ships = [];
  for (var f = 0; f < fleet.length; f++) {
    var len = fleet[f].size, placed = false, tries = 0;
    while (!placed && tries++ < 500) {
      var horiz = rng() < 0.5;
      var r = randInt(rng, horiz ? size : size - len + 1);
      var c = randInt(rng, horiz ? size - len + 1 : size);
      var cells = [], ok = true;
      for (var k = 0; k < len; k++) {
        var rr = horiz ? r : r + k, cc = horiz ? c + k : c, idx = rr * size + cc;
        // "no touching" rule: the cell AND its 8 neighbours must be clear of OTHER ships,
        // so a connected run of hits is always one ship (removes the adjacent-ship ambiguity).
        var clash = false;
        for (var er = -1; er <= 1 && !clash; er++) for (var ec = -1; ec <= 1; ec++) {
          var nr = rr + er, nc = cc + ec;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && ship[nr * size + nc] !== -1) { clash = true; break; }
        }
        if (clash) { ok = false; break; }
        cells.push(idx);
      }
      if (!ok) continue;
      for (var j = 0; j < cells.length; j++) ship[cells[j]] = ships.length;
      ships.push({cells: cells, size: len, hits: 0, name: fleet[f].name});
      placed = true;
    }
  }
  return {size: size, ship: ship, ships: ships};
}

// Fire at idx. Returns {hit, sunk, shipIndex}. Mutates ships[hits].
function fire(board, idx) {
  var si = board.ship[idx];
  if (si < 0) return {hit: false, sunk: false, shipIndex: -1};
  var sh = board.ships[si];
  sh.hits++;
  return {hit: true, sunk: sh.hits >= sh.size, shipIndex: si};
}

function allSunk(board) {
  for (var i = 0; i < board.ships.length; i++) if (board.ships[i].hits < board.ships[i].size) return false;
  return true;
}

/**
 * AI chooses a cell to fire at `board`, given `fired` (Set-like array of booleans,
 * true = already shot) and `hitsOpen` (array of idx that were hits but whose ship
 * isn't sunk yet — the "target" queue). difficulty tunes the smarts.
 */
function aiPick(board, fired, hitsOpen, difficulty, rng) {
  rng = rng || Math.random;
  var size = board.size, N = size * size;
  var avail = [];
  for (var i = 0; i < N; i++) if (!fired[i]) avail.push(i);
  if (!avail.length) return -1;
  if (difficulty !== 'easy' && hitsOpen.length) {
    // target mode: shoot cells adjacent to an open hit
    var cand = [];
    for (var h = 0; h < hitsOpen.length; h++) {
      var idx = hitsOpen[h], r = (idx / size) | 0, c = idx % size;
      var nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (var d = 0; d < 4; d++) {
        var nr = nb[d][0], nc = nb[d][1];
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          var ni = nr * size + nc;
          if (!fired[ni]) cand.push(ni);
        }
      }
    }
    if (cand.length) return cand[randInt(rng, cand.length)];
  }
  if (difficulty === 'hard') {
    // hunt with a checkerboard parity (ships are ≥2 long)
    var par = avail.filter(function (x) { return (((x / size) | 0) + (x % size)) % 2 === 0; });
    if (par.length) return par[randInt(rng, par.length)];
  }
  return avail[randInt(rng, avail.length)];
}

// --- manual placement helpers ---------------------------------------------
function emptyBoard(size) { return {size: size, ship: new Int8Array(size * size).fill(-1), ships: []}; }

// Cells for a ship of `len` at (r,c) with orientation, or null if off-board or
// touching another ship (same "no touching" rule as placeFleet).
function tryPlaceAt(board, len, r, c, horiz) {
  var size = board.size, cells = [];
  for (var k = 0; k < len; k++) {
    var rr = horiz ? r : r + k, cc = horiz ? c + k : c;
    if (rr < 0 || rr >= size || cc < 0 || cc >= size) return null;
    cells.push(rr * size + cc);
  }
  for (var i = 0; i < cells.length; i++) {
    var idx = cells[i], r2 = (idx / size) | 0, c2 = idx % size, clash = false;
    for (var er = -1; er <= 1 && !clash; er++) for (var ec = -1; ec <= 1; ec++) {
      var nr = r2 + er, nc = c2 + ec;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && board.ship[nr * size + nc] !== -1) { clash = true; break; }
    }
    if (clash) return null;
  }
  return cells;
}

function addShip(board, cells, len, name) {
  var si = board.ships.length;
  for (var j = 0; j < cells.length; j++) board.ship[cells[j]] = si;
  board.ships.push({cells: cells, size: len, hits: 0, name: name});
  return board;
}

module.exports = {
  emptyBoard: emptyBoard, tryPlaceAt: tryPlaceAt, addShip: addShip,
  CFG: CFG, FLEET: FLEET, placeFleet: placeFleet, fire: fire, allSunk: allSunk, aiPick: aiPick,
};
