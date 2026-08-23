/**
 * SuperFun — v0.2 games platform (full-screen)
 *
 * Home = pick a game + difficulty + Ko-fi banner (pinned bottom).
 * Games:
 *   • Sudoku       — generated on device; two-list input; handwritten answers;
 *                    Check / Give-1-answer; Save (in-memory, up to 10 grids).
 *   • Tic-Tac-Toe  — you are O and move first, Supernote plays X; score counter
 *                    (resets on leaving); rotating win/lose messages.
 * Each game has an "Explain rules" button. Pure B/W, no animation.
 *
 * @format
 */

import React, {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {
  AppState,
  BackHandler,
  Dimensions,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {generate, DIFFICULTIES} from './src/sudoku';
import * as TTT from './src/tictactoe';
import * as C4 from './src/connect4';
import * as MINE from './src/minesweeper';
import * as NONO from './src/nonogram';
import * as U from './src/uttt';
import * as W from './src/wordsearch';
import * as G2048 from './src/g2048';
import * as TAQUIN from './src/taquin';
import * as MM from './src/mastermind';
import * as PEG from './src/pegsolitaire';
import * as REV from './src/reversi';
import * as CK from './src/checkers';
import * as DOTS from './src/dots';
import * as SNL from './src/snakes';
import * as DAMES from './src/dames';
import * as SHIP from './src/battleship';
import * as CHESS from './src/chess';
import {loadSaves, persistSaves, loadStats, persistStats} from './src/filestore';
import * as STATS from './src/stats';

const NONO_TOTAL = (Object.keys(NONO.PICTURES) as string[]).reduce((a, k) => a + (NONO.PICTURES as any)[k].length, 0);

const KOFI_QR = require('./assets/kofi-qr.png');
const APP_ICON = require('./assets/icon.png');
const INK = '#000000';
const PAPER = '#FFFFFF';
const MUTE = '#8A8A8A';
// Shared board-square tokens (chess/checkers/dames) — one grey per meaning
const SQ_DARK = '#D6D6D6'; // dark square on a checkered board
const SQ_SEL = '#9A9A9A';  // the selected piece's square
const SQ_DEST = '#BEBEBE';  // a legal destination
const SQ_MOVE = '#C8C8C8';  // a piece that can still move (idle hint)
const HAND = Platform.OS === 'android' ? 'casual' : undefined;

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
// Biggest square board that fits width AND leaves room for header/legend/status/footer.
const bigCell = (n: number) => Math.floor(Math.min(SCREEN_W - 12, SCREEN_H - 230, 820) / n);
// Cell size that fits a cols×rows board in the width and the height left after chrome.
const fitCell = (cols: number, rows: number, chromeH: number, maxCell: number) =>
  Math.max(16, Math.floor(Math.min((SCREEN_W - 16) / cols, (SCREEN_H - chromeH) / rows, maxCell)));
const GRID = Math.min(SCREEN_W - 20, 660);
const CELL = Math.floor(GRID / 9);
const GSIZE = CELL * 9;
const TSIZE = Math.min(SCREEN_W - 40, 520);
const TCELL = Math.floor(TSIZE / 3);
const C4CELL = fitCell(7, 6, 300, 96);
const UCELL = Math.max(16, Math.floor((Math.min(SCREEN_W - 16, SCREEN_H - 250, 720) - 30) / 9)); // Ultimate TTT: 9×9 (−30 for sub-board margins + borders)
const gridCell = (cols: number, maxW: number) => Math.floor(Math.min(SCREEN_W - 24, maxW) / cols);

type Diff = keyof typeof DIFFICULTIES;
type Mode = 'ai' | '2p' | 'multi'; // vs SuperFun · two humans · 3–4 humans hot-seat
type Names = {p1: string; p2: string; p3: string; p4: string};
type GameKey = 'sudoku' | 'ttt' | 'c4' | 'mines' | 'nono' | 'uttt' | 'words' | '2048' | 'taquin' | 'mm' | 'peg' | 'memory' | 'reversi' | 'checkers' | 'dots' | 'pig' | 'snakes' | 'dames' | 'battle' | 'chess' | 'dice';
type Screen =
  | {name: 'home'}
  | {name: 'records'}
  | {name: 'sudoku'; diff: Diff}
  | {name: 'ttt'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'c4'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'uttt'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'mines'; diff: Diff}
  | {name: 'nono'; diff: Diff}
  | {name: 'words'; diff: Diff}
  | {name: '2048'; diff: Diff}
  | {name: 'taquin'; diff: Diff}
  | {name: 'mm'; diff: Diff}
  | {name: 'peg'; diff: Diff}
  | {name: 'memory'; diff: Diff; names?: Names; emojis?: Names; players?: number}
  | {name: 'reversi'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'checkers'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'dots'; diff: Diff; mode: Mode; names: Names; emojis?: Names; players?: number}
  | {name: 'pig'; diff: Diff; names?: Names; emojis?: Names; players?: number}
  | {name: 'snakes'; diff: Diff; names?: Names; emojis?: Names; players?: number}
  | {name: 'dames'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'battle'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'chess'; diff: Diff; mode: Mode; names: Names; emojis?: Names}
  | {name: 'dice'; diff: Diff};

const DUEL: {[k in GameKey]?: boolean} = {ttt: true, c4: true, uttt: true, reversi: true, checkers: true, dots: true, dames: true, battle: true, chess: true};

type GameSave = {
  game: string; // one of the GameKey ids
  key: string; // checksum of the base puzzle, or RESUME_KEY for the auto-resume slot
  ts: number; // saved-at epoch ms
  diff: Diff;
  label: string; // short human summary shown in the list
  data: any; // game-specific payload
};

// ---- Auto-resume ----------------------------------------------------------
// Every game may register a snapshot function. Leaving the game (‹ Menu or ✕)
// flushes it into ONE overwriting 'resume' slot per game, shown in that game's
// Saved list as "▶ Resume — …" and reloadable like any save.
const RESUME_KEY = 'resume';
let _resumeSnap: (() => GameSave | null) | null = null;
let _persistResume: ((sv: GameSave) => Promise<void>) | null = null;
// Awaitable: the ✕ path awaits this so the disk write lands before the plugin tears down.
async function flushResume(): Promise<void> {
  try { const gs = _resumeSnap && _resumeSnap(); if (gs && _persistResume) await _persistResume(gs); } catch (e) { /* never block leaving */ }
}
// Register the current game's snapshot; the closure always sees latest state.
function useResume(fn: () => GameSave | null): void {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { _resumeSnap = () => ref.current(); return () => { _resumeSnap = null; }; }, []);
}
// Build a resume GameSave (or null if there's nothing worth resuming).
function resumeSave(game: string, diff: Diff, live: boolean, label: string, data: any): GameSave | null {
  return live ? {game, key: RESUME_KEY, ts: Date.now(), diff, label: '▶ Resume — ' + label, data} : null;
}

const bit = (d: number) => 1 << d;

// Short stable marker for a base grid (FNV-1a over the 81 givens → 4 hex).
// Re-saving the same puzzle yields the same key, so it updates its own entry.
function gridKey(givens: Int8Array | number[]): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < 81; i++) {
    h ^= givens[i] & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).slice(-4).padStart(4, '0');
}

// Device-local "DD/MM HH:MM" (Date works under Hermes on the device).
function fmtTs(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Stable marker for a nonogram puzzle (from its solution bits).
function nonoKey(size: number, solution: boolean[]): string {
  let h = 0x811c9dc5;
  h ^= size; h = Math.imul(h, 0x01000193);
  for (let i = 0; i < solution.length; i++) { h ^= solution[i] ? 1 : 0; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).slice(-4).padStart(4, '0');
}

// Stable marker for a minesweeper board (from its mine layout + size).
function mineKey(mine: boolean[], R: number, C: number): string {
  let h = 0x811c9dc5;
  h ^= R; h = Math.imul(h, 0x01000193); h ^= C; h = Math.imul(h, 0x01000193);
  for (let i = 0; i < mine.length; i++) { h ^= mine[i] ? 1 : 0; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).slice(-4).padStart(4, '0');
}

const WIN_MSGS = [
  'Well done! 🎉', 'You crushed it! 🎉', 'Too easy 😎🎉', 'Brain beats machine 🧠',
  'Victory! 🎉', 'Flawless — chef\'s kiss 👌', 'You\'re on fire! 🔥',
  'GG! The paper bows to you 🎉', 'Unstoppable! 🎉', 'Genius move 🎉',
];
const LOSE_MSGS = [
  'SuperFun wins this one 🤖', 'Outsmarted by paper 😅', 'So close — run it back? 💪',
  'The machine strikes back 🤖', 'Ouch! Rematch? 🔁', 'SuperFun is showing off 😏',
  'Nice try — go again ✊', 'Beaten by pixels… barely 🤖',
];
const DRAW_MSGS = ['A draw — perfectly balanced ⚖️', 'Stalemate! 😐', 'Dead heat — go again 🔁', 'No winner… this time 🤝'];

const C4_WIN = [
  'Four in a row — you win! 🎉', 'Connected and collected 😎', 'SuperFun didn\'t see that coming 🎉',
  'Line \'em up, take \'em down 🔥', 'Gravity\'s on your side today 🎉', 'Dropped the winning disc! 👏',
  'Too sharp for the machine 🧠', 'Victory falls into place 🎉', 'You stacked the odds 🎉', 'GG — four and done 🎉',
];
const C4_LOSE = [
  'SuperFun lines up four 🤖', 'Beaten to the connection 😅', 'So close — one more disc 💪',
  'The machine drops the hammer 🤖', 'Outstacked this time 🔁', 'Gravity betrayed you 😏',
  'Nice try — run it back ✊', 'SuperFun connects first 🤖',
];
const MINE_WIN = [
  'Board cleared — flawless! 🎉', 'Every mine dodged 😎', 'Swept clean! 🧹', 'Nerves of steel 🔥',
  'Not a single boom 👏', 'Minefield: defused 💣✅', 'You read every number 🧠', 'Clean sweep! 🎉',
  'Careful and quick 🎉', 'Mastermine 🎉',
];
const MINE_LOSE = [
  'Boom! 💥 That was a mine', 'Ka-boom — try again 💣', 'One wrong tap… 😬', 'The mine got you 💥',
  'So close to safe 💪', 'Defused zero, exploded one 😅', 'Mind the mines next time 🔁', 'That one was trouble 💥',
];
const pick = (pool: string[], i: number) => pool[i % pool.length];

const RULES: Record<GameKey, {title: string; lines: string[]}> = {
  ttt: {
    title: 'Tic-Tac-Toe',
    lines: [
      'You play O, SuperFun plays X.',
      'Take turns tapping an empty cell.',
      'First to line up three in a row — across, down or diagonally — wins.',
      'You always move first.',
      'Difficulty sets how sharp SuperFun plays (Hard is unbeatable).',
      'Or choose 2 players to play head-to-head on the same device.',
    ],
  },
  sudoku: {
    title: 'Sudoku',
    lines: [
      'Fill the 9×9 grid so every row, column and 3×3 box holds 1–9 with no repeats.',
      'Tap a cell, then tap an Answer to place a value (tap it again to clear).',
      'Notes add small pencil candidates — only on an empty cell.',
      'Check answers flags wrong entries; Give 1 answer reveals a correct cell.',
      'Save keeps a grid in memory (up to 10) to come back to later.',
    ],
  },
  c4: {
    title: 'Connect Four',
    lines: [
      'You play O, SuperFun plays X. You go first.',
      'Tap a column to drop your disc — it falls to the lowest free slot.',
      'First to line up four in a row — across, down or diagonally — wins.',
      'Difficulty sets how far ahead SuperFun thinks (Hard is tough).',
      'Or choose 2 players to play head-to-head on the same device.',
    ],
  },
  uttt: {
    title: 'Ultimate TTT',
    lines: [
      'Nine small boards form a big 3×3 grid.',
      'Win a small board to claim its square in the big grid.',
      'Your move sends your opponent to the small board matching the cell you just played.',
      'If that small board is already decided, they may play in any open board.',
      'Line up three claimed boards in a row to win the game.',
      'Or choose 2 players to play head-to-head on the same device.',
    ],
  },
  mines: {
    title: 'Minesweeper',
    lines: [
      'Clear every safe cell without tapping a mine.',
      'A number tells how many mines touch that cell.',
      'Switch to Flag mode to mark cells you think are mines.',
      'Your first tap is always safe. Difficulty sets grid size and mine count.',
    ],
  },
  nono: {
    title: 'Nonogram',
    lines: [
      'Fill cells so each row and column matches its number clues.',
      'A clue like 3 1 means a run of 3, a gap, then a run of 1.',
      'Fill mode paints cells; Mark mode adds an ✕ for "definitely empty".',
      'Check tells you how many of your FILLED cells are wrong so far — a progress check, not a win test.',
      'The puzzle completes itself the moment every clue is satisfied.',
    ],
  },
  words: {
    title: 'Word Search',
    lines: [
      'Find every word from the list hidden in the letter grid.',
      'Words run horizontally, vertically or diagonally — and can be reversed on harder grids.',
      'Tap the first letter, then tap the last letter to select a word.',
      'A found word is struck through on the grid and crossed off the list; find them all to win.',
      'Stuck? 💡 Hint boxes the first letter of a missing word · long-press any letter to light up every copy of it · Solution reveals them all.',
      'Hide list turns off the word list for a harder round (you only see how many are left); Show list brings it back.',
      'Switch language (EN · DE · FR · ES · IT) any time — it starts a fresh grid.',
    ],
  },
  '2048': {
    title: '2048',
    lines: [
      'Swipe the board (or tap the ↑ ↓ ← → buttons) to slide EVERY tile that way at once.',
      'When two tiles with the same number slide into each other, they merge into one tile of their sum (2 + 2 → 4, 4 + 4 → 8 …).',
      'There is no "1" tile — tiles are only doubles: 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024. The goal is just 2 doubled again and again.',
      'After each slide a new 2 (or 4) appears on a free square — it flashes with a bold outline so you can spot it.',
      'You WIN by building the goal TILE (a single tile of that value) — not by score. "Top tile" up top shows how close you are.',
      'Score = every merge added up (a merge into V adds V points), so it just keeps climbing — your saved record is your HIGHEST TILE, not the score.',
      'When you reach the goal you can Keep going for a bigger tile; the game ends only when the board fills with no move left.',
      'A bigger grid gives far more room, so it is much easier: Easy 6×6 → 256 · Medium 5×5 → 2048 · Hard 4×4 → 2048 (the classic, tough).',
    ],
  },
  taquin: {
    title: '15-Puzzle',
    lines: [
      'Tap a tile next to the empty space to slide it in.',
      'Work the numbers back into order, 1 upward, with the blank last.',
      'Choose Numbers or Picture tiles up top. In Picture mode the goal image shows in its own "Target" frame (with tile gridlines) beside the board — leave it on or turn it off, and tap 🔀 New picture for a fresh puzzle with another image.',
      'In Picture mode, two tiles that look identical are interchangeable — the puzzle is done once the image is complete.',
      '💡 Hint frames the best tile to slide next (on 4×4/5×5 it kicks in once you are close); otherwise it shares a solving tip.',
      'Strategy: solve the top row, then the left column — each finished edge shrinks the puzzle. Keep the blank near the tile you are placing.',
      'The empty square you slide into is framed with a dashed outline so it always stands out.',
      'It always starts from a solvable shuffle.',
      'Difficulty sets the grid (Easy 3×3 · Medium 4×4 · Hard 5×5).',
    ],
  },
  mm: {
    title: 'Mastermind',
    lines: [
      'A secret code of coloured pegs (shown as numbers) is hidden.',
      'Tap numbers to fill a row, then Submit to guess.',
      'Easy: each guess shows a mark UNDER every number — ● right number & right spot · ○ right number, wrong spot · – not in the code.',
      'Medium & Hard (classic): a small square block of ● and ○ tells you HOW MANY are right, but not which — that is the puzzle to deduce.',
      'Crack the code before you run out of tries. Difficulty sets pegs, colours and tries.',
    ],
  },
  peg: {
    title: 'Peg Solitaire',
    lines: [
      'Tap a peg, then tap an empty hole two steps away to jump.',
      'You jump straight over one neighbouring peg — the jumped peg is removed (the triangle also jumps along its diagonals).',
      'Keep jumping until no moves remain.',
      'Goal: clear the board down to a single peg. Difficulty picks the shape (Triangle · Cross · Big Cross).',
      'Undo lets you take a jump back.',
    ],
  },
  memory: {
    title: 'Memory',
    lines: [
      'Tap two cards to flip them face-up.',
      'A matching pair stays up and scores a point — and you go again.',
      'A mismatch flips back; with 2+ players, the turn passes on.',
      'Find every pair; most pairs wins.',
      'Pick 1–4 players at the top; difficulty sets the grid size.',
    ],
  },
  reversi: {
    title: 'Reversi',
    lines: [
      'You play ● (dark) and move first; SuperFun plays ○.',
      'Place a disc so it traps a straight line of the opponent between it and another of yours.',
      'Every trapped disc flips to your colour. You can only play where something flips (dots mark legal spots).',
      'No legal move? You pass. When neither can move, the most discs wins.',
      'Or choose 2 players to play head-to-head on the same device.',
    ],
  },
  checkers: {
    title: 'Checkers',
    lines: [
      'You are ● (bottom), SuperFun is ○ (top). Move diagonally forward one square.',
      'Jump an adjacent enemy piece into the empty square beyond to capture it — captures are compulsory and can chain.',
      'Reach the far row and your piece becomes a King (marked), which moves and jumps both ways.',
      'Trap your opponent with no moves left to win.',
      'Or choose 2 players to play head-to-head on the same device.',
    ],
  },
  battle: {
    title: 'Battleship',
    lines: [
      'A 10×10 sea with coordinates — columns A–J across the top, rows 1–10 down the side (a square is named like C7).',
      'The fleet is five ships: Carrier (5) · Battleship (4) · Cruiser (3) · Submarine (3) · Destroyer (2). Ships never touch each other, so a connected line of hits is always one ship. The roster shows which are still afloat.',
      'Vs SuperFun: first PLACE YOUR FLEET — pick Horizontal/Vertical, tap a square to drop each ship (or Auto-place), then Start battle. Ships can\'t touch.',
      'Then tap a square on "Enemy waters" to fire. ○ = miss, ✗ = hit; when a ship is fully hit its squares turn into a SOLID BLACK block (so you see its whole length) and the roster marks it SUNK.',
      'Your fleet sits below; SuperFun fires back each turn with hunt-and-target aim. Sink all five ships to win. Difficulty = how sharp its aim is.',
      '2 players (paper): your fleet grid starts EMPTY — tap squares to place your own ships (grey), and tap again to mark one hit ✗. Call your shots aloud by coordinate (e.g. "C7"); mark your shots on the top grid. You can also screenshot & print the grids to play fully on paper.',
    ],
  },
  dames: {
    title: 'Dames',
    lines: [
      'You are ● (bottom), SuperFun is ○ (top), on a 10×10 board.',
      'Men move one square diagonally forward, but capture in ANY diagonal direction.',
      'Capturing is compulsory — and you must take the move that captures the MOST pieces.',
      'Reach the far row to become a flying King: it slides and captures any distance along a diagonal.',
      'Trap your opponent with no move left to win.',
      'Or choose 2 players to play head-to-head on the same device.',
    ],
  },
  chess: {
    title: 'Chess',
    lines: [
      'You play White (bottom); SuperFun plays Black — or pick 2 players for hot-seat.',
      'Tap one of your pieces to see its legal moves (dots), then tap a dot to move. Illegal moves that leave your king in check are not offered.',
      'All the rules are in: castling, en passant, and pawn promotion (a pawn reaching the last rank auto-promotes to a Queen).',
      'The status line warns you when a king is in check. Deliver checkmate to win; no legal move without check is a stalemate (draw).',
      'Difficulty sets how deep SuperFun calculates (Easy also makes the odd slip).',
    ],
  },
  dots: {
    title: 'Dots & Boxes',
    lines: [
      'Take turns drawing one line between two neighbouring dots.',
      'Complete the fourth side of a box to claim it — and take another turn.',
      'When every box is claimed, the most boxes wins.',
      'Difficulty sets the grid size. In the 3–4 players section, pick the head-count in-game.',
    ],
  },
  pig: {
    title: 'Pig',
    lines: [
      'On your turn, tap Roll to gather points from the die.',
      'Keep rolling to build the turn total — but roll a 1 and you lose it all and hand over.',
      'Tap Hold to bank your turn total safely and pass the dice.',
      'First player to reach 100 wins. Pick 2–4 players at the top.',
    ],
  },
  snakes: {
    title: 'Snakes & Ladders',
    lines: [
      'Tap Roll and your token moves forward that many squares.',
      'A cell marked ↑N is a LADDER — land on it and you jump UP to square N (that is why one roll can leap far). A cell marked ↓N is a SNAKE — you slide DOWN to square N.',
      'The status line spells out each jump, e.g. "ladder up 28→84".',
      'You must land exactly on 100 — an overshoot stays put.',
      'First to 100 wins. Pick 2–4 players at the top.',
    ],
  },
  dice: {
    title: 'Dice Roller',
    lines: [
      'Pick how many dice you want (1–6), then tap Roll — the faces and their total appear.',
      'Lost the dice from a board game? Roll them here instead — works for any tabletop game.',
      'Fun dice games to play with it: Pig (roll & bank points, first to 100 — but beware a 1!), Farkle (score combos, push your luck), 421, or Yahtzee (5 dice, chase full houses & runs).',
      'Two dice + a printed board is enough for the classics: Backgammon, Monopoly, Snakes & Ladders…',
    ],
  },
};

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({name: 'home'});
  const [saves, setSaves] = useState<GameSave[]>([]); // persisted to disk via FileStore
  const savesRef = useRef<GameSave[]>([]); // mirror of `saves` for synchronous flush-on-leave
  const [stats, setStats] = useState<any>(() => STATS.emptyStats());
  const statsLoaded = useRef(false); // don't persist (nor clobber) before the disk load lands

  useEffect(() => { loadSaves().then(setSaves); }, []); // load once on open
  // Also flush the in-progress game when the app is backgrounded or hardware-back is pressed
  // (launcher / swipe-away / Android back don't go through ‹ Menu or ✕, so those sessions would be lost).
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st === 'background' || st === 'inactive') flushResume(); });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { flushResume(); return false; });
    return () => { sub.remove(); back.remove(); };
  }, []);
  useEffect(() => {
    loadStats().then(loaded => setStats((prev: any) => {
      // Merge the disk load OVER the initial state, but keep any names/emojis the user
      // set before the (async) load landed — then persist once so nothing is lost.
      const base = STATS.normalize(loaded);
      const has = (o: any) => o && Object.keys(o).length > 0;
      const merged = {...base, names: has(prev.names) ? prev.names : base.names, emojis: has(prev.emojis) ? prev.emojis : base.emojis};
      statsLoaded.current = true;
      persistStats(merged);
      return merged;
    }));
  }, []);

  // Persist only AFTER the initial load, so an early write can't clobber the saved file.
  const mutateStats = (fn: (s: any) => any) => setStats((prev: any) => { const next = fn(prev); if (statsLoaded.current) persistStats(next); return next; });
  const statsApi = {
    showBest: stats.showBest,
    best: (game: string, diff: string) => STATS.bestValue(stats, game, diff),
    record: (game: string, diff: string, val: number) => mutateStats(s => STATS.recordBest(s, game, diff, val).stats),
    markPicture: (key: string) => mutateStats(s => STATS.addGallery(s, key)),
    pictures: stats.gallery as string[],
    counter: (key: string) => mutateStats(s => STATS.bumpCounter(s, key)),
  };
  const resetStats = () => mutateStats(() => STATS.emptyStats());

  // Update state AND persist. Same (game,key) updates in place; new one is
  // prepended; each game keeps at most 10 (oldest dropped).
  const mutate = (fn: (prev: GameSave[]) => GameSave[]) =>
    setSaves(prev => {
      const next = fn(prev);
      persistSaves(next);
      return next;
    });
  const addSave = (sv: GameSave) =>
    mutate(prev => {
      const i = prev.findIndex(x => x.game === sv.game && x.key === sv.key);
      let next = i >= 0 ? prev.map((x, k) => (k === i ? sv : x)) : [sv, ...prev];
      const cnt: {[g: string]: number} = {};
      // Cap MANUAL saves at 10 per game; the auto-resume slot is always kept, never competes.
      next = next.filter(x => { if (x.key === RESUME_KEY) return true; cnt[x.game] = (cnt[x.game] || 0) + 1; return cnt[x.game] <= 10; });
      return next;
    });
  const delSave = (game: string, key: string) => mutate(prev => prev.filter(x => !(x.game === game && x.key === key)));
  savesRef.current = saves;
  // Leaving a game flushes its snapshot here. Writes from the ref and RETURNS the
  // persist promise so the ✕ handler can await the disk write before teardown.
  _persistResume = (gs: GameSave) => {
    const prev = savesRef.current;
    const i = prev.findIndex(x => x.game === gs.game && x.key === gs.key);
    let next = i >= 0 ? prev.map((x, k) => (k === i ? gs : x)) : [gs, ...prev];
    const cnt: {[g: string]: number} = {};
    next = next.filter(x => { if (x.key === RESUME_KEY) return true; cnt[x.game] = (cnt[x.game] || 0) + 1; return cnt[x.game] <= 10; });
    savesRef.current = next;
    setSaves(next);
    return persistSaves(next);
  };

  // Remembered player names (persisted in stats.json), survive game switches and sessions.
  const nm = stats.names || {};
  const resolvedNames: Names = {p1: nm.p1 || 'Player 1', p2: nm.p2 || 'Player 2', p3: nm.p3 || 'Player 3', p4: nm.p4 || 'Player 4'};
  const saveNames = (n: Names) => mutateStats(s => ({...s, names: n}));
  const em = stats.emojis || {};
  const resolvedEmojis: Names = {p1: em.p1 || '', p2: em.p2 || '', p3: em.p3 || '', p4: em.p4 || ''};
  const saveEmojis = (e: Names) => mutateStats(s => ({...s, emojis: e}));

  const home = () => setScreen({name: 'home'});
  const play = (g: GameKey, d: Diff, m: Mode, names: Names, emojis: Names, players?: number) => {
    mutateStats(s => STATS.bumpCounter(STATS.bumpCounter(s, 'plays'), 'plays_' + g));
    if (g === 'dots') setScreen({name: 'dots', diff: d, mode: m, names, emojis, players} as Screen);
    else if (g === 'memory' || g === 'pig' || g === 'snakes') setScreen({name: g, diff: d, names, emojis, players} as Screen);
    else if (DUEL[g]) setScreen({name: g, diff: d, mode: m, names, emojis} as Screen);
    else setScreen({name: g, diff: d} as Screen);
  };
  switch (screen.name) {
    case 'sudoku':
      return <SudokuGame diff={screen.diff} onMenu={home} saves={saves.filter(x => x.game === 'sudoku')} onSave={addSave} onDelete={k => delSave('sudoku', k)} st={statsApi} />;
    case 'ttt':
      return <TicTacToe diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'ttt')} onSave={addSave} onDelete={k => delSave('ttt', k)} />;
    case 'c4':
      return <ConnectFour diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'c4')} onSave={addSave} onDelete={k => delSave('c4', k)} />;
    case 'uttt':
      return <UltimateTTT diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'uttt')} onSave={addSave} onDelete={k => delSave('uttt', k)} />;
    case 'mines':
      return <Minesweeper diff={screen.diff} onMenu={home} saves={saves.filter(x => x.game === 'mines')} onSave={addSave} onDelete={k => delSave('mines', k)} st={statsApi} />;
    case 'nono':
      return <Nonogram diff={screen.diff} onMenu={home} saves={saves.filter(x => x.game === 'nono')} onSave={addSave} onDelete={k => delSave('nono', k)} st={statsApi} />;
    case 'words':
      return <WordSearch diff={screen.diff} onMenu={home} saves={saves.filter(x => x.game === 'words')} onSave={addSave} onDelete={k => delSave('words', k)} st={statsApi} />;
    case '2048':
      return <Game2048 diff={screen.diff} onMenu={home} st={statsApi} saves={saves.filter(x => x.game === '2048')} onSave={addSave} onDelete={k => delSave('2048', k)} />;
    case 'taquin':
      return <Taquin diff={screen.diff} onMenu={home} st={statsApi} saves={saves.filter(x => x.game === 'taquin')} onSave={addSave} onDelete={k => delSave('taquin', k)} />;
    case 'mm':
      return <Mastermind diff={screen.diff} onMenu={home} st={statsApi} saves={saves.filter(x => x.game === 'mm')} onSave={addSave} onDelete={k => delSave('mm', k)} />;
    case 'peg':
      return <PegSolitaire diff={screen.diff} onMenu={home} st={statsApi} saves={saves.filter(x => x.game === 'peg')} onSave={addSave} onDelete={k => delSave('peg', k)} />;
    case 'memory':
      return <Memory diff={screen.diff} onMenu={home} st={statsApi} names={screen.names} emojis={screen.emojis} players={screen.players} saves={saves.filter(x => x.game === 'memory')} onSave={addSave} onDelete={k => delSave('memory', k)} />;
    case 'reversi':
      return <Reversi diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'reversi')} onSave={addSave} onDelete={k => delSave('reversi', k)} />;
    case 'checkers':
      return <Checkers diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'checkers')} onSave={addSave} onDelete={k => delSave('checkers', k)} />;
    case 'dames':
      return <Dames diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'dames')} onSave={addSave} onDelete={k => delSave('dames', k)} />;
    case 'battle':
      return <Battleship diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'battle')} onSave={addSave} onDelete={k => delSave('battle', k)} />;
    case 'dice':
      return <Dice onMenu={home} />;
    case 'chess':
      return <Chess diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} saves={saves.filter(x => x.game === 'chess')} onSave={addSave} onDelete={k => delSave('chess', k)} />;
    case 'dots':
      return <DotsBoxes diff={screen.diff} mode={screen.mode} names={screen.names} emojis={screen.emojis} onMenu={home} players={screen.players} saves={saves.filter(x => x.game === 'dots')} onSave={addSave} onDelete={k => delSave('dots', k)} />;
    case 'pig':
      return <Pig onMenu={home} names={screen.names} emojis={screen.emojis} players={screen.players} saves={saves.filter(x => x.game === 'pig')} onSave={addSave} onDelete={k => delSave('pig', k)} />;
    case 'snakes':
      return <Snakes onMenu={home} names={screen.names} emojis={screen.emojis} players={screen.players} saves={saves.filter(x => x.game === 'snakes')} onSave={addSave} onDelete={k => delSave('snakes', k)} />;
    case 'records':
      return <Records stats={stats} onMenu={home} onToggle={() => mutateStats(s => STATS.setShowBest(s, !s.showBest))} onReset={resetStats} />;
    default:
      return <Home onPlay={play} onRecords={() => setScreen({name: 'records'})} initialNames={resolvedNames} onNames={saveNames} initialEmojis={resolvedEmojis} onEmojis={saveEmojis} />;
  }
}

/* --------------------------------------------------------- Rules modal */

// A small B/W illustration for each game's rules.
function exCell(content: React.ReactNode, key: number, inv?: boolean) {
  return <View key={key} style={[s.exCell, inv && s.exInv]}>{content}</View>;
}
function RulesExample({game}: {game: GameKey}): React.JSX.Element | null {
  if (game === 'sudoku') {
    const notes = (
      <View style={s.exNotes}>{[2, 0, 4, 0, 0, 0, 6, 0, 0].map((n, k) => <Text key={k} style={s.exNoteMark}>{n || ''}</Text>)}</View>
    );
    const row = (cells: React.ReactNode[], r: number) => <View key={r} style={s.exGridRow}>{cells}</View>;
    return (
      <View style={s.exWrap}>
        {row([exCell(<Text style={s.exGiven}>5</Text>, 0), exCell(null, 1), exCell(<Text style={s.exGiven}>3</Text>, 2)], 0)}
        {row([exCell(null, 0), exCell(<Text style={s.exHand}>7</Text>, 1), exCell(null, 2)], 1)}
        {row([exCell(<Text style={s.exGiven}>1</Text>, 0), exCell(notes, 1), exCell(null, 2)], 2)}
        <Text style={s.exCaption}>Bold = clue · handwriting = your answer · small = notes</Text>
      </View>
    );
  }
  if (game === 'ttt') {
    const O = (inv?: boolean) => <Text style={[s.exHand, inv && s.exInvText]}>O</Text>;
    const X = <Text style={s.exGiven}>X</Text>;
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[exCell(O(true), 0, true), exCell(X, 1), exCell(null, 2)]}</View>
        <View style={s.exGridRow}>{[exCell(O(true), 0, true), exCell(X, 1), exCell(null, 2)]}</View>
        <View style={s.exGridRow}>{[exCell(O(true), 0, true), exCell(null, 1), exCell(null, 2)]}</View>
        <Text style={s.exCaption}>Three in a row — you win</Text>
      </View>
    );
  }
  if (game === 'c4') {
    const O = (inv?: boolean) => <Text style={[s.exHand, inv && s.exInvText]}>O</Text>;
    const X = <Text style={s.exGiven}>X</Text>;
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[exCell(null, 0), exCell(null, 1), exCell(null, 2), exCell(null, 3)]}</View>
        <View style={s.exGridRow}>{[exCell(X, 0), exCell(null, 1), exCell(X, 2), exCell(null, 3)]}</View>
        <View style={s.exGridRow}>{[exCell(O(true), 0, true), exCell(O(true), 1, true), exCell(O(true), 2, true), exCell(O(true), 3, true)]}</View>
        <Text style={s.exCaption}>Four in a row — you win</Text>
      </View>
    );
  }
  if (game === 'mines') {
    const mine = <Text style={s.exMine}>✳</Text>;
    const two = <Text style={s.exNum}>2</Text>;
    const flag = <Text style={s.exFlag}>⚑</Text>;
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[exCell(mine, 0, true), exCell(flag, 1), exCell(null, 2)]}</View>
        <View style={s.exGridRow}>{[exCell(null, 0), exCell(two, 1), exCell(null, 2)]}</View>
        <View style={s.exGridRow}>{[exCell(null, 0), exCell(null, 1), exCell(mine, 2, true)]}</View>
        <Text style={s.exCaption}>"2" = two mines nearby · ⚑ = your flag</Text>
      </View>
    );
  }
  if (game === 'nono') {
    const f = (k: number) => <View key={k} style={[s.exCell, s.exInv]} />;
    const e = (k: number) => <View key={k} style={s.exCell} />;
    return (
      <View style={s.exWrap}>
        <View style={[s.exGridRow, {alignItems: 'center'}]}>
          <Text style={s.exClueLabel}>2 1</Text>
          {[f(0), f(1), e(2), f(3)]}
        </View>
        <Text style={s.exCaption}>Clue "2 1" → a run of 2, a gap, then 1</Text>
      </View>
    );
  }
  if (game === '2048') {
    const tile = (n: number, k: number) => <View key={k} style={[s.exCell, {backgroundColor: '#E4E4E4'}]}><Text style={s.exNum}>{n}</Text></View>;
    const step = (n: string, k: number) => <View key={k} style={{borderWidth: 1, borderColor: '#BBBBBB', borderRadius: 3, paddingVertical: 2, paddingHorizontal: 4}}><Text style={{fontSize: 10, fontWeight: '800', color: INK}}>{n}</Text></View>;
    const ladder = ['2', '4', '8', '16', '32', '64', '128', '256', '512', '1024'];
    return (
      <View style={s.exWrap}>
        <View style={[s.exGridRow, {alignItems: 'center'}]}>{tile(2, 0)}{tile(2, 1)}<Text style={s.exArrowT}> → </Text>{tile(4, 3)}</View>
        <Text style={s.exCaption}>An arrow slides EVERY tile that way; two equal tiles that bump merge (2 + 2 = 4).</Text>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center', marginTop: 8, maxWidth: 250}}>
          {ladder.map((n, i) => step(n, i))}
        </View>
        <Text style={s.exCaption}>Tiles only DOUBLE — there is no "1". Keep merging up this ladder to reach the 1024 tile.</Text>
      </View>
    );
  }
  if (game === 'taquin') {
    const t = (v: string, k: number) => <View key={k} style={s.exCell}><Text style={s.exNum}>{v}</Text></View>;
    const gap = (k: number) => <View key={k} style={[s.exCell, {backgroundColor: '#EDEDED'}]} />;
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[t('1', 0), t('2', 1), t('3', 2)]}</View>
        <View style={s.exGridRow}>{[t('4', 0), t('5', 1), t('6', 2)]}</View>
        <View style={s.exGridRow}>{[t('7', 0), gap(1), t('8', 2)]}</View>
        <Text style={s.exCaption}>Tap the 8 (next to the gap) to slide it in — work the numbers back into order.</Text>
      </View>
    );
  }
  if (game === 'mm') {
    const peg = (n: number, k: number) => <View key={k} style={[s.exCell, {borderRadius: 18}]}><Text style={s.exNum}>{n}</Text></View>;
    const black = (k: number) => <View key={k} style={{width: 11, height: 11, borderRadius: 6, backgroundColor: INK, margin: 2}} />;
    const white = (k: number) => <View key={k} style={{width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: INK, margin: 2}} />;
    return (
      <View style={s.exWrap}>
        <View style={[s.exGridRow, {alignItems: 'center'}]}>
          {peg(3, 0)}{peg(1, 1)}{peg(4, 2)}{peg(2, 3)}
          <View style={{flexDirection: 'row', marginLeft: 10, alignItems: 'center'}}>{black(0)}{black(1)}{white(2)}</View>
        </View>
        <Text style={s.exCaption}>Your row of numbers, then the feedback in a line: ● = right number in the right spot · ○ = right number, wrong spot (here 2 black + 1 white).</Text>
      </View>
    );
  }
  if (game === 'peg') {
    const hole = (k: number, filled: boolean) => <View key={k} style={[s.exCell, {borderRadius: 18}, filled && s.exInv]} />;
    return (
      <View style={s.exWrap}>
        <View style={[s.exGridRow, {alignItems: 'center'}]}>
          {hole(0, true)}{hole(1, true)}{hole(2, false)}
          <Text style={s.exArrowT}> → </Text>
          {hole(3, false)}{hole(4, false)}{hole(5, true)}
        </View>
        <Text style={s.exCaption}>Jump a peg over its neighbour into the empty hole — the jumped peg is removed.</Text>
      </View>
    );
  }
  if (game === 'memory') {
    const card = (txt: string, k: number, down?: boolean) => <View key={k} style={[s.exCell, down && {backgroundColor: '#E8E8E8'}]}><Text style={s.exNum}>{txt}</Text></View>;
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[card('7', 0), card('7', 1), card('?', 2, true), card('?', 3, true)]}</View>
        <Text style={s.exCaption}>Flip two cards; a matching pair (7 &amp; 7) stays up and you play again.</Text>
      </View>
    );
  }
  if (game === 'uttt') {
    const c = (v: React.ReactNode, k: number, inv?: boolean) => exCell(v, k, inv);
    const O = <Text style={s.exHand}>O</Text>;
    const X = <Text style={s.exGiven}>X</Text>;
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[c(O, 0), c(null, 1, true), c(null, 2)]}</View>
        <View style={s.exGridRow}>{[c(null, 0), c(X, 1), c(null, 2)]}</View>
        <View style={s.exGridRow}>{[c(null, 0), c(null, 1), c(O, 2)]}</View>
        <Text style={s.exCaption}>Nine small boards. Win one to claim its big square (O/X); the highlighted board is where you must play next.</Text>
      </View>
    );
  }
  if (game === 'words') {
    const L = (ch: string, k: number, on?: boolean) => exCell(<Text style={[s.exGiven, on && s.exInvText]}>{ch}</Text>, k, on);
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[L('C', 0, true), L('X', 1), L('T', 2)]}</View>
        <View style={s.exGridRow}>{[L('R', 0), L('A', 1, true), L('E', 2)]}</View>
        <View style={s.exGridRow}>{[L('B', 0), L('S', 1), L('T', 2, true)]}</View>
        <Text style={s.exCaption}>Tap the first letter, then the last letter of a hidden word (CAT on the diagonal).</Text>
      </View>
    );
  }
  if (game === 'reversi') {
    const disc = (k: number, kind: number) => <View key={k} style={s.exCell}><View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: kind === 1 ? INK : PAPER, borderWidth: kind === 2 ? 2 : 0, borderColor: INK}} /></View>;
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[disc(0, 1), disc(1, 2), disc(2, 2), <View key={3} style={s.exCell}><View style={{width: 6, height: 6, borderRadius: 3, backgroundColor: '#999'}} /></View>]}</View>
        <Text style={s.exCaption}>Play your ● on the dot so the ○ ○ line is trapped between your discs — they flip to ●.</Text>
      </View>
    );
  }
  if (game === 'checkers' || game === 'dames') {
    const sq = (k: number, kind: number) => <View key={k} style={s.exCell}>{kind ? <View style={{width: 18, height: 18, borderRadius: 9, backgroundColor: kind === 1 ? INK : PAPER, borderWidth: 2, borderColor: INK}} /> : null}</View>;
    return (
      <View style={s.exWrap}>
        <View style={[s.exGridRow, {alignItems: 'center'}]}>{sq(0, 1)}{sq(1, 2)}{sq(2, 0)}<Text style={s.exArrowT}> → </Text>{sq(3, 0)}{sq(4, 0)}{sq(5, 1)}</View>
        <Text style={s.exCaption}>{game === 'dames' ? 'Jump the ○ into the empty square beyond (10×10, kings fly, take the most).' : 'Jump the ○ into the empty square beyond it to capture — captures are compulsory.'}</Text>
      </View>
    );
  }
  if (game === 'dots') {
    return (
      <View style={s.exWrap}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <View style={{width: 40, height: 40, borderWidth: 2, borderColor: INK, borderBottomColor: '#DDDDDD'}} />
          <Text style={s.exArrowT}>→</Text>
          <View style={{width: 40, height: 40, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECECEC'}}><Text style={s.exNum}>L</Text></View>
        </View>
        <Text style={s.exCaption}>Draw the missing 4th side to close the box — it becomes yours and you go again.</Text>
      </View>
    );
  }
  if (game === 'pig') {
    return (
      <View style={s.exWrap}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}><DieFace n={1} size={40} /><Text style={s.exArrowT}>✗</Text></View>
        <Text style={s.exCaption}>Roll to gather points, but a 1 wipes the turn's total. Tap Hold to bank it and pass on.</Text>
      </View>
    );
  }
  if (game === 'snakes') {
    return (
      <View style={s.exWrap}>
        <View style={s.exGridRow}>{[exCell(<Text style={s.exNum}>↑</Text>, 0), exCell(<Text style={s.exNum}>·</Text>, 1), exCell(<Text style={s.exNum}>↓</Text>, 2)]}</View>
        <Text style={s.exCaption}>Roll &amp; move: a ladder (↑) climbs you up, a snake (↓) slides you down. Land exactly on 100 to win.</Text>
      </View>
    );
  }
  return null;
}

function SavedModal({saves, onLoad, onDelete, onClose}: {
  saves: GameSave[]; onLoad: (s: GameSave) => void; onDelete: (key: string) => void; onClose: () => void;
}): React.JSX.Element {
  const resume = saves.find(x => x.key === RESUME_KEY);
  const manual = saves.filter(x => x.key !== RESUME_KEY);
  return (
    <View style={s.modalWrap}>
      <View style={s.modalCard}>
        {resume ? (
          <View style={[s.savedRow, s.resumeRow]}>
            <View style={{flex: 1}}>
              <Text style={s.savedText}>{resume.label}</Text>
              <Text style={s.savedSub}>left off {fmtTs(resume.ts)}</Text>
            </View>
            <Pressable style={[s.savedBtn, s.resumeBtn]} onPress={() => onLoad(resume)}><Text style={[s.savedBtnText, s.solidText]}>Continue</Text></Pressable>
            <Pressable style={s.savedBtn} onPress={() => onDelete(resume.key)}><Text style={s.savedBtnText}>Delete</Text></Pressable>
          </View>
        ) : null}
        <Text style={s.modalTitle}>Saved ({manual.length}/10)</Text>
        {manual.length === 0 ? (
          <Text style={s.savedEmpty}>No manual saves yet. Tap Save during a game — a game in progress is also kept above when you leave.</Text>
        ) : (
          <ScrollView style={{maxHeight: 300}}>
            {manual.map(sv => (
              <View key={sv.key} style={s.savedRow}>
                <View style={{flex: 1}}>
                  <Text style={s.savedText}>{sv.label} · #{sv.key}</Text>
                  <Text style={s.savedSub}>saved {fmtTs(sv.ts)}</Text>
                </View>
                <Pressable style={s.savedBtn} onPress={() => onLoad(sv)}><Text style={s.savedBtnText}>Load</Text></Pressable>
                <Pressable style={s.savedBtn} onPress={() => onDelete(sv.key)}><Text style={s.savedBtnText}>Delete</Text></Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        <Pressable style={s.modalBtn} onPress={onClose}><Text style={s.modalBtnText}>Close</Text></Pressable>
      </View>
    </View>
  );
}

// Big end-of-game message, centred over the play area (does not move the board).
function EndOverlay({text}: {text: string}): React.JSX.Element {
  return (
    <View pointerEvents="none" style={s.endOverlay}>
      <Text style={s.endBig}>{text}</Text>
    </View>
  );
}

function RulesModal({game, onClose}: {game: GameKey; onClose: () => void}): React.JSX.Element {
  const r = RULES[game];
  return (
    <View style={s.modalWrap}>
      <View style={s.modalCard}>
        <Text style={s.modalTitle}>How to play — {r.title}</Text>
        {r.lines.map((l, i) => (
          <View key={i} style={s.ruleLine}>
            <Text style={s.ruleDot}>•</Text>
            <Text style={s.ruleText}>{l}</Text>
          </View>
        ))}
        <RulesExample game={game} />
        <Pressable style={s.modalBtn} onPress={onClose}><Text style={s.modalBtnText}>Got it</Text></Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ Home */

const GAME_META: {[k: string]: {label: string; blurb: string}} = {
  sudoku: {label: 'Sudoku', blurb: 'Fill the 9×9 grid'},
  nono: {label: 'Nonogram', blurb: 'Reveal a hidden picture'},
  mines: {label: 'Minesweeper', blurb: 'Clear the field, dodge the mines'},
  words: {label: 'Word Search', blurb: 'Find the hidden words'},
  '2048': {label: '2048', blurb: 'Merge tiles to 2048'},
  taquin: {label: '15-Puzzle', blurb: 'Slide tiles into order'},
  mm: {label: 'Mastermind', blurb: 'Crack the hidden code'},
  peg: {label: 'Peg Solitaire', blurb: 'Jump & clear the pegs'},
  memory: {label: 'Memory', blurb: 'Match the pairs'},
  ttt: {label: 'Tic-Tac-Toe', blurb: 'Three in a row'},
  uttt: {label: 'Ultimate TTT', blurb: 'The 3×3-of-3×3 duel'},
  c4: {label: 'Connect Four', blurb: 'Drop four in a row'},
  reversi: {label: 'Reversi', blurb: 'Outflank & flip discs'},
  checkers: {label: 'Checkers', blurb: 'Jump and crown kings'},
  dames: {label: 'Dames', blurb: '10×10 with flying kings'},
  chess: {label: 'Chess', blurb: 'Checkmate the king'},
  dice: {label: 'Dice Roller', blurb: 'Roll dice for any game'},
  battle: {label: 'Battleship', blurb: 'Sink the hidden fleet'},
  dots: {label: 'Dots & Boxes', blurb: 'Close boxes to score'},
  pig: {label: 'Pig', blurb: 'Press your luck with dice'},
  snakes: {label: 'Snakes & Ladders', blurb: 'Race up the board'},
};

// Home is organised into TABS. The Solo tab is split into labelled sections
// (truly solo vs. playing SuperFun); the 2-player tab lists the duels.
// A future tab (e.g. 3–4 players) is just another entry here.
const SOLO_SECTIONS: Array<{title: string; games: GameKey[]}> = [
  {title: 'Play solo', games: ['sudoku', 'nono', 'mines', 'words', '2048', 'taquin', 'mm', 'peg', 'memory', 'dice']},
  {title: 'Vs SuperFun', games: ['chess', 'ttt', 'uttt', 'c4', 'reversi', 'checkers', 'dames', 'dots', 'battle']},
];
// The Multi-players tab is split into titled sections by head-count.
const MULTI_SECTIONS: Array<{title: string; mode: Mode; games: GameKey[]}> = [
  {title: '2 players', mode: '2p', games: ['chess', 'ttt', 'uttt', 'c4', 'reversi', 'checkers', 'dames', 'dots', 'battle']},
  {title: '3–4 players', mode: 'multi', games: ['dots', 'memory', 'pig', 'snakes']},
];

const DIFF_HINT: Record<GameKey, string> = {
  sudoku: 'Difficulty sets how many clues you start with (Easy ≈40 · Medium ≈32 · Hard ≈26).',
  ttt: 'Difficulty sets how sharp SuperFun plays (Easy random · Medium tough · Hard unbeatable).',
  c4: 'Difficulty sets how far ahead SuperFun thinks (Easy light · Medium solid · Hard tough).',
  uttt: 'Difficulty sets how hard SuperFun searches (Easy loose · Medium solid · Hard tough).',
  chess: 'Difficulty sets how deep SuperFun thinks (Easy shallow + slips · Medium 2-ply · Hard 3-ply). Pawns auto-promote to a queen.',
  dice: 'No difficulty — just pick how many dice and roll.',
  mines: 'Difficulty sets grid size and mines (Easy 8×8·10 · Medium 10×10·18 · Hard 12×12·30).',
  nono: 'Difficulty sets the grid size (Easy 5×5 · Medium 8×8 · Hard 10×10).',
  words: 'Difficulty picks an age tier & grid (Easy = Kids 8×8 · Medium = Teens 11×11 · Hard = Adults 14×14). Pick the language in-game.',
  '2048': 'Difficulty sets grid & goal — a bigger grid is far easier (Easy 6×6→256 · Medium 5×5→2048 · Hard 4×4→2048, the classic). Swipe or use the arrows.',
  taquin: 'Difficulty sets the grid size (Easy 3×3 · Medium 4×4 · Hard 5×5).',
  mm: 'Difficulty sets pegs · colours · tries (Easy 4·6·12 · Medium 4·8·10 · Hard 5·8·12).',
  peg: 'Difficulty picks the board shape (Easy Triangle · Medium Cross · Hard Big Cross). Clear down to one peg.',
  memory: 'Difficulty sets the grid (Easy 4×4 · Medium 6×4 · Hard 6×6). Choose 1–4 players in-game.',
  reversi: 'Difficulty sets how far SuperFun looks ahead (Easy grabby · Medium solid · Hard thoughtful).',
  checkers: 'Difficulty sets how deep SuperFun searches (Easy shallow · Medium solid · Hard tough).',
  dames: 'International draughts (10×10, flying kings). Difficulty sets SuperFun\'s search depth (Easy shallow · Medium solid · Hard deep).',
  battle: '10×10 sea, the classic 5-ship fleet. Difficulty sets how cleverly SuperFun hunts (Easy random · Medium hunts hits · Hard hunts smart).',
  dots: 'Difficulty sets the grid (Easy 3×3 · Medium 4×4 · Hard 5×5 boxes).',
  pig: 'A dice race to 100. Pick 2–4 players inside the game.',
  snakes: 'Roll and race to square 100. Pick 2–4 players inside the game.',
};

// Small monochrome View-based icon per game (no SVG dep — matches RulesExample).
const DIE_PIPS: {[n: number]: number[]} = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]};
function DieFace({n, size, color}: {n: number; size: number; color?: string}): React.JSX.Element {
  const col = color || INK;
  const set = DIE_PIPS[n] || [];
  return (
    <View style={{width: size, height: size, borderWidth: 2, borderColor: col, borderRadius: size * 0.16, padding: size * 0.12}}>
      {[0, 1, 2].map(r => (
        <View key={r} style={{flex: 1, flexDirection: 'row'}}>
          {[0, 1, 2].map(c => (
            <View key={c} style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
              {set.indexOf(r * 3 + c) !== -1 ? <View style={{width: size * 0.15, height: size * 0.15, borderRadius: size * 0.075, backgroundColor: col}} /> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function GameIcon({game, size, color}: {game: GameKey; size: number; color: string}): React.JSX.Element {
  const box = {width: size, height: size};
  if (game === 'sudoku') {
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color}]}>
        {[0, 1, 2].map(r => (
          <View key={r} style={{flex: 1, flexDirection: 'row', borderTopWidth: r ? 1 : 0, borderColor: color}}>
            {[0, 1, 2].map(c => (
              <View key={c} style={{flex: 1, borderLeftWidth: c ? 1 : 0, borderColor: color, alignItems: 'center', justifyContent: 'center'}}>
                {r === 0 && c === 0 ? <Text style={{fontSize: size * 0.24, color, fontWeight: '800'}}>5</Text> : null}
                {r === 2 && c === 2 ? <Text style={{fontSize: size * 0.24, color, fontWeight: '800'}}>3</Text> : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (game === 'nono') {
    const fillMap = [0, 1, 0, 1, 1, 1, 0, 1, 0]; // little diamond/plus picture
    return (
      <View style={[box, {borderWidth: 1.4, borderColor: color}]}>
        {[0, 1, 2].map(r => (
          <View key={r} style={{flex: 1, flexDirection: 'row', borderTopWidth: r ? 0.8 : 0, borderColor: color}}>
            {[0, 1, 2].map(c => (
              <View key={c} style={{flex: 1, borderLeftWidth: c ? 0.8 : 0, borderColor: color, backgroundColor: fillMap[r * 3 + c] ? color : 'transparent'}} />
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (game === 'mines') {
    return (
      <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}>
        <View style={{position: 'absolute', width: size * 0.92, height: 1.6, backgroundColor: color}} />
        <View style={{position: 'absolute', width: 1.6, height: size * 0.92, backgroundColor: color}} />
        <View style={{position: 'absolute', width: size * 0.92, height: 1.6, backgroundColor: color, transform: [{rotate: '45deg'}]}} />
        <View style={{position: 'absolute', width: size * 0.92, height: 1.6, backgroundColor: color, transform: [{rotate: '-45deg'}]}} />
        <View style={{width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, backgroundColor: color}} />
      </View>
    );
  }
  if (game === 'words') {
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color, alignItems: 'center', justifyContent: 'center'}]}>
        <Text style={{fontSize: size * 0.48, color, fontWeight: '800'}}>Az</Text>
      </View>
    );
  }
  if (game === 'ttt') {
    return (
      <View style={box}>
        {[0, 1, 2].map(r => (
          <View key={r} style={{flex: 1, flexDirection: 'row', borderTopWidth: r ? 1.4 : 0, borderColor: color}}>
            {[0, 1, 2].map(c => (
              <View key={c} style={{flex: 1, borderLeftWidth: c ? 1.4 : 0, borderColor: color, alignItems: 'center', justifyContent: 'center'}}>
                {r === 0 && c === 0 ? <View style={{width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, borderWidth: 1.4, borderColor: color}} /> : null}
                {r === 2 && c === 2 ? <Text style={{fontSize: size * 0.22, color, fontWeight: '900'}}>✕</Text> : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (game === 'uttt') {
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color}]}>
        {[0, 1, 2].map(r => (
          <View key={r} style={{flex: 1, flexDirection: 'row', borderTopWidth: r ? 1.2 : 0, borderColor: color}}>
            {[0, 1, 2].map(c => (
              <View key={c} style={{flex: 1, borderLeftWidth: c ? 1.2 : 0, borderColor: color, alignItems: 'center', justifyContent: 'center'}}>
                <View style={{width: size * 0.1, height: size * 0.1, backgroundColor: color}} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (game === 'c4') {
    const disc = (fill: boolean, key: number) => <View key={key} style={{width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, borderWidth: 1.2, borderColor: color, backgroundColor: fill ? color : 'transparent'}} />;
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color, borderRadius: 3, padding: size * 0.08, justifyContent: 'space-between'}]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>{[false, true, false].map((f, i) => disc(f, i))}</View>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>{[true, false, true].map((f, i) => disc(f, i))}</View>
      </View>
    );
  }
  if (game === '2048') {
    const labels = ['2', '4', '8', '16'];
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color}]}>
        {[0, 1].map(r => (
          <View key={r} style={{flex: 1, flexDirection: 'row', borderTopWidth: r ? 1 : 0, borderColor: color}}>
            {[0, 1].map(c => (
              <View key={c} style={{flex: 1, borderLeftWidth: c ? 1 : 0, borderColor: color, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: size * 0.22, color, fontWeight: '800'}}>{labels[r * 2 + c]}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (game === 'taquin') {
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color}]}>
        {[0, 1, 2].map(r => (
          <View key={r} style={{flex: 1, flexDirection: 'row', borderTopWidth: r ? 1 : 0, borderColor: color}}>
            {[0, 1, 2].map(c => (
              <View key={c} style={{flex: 1, borderLeftWidth: c ? 1 : 0, borderColor: color, backgroundColor: r === 2 && c === 2 ? color : 'transparent'}} />
            ))}
          </View>
        ))}
      </View>
    );
  }
  if (game === 'mm') {
    const peg = (fill: boolean, key: number) => <View key={key} style={{width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, borderWidth: 1.3, borderColor: color, backgroundColor: fill ? color : 'transparent'}} />;
    return (
      <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}>
        <View style={{flexDirection: 'row', gap: size * 0.06}}>{[true, false, true, false].map((f, i) => peg(f, i))}</View>
      </View>
    );
  }
  if (game === 'peg') {
    const dot = (fill: boolean, key: number) => <View key={key} style={{width: size * 0.2, height: size * 0.2, borderRadius: size * 0.1, borderWidth: 1.3, borderColor: color, backgroundColor: fill ? color : 'transparent'}} />;
    return (
      <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}>
        <View style={{alignItems: 'center', gap: size * 0.05}}>
          <View style={{flexDirection: 'row', justifyContent: 'center'}}>{dot(true, 0)}</View>
          <View style={{flexDirection: 'row', gap: size * 0.05}}>{dot(true, 1)}{dot(false, 2)}{dot(true, 3)}</View>
          <View style={{flexDirection: 'row', justifyContent: 'center'}}>{dot(true, 4)}</View>
        </View>
      </View>
    );
  }
  if (game === 'memory') {
    return (
      <View style={[box, {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * 0.12}]}>
        <View style={{width: size * 0.34, height: size * 0.46, borderWidth: 1.6, borderColor: color, borderRadius: 2, alignItems: 'center', justifyContent: 'center'}}><Text style={{fontSize: size * 0.28, color, fontWeight: '800'}}>?</Text></View>
        <View style={{width: size * 0.34, height: size * 0.46, borderWidth: 1.6, borderColor: color, borderRadius: 2, backgroundColor: color}} />
      </View>
    );
  }
  if (game === 'reversi') {
    const disc = (fill: boolean, key: number) => <View key={key} style={{width: size * 0.26, height: size * 0.26, borderRadius: size * 0.13, borderWidth: 1.4, borderColor: color, backgroundColor: fill ? color : 'transparent'}} />;
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color, padding: size * 0.09, justifyContent: 'space-between'}]}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>{disc(true, 0)}{disc(false, 1)}</View>
        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>{disc(false, 2)}{disc(true, 3)}</View>
      </View>
    );
  }
  if (game === 'checkers') {
    // a crown-ish disc
    return (
      <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}>
        <View style={{width: size * 0.62, height: size * 0.62, borderRadius: size * 0.31, backgroundColor: color, alignItems: 'center', justifyContent: 'center'}}>
          <View style={{width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11, borderWidth: 2, borderColor: color === INK ? PAPER : INK}} />
        </View>
      </View>
    );
  }
  if (game === 'dames') {
    // a stacked-disc "dame" (flying king)
    return (
      <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}>
        <View style={{width: size * 0.66, height: size * 0.66, borderRadius: size * 0.33, backgroundColor: color, alignItems: 'center', justifyContent: 'center'}}>
          <View style={{width: size * 0.36, height: size * 0.36, borderRadius: size * 0.18, borderWidth: 2, borderColor: color === INK ? PAPER : INK, alignItems: 'center', justifyContent: 'center'}}>
            <View style={{width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: color === INK ? PAPER : INK}} />
          </View>
        </View>
      </View>
    );
  }
  if (game === 'battle') {
    // 3×3 grid: a ship block + a hit ✗ + a miss ○
    const cells = [1, 0, 2, 0, 1, 0, 0, 0, 2]; // 1=ship, 2=mark
    return (
      <View style={[box, {borderWidth: 1.6, borderColor: color}]}>
        {[0, 1, 2].map(r => (
          <View key={r} style={{flex: 1, flexDirection: 'row', borderTopWidth: r ? 1 : 0, borderColor: color}}>
            {[0, 1, 2].map(cc => {
              const v = cells[r * 3 + cc];
              return <View key={cc} style={{flex: 1, borderLeftWidth: cc ? 1 : 0, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: v === 1 ? color : 'transparent'}}>
                {v === 2 ? <Text style={{fontSize: size * 0.24, fontWeight: '900', color}}>✗</Text> : null}
              </View>;
            })}
          </View>
        ))}
      </View>
    );
  }
  if (game === 'dots') {
    const dot = (key: number) => <View key={key} style={{width: size * 0.12, height: size * 0.12, borderRadius: size * 0.06, backgroundColor: color}} />;
    return (
      <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}>
        <View style={{width: size * 0.72, height: size * 0.72, justifyContent: 'space-between'}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>{dot(0)}{dot(1)}{dot(2)}</View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>{dot(3)}<View style={{width: size * 0.16, height: size * 0.16, borderWidth: 1.4, borderColor: color}} />{dot(4)}</View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>{dot(5)}{dot(6)}{dot(7)}</View>
        </View>
      </View>
    );
  }
  if (game === 'pig') return <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}><DieFace n={5} size={size * 0.92} color={color} /></View>;
  if (game === 'snakes') {
    return (
      <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}>
        <View style={{width: size * 0.42, height: size * 0.8, borderLeftWidth: 2, borderRightWidth: 2, borderColor: color, justifyContent: 'space-around', transform: [{rotate: '12deg'}]}}>
          {[0, 1, 2, 3].map(i => <View key={i} style={{height: 2, marginHorizontal: -1, backgroundColor: color}} />)}
        </View>
      </View>
    );
  }
  if (game === 'chess') return <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}><Text style={{fontSize: size * 0.8, color}}>♞</Text></View>;
  if (game === 'dice') return <View style={[box, {alignItems: 'center', justifyContent: 'center'}]}><DieFace n={5} size={size * 0.92} color={color} /></View>;
  return <View style={box} />;
}

// Shared game header — one consistent order everywhere:
// ‹ Menu · <title> · [Undo] [Save] [Saved] [Rules] [New] [✕]
function GameHeader({title, onMenu, onUndo, onSave, savedCount, onShowSaved, onRules, onNew}: {
  title: string; onMenu: () => void; onUndo?: () => void; onSave?: () => void; savedCount?: number; onShowSaved?: () => void; onRules?: () => void; onNew?: () => void;
}): React.JSX.Element {
  return (
    <View style={s.header}>
      <Pressable style={s.iconBtn} onPress={async () => { await flushResume(); onMenu(); }}><Text style={s.iconText}>‹ Menu</Text></Pressable>
      <Text style={s.gameTitle} numberOfLines={1}>{title}</Text>
      <View style={{flexDirection: 'row'}}>
        {onUndo ? <Pressable style={s.iconBtn} onPress={onUndo}><Text style={s.iconText}>↶ Undo</Text></Pressable> : null}
        {onSave ? <Pressable style={s.iconBtn} onPress={onSave}><Text style={s.iconText}>Save</Text></Pressable> : null}
        {onShowSaved ? <Pressable style={s.iconBtn} onPress={onShowSaved}><Text style={s.iconText}>Saved ({savedCount})</Text></Pressable> : null}
        {onRules ? <Pressable style={s.iconBtn} onPress={onRules}><Text style={s.iconText}>Rules</Text></Pressable> : null}
        {onNew ? <Pressable style={s.iconBtn} onPress={onNew}><Text style={s.iconText}>New</Text></Pressable> : null}
        <Pressable style={s.iconBtn} onPress={async () => { await flushResume(); PluginManager.closePluginView(); }}><Text style={s.iconText}>✕</Text></Pressable>
      </View>
    </View>
  );
}

const EMOJI_CHOICES = ['🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐧', '🐵', '⭐', '❤️', '⚡', '🚀'];
function Home({onPlay, onRecords, initialNames, onNames, initialEmojis, onEmojis}: {onPlay: (g: GameKey, d: Diff, m: Mode, names: Names, emojis: Names, players?: number) => void; onRecords: () => void; initialNames: Names; onNames: (n: Names) => void; initialEmojis: Names; onEmojis: (e: Names) => void}): React.JSX.Element {
  const [tab, setTab] = useState<'solo' | 'multi'>('solo');
  const [sel, setSel] = useState<{game: GameKey; mode: Mode}>({game: 'sudoku', mode: 'ai'});
  const [diff, setDiff] = useState<Diff>('medium');
  const [p1, setP1] = useState(initialNames.p1);
  const [p2, setP2] = useState(initialNames.p2);
  const [p3, setP3] = useState(initialNames.p3);
  const [p4, setP4] = useState(initialNames.p4);
  const [emojis, setEmojis] = useState<string[]>([initialEmojis.p1, initialEmojis.p2, initialEmojis.p3, initialEmojis.p4]);
  const [mplayers, setMplayers] = useState(3);
  const [kb, setKb] = useState(0); // keyboard height — lift the name fields above it
  const [nameFocus, setNameFocus] = useState(false); // A5X gen-1 reports kb height 0 → use a fixed fallback lift when a name field is focused
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKb(e.endCoordinates?.height || 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const order: Diff[] = ['easy', 'medium', 'hard'];
  const nameStates: Array<[string, (v: string) => void]> = [[p1, setP1], [p2, setP2], [p3, setP3], [p4, setP4]];

  const collect = (): Names => ({p1: p1.trim() || 'Player 1', p2: p2.trim() || 'Player 2', p3: p3.trim() || 'Player 3', p4: p4.trim() || 'Player 4'});
  const collectEmojis = (): Names => ({p1: emojis[0] || '', p2: emojis[1] || '', p3: emojis[2] || '', p4: emojis[3] || ''});
  const pickEmoji = (i: number, e: string) => { const ne = emojis.slice(); ne[i] = ne[i] === e ? '' : e; setEmojis(ne); onEmojis({p1: ne[0] || '', p2: ne[1] || '', p3: ne[2] || '', p4: ne[3] || ''}); };
  const goTab = (t: 'solo' | 'multi') => { if (t === tab) return; setTab(t); setSel(t === 'solo' ? {game: 'sudoku', mode: 'ai'} : {game: 'ttt', mode: '2p'}); };
  const start = () => {
    const names = collect(); const em = collectEmojis();
    onNames(names); onEmojis(em); // remember names + emojis across games + sessions
    const count = sel.mode === 'multi' ? mplayers : sel.mode === '2p' ? 2 : 1;
    onPlay(sel.game, diff, sel.mode, names, em, count);
  };
  const EmojiRow = ({i}: {i: number}) => (
    <View style={s.emojiRow}>
      {EMOJI_CHOICES.map(e => {
        const mine = emojis[i] === e;
        const takenByOther = !mine && emojis.some((x, j) => j !== i && x === e);
        return (
          <Pressable key={e} disabled={takenByOther} onPress={() => pickEmoji(i, e)} style={[s.emojiBtn, mine && s.emojiBtnOn, takenByOther && s.emojiBtnOff]}>
            <Text style={[s.emojiTxt, takenByOther && {opacity: 0.25}]}>{e}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const Tile = ({g, mode}: {g: GameKey; mode: Mode}) => {
    const on = sel.game === g && sel.mode === mode;
    return (
      <Pressable onPress={() => setSel({game: g, mode})} style={[s.gTile, on && s.gTileOn]}>
        <GameIcon game={g} size={30} color={on ? PAPER : INK} />
        <View style={{flex: 1}}>
          <Text style={[s.gTileName, on && s.solidText]}>{GAME_META[g].label}</Text>
          <Text style={[s.gTileBlurb, on && s.solidTextDim]} numberOfLines={1}>{GAME_META[g].blurb}</Text>
        </View>
      </Pressable>
    );
  };

  const showDiff = (tab === 'solo' && sel.game !== 'dice') || sel.game === 'dots' || sel.game === 'memory';
  const showNames = tab === 'multi';

  return (
    <View style={[s.container, (() => { const lift = Math.max(kb, nameFocus ? Math.round(SCREEN_H * 0.42) : 0); return lift ? {paddingBottom: lift} : null; })()]}>
      <View style={s.header}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Image source={APP_ICON} style={s.brandIcon} resizeMode="contain" />
          <Text style={s.brand}>SuperFun</Text>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Pressable style={s.iconBtn} onPress={onRecords}><Text style={s.iconText}>🏆 Records</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
        </View>
      </View>

      <View style={s.tabs}>
        <Pressable onPress={() => goTab('solo')} style={[s.tabBtn, tab === 'solo' && s.tabOn]}><Text style={[s.tabText, tab === 'solo' && s.solidText]}>Solo</Text></Pressable>
        <Pressable onPress={() => goTab('multi')} style={[s.tabBtn, tab === 'multi' && s.tabOn]}><Text style={[s.tabText, tab === 'multi' && s.solidText]}>Multi-players</Text></Pressable>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 10}}>
        {tab === 'solo'
          ? SOLO_SECTIONS.map(sec => (
            <View key={sec.title}>
              <Text style={s.sectionLabel}>{sec.title}</Text>
              <View style={s.tileGrid}>{sec.games.map(g => <Tile key={g} g={g} mode="ai" />)}</View>
            </View>
          ))
          : MULTI_SECTIONS.map(sec => (
            <View key={sec.title}>
              <Text style={s.sectionLabel}>{sec.title}</Text>
              <View style={s.tileGrid}>{sec.games.map(g => <Tile key={g + sec.title} g={g} mode={sec.mode} />)}</View>
            </View>
          ))}
      </ScrollView>

      {/* Options + Play pinned to the bottom, always reflecting the selected game */}
      <View style={s.homeBottom}>
        {showDiff ? (
          <>
            <Text style={s.sectionLabel}>Difficulty · {GAME_META[sel.game].label}</Text>
            <View style={s.diffRow}>
              {order.map(d => (
                <Pressable key={d} onPress={() => setDiff(d)} style={[s.diffBtn, diff === d && s.solidBtn]}>
                  <Text style={[s.diffText, diff === d && s.solidText]}>{DIFFICULTIES[d].label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.diffHint}>{DIFF_HINT[sel.game]}</Text>
          </>
        ) : null}

        {showNames ? (
          <>
            {sel.mode === 'multi' ? (
              <View style={s.memPlayers}>
                <Text style={s.memPlayersLbl}>Players</Text>
                {[2, 3, 4].map(n => (
                  <Pressable key={n} onPress={() => setMplayers(n)} style={[s.pSelBtn, mplayers === n && s.solidBtn]}>
                    <Text style={[s.pSelTxt, mplayers === n && s.solidText]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={s.sectionLabel}>Player names</Text>
            <View style={s.nameRow}>
              {[0, 1].map(i => (
                <View key={i} style={s.nameField}>
                  <Text style={s.nameTag}>{sel.mode === '2p' ? (i === 0 ? 'First · plays O' : 'Second · plays X') : `Player ${i + 1}`}</Text>
                  <TextInput value={nameStates[i][0]} onChangeText={nameStates[i][1]} onEndEditing={() => onNames(collect())} onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)} placeholder={`Player ${i + 1}`} placeholderTextColor="#AAAAAA" style={s.nameInput} maxLength={14} />
                  <EmojiRow i={i} />
                </View>
              ))}
            </View>
            {sel.mode === 'multi' && mplayers > 2 ? (
              <View style={[s.nameRow, {marginTop: 8}]}>
                {[2, 3].filter(i => i < mplayers).map(i => (
                  <View key={i} style={s.nameField}>
                    <Text style={s.nameTag}>Player {i + 1}</Text>
                    <TextInput value={nameStates[i][0]} onChangeText={nameStates[i][1]} onEndEditing={() => onNames(collect())} onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)} placeholder={`Player ${i + 1}`} placeholderTextColor="#AAAAAA" style={s.nameInput} maxLength={14} />
                  <EmojiRow i={i} />
                  </View>
                ))}
                {mplayers === 3 ? <View style={s.nameField} /> : null}
              </View>
            ) : null}
          </>
        ) : null}

        <Pressable style={s.playBtn} onPress={start}>
          <Text style={s.playText}>Play {GAME_META[sel.game].label} ▸</Text>
        </Pressable>
      </View>

      <View style={s.kofiRow}>
        <View style={{flex: 1}}>
          <Text style={s.kofiText}>
            What does a Supernote dev do to procrastinate? Build a whole games plugin, of course!
            If SuperFun brightens your breaks too, a coffee keeps it growing:
          </Text>
          <Text selectable style={s.kofiLink}>https://ko-fi.com/agp42</Text>
        </View>
        <Image source={KOFI_QR} style={s.kofiQr} resizeMode="contain" />
      </View>
    </View>
  );
}

/* --------------------------------------------------------- Tic-Tac-Toe */

function TicTacToe({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const twoP = mode === '2p';
  const p1 = names.p1, p2 = names.p2;
  const e1 = (emojis && emojis.p1) ? emojis.p1 + ' ' : '', e2 = (emojis && emojis.p2) ? emojis.p2 + ' ' : '';
  const [board, setBoard] = useState<string[]>(() => Array(9).fill(''));
  const [showSaved, setShowSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turn, setTurn] = useState<'O' | 'X'>('O');
  const [score, setScore] = useState({you: 0, sn: 0, draw: 0});
  const [end, setEnd] = useState<{msg: string; kind: 'win' | 'lose' | 'draw'} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0, draw: 0});

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const result = TTT.winner(board);
  const over = !!result;
  const winLine: number[] = result && result.line ? result.line : [];

  const finish = (who: 'O' | 'X' | 'draw') => {
    onDelete(RESUME_KEY);
    if (who === 'O') {
      setScore(v => ({...v, you: v.you + 1}));
      setEnd({msg: twoP ? `${e1}${p1} wins! 🎉` : WIN_MSGS[idx.current.win++ % WIN_MSGS.length], kind: 'win'});
    } else if (who === 'X') {
      setScore(v => ({...v, sn: v.sn + 1}));
      setEnd({msg: twoP ? `${e2}${p2} wins! 🎉` : LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length], kind: twoP ? 'win' : 'lose'});
    } else {
      setScore(v => ({...v, draw: v.draw + 1}));
      setEnd({msg: DRAW_MSGS[idx.current.draw++ % DRAW_MSGS.length], kind: 'draw'});
    }
  };

  const playAgain = () => {
    if (timer.current) clearTimeout(timer.current);
    setBoard(Array(9).fill(''));
    setBusy(false);
    setEnd(null);
    setTurn('O');
  };
  const newMatch = () => {
    playAgain();
    setScore({you: 0, sn: 0, draw: 0}); // "New" starts a fresh match: reset the scoreboard
  };

  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.board) || d.board.length !== 9) return;
    setBoard(d.board.slice()); setTurn(d.turn === 'X' ? 'X' : 'O'); setScore(d.score || {you: 0, sn: 0, draw: 0});
    setBusy(false); setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('ttt', diff, !over && !busy && board.some(Boolean) && (twoP || turn === 'O'), twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, {board, turn, score}));
  const saveNow = () => onSave({game: 'ttt', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, data: {board, turn, score}});
  const play = (i: number) => {
    if (busy || over || board[i]) return;
    const cur = twoP ? turn : 'O';
    const nb = board.slice();
    nb[i] = cur;
    setBoard(nb);
    const w1 = TTT.winner(nb);
    if (w1) { finish(w1.player as 'O' | 'X' | 'draw'); return; }
    if (twoP) { setTurn(cur === 'O' ? 'X' : 'O'); return; }
    setBusy(true);
    timer.current = setTimeout(() => {
      const m = TTT.aiMove(nb.slice(), diff);
      const ab = nb.slice();
      if (m >= 0) ab[m] = 'X';
      setBoard(ab);
      setBusy(false);
      const w2 = TTT.winner(ab);
      if (w2) finish(w2.player as 'X' | 'draw');
    }, 400); // brief pause before SuperFun plays its X
  };

  const status = twoP
    ? (turn === 'O' ? `${e1}${p1}'s turn (O)` : `${e2}${p2}'s turn (X)`)
    : (busy ? 'SuperFun is thinking…' : 'Your turn');

  return (
    <View style={s.container}>
      <GameHeader title="Tic-Tac-Toe" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newMatch} />

      <Text style={s.tttLegend}>{twoP ? <Text>{e1}{p1} = <Text style={s.bold}>O</Text> · {e2}{p2} = <Text style={s.bold}>X</Text></Text> : <Text>You are <Text style={s.bold}>O</Text> · SuperFun is <Text style={s.bold}>X</Text> · {DIFFICULTIES[diff].label}</Text>}</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={twoP ? s.turnBig : s.statusBig}>{status}</Text>}
        </View>

        <View style={s.tttBoard}>
          {[0, 1, 2].map(r => (
            <View key={r} style={s.tttRow}>
              {[0, 1, 2].map(c => {
                const i = r * 3 + c;
                const mark = board[i];
                const win = winLine.indexOf(i) !== -1;
                return (
                  <Pressable key={c} onPress={() => play(i)} style={[s.tttCell, win && s.tttCellWin]}>
                    {mark ? <Text style={[mark === 'O' ? s.tttO : s.tttX, win && s.cellTextSel]}>{mark}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
          <View pointerEvents="none" style={[s.tttLineV, {left: TCELL - 2}]} />
          <View pointerEvents="none" style={[s.tttLineV, {left: TCELL * 2 - 2}]} />
          <View pointerEvents="none" style={[s.tttLineH, {top: TCELL - 2}]} />
          <View pointerEvents="none" style={[s.tttLineH, {top: TCELL * 2 - 2}]} />
        </View>

        <View style={s.belowZone}>
          {over ? <Pressable style={s.playAgainBtn} onPress={playAgain}><Text style={s.playText}>Play again ▸</Text></Pressable> : null}
        </View>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>

      <View style={s.scoreRow}>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.you}</Text><Text style={s.scoreWho}>{twoP ? `${e1}${p1}` : 'You'}</Text></View>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.draw}</Text><Text style={s.scoreWho}>Draws</Text></View>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.sn}</Text><Text style={s.scoreWho}>{twoP ? `${e2}${p2}` : 'SuperFun'}</Text></View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="ttt" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------- Sudoku */

function SudokuGame({diff, onMenu, saves, onSave, onDelete, st}: {
  diff: Diff; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void; st: any;
}): React.JSX.Element {
  const [puzzle, setPuzzle] = useState<{puzzle: Int8Array; solution: Int8Array}>(() => generate(diff));
  const givens = puzzle.puzzle;
  const solution = puzzle.solution;

  const [val, setVal] = useState<Int8Array>(() => Int8Array.from(puzzle.puzzle));
  const [notes, setNotes] = useState<Uint16Array>(() => new Uint16Array(81));
  const [locked, setLocked] = useState<Set<number>>(() => new Set());
  const [wrong, setWrong] = useState<Set<number>>(() => new Set());
  const [sel, setSel] = useState(-1);
  const [info, setInfo] = useState<string | null>(null);
  const [undo, setUndo] = useState<Array<{i: number; v: number; n: number}>>([]);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [hints, setHints] = useState(0);
  const recorded = useRef(false);
  const best = st.best('sudoku', diff);
  const now = () => Date.now();

  const isLocked = (i: number) => givens[i] !== 0 || locked.has(i);
  const clearTransient = () => { if (wrong.size) setWrong(new Set()); if (info) setInfo(null); };
  const pushUndo = (i: number) => setUndo(u => [...u, {i, v: val[i], n: notes[i]}].slice(-120));

  const newPuzzle = () => {
    const p = generate(diff);
    setPuzzle(p);
    setVal(Int8Array.from(p.puzzle));
    setNotes(new Uint16Array(81));
    setLocked(new Set()); setWrong(new Set()); setSel(-1); setInfo(null); setUndo([]);
    setHints(0); recorded.current = false;
  };

  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!Array.isArray(d.givens) || d.givens.length !== 81) return;
    setPuzzle({puzzle: Int8Array.from(d.givens), solution: Int8Array.from(d.solution)});
    setVal(Int8Array.from(d.val));
    setNotes(Uint16Array.from(d.notes));
    setLocked(new Set<number>(d.locked)); setWrong(new Set()); setSel(-1); setUndo([]);
    setInfo('Loaded a saved grid');
    setShowSaved(false);
  };

  const saveNow = () => {
    let filled = 0;
    for (let i = 0; i < 81; i++) if (val[i] !== 0 && givens[i] === 0) filled++;
    const key = gridKey(givens);
    const existed = saves.some(x => x.key === key);
    onSave({
      game: 'sudoku', key, ts: now(), diff,
      label: `${DIFFICULTIES[diff].label} · ${filled} filled`,
      data: {
        givens: Array.from(givens), solution: Array.from(solution),
        val: Array.from(val), notes: Array.from(notes), locked: Array.from(locked),
      },
    });
    setInfo(existed ? `Updated grid #${key}` : saves.length >= 10 ? `Saved #${key} (oldest dropped)` : `Saved grid #${key}`);
  };
  useResume(() => {
    let filled = 0, solved = true;
    for (let i = 0; i < 81; i++) { if (val[i] !== 0 && givens[i] === 0) filled++; if (val[i] !== solution[i]) solved = false; }
    return resumeSave('sudoku', diff, filled > 0 && !solved, `${DIFFICULTIES[diff].label} · ${filled} filled`,
      {givens: Array.from(givens), solution: Array.from(solution), val: Array.from(val), notes: Array.from(notes), locked: Array.from(locked)});
  });

  const setAnswer = (d: number) => {
    if (sel < 0 || isLocked(sel)) return;
    clearTransient(); pushUndo(sel);
    const nv = Int8Array.from(val); nv[sel] = val[sel] === d ? 0 : d; setVal(nv);
  };
  const toggleNote = (d: number) => {
    if (sel < 0 || isLocked(sel)) return;
    if (val[sel] !== 0) { setInfo('Clear the answer first to add notes'); return; }
    clearTransient(); pushUndo(sel);
    const nn = Uint16Array.from(notes); nn[sel] = nn[sel] ^ bit(d); setNotes(nn);
  };
  const doUndo = () => {
    setUndo(u => {
      if (!u.length) return u;
      const last = u[u.length - 1];
      setVal(v => { const nv = Int8Array.from(v); nv[last.i] = last.v; return nv; });
      setNotes(n => { const nn = Uint16Array.from(n); nn[last.i] = last.n; return nn; });
      setSel(last.i); setWrong(new Set()); setInfo(null);
      return u.slice(0, -1);
    });
  };
  const check = () => {
    const w = new Set<number>(); let filled = 0;
    for (let i = 0; i < 81; i++) if (givens[i] === 0 && !locked.has(i) && val[i] !== 0) { filled++; if (val[i] !== solution[i]) w.add(i); }
    setWrong(w);
    setInfo(filled === 0 ? 'Nothing to check yet' : w.size === 0 ? 'All entries correct so far ✓' : `${w.size} wrong so far`);
  };
  const giveOne = () => {
    const empties: number[] = [];
    for (let i = 0; i < 81; i++) if (val[i] === 0 && givens[i] === 0 && !locked.has(i)) empties.push(i);
    if (!empties.length) { setInfo('No empty cell to reveal'); return; }
    const pick = empties[Math.floor(Math.random() * empties.length)];
    setVal(v => { const nv = Int8Array.from(v); nv[pick] = solution[pick]; return nv; });
    setNotes(n => { const nn = Uint16Array.from(n); nn[pick] = 0; return nn; });
    setLocked(prev => new Set(prev).add(pick));
    setWrong(new Set()); setSel(-1); setInfo('Revealed one cell'); setHints(h => h + 1);
  };

  let solved = true;
  for (let i = 0; i < 81; i++) if (val[i] !== solution[i]) { solved = false; break; }
  useEffect(() => { if (solved && !recorded.current) { recorded.current = true; st.record('sudoku', diff, hints); onDelete(RESUME_KEY); } }, [solved]);

  const selectable = sel >= 0 && !isLocked(sel);
  const notesEnabled = selectable && val[sel] === 0;
  const curVal = sel >= 0 ? val[sel] : 0;
  const curNotes = sel >= 0 ? notes[sel] : 0;

  return (
    <View style={s.container}>
      <GameHeader title={`Sudoku · ${DIFFICULTIES[diff].label}`} onMenu={onMenu} onUndo={doUndo} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newPuzzle} />
      <Text style={s.tttLegend}>Hints used: {hints}{st.showBest && best != null ? ` · Best (${DIFFICULTIES[diff].label}): ${best === 0 ? 'no hints!' : best}` : ''}</Text>

      <View style={s.msgZone}>
        {solved ? null : <Text style={s.hintText}>{selectable ? (notesEnabled ? 'Answer = final value · Notes = candidates' : 'This cell has an answer — tap it again to clear it') : 'Tap an empty cell'}</Text>}
      </View>

      <View style={s.centerArea}>
        <Board givens={givens} val={val} notes={notes} sel={sel} wrong={wrong}
          onSelect={i => { clearTransient(); if (isLocked(i)) { setSel(-1); return; } setSel(prev => (prev === i ? -1 : i)); }}
        />
        {solved ? <EndOverlay text={hints === 0 ? 'Solved — no hints! 🎉' : `Solved with ${hints} hint${hints > 1 ? 's' : ''}! 🎉`} /> : null}
      </View>
      <View style={s.belowZone}>
        {solved ? <Pressable style={s.playAgainBtn} onPress={newPuzzle}><Text style={s.playText}>New game ▸</Text></Pressable> : null}
      </View>

      {/* controls live at the bottom, under the board */}
      <Text style={s.sectionLabel}>Answer</Text>
      <View style={s.padRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
          const on = selectable && curVal === d;
          return (
            <Pressable key={d} disabled={!selectable} onPress={() => setAnswer(d)} style={[s.ansBtn, on && s.solidBtn, !selectable && s.disabledBtn]}>
              <Text style={[s.ansText, on && s.solidText, !selectable && s.disabledText]}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[s.sectionLabel, !notesEnabled && s.labelDim]}>Notes</Text>
      <View style={s.padRow}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
          const on = notesEnabled && (curNotes & bit(d)) !== 0;
          return (
            <Pressable key={d} disabled={!notesEnabled} onPress={() => toggleNote(d)} style={[s.noteBtn, on && s.solidPill, !notesEnabled && s.disabledBtn]}>
              <Text style={[s.noteText, on && s.solidText, !notesEnabled && s.disabledText]}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={s.feedbackZone}>{info ? <Text style={s.feedbackText}>{info}</Text> : null}</View>
      <View style={s.actionRow}>
        <Pressable style={s.actionBtn} onPress={check}><Text style={s.actionText}>Check answers</Text></Pressable>
        <Pressable style={s.actionBtn} onPress={giveOne}><Text style={s.actionText}>Give 1 answer</Text></Pressable>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="sudoku" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

function Board({givens, val, notes, sel, wrong, onSelect}: {
  givens: Int8Array; val: Int8Array; notes: Uint16Array; sel: number; wrong: Set<number>; onSelect: (i: number) => void;
}): React.JSX.Element {
  const rows = [];
  for (let r = 0; r < 9; r++) {
    const cells = [];
    for (let c = 0; c < 9; c++) {
      const i = r * 9 + c;
      const given = givens[i] !== 0;
      const v = val[i];
      const isSel = i === sel;
      const isWrong = wrong.has(i);
      cells.push(
        <Pressable key={c} onPress={() => onSelect(i)}
          style={[s.cell, {borderRightWidth: c % 3 === 2 ? 2 : 1, borderBottomWidth: r % 3 === 2 ? 2 : 1}, isSel && s.cellSel]}>
          {v !== 0 ? (
            <Text style={[given ? s.cellGiven : s.cellUser, isSel && s.cellTextSel]}>{v}</Text>
          ) : notes[i] !== 0 ? (
            <View style={s.notesGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                <Text key={d} style={[s.noteMark, isSel && s.cellTextSel]}>{notes[i] & bit(d) ? d : ''}</Text>
              ))}
            </View>
          ) : null}
          {isWrong ? <View pointerEvents="none" style={[s.wrongBox, isSel && s.wrongBoxSel]} /> : null}
          {isWrong ? <View pointerEvents="none" style={[s.wrongStrike, isSel && s.wrongStrikeSel]} /> : null}
        </Pressable>,
      );
    }
    rows.push(<View key={r} style={s.boardRow}>{cells}</View>);
  }
  return <View style={s.board}>{rows}</View>;
}

/* --------------------------------------------------------- Connect Four */

function ConnectFour({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const twoP = mode === '2p';
  const p1 = names.p1, p2 = names.p2;
  const e1 = (emojis && emojis.p1) ? emojis.p1 + ' ' : '', e2 = (emojis && emojis.p2) ? emojis.p2 + ' ' : '';
  const [board, setBoard] = useState<string[]>(() => Array(42).fill(''));
  const [showSaved, setShowSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turn, setTurn] = useState<'O' | 'X'>('O');
  const [score, setScore] = useState({you: 0, sn: 0, draw: 0});
  const [end, setEnd] = useState<{msg: string; kind: 'win' | 'lose' | 'draw'} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0, draw: 0});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const result = C4.winner(board);
  const over = !!result;
  const winCells: number[] = result && result.cells ? result.cells : [];

  const finish = (who: string) => {
    onDelete(RESUME_KEY);
    if (who === 'O') { setScore(v => ({...v, you: v.you + 1})); setEnd({msg: twoP ? `${e1}${p1} wins! 🎉` : pick(C4_WIN, idx.current.win++), kind: 'win'}); }
    else if (who === 'X') { setScore(v => ({...v, sn: v.sn + 1})); setEnd({msg: twoP ? `${e2}${p2} wins! 🎉` : pick(C4_LOSE, idx.current.lose++), kind: twoP ? 'win' : 'lose'}); }
    else { setScore(v => ({...v, draw: v.draw + 1})); setEnd({msg: pick(DRAW_MSGS, idx.current.draw++), kind: 'draw'}); }
  };
  const playAgain = () => { if (timer.current) clearTimeout(timer.current); setBoard(Array(42).fill('')); setBusy(false); setEnd(null); setTurn('O'); };
  const newMatch = () => { playAgain(); setScore({you: 0, sn: 0, draw: 0}); };

  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.board) || d.board.length !== 42) return;
    setBoard(d.board.slice()); setTurn(d.turn === 'X' ? 'X' : 'O'); setScore(d.score || {you: 0, sn: 0, draw: 0});
    setBusy(false); setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('c4', diff, !over && !busy && board.some(Boolean) && (twoP || turn === 'O'), twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, {board, turn, score}));
  const saveNow = () => onSave({game: 'c4', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, data: {board, turn, score}});
  const dropCol = (col: number) => {
    if (busy || over) return;
    const cur = twoP ? turn : 'O';
    const res = C4.drop(board, col, cur);
    if (!res) return;
    const nb = res.board;
    setBoard(nb);
    const w1 = C4.winner(nb);
    if (w1) { finish(w1.player); return; }
    if (twoP) { setTurn(cur === 'O' ? 'X' : 'O'); return; }
    setBusy(true);
    timer.current = setTimeout(() => {
      const ac = C4.aiMove(nb.slice(), diff);
      const ar = C4.drop(nb, ac, 'X');
      const ab = ar ? ar.board : nb;
      setBoard(ab);
      setBusy(false);
      const w2 = C4.winner(ab);
      if (w2) finish(w2.player);
    }, 400);
  };

  return (
    <View style={s.container}>
      <GameHeader title="Connect Four" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newMatch} />
      <Text style={s.tttLegend}>{twoP ? <Text>{e1}{p1} = <Text style={s.bold}>O</Text> · {e2}{p2} = <Text style={s.bold}>X</Text></Text> : <Text>You are <Text style={s.bold}>O</Text> · SuperFun is <Text style={s.bold}>X</Text> · {DIFFICULTIES[diff].label}</Text>}</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={twoP ? s.turnBig : s.statusBig}>{twoP ? (turn === 'O' ? `${e1}${p1}'s turn (O) — tap a column` : `${e2}${p2}'s turn (X) — tap a column`) : (busy ? 'SuperFun is thinking…' : 'Your turn — tap a column')}</Text>}
        </View>
        <View style={s.c4Board}>
          {[0, 1, 2, 3, 4, 5].map(r => (
            <View key={r} style={s.c4Row}>
              {[0, 1, 2, 3, 4, 5, 6].map(c => {
                const i = r * 7 + c;
                const mark = board[i];
                const win = winCells.indexOf(i) !== -1;
                return (
                  <Pressable key={c} onPress={() => dropCol(c)} style={[s.c4Cell, win && s.tttCellWin]}>
                    {mark ? <Text style={[mark === 'O' ? s.c4O : s.c4X, win && s.cellTextSel]}>{mark}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
          {[1, 2, 3, 4, 5, 6].map(c => <View key={'v' + c} pointerEvents="none" style={[s.gridLineV, {left: C4CELL * c - 1, height: C4CELL * 6}]} />)}
          {[1, 2, 3, 4, 5].map(r => <View key={'h' + r} pointerEvents="none" style={[s.gridLineH, {top: C4CELL * r - 1, width: C4CELL * 7}]} />)}
        </View>
        <View style={s.belowZone}>
          {over ? <Pressable style={s.playAgainBtn} onPress={playAgain}><Text style={s.playText}>Play again ▸</Text></Pressable> : null}
        </View>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>

      <View style={s.scoreRow}>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.you}</Text><Text style={s.scoreWho}>{twoP ? `${e1}${p1}` : 'You'}</Text></View>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.draw}</Text><Text style={s.scoreWho}>Draws</Text></View>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.sn}</Text><Text style={s.scoreWho}>{twoP ? `${e2}${p2}` : 'SuperFun'}</Text></View>
      </View>
      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="c4" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------- Ultimate Tic-Tac-Toe */

function UltimateTTT({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {
  diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void;
}): React.JSX.Element {
  const twoP = mode === '2p';
  const p1 = names.p1, p2 = names.p2;
  const e1 = (emojis && emojis.p1) ? emojis.p1 + ' ' : '', e2 = (emojis && emojis.p2) ? emojis.p2 + ' ' : '';
  const [st, setSt] = useState(() => U.initState());
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState({you: 0, sn: 0, draw: 0});
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [reject, setReject] = useState<{idx: number; msg: string} | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0, draw: 0});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (rejTimer.current) clearTimeout(rejTimer.current); }, []);

  const over = U.winner(st) !== 0;

  const finish = (w: number) => {
    onDelete(RESUME_KEY);
    if (w === 1) { setScore(v => ({...v, you: v.you + 1})); setEnd({msg: twoP ? `${e1}${p1} wins! 🎉` : WIN_MSGS[idx.current.win++ % WIN_MSGS.length]}); }
    else if (w === 2) { setScore(v => ({...v, sn: v.sn + 1})); setEnd({msg: twoP ? `${e2}${p2} wins! 🎉` : LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length]}); }
    else { setScore(v => ({...v, draw: v.draw + 1})); setEnd({msg: DRAW_MSGS[idx.current.draw++ % DRAW_MSGS.length]}); }
  };
  const playAgain = () => { if (timer.current) clearTimeout(timer.current); setSt(U.initState()); setBusy(false); setEnd(null); setReject(null); };
  const newMatch = () => { playAgain(); setScore({you: 0, sn: 0, draw: 0}); };

  // A board is playable now if the game is live, it isn't decided, and it's the
  // board the last move sent us to (or any board when active === -1).
  const canPlay = (b: number) => !over && !busy && st.sub[b] === 0 && (st.active === -1 || st.active === b);

  // Why is this square locked? (only called for a tap that got rejected)
  const whyBlocked = (b: number, c: number) => {
    if (st.cells[b * 9 + c]) return 'That square is already taken — pick an empty one.';
    if (st.sub[b] !== 0) return 'That board is already finished — pick the highlighted one.';
    return 'Locked this turn: the last move sends you to the highlighted board.';
  };
  const flashReject = (cell: number, msg: string) => {
    setReject({idx: cell, msg});
    if (rejTimer.current) clearTimeout(rejTimer.current);
    rejTimer.current = setTimeout(() => setReject(null), 1800);
  };

  // Let SuperFun (player 2) answer from `fromState`. Used after a human
  // move and after loading a saved solo game where it's the AI's turn.
  const aiRespond = (fromState: any) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      const as = U.cloneState(fromState);
      const m = U.aiMove(as, diff);
      if (m >= 0) U.applyMove(as, m);
      setSt(as);
      setBusy(false);
      const w2 = U.winner(as);
      if (w2) finish(w2);
    }, 400); // let the human move paint before the (blocking) MCTS search
  };

  const tap = (b: number, c: number) => {
    if (busy || over) return;
    if (!canPlay(b) || st.cells[b * 9 + c]) { flashReject(b * 9 + c, whyBlocked(b, c)); return; }
    if (reject) setReject(null);
    const ns = U.cloneState(st);
    U.applyMove(ns, b * 9 + c);
    setSt(ns);
    const w = U.winner(ns);
    if (w) { finish(w); return; }
    if (twoP) return; // next human takes over
    aiRespond(ns);
  };

  const saveNow = () => {
    if (over) { setReject({idx: -1, msg: 'Nothing to save — the game is over.'}); if (rejTimer.current) clearTimeout(rejTimer.current); rejTimer.current = setTimeout(() => setReject(null), 1800); return; }
    const moves = Array.from(st.cells).filter(v => v).length;
    const key = String(Date.now()).slice(-6);
    onSave({
      game: 'uttt', key, ts: Date.now(), diff,
      label: twoP ? `${p1} vs ${p2} · ${moves} moves` : `vs SuperFun (${DIFFICULTIES[diff].label}) · ${moves} moves`,
      data: {cells: Array.from(st.cells), sub: Array.from(st.sub), active: st.active, turn: st.turn, score},
    });
  };
  useResume(() => resumeSave('uttt', diff, !over && Array.from(st.cells).some(v => v), twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, {cells: Array.from(st.cells), sub: Array.from(st.sub), active: st.active, turn: st.turn, score}));
  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.cells) || d.cells.length !== 81) return;
    const loaded = {cells: Uint8Array.from(d.cells), sub: Uint8Array.from(d.sub), active: d.active, turn: d.turn};
    setSt(loaded);
    setScore(d.score || {you: 0, sn: 0, draw: 0});
    setBusy(false); setEnd(null); setReject(null); setShowSaved(false);
    if (!twoP && d.turn === 2 && U.winner(loaded) === 0) aiRespond(loaded); // AI to move in a loaded solo game
  };

  const whoseTurn = twoP ? (st.turn === 1 ? `${e1}${p1}'s turn (O)` : `${e2}${p2}'s turn (X)`) : 'Your turn';
  const constraint = st.active === -1 ? 'play in any open board' : 'play in the highlighted board';
  const status = busy && !twoP ? 'SuperFun is thinking…' : `${whoseTurn} · ${constraint}`;

  return (
    <View style={s.container}>
      <GameHeader title="Ultimate TTT" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newMatch} />
      <Text style={s.tttLegend}>{twoP ? <Text>{e1}{p1} = <Text style={s.bold}>O</Text> · {e2}{p2} = <Text style={s.bold}>X</Text> · win a board to claim it</Text> : <Text>You are <Text style={s.bold}>O</Text> · SuperFun is <Text style={s.bold}>X</Text> · {DIFFICULTIES[diff].label}</Text>}</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={[twoP ? s.turnBig : s.statusBig, reject && s.rejectText]}>{reject ? reject.msg : status}</Text>}
        </View>

        <View style={s.uBoard}>
          {[0, 1, 2].map(br => (
            <View key={br} style={s.uMetaRow}>
              {[0, 1, 2].map(bc => {
                const b = br * 3 + bc;
                const decided = st.sub[b];
                const hot = canPlay(b);
                const off = !over && !hot && decided === 0; // open but locked this turn
                return (
                  <View key={bc} style={[s.uSub, hot && s.uSubOn, off && s.uSubOff]}>
                    {[0, 1, 2].map(cr => (
                      <View key={cr} style={s.uCellRow}>
                        {[0, 1, 2].map(cc => {
                          const cell = b * 9 + cr * 3 + cc;
                          const v = st.cells[cell];
                          const rej = reject && reject.idx === cell;
                          return (
                            <Pressable key={cc} onPress={() => tap(b, cr * 3 + cc)} style={[s.uCell, rej && s.uCellReject]}>
                              {v ? <Text style={v === 1 ? s.uO : s.uX}>{v === 1 ? 'O' : 'X'}</Text> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                    {decided ? (
                      <View pointerEvents="none" style={s.uWon}>
                        <Text style={s.uWonMark}>{decided === 1 ? 'O' : decided === 2 ? 'X' : '–'}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={s.belowZone}>
          {over
            ? <Pressable style={s.playAgainBtn} onPress={playAgain}><Text style={s.playText}>Play again ▸</Text></Pressable>
            : <Text style={s.uHint}>Bright board = play here · greyed boards are locked this turn</Text>}
        </View>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>

      <View style={s.scoreRow}>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.you}</Text><Text style={s.scoreWho}>{twoP ? `${e1}${p1}` : 'You'}</Text></View>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.draw}</Text><Text style={s.scoreWho}>Draws</Text></View>
        <View style={s.scoreCell}><Text style={s.mpNum}>{score.sn}</Text><Text style={s.scoreWho}>{twoP ? `${e2}${p2}` : 'SuperFun'}</Text></View>
      </View>
      {rules ? <RulesModal game="uttt" onClose={() => setRules(false)} /> : null}
      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
    </View>
  );
}

/* --------------------------------------------------------- Minesweeper */

function Minesweeper({diff, onMenu, saves, onSave, onDelete, st}: {
  diff: Diff; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void; st: any;
}): React.JSX.Element {
  const [dims, setDims] = useState<{rows: number; cols: number; mines: number}>(() => MINE.PRESETS[diff]);
  const R = dims.rows, C = dims.cols, MINES = dims.mines;
  const cell = Math.max(26, gridCell(C, 640));
  const [board, setBoard] = useState<{mine: boolean[]; count: Int8Array} | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(MINE.PRESETS[diff].rows * MINE.PRESETS[diff].cols).fill(false));
  const [flags, setFlags] = useState<boolean[]>(() => Array(MINE.PRESETS[diff].rows * MINE.PRESETS[diff].cols).fill(false));
  const [mode, setMode] = useState<'dig' | 'flag'>('dig');
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [end, setEnd] = useState<{msg: string; kind: 'win' | 'lose'} | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const idx = useRef({win: 0, lose: 0});

  const newGame = () => {
    const p = MINE.PRESETS[diff];
    setDims(p); setBoard(null);
    setRevealed(Array(p.rows * p.cols).fill(false)); setFlags(Array(p.rows * p.cols).fill(false));
    setDead(false); setWon(false); setEnd(null); setInfo(null); setMode('dig');
  };
  const saveNow = () => {
    if (!board) { setInfo('Start digging first'); return; }
    const key = mineKey(board.mine, R, C);
    const existed = saves.some(x => x.key === key);
    let opened = 0;
    for (let i = 0; i < R * C; i++) if (revealed[i] && !board.mine[i]) opened++;
    onSave({
      game: 'mines', key, ts: Date.now(), diff,
      label: `${DIFFICULTIES[diff].label} ${R}×${C} · ${opened} open`,
      data: {rows: R, cols: C, mines: MINES, mine: board.mine, count: Array.from(board.count), revealed: revealed.slice(), flags: flags.slice(), dead, won},
    });
    setInfo(existed ? `Updated grid #${key}` : `Saved grid #${key}`);
  };
  useResume(() => {
    if (!board) return null;
    let opened = 0; for (let i = 0; i < R * C; i++) if (revealed[i] && !board.mine[i]) opened++;
    return resumeSave('mines', diff, !dead && !won && opened > 0, `${DIFFICULTIES[diff].label} ${R}×${C} · ${opened} open`,
      {rows: R, cols: C, mines: MINES, mine: board.mine, count: Array.from(board.count), revealed: revealed.slice(), flags: flags.slice(), dead, won});
  });
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!Array.isArray(d.mine) || !d.rows || !d.cols || d.mine.length !== d.rows * d.cols) return;
    setDims({rows: d.rows, cols: d.cols, mines: d.mines});
    setBoard({mine: d.mine, count: Int8Array.from(d.count)});
    setRevealed(d.revealed.slice()); setFlags(d.flags.slice());
    setDead(!!d.dead); setWon(!!d.won); setEnd(null); setInfo('Loaded a saved board'); setShowSaved(false); setMode('dig');
  };

  const flood = (b: {mine: boolean[]; count: Int8Array}, rev: boolean[], start: number) => {
    const stack = [start];
    while (stack.length) {
      const i = stack.pop() as number;
      if (rev[i]) continue;
      rev[i] = true;
      if (b.count[i] === 0) {
        const ns = MINE.neighbors(i, R, C);
        for (let k = 0; k < ns.length; k++) if (!rev[ns[k]] && !b.mine[ns[k]]) stack.push(ns[k]);
      }
    }
  };

  const tap = (i: number) => {
    if (dead || won) return;
    if (info) setInfo(null);
    if (mode === 'flag') { if (revealed[i]) return; setFlags(f => { const nf = f.slice(); nf[i] = !nf[i]; return nf; }); return; }
    if (flags[i] || revealed[i]) return;
    let b = board;
    if (!b) { b = MINE.generate(R, C, MINES, i); setBoard(b); }
    if (b.mine[i]) {
      const rev = revealed.slice();
      for (let k = 0; k < R * C; k++) if (b.mine[k]) rev[k] = true;
      setRevealed(rev); setDead(true); onDelete(RESUME_KEY); setEnd({msg: pick(MINE_LOSE, idx.current.lose++), kind: 'lose'});
      return;
    }
    const rev = revealed.slice();
    flood(b, rev, i);
    setRevealed(rev);
    let safe = 0, got = 0;
    for (let k = 0; k < R * C; k++) if (!b.mine[k]) { safe++; if (rev[k]) got++; }
    if (got === safe) { setWon(true); st.counter('mines_' + diff); onDelete(RESUME_KEY); setEnd({msg: pick(MINE_WIN, idx.current.win++), kind: 'win'}); }
  };

  let flagCount = 0;
  for (let k = 0; k < flags.length; k++) if (flags[k]) flagCount++;

  return (
    <View style={s.container}>
      <GameHeader title={`Minesweeper · ${DIFFICULTIES[diff].label}`} onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />

      <View style={s.msgZone}>
        {end ? null : <Text style={s.hintText}>{info || `Mines: ${MINES} · Flags: ${flagCount}`}</Text>}
      </View>

      <View style={s.centerArea}>
        <View style={[s.mineBoard, {width: cell * C + 4}]}>
          {Array.from({length: R}).map((_, r) => (
            <View key={r} style={{flexDirection: 'row', height: cell}}>
              {Array.from({length: C}).map((__, c) => {
                const i = r * C + c;
                const rev = revealed[i];
                const isMine = board && board.mine[i];
                const cnt = board ? board.count[i] : 0;
                return (
                  <Pressable key={c} onPress={() => tap(i)} style={[{width: cell, height: cell}, rev ? (isMine ? s.mineCellBoom : s.mineCellOpen) : s.mineCellTile]}>
                    {rev
                      ? isMine
                        ? <Text style={s.mineBoomText}>✳</Text>
                        : cnt > 0 ? <Text style={s.mineNum}>{cnt}</Text> : null
                      : flags[i] ? <Text style={s.mineFlag}>⚑</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <View style={s.belowZone}>
          {(dead || won) ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>New game ▸</Text></Pressable> : null}
        </View>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>
      <View style={s.actionRow}>
        <Pressable style={[s.actionBtn, mode === 'dig' && s.solidBtn]} onPress={() => setMode('dig')}><Text style={[s.actionText, mode === 'dig' && s.solidText]}>Dig</Text></Pressable>
        <Pressable style={[s.actionBtn, mode === 'flag' && s.solidBtn]} onPress={() => setMode('flag')}><Text style={[s.actionText, mode === 'flag' && s.solidText]}>Flag ⚑</Text></Pressable>
      </View>
      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="mines" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* --------------------------------------------------------- Nonogram */

function Nonogram({diff, onMenu, saves, onSave, onDelete, st}: {
  diff: Diff; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void; st: any;
}): React.JSX.Element {
  const avoidNames = (sz: number) => (st.pictures as string[]).filter(k => k.indexOf(sz + ':') === 0).map(k => k.slice(('' + sz).length + 1));
  const [puz, setPuz] = useState(() => NONO.generate(NONO.SIZES[diff], undefined, avoidNames(NONO.SIZES[diff])));
  const size = puz.size; // follows the current puzzle (so a loaded save can differ)
  const [fill, setFill] = useState<boolean[]>(() => Array(NONO.SIZES[diff] * NONO.SIZES[diff]).fill(false));
  const [marks, setMarks] = useState<boolean[]>(() => Array(NONO.SIZES[diff] * NONO.SIZES[diff]).fill(false));
  const [mode, setMode] = useState<'fill' | 'mark'>('fill');
  const [end, setEnd] = useState<{msg: string; kind: 'win' | 'lose'} | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const newGame = () => {
    const p = NONO.generate(NONO.SIZES[diff], undefined, avoidNames(NONO.SIZES[diff]));
    setPuz(p);
    setFill(Array(p.size * p.size).fill(false));
    setMarks(Array(p.size * p.size).fill(false));
    setEnd(null); setInfo(null); setShown(false); setMode('fill');
  };
  const saveNow = () => {
    const key = nonoKey(size, puz.solution);
    const existed = saves.some(x => x.key === key);
    let filled = 0;
    for (let i = 0; i < size * size; i++) if (fill[i]) filled++;
    onSave({
      game: 'nono', key, ts: Date.now(), diff,
      label: `${DIFFICULTIES[diff].label} ${size}×${size} · ${filled} cells`,
      data: {size, name: puz.name, solution: puz.solution, rowClues: puz.rowClues, colClues: puz.colClues, fill: fill.map(Boolean), marks: marks.map(Boolean)},
    });
    setInfo(existed ? `Updated grid #${key}` : `Saved grid #${key}`);
  };
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!d.size || !Array.isArray(d.fill) || d.fill.length !== d.size * d.size) return;
    setPuz({size: d.size, solution: d.solution, rowClues: d.rowClues, colClues: d.colClues, name: d.name});
    setFill(d.fill.slice()); setMarks(d.marks.slice());
    setShown(false); setEnd(null); setInfo('Loaded a saved grid'); setShowSaved(false); setMode('fill');
  };

  const solved = useMemo(() => NONO.validate(fill, puz.rowClues, puz.colClues, size), [fill, puz, size]);
  const won = end?.kind === 'win';
  useResume(() => resumeSave('nono', diff, !solved && fill.some(Boolean), `${DIFFICULTIES[diff].label} ${size}×${size}`, {size, name: puz.name, solution: puz.solution, rowClues: puz.rowClues, colClues: puz.colClues, fill: fill.map(Boolean), marks: marks.map(Boolean)}));
  useEffect(() => {
    if (solved && !won && !shown) {
      const n = (puz as any).name || 'picture';
      const art = /^[aeiou]/i.test(n) ? 'an' : 'a';
      st.markPicture(`${size}:${n}`); // add to the picture gallery
      onDelete(RESUME_KEY);
      setEnd({msg: `It's ${art} ${n}! 🎉`, kind: 'win'});
    }
  }, [solved, won, shown, puz]);

  const hint = () => {
    if (solved) return;
    const diffs: number[] = [];
    for (let i = 0; i < size * size; i++) if (!!fill[i] !== !!puz.solution[i]) diffs.push(i);
    if (!diffs.length) return;
    const p = diffs[Math.floor(Math.random() * diffs.length)];
    setFill(f => { const nf = f.slice(); nf[p] = !!puz.solution[p]; return nf; });
    setMarks(m => { const nm = m.slice(); nm[p] = false; return nm; });
    setEnd(null); setInfo('Hint added — one cell fixed ✓');
  };
  const reveal = () => {
    setFill(puz.solution.slice());
    setMarks(Array(size * size).fill(false));
    setShown(true); setEnd(null);
    setInfo("Here's the full solution 👀");
  };

  const tap = (i: number) => {
    if (solved) return;
    setEnd(null); setInfo(null);
    if (mode === 'fill') {
      setMarks(m => { const nm = m.slice(); nm[i] = false; return nm; });
      setFill(f => { const nf = f.slice(); nf[i] = !nf[i]; return nf; });
    } else {
      setFill(f => { const nf = f.slice(); nf[i] = false; return nf; });
      setMarks(m => { const nm = m.slice(); nm[i] = !nm[i]; return nm; });
    }
  };
  const check = () => {
    let wrong = 0, filled = 0;
    for (let i = 0; i < size * size; i++) if (fill[i]) { filled++; if (!puz.solution[i]) wrong++; }
    if (filled === 0) { setInfo('Fill some cells first, then Check.'); return; }
    if (wrong === 0) setInfo(`So far so good — all ${filled} filled cells are correct ✓`);
    else setInfo(`${wrong} of ${filled} filled cell${wrong === 1 ? ' is' : 's are'} wrong ✗`);
  };

  const maxRC = Math.max(1, ...puz.rowClues.map(a => a.length));
  const maxCC = Math.max(1, ...puz.colClues.map(a => a.length));
  const cell = Math.max(24, Math.min(84, Math.floor((SCREEN_W - 28) / (size + maxRC * 0.62)), Math.floor((SCREEN_H - 280) / (size + maxCC * 0.62))));
  const clueW = Math.round(cell * 0.62);
  const leftGutter = maxRC * clueW;
  const topGutter = maxCC * clueW;

  return (
    <View style={s.container}>
      <GameHeader title={`Nonogram · ${DIFFICULTIES[diff].label}`} onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />

      <View style={s.msgZone}>
        {end ? null : <Text style={s.hintText}>Match every row &amp; column clue.</Text>}
      </View>

      <View style={s.centerArea}>
        <View style={{alignSelf: 'center'}}>
          {/* column clues */}
          <View style={{flexDirection: 'row'}}>
            <View style={{width: leftGutter, height: topGutter}} />
            {puz.colClues.map((cl, c) => (
              <View key={c} style={{width: cell, height: topGutter, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 2}}>
                {cl.map((n, k) => <Text key={k} style={s.clueText}>{n}</Text>)}
              </View>
            ))}
          </View>
          {/* rows */}
          {Array.from({length: size}).map((_, r) => (
            <View key={r} style={{flexDirection: 'row'}}>
              <View style={{width: leftGutter, height: cell, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center'}}>
                {puz.rowClues[r].map((n, k) => <Text key={k} style={[s.clueText, {width: clueW, textAlign: 'center'}]}>{n}</Text>)}
              </View>
              {Array.from({length: size}).map((__, c) => {
                const i = r * size + c;
                return (
                  <Pressable key={c} onPress={() => tap(i)}
                    style={[
                      {width: cell, height: cell, alignItems: 'center', justifyContent: 'center', borderColor: INK,
                        borderLeftWidth: c === 0 ? 2 : 0,
                        borderTopWidth: r === 0 ? 2 : 0,
                        // thick outer border always; every-5 guide lines only when the size is a multiple of 5
                        borderRightWidth: c === size - 1 ? 2 : (size % 5 === 0 && (c + 1) % 5 === 0 ? 2 : 1),
                        borderBottomWidth: r === size - 1 ? 2 : (size % 5 === 0 && (r + 1) % 5 === 0 ? 2 : 1)},
                      fill[i] && s.nonoFill,
                    ]}>
                    {!fill[i] && marks[i] ? <Text style={s.nonoMark}>✕</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>
      <View style={s.belowZone}>
        {solved ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>New game ▸</Text></Pressable> : null}
      </View>

      {/* game controls at the bottom, under the grid */}
      <View style={s.feedbackZone}>{info ? <Text style={s.feedbackText}>{info}</Text> : null}</View>
      <View style={s.actionRow}>
        <Pressable style={[s.actionBtn, mode === 'fill' && s.solidBtn]} onPress={() => setMode('fill')}><Text style={[s.actionText, mode === 'fill' && s.solidText]}>Fill ■</Text></Pressable>
        <Pressable style={[s.actionBtn, mode === 'mark' && s.solidBtn]} onPress={() => setMode('mark')}><Text style={[s.actionText, mode === 'mark' && s.solidText]}>Mark ✕</Text></Pressable>
      </View>
      <View style={s.actionRow}>
        <Pressable style={s.actionBtn} onPress={check}><Text style={s.actionText}>Check</Text></Pressable>
        <Pressable style={s.actionBtn} onPress={hint}><Text style={s.actionText}>Hint</Text></Pressable>
        <Pressable style={s.actionBtn} onPress={reveal}><Text style={s.actionText}>Solution</Text></Pressable>
      </View>
      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="nono" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* --------------------------------------------------------- Word Search */

function WordSearch({diff, onMenu, saves, onSave, onDelete, st}: {
  diff: Diff; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void; st: any;
}): React.JSX.Element {
  const [lang, setLang] = useState<string>('en');
  const [puz, setPuz] = useState<any>(() => W.generate(diff, 'en'));
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [flash, setFlash] = useState('');
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [hintCell, setHintCell] = useState<number | null>(null); // boxed first letter of a hinted word
  const [spot, setSpot] = useState<string | null>(null);         // letter lit up everywhere (long-press)
  const [showWords, setShowWords] = useState(true);              // show/hide the word list (hidden = harder)

  const size: number = puz.size;
  const CELL = Math.max(24, gridCell(size, 560));
  const OFF = 2; // wsBoard border width, so overlay lines line up with the cells
  const foundCount = puz.words.filter((w: any) => w.found).length;
  const total = puz.words.length;

  const foundSet = new Set<number>();
  puz.words.forEach((w: any) => { if (w.found) w.cells.forEach((c: number) => foundSet.add(c)); });

  const fresh = (l: string) => { setPuz(W.generate(diff, l)); setStart(null); setEnd(null); setFlash(''); setHintCell(null); setSpot(null); };
  const pickLang = (l: string) => { if (l === lang) return; setLang(l); fresh(l); };
  const newRound = () => fresh(lang);

  const wsKey = (grid: string[]) => {
    let h = 0x811c9dc5;
    const str = grid.join('');
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16).slice(0, 6);
  };
  const saveNow = () => {
    const key = wsKey(puz.grid);
    const existed = saves.some(x => x.key === key);
    onSave({
      game: 'words', key, ts: Date.now(), diff,
      label: `${puz.theme} · ${W.TIERS[diff].label} · ${foundCount}/${total}`,
      data: {size: puz.size, tier: puz.tier, theme: puz.theme, lang: puz.lang, grid: puz.grid, words: puz.words},
    });
    setFlash(existed ? 'Updated this grid' : 'Saved this grid');
  };
  useResume(() => resumeSave('words', diff, foundCount > 0 && !end, `${puz.theme} · ${foundCount}/${total}`, {size: puz.size, tier: puz.tier, theme: puz.theme, lang: puz.lang, grid: puz.grid, words: puz.words}));
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!d.size || !Array.isArray(d.grid) || !Array.isArray(d.words)) return;
    setPuz({size: d.size, tier: d.tier, theme: d.theme, lang: d.lang, grid: d.grid, words: d.words});
    setLang(d.lang);
    setStart(null); setEnd(null); setFlash('Loaded a saved grid'); setShowSaved(false); setHintCell(null); setSpot(null);
  };

  const tap = (idx: number) => {
    if (end) return;
    if (start === null) { setStart(idx); setFlash(''); return; }
    if (start === idx) { setStart(null); return; }
    const cells = W.lineCells(size, start, idx);
    if (!cells) { setStart(idx); return; } // not a straight line — start over here
    const str = cells.map((i: number) => puz.grid[i]).join('');
    const rev = str.split('').reverse().join('');
    const wi = puz.words.findIndex((w: any) => !w.found && (w.text === str || w.text === rev));
    setStart(null);
    if (wi >= 0) {
      const words = puz.words.map((w: any, i: number) => (i === wi ? {...w, found: true} : w));
      setPuz({...puz, words});
      setFlash(`Found ${words[wi].text} ✓`);
      setHintCell(null);
      if (words.filter((w: any) => w.found).length === words.length) { st.counter('words'); onDelete(RESUME_KEY); setEnd({msg: 'All found! 🎉'}); }
    } else {
      setFlash('Not on the list — try again');
    }
  };

  // long-press a letter to light up every copy of it on the grid (toggle)
  const spotlight = (letter: string) => { setStart(null); setSpot(cur => (cur === letter ? null : letter)); };

  // Hint: box the first letter of a still-unfound word.
  const hint = () => {
    const un = puz.words.filter((w: any) => !w.found);
    if (!un.length) { setFlash('Every word is already found ✓'); return; }
    const w = un[Math.floor(Math.random() * un.length)];
    setHintCell(w.cells[0]);
    setFlash(`Hint: a ${w.text.length}-letter word starts in the box`);
  };

  // Show solution: mark every word found (does not count as a solve).
  const solve = () => {
    setPuz({...puz, words: puz.words.map((w: any) => ({...w, found: true}))});
    setStart(null); setHintCell(null); setEnd({msg: 'Solution shown 👀'});
  };

  // strike-through lines drawn over each found word (from first to last letter)
  const strikes = puz.words.filter((w: any) => w.found).map((w: any, i: number) => {
    const a = w.cells[0], b = w.cells[w.cells.length - 1];
    const ar = (a / size) | 0, ac = a % size, br = (b / size) | 0, bc = b % size;
    const x1 = OFF + ac * CELL + CELL / 2, y1 = OFF + ar * CELL + CELL / 2;
    const x2 = OFF + bc * CELL + CELL / 2, y2 = OFF + br * CELL + CELL / 2;
    const len = Math.hypot(x2 - x1, y2 - y1) + CELL * 0.5;
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return <View key={i} pointerEvents="none" style={{position: 'absolute', left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 2.5, width: len, height: 5, borderRadius: 3, backgroundColor: INK, opacity: 0.55, transform: [{rotate: `${ang}deg`}]}} />;
  });

  return (
    <View style={s.container}>
      <GameHeader title="Word Search" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newRound} />

      <Text style={s.wsTheme}>{puz.theme} · {W.TIERS[diff].label}</Text>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 2}}>
        {W.LANGS.map((L: any) => (
          <Pressable key={L.key} onPress={() => pickLang(L.key)} style={[s.wsLangBtn, lang === L.key && s.solidBtn]}>
            <Text style={[s.wsLangText, lang === L.key && s.solidText]}>{L.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.wsControls}>
        <Pressable onPress={hint} style={s.segBtn}><Text style={s.segTxt}>💡 Hint</Text></Pressable>
        <Pressable onPress={() => setShowWords(v => !v)} style={[s.segBtn, !showWords && s.segOn]}><Text style={[s.segTxt, !showWords && s.solidText]}>{showWords ? 'Hide list' : 'Show list'}</Text></Pressable>
        <Pressable onPress={solve} style={s.segBtn}><Text style={s.segTxt}>Solution</Text></Pressable>
        {spot ? <Pressable onPress={() => setSpot(null)} style={[s.segBtn, s.segOn]}><Text style={[s.segTxt, s.solidText]}>Clear “{spot}”</Text></Pressable> : null}
      </View>

      <View style={s.msgZone}>
        <Text style={s.statusBig}>{flash || (start !== null ? 'Now tap the last letter' : `${foundCount} / ${total} found`)}</Text>
      </View>

      <View style={{position: 'relative', alignSelf: 'center'}}>
        <View style={s.wsBoard}>
          {Array.from({length: size}).map((_, r) => (
            <View key={r} style={{flexDirection: 'row'}}>
              {Array.from({length: size}).map((_, c) => {
                const idx = r * size + c;
                const isStart = start === idx;
                const isFound = foundSet.has(idx);
                const isSpot = spot != null && puz.grid[idx] === spot;
                const isHint = hintCell === idx;
                return (
                  <Pressable key={c} onPress={() => tap(idx)} onLongPress={() => spotlight(puz.grid[idx])} delayLongPress={280}
                    style={[s.wsCell, {width: CELL, height: CELL}, isFound && s.wsFound, isSpot && s.wsSpot, isStart && s.wsStart, isHint && s.wsHintCell]}>
                    <Text style={{fontSize: Math.round(CELL * 0.5), fontWeight: '700', color: isStart ? PAPER : INK}}>{puz.grid[idx]}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {strikes}
        </View>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>

      {showWords ? (
        <View style={s.wsWordsWrap}>
          {puz.words.map((w: any, i: number) => (
            <Text key={i} style={[s.wsWord, w.found && s.wsWordFound]}>{w.text}</Text>
          ))}
        </View>
      ) : (
        <View style={s.wsWordsWrap}>
          <Text style={s.wsHidden}>List hidden — {total - foundCount} word{total - foundCount === 1 ? '' : 's'} left to find</Text>
        </View>
      )}
      <Text style={s.wsTip}>Tip: long-press any letter to light up every copy of it.</Text>

      <View style={s.belowZone}>
        {end ? <Pressable style={s.playAgainBtn} onPress={newRound}><Text style={s.playText}>New game ▸</Text></Pressable> : null}
      </View>

      {rules ? <RulesModal game="words" onClose={() => setRules(false)} /> : null}
      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
    </View>
  );
}

/* ---------------------------------------------------------------- 2048 */

// Light fills (black text stays readable) for 2..256, then a clear jump to dark
// fills (white text) for 512+ — the mid-greys were unreadable on e-ink.
const SHADES2048 = ['#FFFFFF', '#F4F4F4', '#E9E9E9', '#DEDEDE', '#D3D3D3', '#C8C8C8', '#BDBDBD', '#AEAEAE', '#3C3C3C', '#2A2A2A', '#181818', '#000000'];

function Game2048({diff, onMenu, st, saves, onSave, onDelete}: {diff: Diff; onMenu: () => void; st: any; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const dsize = diff === 'easy' ? 6 : diff === 'medium' ? 5 : 4; // bigger grid = more room = far easier
  const dtarget = diff === 'easy' ? 256 : 2048;                  // Easy 256 · Medium 2048 (5×5) · Hard 2048 (classic 4×4)
  const [size, setSize] = useState(dsize);
  const [target, setTarget] = useState(dtarget);
  const [board, setBoard] = useState<number[]>(() => G2048.newGame(dsize));
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [wonBanner, setWonBanner] = useState(false);
  const [lastSpawn, setLastSpawn] = useState(-1);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const best = st.best('2048', diff);

  const reset = () => { setSize(dsize); setTarget(dtarget); setBoard(G2048.newGame(dsize)); setScore(0); setWon(false); setWonBanner(false); setLastSpawn(-1); setEnd(null); };
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!Array.isArray(d.board) || !d.size) return;
    setSize(d.size); setTarget(d.target || 2048); setBoard(d.board.slice()); setScore(d.score || 0); setWon(!!d.won);
    setWonBanner(false); setLastSpawn(-1); setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('2048', diff, score > 0 && !end, `top tile ${G2048.maxTile(board)} · score ${score}`, {size, target, board, score, won}));
  const saveNow = () => onSave({game: '2048', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: `top tile ${G2048.maxTile(board)} · score ${score}`, data: {size, target, board, score, won}});

  const doMove = (dir: 'L' | 'R' | 'U' | 'D') => {
    if (end || wonBanner) return;
    const r = G2048.move(board, size, dir);
    if (!r.moved) return;
    const spawn = G2048.addTile(r.board, Math.random);
    setBoard(r.board);
    setLastSpawn(spawn);
    const fs = score + r.gained;
    setScore(fs);
    const nm = G2048.maxTile(r.board);
    if (best == null || nm > best) st.record('2048', diff, nm); // record = highest tile ever reached
    if (!won && G2048.hasWon(r.board, target)) { setWon(true); setWonBanner(true); return; }
    if (!G2048.canMove(r.board, size)) {
      onDelete(RESUME_KEY); // game over — drop the stale resume
      setEnd({msg: `No moves left — top tile ${nm}, score ${fs} 😅`});
    }
  };

  const shadeIdx = (v: number) => Math.min(SHADES2048.length - 1, Math.max(0, Math.round(Math.log2(v)) - 1));
  const CELL = Math.floor(Math.min(SCREEN_W - 40, 400) / size);
  const mx = G2048.maxTile(board);

  // Swipe the board (in addition to the arrow buttons). A ref keeps the handler
  // pointing at the latest doMove without recreating the PanResponder.
  const doMoveRef = useRef(doMove);
  doMoveRef.current = doMove;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 || Math.abs(g.dy) > 12,
    onPanResponderRelease: (_e, g) => {
      if (Math.abs(g.dx) < 18 && Math.abs(g.dy) < 18) return;
      const dir = Math.abs(g.dx) > Math.abs(g.dy) ? (g.dx > 0 ? 'R' : 'L') : (g.dy > 0 ? 'D' : 'U');
      doMoveRef.current(dir as 'L' | 'R' | 'U' | 'D');
    },
  })).current;

  return (
    <View style={s.container}>
      <GameHeader title="2048" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={reset} />
      <Text style={s.tttLegend}>Goal: make a <Text style={s.bold}>{target}</Text> tile · merge equal tiles (2+2→4)</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={s.statusBig}>Top tile {mx} → goal {target} · score {score}{st.showBest && best != null ? ` · record ${best}` : ''}</Text>}
        </View>

        <View style={{position: 'relative', alignSelf: 'center'}} {...pan.panHandlers}>
          <View style={s.gBoard}>
            {Array.from({length: size}).map((_, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {Array.from({length: size}).map((_, c) => {
                  const idx = r * size + c, v = board[idx];
                  const dark = v > 0 && shadeIdx(v) >= 8; // 512 and up use white text on a dark fill
                  const isNew = idx === lastSpawn && v > 0;
                  return (
                    <View key={c} style={{width: CELL, height: CELL, borderWidth: 1, borderColor: INK, alignItems: 'center', justifyContent: 'center', backgroundColor: v ? SHADES2048[shadeIdx(v)] : PAPER}}>
                      {v ? <Text style={{fontSize: v >= 1000 ? CELL * 0.3 : CELL * 0.4, fontWeight: '800', color: dark ? PAPER : INK}}>{v}</Text> : null}
                      {isNew ? <View pointerEvents="none" style={{position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, borderWidth: 2.5, borderColor: INK, borderRadius: 3}} /> : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : wonBanner ? <EndOverlay text={`You made the ${target} tile! 🎉`} /> : null}
        </View>

        <View style={s.padArea}>
          {end ? <Pressable style={s.playAgainBtn} onPress={reset}><Text style={s.playText}>New game ▸</Text></Pressable>
            : wonBanner ? <Pressable style={s.playAgainBtn} onPress={() => setWonBanner(false)}><Text style={s.playText}>Keep going ▸</Text></Pressable>
            : (
              <>
                <Pressable onPress={() => doMove('U')} style={s.padBtn}><Text style={s.padTxt}>↑</Text></Pressable>
                <View style={{flexDirection: 'row', gap: 12}}>
                  <Pressable onPress={() => doMove('L')} style={s.padBtn}><Text style={s.padTxt}>←</Text></Pressable>
                  <Pressable onPress={() => doMove('D')} style={s.padBtn}><Text style={s.padTxt}>↓</Text></Pressable>
                  <Pressable onPress={() => doMove('R')} style={s.padBtn}><Text style={s.padTxt}>→</Text></Pressable>
                </View>
              </>
            )}
        </View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="2048" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ----------------------------------------------------------- 15-Puzzle */

// Every Nonogram picture, usable as a puzzle image (uniqueness doesn't matter here).
const TAQ_PICS: any[] = (['5', '8', '10'] as string[]).reduce((a: any[], k) => a.concat((NONO.PICTURES as any)[k]), []);
// Nearest-neighbour resample of a '#/.' picture to an N×N grid.
function resamplePic(rows: string[], toN: number): string[] {
  const fromN = rows.length, out: string[] = [];
  for (let r = 0; r < toN; r++) {
    const fr = Math.min(fromN - 1, Math.floor(r * fromN / toN));
    let s = '';
    for (let c = 0; c < toN; c++) s += rows[fr][Math.min(fromN - 1, Math.floor(c * fromN / toN))];
    out.push(s);
  }
  return out;
}

const TAQ_TIPS = [
  'Solve the TOP ROW first, left to right — then never disturb it again.',
  'Next do the LEFT COLUMN. Each finished edge shrinks the puzzle to a smaller one.',
  'For the last two tiles of a row: stack them near the corner, then rotate them into place together.',
  'Keep the blank close to the tile you are placing so you can steer that tile.',
  'Reduce it down to a 2×2 block in a corner — those last tiles just cycle around.',
];
function Taquin({diff, onMenu, st, saves, onSave, onDelete}: {diff: Diff; onMenu: () => void; st: any; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const dsize = diff === 'easy' ? 3 : diff === 'hard' ? 5 : 4;
  const pRes = (n: number) => (n === 3 ? 9 : n === 5 ? 10 : 8); // picture res = whole multiple of size → even tiles, no crop/stretch
  const [size, setSize] = useState(dsize);
  const imageP = pRes(size);
  const [board, setBoard] = useState<number[]>(() => TAQUIN.newGame(dsize));
  const [moves, setMoves] = useState(0);
  const [rules, setRules] = useState(false);
  const [imgMode, setImgMode] = useState<'num' | 'pic'>('pic');
  const [picRows, setPicRows] = useState<string[]>(() => resamplePic(TAQ_PICS[Math.floor(Math.random() * TAQ_PICS.length)].rows, pRes(dsize)));
  const [showTarget, setShowTarget] = useState(true);
  const [showSaved, setShowSaved] = useState(false);
  const [hintPos, setHintPos] = useState<number | null>(null);
  const [flash, setFlash] = useState('');
  const tipRef = useRef(0);
  // Pixel signature of a home tile's image region — two tiles with the same art are interchangeable.
  const regionSig = (home: number) => {
    const hr = Math.floor(home / size), hc = home % size;
    const r0 = Math.floor((hr * imageP) / size), r1 = Math.floor(((hr + 1) * imageP) / size);
    const c0 = Math.floor((hc * imageP) / size), c1 = Math.floor(((hc + 1) * imageP) / size);
    let sig = '';
    for (let r = r0; r < r1; r++) sig += picRows[r].slice(c0, c1) + '/';
    return sig;
  };
  // In Picture mode the puzzle is done when the IMAGE is complete (identical tiles may be swapped);
  // in Numbers mode the exact tile order must match.
  const picSolved = (bd: number[]) => {
    if (TAQUIN.isSolved(bd)) return true; // exact order always counts (covers dense pictures)
    for (let i = 0; i < bd.length; i++) {
      if (bd[i] === 0) { if (regionSig(i).indexOf('#') >= 0) return false; continue; } // hole is fine only on an all-background cell
      if (regionSig(bd[i] - 1) !== regionSig(i)) return false;
    }
    return true;
  };
  const isDone = (bd: number[]) => (imgMode === 'pic' ? picSolved(bd) : TAQUIN.isSolved(bd));
  const solved = isDone(board);
  const best = st.best('taquin', diff);

  const reset = () => { setSize(dsize); setBoard(TAQUIN.newGame(dsize)); setMoves(0); setHintPos(null); setFlash(''); setPicRows(resamplePic(TAQ_PICS[Math.floor(Math.random() * TAQ_PICS.length)].rows, pRes(dsize))); };
  const hint = () => {
    if (solved) return;
    const cap = size <= 3 ? 45000 : 2500, w = size <= 3 ? 2 : 3;
    const pos = TAQUIN.solveNext(board, size, cap, w);
    if (pos >= 0) { setHintPos(pos); setFlash('💡 Tap the framed tile'); }
    else { setHintPos(null); setFlash('💡 ' + TAQ_TIPS[tipRef.current++ % TAQ_TIPS.length]); }
  };
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!Array.isArray(d.board) || !d.size) return;
    setSize(d.size); setBoard(d.board.slice()); setMoves(d.moves || 0);
    if (d.imgMode) setImgMode(d.imgMode);
    if (Array.isArray(d.picRows)) setPicRows(d.picRows.slice());
    setShowSaved(false);
  };
  useResume(() => resumeSave('taquin', diff, moves > 0 && !solved, `${size}×${size} · ${moves} moves`, {size, board, moves, imgMode, picRows}));
  const saveNow = () => onSave({game: 'taquin', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: `${size}×${size} · ${moves} moves`, data: {size, board, moves, imgMode, picRows}});
  const tap = (i: number) => {
    if (solved) return;
    const nb = TAQUIN.slide(board, size, i);
    if (nb) { const m = moves + 1; setBoard(nb); setMoves(m); setHintPos(null); setFlash(''); if (isDone(nb)) { onDelete(RESUME_KEY); st.record('taquin', diff, m); } }
  };
  const CELL = Math.floor(Math.min(SCREEN_W - 40, 432) / size);

  const TileArt = (home: number) => {
    const hr = Math.floor(home / size), hc = home % size;
    const r0 = Math.floor(hr * imageP / size), r1 = Math.floor((hr + 1) * imageP / size);
    const c0 = Math.floor(hc * imageP / size), c1 = Math.floor((hc + 1) * imageP / size);
    const rr = Math.max(1, r1 - r0), cc = Math.max(1, c1 - c0);
    const pw = CELL / cc, ph = CELL / rr;
    return (
      <View>
        {Array.from({length: rr}).map((_, ri) => (
          <View key={ri} style={{flexDirection: 'row'}}>
            {Array.from({length: cc}).map((_, ci) => (
              <View key={ci} style={{width: pw, height: ph, backgroundColor: picRows[r0 + ri][c0 + ci] === '#' ? INK : PAPER}} />
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <GameHeader title="15-Puzzle" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={reset} />

      <View style={s.taqControls}>
        <Text style={s.memCardsLbl}>Tiles</Text>
        <Pressable onPress={() => setImgMode('num')} style={[s.segBtn, imgMode === 'num' && s.segOn]}><Text style={[s.segTxt, imgMode === 'num' && s.solidText]}>Numbers</Text></Pressable>
        <Pressable onPress={() => setImgMode('pic')} style={[s.segBtn, imgMode === 'pic' && s.segOn]}><Text style={[s.segTxt, imgMode === 'pic' && s.solidText]}>Picture</Text></Pressable>
        {imgMode === 'pic' ? <Pressable onPress={() => setShowTarget(t => !t)} style={[s.segBtn, showTarget && s.segOn]}><Text style={[s.segTxt, showTarget && s.solidText]}>{showTarget ? 'Target: on' : 'Target: off'}</Text></Pressable> : null}
        <Pressable onPress={hint} style={s.segBtn}><Text style={s.segTxt}>💡 Hint</Text></Pressable>
      </View>

      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <View style={s.msgZone}>
          {solved ? null : <Text style={s.statusBig}>{flash || `Moves ${moves}${st.showBest && best != null ? ` · Best ${best}` : ''}`}</Text>}
        </View>

        <View style={{flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 14}}>
          <View style={{position: 'relative'}}>
            <View style={s.gBoard}>
              {Array.from({length: size}).map((_, r) => (
                <View key={r} style={{flexDirection: 'row'}}>
                  {Array.from({length: size}).map((_, c) => {
                    const i = r * size + c, v = board[i];
                    if (v === 0) return (
                      <View key={c} style={{width: CELL, height: CELL, borderWidth: imgMode === 'pic' ? 2.5 : 1, borderColor: imgMode === 'pic' ? INK : '#DDDDDD', borderStyle: imgMode === 'pic' ? 'dashed' : 'solid', backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center'}}>
                        {imgMode === 'pic' ? <Text style={{fontSize: CELL * 0.3, color: '#999999', fontWeight: '800'}}>◻</Text> : null}
                      </View>
                    );
                    const hinted = hintPos === i;
                    if (imgMode === 'pic') return (
                      <Pressable key={c} onPress={() => tap(i)} style={{width: CELL, height: CELL, borderWidth: hinted ? 4 : 1, borderColor: hinted ? '#000000' : '#888888', overflow: 'hidden'}}>{TileArt(v - 1)}</Pressable>
                    );
                    return (
                      <Pressable key={c} onPress={() => tap(i)} style={{width: CELL, height: CELL, borderWidth: hinted ? 4 : 1.5, borderColor: INK, alignItems: 'center', justifyContent: 'center', backgroundColor: hinted ? '#D9D9D9' : PAPER}}>
                        <Text style={{fontSize: CELL * 0.4, fontWeight: '800', color: INK}}>{v}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
            {solved ? <EndOverlay text={`Solved in ${moves}! 🎉`} /> : null}
          </View>

          {imgMode === 'pic' && showTarget && !solved ? (
            <View style={{alignItems: 'center'}}>
              <Text style={s.bsLabel}>Target</Text>
              <View style={{borderWidth: 2, borderColor: INK}}><TargetPic rows={picRows} size={size} box={Math.min(120, size * CELL * 0.5)} /></View>
              <Pressable onPress={reset} style={[s.segBtn, {marginTop: 8, paddingVertical: 7}]}><Text style={s.segTxt}>🔀 New picture</Text></Pressable>
            </View>
          ) : null}
        </View>

        <View style={s.belowZone}>
          {solved ? <Pressable style={s.playAgainBtn} onPress={reset}><Text style={s.playText}>New game ▸</Text></Pressable> : null}
        </View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="taquin" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ---------------------------------------------------------- Mastermind */

function Mastermind({diff, onMenu, st, saves, onSave, onDelete}: {diff: Diff; onMenu: () => void; st: any; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const cfg = MM.TIERS[diff];
  const [code, setCode] = useState<number[]>(() => MM.newCode(diff));
  const [rows, setRows] = useState<Array<{guess: number[]; black: number; white: number}>>([]);
  const [cur, setCur] = useState<number[]>([]);
  const [end, setEnd] = useState<{msg: string; win: boolean} | null>(null);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const best = st.best('mm', diff);

  const reset = () => { setCode(MM.newCode(diff)); setRows([]); setCur([]); setEnd(null); };
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!Array.isArray(d.code) || d.code.length !== cfg.pegs) return; // wrong difficulty — ignore
    setCode(d.code.slice()); setRows(Array.isArray(d.rows) ? d.rows : []); setCur(Array.isArray(d.cur) ? d.cur : []);
    setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('mm', diff, rows.length > 0 && !end, `${rows.length} guess${rows.length === 1 ? '' : 'es'} played`, {code, rows, cur}));
  const saveNow = () => onSave({game: 'mm', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: `${rows.length} guess${rows.length === 1 ? '' : 'es'} played`, data: {code, rows, cur}});
  const place = (sym: number) => { if (end || cur.length >= cfg.pegs) return; setCur([...cur, sym]); };
  const back = () => { if (end) return; setCur(cur.slice(0, -1)); };
  const submit = () => {
    if (end || cur.length !== cfg.pegs) return;
    const sc = MM.score(code, cur);
    const nrows = [...rows, {guess: cur, black: sc.black, white: sc.white}];
    setRows(nrows); setCur([]);
    if (sc.black === cfg.pegs) {
      const g = nrows.length, isBest = best == null || g < best;
      st.record('mm', diff, g); onDelete(RESUME_KEY);
      setEnd({msg: st.showBest && isBest ? `Cracked in ${g} — new best! 🏆` : `Code cracked in ${g}! 🎉`, win: true});
    } else if (nrows.length >= cfg.guesses) { onDelete(RESUME_KEY); setEnd({msg: 'Out of tries 😅', win: false}); }
  };

  const easy = diff === 'easy';
  const fbCols = Math.ceil(Math.sqrt(cfg.pegs)); // 4 pegs → 2×2, 5 pegs → 3+2 (square-ish)

  // Easy: one aligned mark UNDER each tried number (● right spot · ○ right number · – absent).
  const markView = (kind: string, key: number) => (
    <View key={key} style={kind === 'exact' ? s.mmMarkExact : kind === 'close' ? s.mmMarkClose : s.mmMarkAbsent} />
  );
  // Medium/Hard: classic aggregated black/white pegs, laid out as a fixed SQUARE block.
  const squareFb = (black: number, white: number) => {
    const slots: string[] = [];
    for (let i = 0; i < black; i++) slots.push('b');
    for (let i = 0; i < white; i++) slots.push('w');
    while (slots.length < cfg.pegs) slots.push('e');
    const grid: string[][] = [];
    for (let r = 0; r < slots.length; r += fbCols) grid.push(slots.slice(r, r + fbCols));
    return (
      <View style={s.fbGrid}>
        {grid.map((rw, ri) => (
          <View key={ri} style={{flexDirection: 'row', gap: 4}}>
            {rw.map((k, ci) => <View key={ci} style={k === 'b' ? s.fbBlack : k === 'w' ? s.fbWhite : s.fbEmpty} />)}
          </View>
        ))}
      </View>
    );
  };
  const pegView = (sym: number, key: number) => (
    <View key={key} style={s.mmPeg}><Text style={s.mmPegTxt}>{sym + 1}</Text></View>
  );

  const triesLeft = cfg.guesses - rows.length;

  return (
    <View style={s.container}>
      <GameHeader title="Mastermind" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={reset} />
      <Text style={s.tttLegend}>{cfg.pegs} pegs · {cfg.symbols} numbers · {end ? (end.win ? 'solved' : 'revealed below') : `${triesLeft} of ${cfg.guesses} tries left`}{st.showBest && best != null ? ` · best ${best}` : ''} · ● right spot · ○ right number{easy ? ' · – absent' : ''}</Text>

      <View style={{flex: 1, position: 'relative'}}>
        <ScrollView style={{flex: 1}} contentContainerStyle={{paddingVertical: 8, alignItems: 'center', flexGrow: 1, justifyContent: 'center'}}>
          {Array.from({length: cfg.guesses}).map((_, ri) => {
            const row = rows[ri];
            if (!row) { // a remaining attempt — grey placeholder so the whole board is visible
              return (
                <View key={ri} style={[s.mmRow, s.mmRowGhost]}>
                  <Text style={s.mmRowNum}>{ri + 1}</Text>
                  <View style={{flexDirection: 'row', gap: 6}}>
                    {Array.from({length: cfg.pegs}).map((_, gi) => <View key={gi} style={[s.mmPeg, s.mmPegEmpty]} />)}
                  </View>
                </View>
              );
            }
            const marks = easy ? MM.scoreEach(code, row.guess) : null;
            return (
              <View key={ri} style={s.mmRow}>
                <Text style={s.mmRowNum}>{ri + 1}</Text>
                <View style={{flexDirection: 'row', gap: 6}}>
                  {row.guess.map((g, gi) => (
                    easy
                      ? <View key={gi} style={{alignItems: 'center', gap: 4}}>{pegView(g, gi)}{markView((marks as string[])[gi], gi)}</View>
                      : pegView(g, gi)
                  ))}
                </View>
                {easy ? null : squareFb(row.black, row.white)}
              </View>
            );
          })}
          {end && !end.win ? (
            <View style={[s.mmRow, {opacity: 0.9}]}>
              <Text style={s.mmRowNum}>✓</Text>
              <View style={{flexDirection: 'row', gap: 6}}>{code.map((g, gi) => pegView(g, gi))}</View>
              <Text style={{fontWeight: '700', color: INK}}>the code</Text>
            </View>
          ) : null}
        </ScrollView>

        {end ? <EndOverlay text={end.msg} /> : null}
      </View>

      <View style={{position: 'relative'}}>
        <View style={end ? {opacity: 0} : undefined} pointerEvents={end ? 'none' : 'auto'}>
        <View style={s.mmControls}>
          <View style={s.mmCurRow}>
            {Array.from({length: cfg.pegs}).map((_, i) => (
              cur[i] !== undefined ? pegView(cur[i], i)
                : <View key={'s' + i} style={[s.mmPeg, s.mmPegEmpty]} />
            ))}
            <Pressable onPress={back} style={s.mmBack}><Text style={s.mmBackTxt}>⌫</Text></Pressable>
          </View>
          <View style={s.mmPalette}>
            {Array.from({length: cfg.symbols}).map((_, sym) => (
              <Pressable key={sym} onPress={() => place(sym)} style={s.mmPalBtn}><Text style={s.mmPalTxt}>{sym + 1}</Text></Pressable>
            ))}
          </View>
          <Pressable onPress={submit} style={[s.playBtn, cur.length !== cfg.pegs && s.mmSubmitOff, {marginTop: 10}]}>
            <Text style={s.playText}>Submit guess ▸</Text>
          </Pressable>
        </View>
        </View>
        {end ? <View style={[StyleSheet.absoluteFill, {alignItems: 'center', justifyContent: 'center'}]}><Pressable style={s.playAgainBtn} onPress={reset}><Text style={s.playText}>New game ▸</Text></Pressable></View> : null}
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="mm" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------- Peg Solitaire */

function PegSolitaire({diff, onMenu, st, saves, onSave, onDelete}: {diff: Diff; onMenu: () => void; st: any; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const spec: any = PEG.BOARDS[diff];
  const [pegs, setPegs] = useState<number[]>(() => PEG.initPegs(spec));
  const [sel, setSel] = useState<number | null>(null);
  const [hist, setHist] = useState<number[][]>([]);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const best = st.best('peg', diff);

  const reset = () => { setPegs(PEG.initPegs(spec)); setSel(null); setHist([]); setEnd(null); };
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!Array.isArray(d.pegs) || d.pegs.length !== PEG.initPegs(spec).length) return; // wrong board — ignore
    setPegs(d.pegs.slice()); setHist(Array.isArray(d.hist) ? d.hist : []); setSel(null); setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('peg', diff, hist.length > 0 && !end, `${PEG.pegCount(pegs)} pegs left`, {pegs, hist}));
  const saveNow = () => onSave({game: 'peg', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: `${PEG.pegCount(pegs)} pegs left`, data: {pegs, hist}});
  const undo = () => { if (!hist.length) return; setPegs(hist[hist.length - 1]); setHist(hist.slice(0, -1)); setSel(null); setEnd(null); };

  const count = PEG.pegCount(pegs);
  const dests = sel !== null ? new Set(PEG.movesFrom(spec, pegs, sel).map((j: number[]) => j[2])) : new Set<number>();

  const tap = (id: number) => {
    if (end) return;
    if (pegs[id] === 1) { setSel(sel === id ? null : id); return; }
    if (pegs[id] === 0 && sel !== null) {
      const j = PEG.movesFrom(spec, pegs, sel).find((x: number[]) => x[2] === id);
      if (!j) { setSel(null); return; }
      const np = PEG.applyJump(pegs, j);
      setHist(h => [...h, pegs]); setPegs(np); setSel(null);
      if (PEG.legalMoves(spec, np).length === 0) {
        const pc = PEG.pegCount(np);
        const isBest = best == null || pc < best;
        st.record('peg', diff, pc); onDelete(RESUME_KEY);
        setEnd({msg: pc === 1 ? 'Perfect — one peg left! 🎉' : (st.showBest && isBest ? `${pc} pegs left — new best! 🏆` : `${pc} pegs left — try again`)});
      }
    }
  };

  const cellSize = spec.layout === 'triangle'
    ? fitCell(spec.rows, spec.rows, 300, 92)
    : fitCell(spec.N, spec.N, 300, 92);
  const Peg = (id: number, key: number) => {
    const isPeg = pegs[id] === 1, seld = sel === id, dest = dests.has(id);
    return (
      <Pressable key={key} onPress={() => tap(id)} style={{width: cellSize, height: cellSize, alignItems: 'center', justifyContent: 'center'}}>
        <View style={{width: cellSize * 0.66, height: cellSize * 0.66, borderRadius: cellSize * 0.33, borderWidth: 2, borderColor: isPeg ? INK : (dest ? INK : '#CFCFCF'), backgroundColor: isPeg ? (seld ? '#666666' : INK) : (dest ? '#D8D8D8' : PAPER)}} />
      </Pressable>
    );
  };

  return (
    <View style={s.container}>
      <GameHeader title="Peg Solitaire" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={reset} />
      <Text style={s.tttLegend}>{spec.name} · clear down to a single peg</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={s.statusBig}>Pegs left: {count}{st.showBest && best != null ? ` · Best ${best}` : ''}</Text>}
        </View>

        <View style={{position: 'relative', alignSelf: 'center'}}>
          <View style={{alignSelf: 'center'}}>
            {spec.layout === 'triangle'
              ? Array.from({length: spec.rows}).map((_, r) => (
                <View key={r} style={{flexDirection: 'row', justifyContent: 'center'}}>
                  {Array.from({length: r + 1}).map((_, c) => Peg(spec.cellAt[r + ',' + c], c))}
                </View>
              ))
              : Array.from({length: spec.N}).map((_, r) => (
                <View key={r} style={{flexDirection: 'row'}}>
                  {Array.from({length: spec.N}).map((_, c) => {
                    const id = spec.cellAt[r + ',' + c];
                    return id === undefined ? <View key={c} style={{width: cellSize, height: cellSize}} /> : Peg(id, c);
                  })}
                </View>
              ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
        </View>

        <View style={s.belowZone}>
          {end
            ? <Pressable style={s.playAgainBtn} onPress={reset}><Text style={s.playText}>New game ▸</Text></Pressable>
            : (hist.length ? <Pressable style={s.undoBtn} onPress={undo}><Text style={s.undoTxt}>↩ Undo</Text></Pressable> : null)}
        </View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="peg" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* --------------------------------------------------------------- Memory */

// pixel-art card faces (8×8 bank) — drop 'tree' (near-identical to diamond/arrow on a small card). Nonogram keeps the full bank.
const MEM_PICS: any[] = ((NONO.PICTURES as any)['8'] as any[]).filter(p => p.name !== 'tree');
const MEM_CFG: Record<Diff, {cols: number; rows: number}> = {
  easy: {cols: 4, rows: 4}, medium: {cols: 6, rows: 4}, hard: {cols: 6, rows: 6},
};
function makeMemBoard(diff: Diff) {
  const {cols, rows} = MEM_CFG[diff];
  const pairs = (cols * rows) / 2;
  const values: number[] = [];
  for (let i = 0; i < pairs; i++) { values.push(i, i); }
  for (let i = values.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = values[i]; values[i] = values[j]; values[j] = t; }
  return {cols, rows, pairs, values, matched: new Array(values.length).fill(false) as boolean[]};
}

function Memory({diff, onMenu, st, names, emojis, players: propPlayers, saves, onSave, onDelete}: {diff: Diff; onMenu: () => void; st: any; names?: Names; emojis?: Names; players?: number; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const players = propPlayers || 1;
  const best = st.best('memory', diff);
  const [showSaved, setShowSaved] = useState(false);
  const [cardSet, setCardSet] = useState<'num' | 'pic'>('pic');
  const [board, setBoard] = useState(() => makeMemBoard(diff));
  const [first, setFirst] = useState<number | null>(null);
  const [second, setSecond] = useState<number | null>(null);
  const [lock, setLock] = useState(false);
  const [scores, setScores] = useState<number[]>(() => new Array(players).fill(0));
  const [turn, setTurn] = useState(0);
  const [flips, setFlips] = useState(0);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const nameFor = (i: number) => (names && (names as any)['p' + (i + 1)]) ? (names as any)['p' + (i + 1)] : `Player ${i + 1}`;
  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setBoard(makeMemBoard(diff));
    setFirst(null); setSecond(null); setLock(false);
    setScores(new Array(players).fill(0)); setTurn(0); setFlips(0); setEnd(null);
  };
  const loadSave = (sv: GameSave) => {
    const d = sv.data || {};
    if (!Array.isArray(d.values) || d.values.length !== board.values.length) return; // wrong difficulty — ignore
    setBoard({...board, values: d.values.slice(), matched: Array.isArray(d.matched) ? d.matched.slice() : new Array(d.values.length).fill(false), pairs: d.pairs || board.pairs});
    setScores(Array.isArray(d.scores) ? d.scores.slice() : new Array(players).fill(0));
    setTurn(d.turn || 0); setFlips(d.flips || 0); if (d.cardSet) setCardSet(d.cardSet);
    setFirst(null); setSecond(null); setLock(false); setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('memory', diff, !end && (flips > 0 || board.matched.some(Boolean)), `${Math.floor(board.matched.filter(Boolean).length / 2)}/${board.pairs} pairs`, {values: board.values, matched: board.matched, pairs: board.pairs, scores, turn, flips, cardSet}));
  const saveNow = () => onSave({game: 'memory', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: `${Math.floor(board.matched.filter(Boolean).length / 2)}/${board.pairs} pairs`, data: {values: board.values, matched: board.matched, pairs: board.pairs, scores, turn, flips, cardSet}});

  const winnerMsg = (fs: number[]) => {
    if (players === 1) return `All ${board.pairs} pairs in ${flips + 1} flips! 🎉`;
    let max = -1; fs.forEach(v => { if (v > max) max = v; });
    const winners = fs.map((v, i) => (v === max ? i : -1)).filter(i => i >= 0);
    return winners.length > 1 ? `It's a tie — ${max} pairs each!` : `${tokenFor(winners[0] + 1)} ${nameFor(winners[0])} wins with ${max}! 🎉`;
  };

  const tap = (i: number) => {
    if (lock || end || board.matched[i] || i === first) return;
    if (first === null) { setFirst(i); return; }
    setSecond(i);
    setFlips(f => f + 1);
    if (board.values[i] === board.values[first]) {
      const nm = board.matched.slice(); nm[i] = true; nm[first] = true;
      setBoard({...board, matched: nm});
      const fs = scores.slice(); fs[turn] = (fs[turn] || 0) + 1; setScores(fs);
      setFirst(null); setSecond(null);
      if (nm.every(Boolean)) { if (players === 1) st.record('memory', diff, flips + 1); onDelete(RESUME_KEY); setEnd({msg: winnerMsg(fs)}); }
    } else {
      setLock(true);
      timer.current = setTimeout(() => {
        setFirst(null); setSecond(null); setLock(false);
        setTurn(t => (t + 1) % players);
      }, 900);
    }
  };

  const shown = (i: number) => board.matched[i] || i === first || i === second;
  const matchedPairs = board.matched.filter(Boolean).length / 2;
  const CELL = fitCell(board.cols, board.rows, 300, 120);
  const tokenFor = (p1based: number) => (emojis && (emojis as any)['p' + p1based]) || String(p1based);
  const status = players === 1 ? `Pairs ${matchedPairs}/${board.pairs} · flips ${flips}${st.showBest && best != null ? ` · Best ${best}` : ''}` : `${tokenFor(turn + 1)} ${nameFor(turn)}'s turn`;

  return (
    <View style={s.container}>
      <GameHeader title="Memory" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={reset} />

      <View style={s.memCardsRow}>
        {players > 1 ? <Text style={[s.tttLegend, {flex: 1}]} numberOfLines={1}>{Array.from({length: players}).map((_, i) => `${tokenFor(i + 1)} ${nameFor(i)}`).join(' · ')}</Text> : <View style={{flex: 1}} />}
        <Text style={s.memCardsLbl}>Cards</Text>
        <Pressable onPress={() => setCardSet('num')} style={[s.segBtn, cardSet === 'num' && s.segOn]}><Text style={[s.segTxt, cardSet === 'num' && s.solidText]}>Numbers</Text></Pressable>
        <Pressable onPress={() => setCardSet('pic')} style={[s.segBtn, cardSet === 'pic' && s.segOn]}><Text style={[s.segTxt, cardSet === 'pic' && s.solidText]}>Picture</Text></Pressable>
      </View>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={players > 1 ? s.turnBig : s.statusBig}>{status}</Text>}
        </View>

        <View style={{position: 'relative', alignSelf: 'center'}}>
          <View style={{alignSelf: 'center'}}>
            {Array.from({length: board.rows}).map((_, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {Array.from({length: board.cols}).map((_, c) => {
                  const i = r * board.cols + c;
                  const up = shown(i);
                  const done = board.matched[i];
                  return (
                    <Pressable key={c} onPress={() => tap(i)} style={{width: CELL, height: CELL, padding: 2}}>
                      <View style={[s.memCard, up && s.memCardUp, done && s.memCardDone]}>
                        {up
                          ? (cardSet === 'pic'
                            ? <MiniPic rows={MEM_PICS[board.values[i] % MEM_PICS.length].rows} box={Math.floor(CELL * 0.66)} color={done ? '#9A9A9A' : INK} />
                            : <Text style={[s.memCardTxt, {fontSize: CELL * 0.4}, done && {color: '#9A9A9A'}]}>{board.values[i] + 1}</Text>)
                          : <Text style={[s.memCardTxt, {fontSize: CELL * 0.4, color: '#BBBBBB'}]}>?</Text>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
        </View>

        <View style={s.belowZone}>
          {end
            ? <Pressable style={s.playAgainBtn} onPress={reset}><Text style={s.playText}>New game ▸</Text></Pressable>
            : (players > 1 ? (
              <View style={s.memScoreRow}>
                {scores.map((sc, i) => (
                  <View key={i} style={[s.scoreCard, turn === i && s.scoreCardOn]}>
                    <Text style={s.scoreWho} numberOfLines={1}>{tokenFor(i + 1)} {nameFor(i)}</Text>
                    <Text style={s.mpNum}>{sc}</Text>
                  </View>
                ))}
              </View>
            ) : null)}
        </View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="memory" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ---------------------------------------------------------------- Chess */

const CHESS_GLYPH: {[k: string]: string} = {P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔', p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚'};

function Chess({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const twoP = mode === '2p';
  const p1 = names.p1, p2 = names.p2;
  const e1 = (emojis && emojis.p1) ? emojis.p1 + ' ' : '', e2 = (emojis && emojis.p2) ? emojis.p2 + ' ' : '';
  const [st, setSt] = useState<any>(() => CHESS.initBoard());
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const nameFor = (whiteSide: boolean) => twoP ? ((emojis && (emojis as any)[whiteSide ? 'p1' : 'p2'] ? (emojis as any)[whiteSide ? 'p1' : 'p2'] + ' ' : '') + (whiteSide ? p1 : p2)) : (whiteSide ? 'You' : 'SuperFun');
  const moves = useMemo(() => (!busy && !end) ? CHESS.legalMoves(st) : [], [st, busy, end]);
  const selMoves = sel !== null ? moves.filter((m: any) => m.from === sel) : [];
  const dests = new Set<number>(selMoves.map((m: any) => m.to));

  const newGame = () => { if (timer.current) clearTimeout(timer.current); setSt(CHESS.initBoard()); setSel(null); setBusy(false); setEnd(null); };

  const finish = (state: any) => {
    const r = CHESS.status(state);
    if (!r.over) return false;
    onDelete(RESUME_KEY);
    let msg: string;
    if (r.reason === 'checkmate') msg = twoP ? `${nameFor(r.result === 'w')} wins — checkmate! 🎉` : (r.result === 'w' ? WIN_MSGS[idx.current.win++ % WIN_MSGS.length] : LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length]);
    else msg = r.reason === 'stalemate' ? 'Stalemate — a draw.' : `Draw — ${r.reason}.`;
    setEnd({msg});
    return true;
  };
  const aiRespond = (state: any) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      const m = CHESS.aiMove(state, diff, Math.random);
      setBusy(false);
      if (!m) { finish(state); return; }
      commit(CHESS.applyMove(state, m));
    }, 400);
  };
  const commit = (state: any) => {
    setSt(state); setSel(null);
    if (finish(state)) return;
    if (!twoP && state.turn === 'b') aiRespond(state);
  };
  const tap = (i: number) => {
    if (busy || end) return;
    if (!twoP && st.turn !== 'w') return;
    const p = st.board[i], ownTurn = st.turn === 'w';
    if (sel === null) { if (p && CHESS.isWhite(p) === ownTurn) setSel(i); return; }
    if (i === sel) { setSel(null); return; }
    if (dests.has(i)) { const m = selMoves.find((x: any) => x.to === i); if (m) { commit(CHESS.applyMove(st, m)); return; } }
    if (p && CHESS.isWhite(p) === ownTurn) { setSel(i); return; } // reselect
    setSel(null);
  };

  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.board) || d.board.length !== 64) return;
    const state = {board: d.board.slice(), turn: d.turn === 'b' ? 'b' : 'w', castle: d.castle || {K: false, Q: false, k: false, q: false}, ep: typeof d.ep === 'number' ? d.ep : -1};
    setSt(state); setSel(null); setBusy(false); setEnd(null); setShowSaved(false);
    if (!twoP && state.turn === 'b' && !CHESS.status(state).over) aiRespond(state);
  };
  useResume(() => {
    const init = CHESS.initBoard().board;
    const started = st.board.some((v: string, k: number) => v !== init[k]);
    return resumeSave('chess', diff, !end && !busy && started && (twoP || st.turn === 'w'), twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, {board: st.board, turn: st.turn, castle: st.castle, ep: st.ep});
  });
  const saveNow = () => onSave({game: 'chess', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, data: {board: st.board, turn: st.turn, castle: st.castle, ep: st.ep}});

  const chk = !end && CHESS.inCheck(st, st.turn === 'w');
  const status = end ? '' : busy ? 'SuperFun is thinking…' : `${nameFor(st.turn === 'w')}'s turn${chk ? ' — check!' : ''}`;
  const CELL = bigCell(8);

  return (
    <View style={s.container}>
      <GameHeader title="Chess" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />
      <Text style={s.tttLegend}>{twoP ? `${p1} = white ♙ · ${p2} = black ♟` : `You are white ♙ · SuperFun black ♟ · ${DIFFICULTIES[diff].label}`}</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>{end ? null : <Text style={twoP ? s.turnBig : s.statusBig}>{status}</Text>}</View>
        <View style={{position: 'relative', alignSelf: 'center'}}>
          <View style={{borderWidth: 2, borderColor: INK}}>
            {Array.from({length: 8}).map((_, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {Array.from({length: 8}).map((_, c) => {
                  const i = r * 8 + c, pc = st.board[i], light = (r + c) % 2 === 0, isSel = sel === i, dest = dests.has(i);
                  return (
                    <Pressable key={c} onPress={() => tap(i)} style={{width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? SQ_SEL : (light ? PAPER : SQ_DARK)}}>
                      {pc ? <Text style={{fontSize: CELL * 0.72, color: INK}}>{CHESS_GLYPH[pc]}</Text> : null}
                      {dest ? <View style={{position: 'absolute', width: pc ? CELL * 0.9 : CELL * 0.3, height: pc ? CELL * 0.9 : CELL * 0.3, borderRadius: pc ? CELL * 0.45 : CELL * 0.15, backgroundColor: pc ? 'transparent' : '#6E6E6E', borderWidth: pc ? 3 : 0, borderColor: '#6E6E6E'}} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
        </View>
        <View style={s.belowZone}>{end ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>Play again ▸</Text></Pressable> : null}</View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="chess" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* -------------------------------------------------------------- Reversi */

function Reversi({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const twoP = mode === '2p';
  const p1 = names.p1, p2 = names.p2;
  const e1 = (emojis && emojis.p1) ? emojis.p1 + ' ' : '', e2 = (emojis && emojis.p2) ? emojis.p2 + ' ' : '';
  const [board, setBoard] = useState<number[]>(() => REV.initBoard());
  const [showSaved, setShowSaved] = useState(false);
  const [turn, setTurn] = useState(1);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0, draw: 0});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const c = REV.counts(board);
  const nameFor = (p: number) => twoP ? ((emojis && (emojis as any)['p' + p] ? (emojis as any)['p' + p] + ' ' : '') + (p === 1 ? p1 : p2)) : (p === 1 ? 'You' : 'SuperFun');
  const newGame = () => { if (timer.current) clearTimeout(timer.current); setBoard(REV.initBoard()); setTurn(1); setBusy(false); setEnd(null); };

  const finish = (nb: number[]) => {
    onDelete(RESUME_KEY);
    const cc = REV.counts(nb);
    if (cc.p1 === cc.p2) { setEnd({msg: DRAW_MSGS[idx.current.draw++ % DRAW_MSGS.length]}); return; }
    const p1won = cc.p1 > cc.p2;
    if (twoP) setEnd({msg: `${p1won ? nameFor(1) : nameFor(2)} wins ${Math.max(cc.p1, cc.p2)}–${Math.min(cc.p1, cc.p2)}! 🎉`});
    else setEnd({msg: p1won ? WIN_MSGS[idx.current.win++ % WIN_MSGS.length] : LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length]});
  };
  const nextTurn = (nb: number[], moved: number) => { const other = REV.opp(moved); return REV.legalMoves(nb, other).length ? other : moved; };
  const commit = (nb: number[], moved: number) => {
    setBoard(nb);
    if (REV.isOver(nb)) { finish(nb); return; }
    const nt = nextTurn(nb, moved);
    setTurn(nt);
    if (!twoP && nt === 2) aiRespond(nb);
  };
  const aiRespond = (nb: number[]) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      const m = REV.aiMove(nb, 2, diff);
      const nb2 = m >= 0 ? REV.applyMove(nb, m, 2) : nb;
      setBusy(false);
      commit(nb2, 2);
    }, 400);
  };
  const tap = (i: number) => {
    if (busy || end) return;
    if (!twoP && turn !== 1) return;
    if (board[i] !== 0 || REV.flipsFor(board, i, turn).length === 0) return;
    commit(REV.applyMove(board, i, turn), turn);
  };

  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.board) || d.board.length !== 64) return;
    const nb = d.board.slice(), t = d.turn === 2 ? 2 : 1;
    setBoard(nb); setTurn(t); setBusy(false); setEnd(null); setShowSaved(false);
    if (!twoP && t === 2 && !REV.isOver(nb)) aiRespond(nb); // solo game loaded on the AI's turn → let it move
  };
  useResume(() => resumeSave('reversi', diff, !end && !busy && (c.p1 + c.p2) > 4 && (twoP || turn === 1), twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, {board, turn}));
  const saveNow = () => onSave({game: 'reversi', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, data: {board, turn}});
  const legal = useMemo(() => (!busy && !end) ? new Set(REV.legalMoves(board, turn)) : new Set<number>(), [board, turn, busy, end]);
  const status = end ? '' : busy ? 'SuperFun is thinking…' : (twoP ? `${nameFor(turn)}'s turn (${turn === 1 ? '●' : '○'})` : 'Your turn');
  const CELL = bigCell(8);

  return (
    <View style={s.container}>
      <GameHeader title="Reversi" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />
      <Text style={s.tttLegend}>{nameFor(1)} = <Text style={s.bold}>●</Text> {c.p1} · {nameFor(2)} = <Text style={s.bold}>○</Text> {c.p2}</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>{end ? null : <Text style={twoP ? s.turnBig : s.statusBig}>{status}</Text>}</View>
        <View style={{position: 'relative', alignSelf: 'center'}}>
          <View style={s.rvBoard}>
            {Array.from({length: 8}).map((_, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {Array.from({length: 8}).map((_, col) => {
                  const i = r * 8 + col, v = board[i];
                  return (
                    <Pressable key={col} onPress={() => tap(i)} style={{width: CELL, height: CELL, borderWidth: StyleSheet.hairlineWidth, borderColor: '#999999', alignItems: 'center', justifyContent: 'center'}}>
                      {v === 1 ? <View style={{width: CELL * 0.74, height: CELL * 0.74, borderRadius: CELL * 0.37, backgroundColor: INK}} />
                        : v === 2 ? <View style={{width: CELL * 0.74, height: CELL * 0.74, borderRadius: CELL * 0.37, backgroundColor: PAPER, borderWidth: 2, borderColor: INK}} />
                        : legal.has(i) ? <View style={{width: CELL * 0.2, height: CELL * 0.2, borderRadius: CELL * 0.1, backgroundColor: '#888888'}} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
        </View>
        <View style={s.belowZone}>{end ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>Play again ▸</Text></Pressable> : null}</View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="reversi" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------- Checkers */

function Checkers({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const twoP = mode === '2p';
  const p1 = names.p1, p2 = names.p2;
  const e1 = (emojis && emojis.p1) ? emojis.p1 + ' ' : '', e2 = (emojis && emojis.p2) ? emojis.p2 + ' ' : '';
  const [board, setBoard] = useState<number[]>(() => CK.initBoard());
  const [showSaved, setShowSaved] = useState(false);
  const [turn, setTurn] = useState(1);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const newGame = () => { if (timer.current) clearTimeout(timer.current); setBoard(CK.initBoard()); setTurn(1); setSel(null); setBusy(false); setEnd(null); };
  const nameFor = (p: number) => twoP ? ((emojis && (emojis as any)['p' + p] ? (emojis as any)['p' + p] + ' ' : '') + (p === 1 ? p1 : p2)) : (p === 1 ? 'You' : 'SuperFun');

  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.board) || d.board.length !== CK.initBoard().length) return;
    const nb = d.board.slice(), t = d.turn === 2 ? 2 : 1;
    setBoard(nb); setTurn(t); setSel(null); setBusy(false); setEnd(null); setShowSaved(false);
    if (!twoP && t === 2) aiRespond(nb); // solo game loaded on the AI's turn → let it move
  };
  useResume(() => { const init = CK.initBoard(); const started = board.some((v, i) => v !== init[i]); return resumeSave('checkers', diff, !end && !busy && started && (twoP || turn === 1), twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, {board, turn}); });
  const saveNow = () => onSave({game: 'checkers', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, data: {board, turn}});
  const moves = useMemo(() => (!busy && !end) ? CK.legalMoves(board, turn) : [], [board, turn, busy, end]);
  const movable = new Set(moves.map((m: any) => m.from));
  const selMoves = sel !== null ? moves.filter((m: any) => m.from === sel) : [];
  const destSet = new Set(selMoves.map((m: any) => m.to));

  const finishWin = (winner: number) => {
    onDelete(RESUME_KEY);
    if (twoP) setEnd({msg: `${nameFor(winner)} wins! 🎉`});
    else setEnd({msg: winner === 1 ? WIN_MSGS[idx.current.win++ % WIN_MSGS.length] : LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length]});
  };
  const commit = (nb: number[], moved: number) => {
    setBoard(nb); setSel(null);
    if (CK.legalMoves(nb, CK.opp(moved)).length === 0) { finishWin(moved); return; }
    const nt = CK.opp(moved);
    setTurn(nt);
    if (!twoP && nt === 2) aiRespond(nb);
  };
  const aiRespond = (nb: number[]) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      const m = CK.aiMove(nb, 2, diff);
      setBusy(false);
      if (m) commit(CK.applyMove(nb, m), 2); else finishWin(1);
    }, 400);
  };
  const tap = (i: number) => {
    if (busy || end) return;
    if (!twoP && turn !== 1) return;
    if (CK.owner(board[i]) === turn) { setSel(sel === i ? null : i); return; }
    if (sel !== null && destSet.has(i)) {
      const mv = selMoves.find((m: any) => m.to === i);
      if (mv) commit(CK.applyMove(board, mv), turn);
    }
  };

  const status = end ? '' : busy ? 'SuperFun is thinking…' : (twoP ? `${nameFor(turn)}'s turn (${turn === 1 ? '●' : '○'})` : 'Your turn');
  const CELL = bigCell(8);

  return (
    <View style={s.container}>
      <GameHeader title="Checkers" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />
      <Text style={s.tttLegend}>{nameFor(1)} = <Text style={s.bold}>●</Text> · {nameFor(2)} = <Text style={s.bold}>○</Text> · captures are forced</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>{end ? null : <Text style={twoP ? s.turnBig : s.statusBig}>{status}</Text>}</View>
        <View style={{position: 'relative', alignSelf: 'center'}}>
          <View style={s.ckBoard}>
            {Array.from({length: 8}).map((_, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {Array.from({length: 8}).map((_, col) => {
                  const i = r * 8 + col, v = board[i];
                  const dark = (r + col) % 2 === 1;
                  const you = v === 1 || v === 3, king = v === 3 || v === 4;
                  const bg = !dark ? PAPER : destSet.has(i) ? SQ_DEST : sel === i ? SQ_SEL : (sel === null && movable.has(i)) ? SQ_MOVE : SQ_DARK;
                  return (
                    <Pressable key={col} onPress={() => (dark ? tap(i) : undefined)} style={{width: CELL, height: CELL, backgroundColor: bg, alignItems: 'center', justifyContent: 'center'}}>
                      {v ? (
                        <View style={{width: CELL * 0.72, height: CELL * 0.72, borderRadius: CELL * 0.36, backgroundColor: you ? INK : PAPER, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center'}}>
                          {king ? <View style={{width: CELL * 0.26, height: CELL * 0.26, borderRadius: CELL * 0.13, borderWidth: 2, borderColor: you ? PAPER : INK}} /> : null}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
        </View>
        <View style={s.belowZone}>{end ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>Play again ▸</Text></Pressable> : null}</View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="checkers" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ----------------------------------------------- Dames (10×10 draughts) */

function Dames({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const twoP = mode === '2p';
  const p1 = names.p1, p2 = names.p2;
  const e1 = (emojis && emojis.p1) ? emojis.p1 + ' ' : '', e2 = (emojis && emojis.p2) ? emojis.p2 + ' ' : '';
  const [board, setBoard] = useState<number[]>(() => DAMES.initBoard());
  const [showSaved, setShowSaved] = useState(false);
  const [turn, setTurn] = useState(1);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const newGame = () => { if (timer.current) clearTimeout(timer.current); setBoard(DAMES.initBoard()); setTurn(1); setSel(null); setBusy(false); setEnd(null); };
  const nameFor = (p: number) => twoP ? ((emojis && (emojis as any)['p' + p] ? (emojis as any)['p' + p] + ' ' : '') + (p === 1 ? p1 : p2)) : (p === 1 ? 'You' : 'SuperFun');

  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.board) || d.board.length !== DAMES.initBoard().length) return;
    const nb = d.board.slice(), t = d.turn === 2 ? 2 : 1;
    setBoard(nb); setTurn(t); setSel(null); setBusy(false); setEnd(null); setShowSaved(false);
    if (!twoP && t === 2) aiRespond(nb); // solo game loaded on the AI's turn → let it move
  };
  useResume(() => { const init = DAMES.initBoard(); const started = board.some((v, i) => v !== init[i]); return resumeSave('dames', diff, !end && !busy && started && (twoP || turn === 1), twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, {board, turn}); });
  const saveNow = () => onSave({game: 'dames', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: twoP ? `${p1} vs ${p2}` : `vs SuperFun (${DIFFICULTIES[diff].label})`, data: {board, turn}});
  const moves = useMemo(() => (!busy && !end) ? DAMES.legalMoves(board, turn) : [], [board, turn, busy, end]);
  const movable = new Set(moves.map((m: any) => m.from));
  const selMoves = sel !== null ? moves.filter((m: any) => m.from === sel) : [];
  const destSet = new Set(selMoves.map((m: any) => m.to));

  const finishWin = (winner: number) => {
    onDelete(RESUME_KEY);
    if (twoP) setEnd({msg: `${nameFor(winner)} wins! 🎉`});
    else setEnd({msg: winner === 1 ? WIN_MSGS[idx.current.win++ % WIN_MSGS.length] : LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length]});
  };
  const commit = (nb: number[], moved: number) => {
    setBoard(nb); setSel(null);
    if (DAMES.legalMoves(nb, DAMES.opp(moved)).length === 0) { finishWin(moved); return; }
    const nt = DAMES.opp(moved);
    setTurn(nt);
    if (!twoP && nt === 2) aiRespond(nb);
  };
  const aiRespond = (nb: number[]) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      const m = DAMES.aiMove(nb, 2, diff);
      setBusy(false);
      if (m) commit(DAMES.applyMove(nb, m), 2); else finishWin(1);
    }, 400);
  };
  const tap = (i: number) => {
    if (busy || end) return;
    if (!twoP && turn !== 1) return;
    if (DAMES.owner(board[i]) === turn) { setSel(sel === i ? null : i); return; }
    if (sel !== null && destSet.has(i)) {
      const mv = selMoves.find((m: any) => m.to === i);
      if (mv) commit(DAMES.applyMove(board, mv), turn);
    }
  };

  const status = end ? '' : busy ? 'SuperFun is thinking…' : (twoP ? `${nameFor(turn)}'s turn (${turn === 1 ? '●' : '○'})` : 'Your turn');
  const CELL = bigCell(10);

  return (
    <View style={s.container}>
      <GameHeader title="Dames" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />
      <Text style={s.tttLegend}>{nameFor(1)} = <Text style={s.bold}>●</Text> · {nameFor(2)} = <Text style={s.bold}>○</Text> · take the most captures</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>{end ? null : <Text style={twoP ? s.turnBig : s.statusBig}>{status}</Text>}</View>
        <View style={{position: 'relative', alignSelf: 'center'}}>
          <View style={s.ckBoard}>
            {Array.from({length: 10}).map((_, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {Array.from({length: 10}).map((_, col) => {
                  const i = r * 10 + col, v = board[i];
                  const dark = (r + col) % 2 === 1;
                  const you = v === 1 || v === 3, king = v === 3 || v === 4;
                  const bg = !dark ? PAPER : destSet.has(i) ? SQ_DEST : sel === i ? SQ_SEL : (sel === null && movable.has(i)) ? SQ_MOVE : SQ_DARK;
                  return (
                    <Pressable key={col} onPress={() => (dark ? tap(i) : undefined)} style={{width: CELL, height: CELL, backgroundColor: bg, alignItems: 'center', justifyContent: 'center'}}>
                      {v ? (
                        <View style={{width: CELL * 0.74, height: CELL * 0.74, borderRadius: CELL * 0.37, backgroundColor: you ? INK : PAPER, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center'}}>
                          {king ? <View style={{width: CELL * 0.34, height: CELL * 0.34, borderRadius: CELL * 0.17, borderWidth: 2, borderColor: you ? PAPER : INK, alignItems: 'center', justifyContent: 'center'}}><View style={{width: CELL * 0.12, height: CELL * 0.12, borderRadius: CELL * 0.06, backgroundColor: you ? PAPER : INK}} /></View> : null}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
        </View>
        <View style={s.belowZone}>{end ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>Play again ▸</Text></Pressable> : null}</View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="dames" onClose={() => setRules(false)} /> : null}
    </View>
  );
}
/* --------------------------------------------------------- Dots & Boxes */

function DotsBoxes({diff, mode, names, emojis, onMenu, players: propPlayers, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; players?: number; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const isAI = mode === 'ai', twoP = mode === '2p', multi = mode === 'multi';
  const players = isAI ? 2 : multi ? (propPlayers || 3) : 2;
  const R = diff === 'easy' ? 3 : diff === 'hard' ? 5 : 4, C = R;
  const [st, setSt] = useState(() => DOTS.initState(R, C));
  const [showSaved, setShowSaved] = useState(false);
  const [turn, setTurn] = useState(1);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = useRef({win: 0, lose: 0});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const newGame = () => { if (timer.current) clearTimeout(timer.current); setSt(DOTS.initState(R, C)); setTurn(1); setBusy(false); setEnd(null); };

  const nameFor = (p: number) => isAI ? (p === 1 ? 'You' : 'SuperFun') : ((names as any)['p' + p] || `Player ${p}`);
  const initial = (p: number) => isAI ? (p === 1 ? 'Y' : 'S') : nameFor(p).charAt(0).toUpperCase();
  // If two players share an initial, fall back to their number; also tint each owner's box differently.
  const marks = Array.from({length: players}, (_, i) => initial(i + 1));
  const dupMarks = marks.some((m, i) => marks.indexOf(m) !== i);
  const emj = (p: number) => (emojis && (emojis as any)['p' + p]) || '';
  const boxMark = (p: number) => emj(p) || (dupMarks ? String(p) : initial(p));
  const pShade = (p: number) => ['#E6E6E6', '#C2C2C2', '#A0A0A0', '#828282'][(p - 1) % 4];
  const sc = DOTS.scores(st) as {[k: number]: number};

  const finish = (state: any) => {
    const s2 = DOTS.scores(state) as {[k: number]: number};
    if (isAI) {
      const a = s2[1] || 0, b = s2[2] || 0;
      if (a === b) setEnd({msg: `It's a tie — ${a} each!`});
      else setEnd({msg: a > b ? WIN_MSGS[idx.current.win++ % WIN_MSGS.length] : LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length]});
      return;
    }
    let max = -1;
    for (let p = 1; p <= players; p++) { const v = s2[p] || 0; if (v > max) max = v; }
    const winners: number[] = [];
    for (let p = 1; p <= players; p++) if ((s2[p] || 0) === max) winners.push(p);
    setEnd({msg: winners.length > 1 ? `It's a tie — ${max} each!` : `${emj(winners[0]) || boxMark(winners[0])} ${nameFor(winners[0])} wins with ${max}! 🎉`});
  };
  const scheduleAI = (state: any) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      const e = DOTS.aiEdge(state, Math.random);
      setBusy(false);
      if (e) play(e.kind, e.idx, 2, state); // apply onto the SAME board the AI just read, not the stale closure
    }, 400);
  };
  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!d.st || d.R !== R || d.C !== C) return;
    setSt(DOTS.clone(d.st)); setTurn(d.turn || 1); setBusy(false); setEnd(null); setShowSaved(false);
  };
  useResume(() => { const fresh = JSON.stringify(st) === JSON.stringify(DOTS.initState(R, C)); return resumeSave('dots', diff, !end && !busy && !fresh && (!isAI || turn === 1), isAI ? `vs SuperFun (${DIFFICULTIES[diff].label})` : `${players} players`, {st, turn, R, C}); });
  const saveNow = () => onSave({game: 'dots', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: isAI ? `vs SuperFun (${DIFFICULTIES[diff].label})` : `${players} players`, data: {st, turn, R, C}});
  const play = (kind: string, i: number, by: number, base: any = st) => {
    const ns = DOTS.clone(base);
    const done = DOTS.applyEdge(ns, kind, i, by);
    setSt(ns);
    if (DOTS.isOver(ns)) { onDelete(RESUME_KEY); finish(ns); return; }
    if (done > 0) { if (isAI && by === 2) scheduleAI(ns); return; } // completed a box → same player again
    const nt = (by % players) + 1;
    setTurn(nt);
    if (isAI && nt === 2) scheduleAI(ns);
  };
  const tapEdge = (kind: string, i: number) => {
    if (busy || end) return;
    if (DOTS.has(st, kind, i)) return;
    if (isAI && turn !== 1) return;
    play(kind, i, turn);
  };

  const status = end ? '' : busy ? 'SuperFun is thinking…' : (multi ? `${emj(turn) ? emj(turn) + ' ' : ''}${nameFor(turn)}'s turn` : `${nameFor(turn)}'s turn · ${sc[1] || 0}–${sc[2] || 0}`);
  const EDGE = 14;
  const avail = Math.min(SCREEN_W - 24, 460);
  const cellLen = Math.max(26, Math.floor((avail - (C + 1) * EDGE) / C));
  const hs = Math.round(cellLen * 0.42); // hit-slop: enlarge the thin edge touch target

  return (
    <View style={s.container}>
      <GameHeader title="Dots & Boxes" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />

      <Text style={s.tttLegend}>{multi ? Array.from({length: players}).map((_, i) => `${nameFor(i + 1)} (${boxMark(i + 1)})`).join(' · ') : `${nameFor(1)} (${boxMark(1)}) vs ${nameFor(2)} (${boxMark(2)})`} · close a box to go again</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>{end ? null : <Text style={!isAI ? s.turnBig : s.statusBig}>{status}</Text>}</View>
        <View style={{position: 'relative', alignSelf: 'center'}}>
          <View style={s.dotsWrap}>
            {Array.from({length: 2 * R + 1}).map((_, rr) => (
              <View key={rr} style={{flexDirection: 'row'}}>
                {Array.from({length: 2 * C + 1}).map((_, cc) => {
                  const evenR = rr % 2 === 0, evenC = cc % 2 === 0;
                  if (evenR && evenC) return <View key={cc} style={{width: EDGE, height: EDGE, alignItems: 'center', justifyContent: 'center'}}><View style={{width: EDGE * 0.55, height: EDGE * 0.55, borderRadius: EDGE * 0.3, backgroundColor: INK}} /></View>;
                  if (evenR && !evenC) {
                    const hi = (rr / 2) * C + (cc - 1) / 2, on = st.h[hi];
                    return <Pressable key={cc} onPress={() => tapEdge('h', hi)} hitSlop={{top: hs, bottom: hs, left: 0, right: 0}} style={{width: cellLen, height: EDGE, alignItems: 'center', justifyContent: 'center'}}><View style={{width: cellLen - 4, height: on ? 4 : 2, backgroundColor: on ? INK : '#CFCFCF'}} /></Pressable>;
                  }
                  if (!evenR && evenC) {
                    const vi = ((rr - 1) / 2) * (C + 1) + cc / 2, on = st.v[vi];
                    return <Pressable key={cc} onPress={() => tapEdge('v', vi)} hitSlop={{left: hs, right: hs, top: 0, bottom: 0}} style={{width: EDGE, height: cellLen, alignItems: 'center', justifyContent: 'center'}}><View style={{width: on ? 4 : 2, height: cellLen - 4, backgroundColor: on ? INK : '#CFCFCF'}} /></Pressable>;
                  }
                  const bi = ((rr - 1) / 2) * C + (cc - 1) / 2, own = st.owner[bi];
                  return <View key={cc} style={{width: cellLen, height: cellLen, alignItems: 'center', justifyContent: 'center', backgroundColor: own ? pShade(own) : 'transparent'}}>{own ? <Text style={{fontSize: cellLen * 0.42, fontWeight: '800', color: INK}}>{boxMark(own)}</Text> : null}</View>;
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
        </View>
        <View style={s.belowZone}>
          {end
            ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>Play again ▸</Text></Pressable>
            : (multi ? (
              <View style={s.memScoreRow}>
                {Array.from({length: players}).map((_, i) => (
                  <View key={i} style={[s.scoreCard, turn === i + 1 && s.scoreCardOn]}>
                    <Text style={s.scoreWho} numberOfLines={1}>{emj(i + 1) || boxMark(i + 1)} {nameFor(i + 1)}</Text>
                    <Text style={s.mpNum}>{sc[i + 1] || 0}</Text>
                  </View>
                ))}
              </View>
            ) : null)}
        </View>
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="dots" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ Pig */

/* ----------------------------------------------------------- Dice Roller */

function Dice({onMenu}: {onMenu: () => void}): React.JSX.Element {
  const roll1 = () => 1 + Math.floor(Math.random() * 6);
  const [n, setN] = useState(2);
  const [vals, setVals] = useState<number[]>(() => Array.from({length: 2}, roll1));
  const [rolling, setRolling] = useState(false);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setCount = (c: number) => { if (rolling) return; setN(c); setVals(Array.from({length: c}, roll1)); };
  const roll = () => {
    if (rolling) return;
    setRolling(true);
    let ticks = 0;
    const step = () => {
      setVals(Array.from({length: n}, roll1));
      ticks++;
      if (ticks < 7) timer.current = setTimeout(step, 55);
      else setRolling(false);
    };
    step();
  };
  const total = vals.reduce((a, b) => a + b, 0);
  const die = n <= 2 ? 120 : n <= 4 ? 96 : 78;

  return (
    <View style={s.container}>
      <GameHeader title="Dice Roller" onMenu={onMenu} onRules={() => setRules(true)} />

      <View style={s.diceCountRow}>
        <Text style={s.memCardsLbl}>Dice</Text>
        {[1, 2, 3, 4, 5, 6].map(c => (
          <Pressable key={c} onPress={() => setCount(c)} style={[s.segBtn, n === c && s.segOn]}>
            <Text style={[s.segTxt, n === c && s.solidText]}>{c}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20}}>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, maxWidth: SCREEN_W - 30}}>
          {vals.map((v, i) => <DieFace key={i} n={v} size={die} color={INK} />)}
        </View>
        <Text style={s.diceTotal}>Total: {total}</Text>
        <Pressable style={[s.playBtn, {paddingHorizontal: 40}]} onPress={roll}>
          <Text style={s.playText}>🎲 Roll{rolling ? '…' : ''}</Text>
        </Pressable>
      </View>

      {rules ? <RulesModal game="dice" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

function Pig({onMenu, names, emojis, players: propPlayers, saves, onSave, onDelete}: {onMenu: () => void; names?: Names; emojis?: Names; players?: number; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const TARGET = 100;
  const players = propPlayers || 2;
  const [scores, setScores] = useState<number[]>(() => new Array(players).fill(0));
  const [turn, setTurn] = useState(0);
  const [turnTotal, setTurnTotal] = useState(0);
  const [die, setDie] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [msg, setMsg] = useState('');
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const nameFor = (i: number) => (names && (names as any)['p' + (i + 1)]) ? (names as any)['p' + (i + 1)] : `Player ${i + 1}`;
  const tokenFor = (p1based: number) => (emojis && (emojis as any)['p' + p1based]) || String(p1based);
  const newGame = () => { if (timer.current) clearTimeout(timer.current); setScores(new Array(players).fill(0)); setTurn(0); setTurnTotal(0); setDie(1); setRolling(false); setMsg(''); setEnd(null); };
  const nextTurn = () => { setTurnTotal(0); setTurn(t => (t + 1) % players); };
  const [showSaved, setShowSaved] = useState(false);
  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.scores) || d.scores.length !== players) return;
    setScores(d.scores.slice()); setTurn(d.turn || 0); setTurnTotal(d.turnTotal || 0); setDie(d.die || 1); setRolling(false); setMsg(''); setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('pig', 'medium', !end && !rolling && (turnTotal > 0 || scores.some(v => v > 0)), `${players} players`, {scores, turn, turnTotal, die, players}));
  const saveNow = () => onSave({game: 'pig', key: String(Date.now()).slice(-6), ts: Date.now(), diff: 'medium', label: `${players} players`, data: {scores, turn, turnTotal, die, players}});

  const roll = () => {
    if (rolling || end) return;
    setRolling(true); setMsg('');
    timer.current = setTimeout(() => {
      const d = 1 + Math.floor(Math.random() * 6);
      setDie(d); setRolling(false);
      if (d === 1) { setMsg('Rolled a 1 — turn lost!'); nextTurn(); }
      else setTurnTotal(t => t + d);
    }, 350);
  };
  const hold = () => {
    if (rolling || end || turnTotal === 0) return;
    const ns = scores.slice(); ns[turn] += turnTotal; setScores(ns);
    if (ns[turn] >= TARGET) { onDelete(RESUME_KEY); setEnd({msg: `${tokenFor(turn + 1)} ${nameFor(turn)} wins with ${ns[turn]}! 🎉`}); return; }
    setMsg(''); nextTurn();
  };

  return (
    <View style={s.container}>
      <GameHeader title="Pig" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />

      <Text style={s.tttLegend}>{Array.from({length: players}).map((_, i) => `${tokenFor(i + 1)} ${nameFor(i)}`).join(' · ')} · first to 100</Text>

      <View style={{flex: 1, position: 'relative'}}>
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16}}>
          <Text style={s.turnBig}>{end ? '' : (msg || `${tokenFor(turn + 1)} ${nameFor(turn)}'s turn`)}</Text>
          <DieFace n={die} size={112} />
          <Text style={s.pigTotal}>Turn total: {turnTotal}</Text>
          {end
            ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>New game ▸</Text></Pressable>
            : (
              <View style={{flexDirection: 'row', gap: 14}}>
                <Pressable style={[s.pigBtn, rolling && s.mmSubmitOff]} onPress={roll}><Text style={s.pigBtnTxt}>Roll</Text></Pressable>
                <Pressable style={[s.pigBtn, turnTotal === 0 && s.mmSubmitOff]} onPress={hold}><Text style={s.pigBtnTxt}>Hold</Text></Pressable>
              </View>
            )}
        </View>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>

      <View style={[s.memScoreRow, {paddingVertical: 8}]}>
        {Array.from({length: players}).map((_, i) => (
          <View key={i} style={[s.scoreCard, turn === i && s.scoreCardOn]}>
            <Text style={s.scoreWho} numberOfLines={1}>{tokenFor(i + 1)} {nameFor(i)}</Text>
            <Text style={s.mpNum}>{scores[i] || 0}</Text>
          </View>
        ))}
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="pig" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------ Snakes & Ladders */

const SNL_LADDER_LINES = [
  {e: '🪜', t: 'Up you go! Someone left a ladder right here.'},
  {e: '🚀', t: 'Whoosh! Express elevator to the top.'},
  {e: '🎈', t: 'Hold on tight — free ride upward!'},
  {e: '🧗', t: 'Nice climb! Gravity took the day off.'},
  {e: '🦸', t: 'Super-jump! No cape required.'},
  {e: '🍀', t: 'Lucky rungs — you skipped way ahead!'},
  {e: '⛅', t: 'Straight to the clouds. Enjoy the view!'},
  {e: '🎁', t: "Surprise boost — that's a keeper."},
];
const SNL_SNAKE_LINES = [
  {e: '🐍', t: 'Sssso close… down you slide!'},
  {e: '🍌', t: 'Slipped on a snake — back you go.'},
  {e: '😅', t: 'Oops! That snake had other plans.'},
  {e: '🕳️', t: 'Gulp! The snake swallowed your progress.'},
  {e: '🎢', t: 'Down the chute! Better luck next roll.'},
  {e: '🧦', t: 'The snake ate your lead. Rude.'},
  {e: '💨', t: 'Slip-slide away — see you back down there.'},
  {e: '🙈', t: "Don't look down… too late."},
];
function Snakes({onMenu, names, emojis, players: propPlayers, saves, onSave, onDelete}: {onMenu: () => void; names?: Names; emojis?: Names; players?: number; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const players = propPlayers || 2;
  const [pos, setPos] = useState<number[]>(() => new Array(players).fill(0));
  const [turn, setTurn] = useState(0);
  const [die, setDie] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [msg, setMsg] = useState('');
  const [hl, setHl] = useState<number | null>(null); // cell being animated / highlighted
  const [pop, setPop] = useState<{e: string; t: string; after: number} | null>(null); // snake/ladder popup (tap Continue to slide)
  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const nameFor = (i: number) => (names && (names as any)['p' + (i + 1)]) ? (names as any)['p' + (i + 1)] : `Player ${i + 1}`;
  const tokenFor = (p1based: number) => (emojis && (emojis as any)['p' + p1based]) || String(p1based);
  const newGame = () => { if (timer.current) clearTimeout(timer.current); setPos(new Array(players).fill(0)); setTurn(0); setDie(1); setRolling(false); setMsg(''); setHl(null); setPop(null); setEnd(null); };
  const [showSaved, setShowSaved] = useState(false);
  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!Array.isArray(d.pos) || d.pos.length !== players) return;
    setPos(d.pos.slice()); setTurn(d.turn || 0); setDie(d.die || 1); setRolling(false); setMsg(''); setHl(null); setPop(null); setEnd(null); setShowSaved(false);
  };
  useResume(() => resumeSave('snakes', 'medium', !end && !rolling && pos.some(v => v > 0), `${players} players`, {pos, turn, die, players}));
  const saveNow = () => onSave({game: 'snakes', key: String(Date.now()).slice(-6), ts: Date.now(), diff: 'medium', label: `${players} players`, data: {pos, turn, die, players}});

  const finishTurn = (landed: number) => {
    setHl(null); setRolling(false);
    if (landed === 100) { onDelete(RESUME_KEY); setEnd({msg: `${tokenFor(turn + 1)} ${nameFor(turn)} wins! 🎉`}); }
    else setTurn(t => (t + 1) % players);
  };
  const roll = () => {
    if (rolling || end) return;
    setRolling(true); setMsg(''); setHl(null);
    timer.current = setTimeout(() => {
      const d = 1 + Math.floor(Math.random() * 6);
      setDie(d);
      const from = pos[turn], target = from + d;
      if (target > 100) { setMsg(`Rolled ${d} — need exactly ${100 - from}, stay put`); setRolling(false); setTurn(t => (t + 1) % players); return; }
      const np = pos.slice(); np[turn] = target; setPos(np); setHl(target); // step 1: land on the square
      const after = SNL.resolve(target);
      if (after === target) { setMsg(`Rolled ${d} → ${target}`); timer.current = setTimeout(() => finishTurn(target), 450); return; }
      const up = after > target;
      setMsg(up ? `Rolled ${d} → ${target}, ladder up ${target}→${after}! ↑` : `Rolled ${d} → ${target}, snake down ${target}→${after} ↓`);
      const pool = up ? SNL_LADDER_LINES : SNL_SNAKE_LINES;
      const line = pool[target % pool.length];
      setPop({e: line.e, t: line.t, after}); // pause on the trigger cell; slide runs on Continue
    }, 300);
  };
  const continueSlide = () => {
    if (!pop) return;
    const after = pop.after; setPop(null); setHl(after);
    setPos(prev => { const np2 = prev.slice(); np2[turn] = after; return np2; });
    timer.current = setTimeout(() => finishTurn(after), 1000);
  };

  const CELL = fitCell(10, 10, 250, 96);

  return (
    <View style={s.container}>
      <GameHeader title="Snakes & Ladders" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />

      <Text style={s.tttLegend}>{Array.from({length: players}).map((_, i) => `${tokenFor(i + 1)} ${nameFor(i)}`).join(' · ')} · race to 100</Text>

      <View style={s.msgZone}>{end ? null : <Text style={s.turnBig}>{msg || `${tokenFor(turn + 1)} ${nameFor(turn)}'s turn`}</Text>}</View>

      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <View style={{position: 'relative'}}>
          <View style={{borderWidth: 2, borderColor: INK}}>
            {Array.from({length: 10}).map((_, r) => (
              <View key={r} style={{flexDirection: 'row'}}>
                {Array.from({length: 10}).map((_, c) => {
                  const n = SNL.squareNum(r, c);
                  const dest = (SNL.LADDERS as any)[n], destS = (SNL.SNAKES as any)[n];
                  const lad = dest !== undefined, sn = destS !== undefined;
                  const here: number[] = [];
                  for (let p = 0; p < players; p++) if (pos[p] === n) here.push(p + 1);
                  const isMove = hl === n; // animated landing/slide — strong
                  const isTurn = n > 0 && !rolling && !end && !pop && hl === null && pos[turn] === n; // whose-turn — grey frame only
                  return (
                    <View key={c} style={{width: CELL, height: CELL, borderWidth: isMove || isTurn ? 2.5 : StyleSheet.hairlineWidth, borderColor: isMove ? INK : isTurn ? MUTE : '#BBBBBB', backgroundColor: isMove ? '#B4B4B4' : lad ? '#E6E6E6' : sn ? '#F4F4F4' : PAPER, alignItems: 'center', justifyContent: 'center'}}>
                      <Text style={{position: 'absolute', top: 1, left: 2, fontSize: CELL * 0.2, color: '#999999'}}>{n}</Text>
                      {lad || sn ? <Text style={{fontSize: CELL * 0.32, fontWeight: '900', color: INK}}>{lad ? `↑${dest}` : `↓${destS}`}</Text> : null}
                      {here.length ? <Text style={{position: 'absolute', bottom: 0, right: 2, fontSize: CELL * 0.46, fontWeight: '900', color: INK}}>{here.map((pp: number) => tokenFor(pp)).join('')}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
          {end ? <EndOverlay text={end.msg} /> : null}
          {pop ? (
            <View style={[StyleSheet.absoluteFill, {alignItems: 'center', justifyContent: 'center'}]}>
              <View style={s.snPop}>
                <Text style={s.snPopEmoji}>{pop.e}</Text>
                <Text style={s.snPopText}>{pop.t}</Text>
                <Pressable style={[s.playAgainBtn, {paddingVertical: 12, marginTop: 12}]} onPress={continueSlide}><Text style={s.playText}>Continue ▸</Text></Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12}}>
        <DieFace n={die} size={52} />
        {end
          ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>New game ▸</Text></Pressable>
          : <Pressable style={[s.pigBtn, rolling && s.mmSubmitOff]} onPress={roll}><Text style={s.pigBtnTxt}>Roll</Text></Pressable>}
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="snakes" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------- Records */

const BEST_GAMES: GameKey[] = ['2048', 'taquin', 'mm', 'peg', 'memory', 'sudoku'];

function MiniPic({rows, box, color}: {rows: string[]; box?: number; color?: string}): React.JSX.Element {
  const n = rows.length, cell = Math.max(2, Math.floor((box || 30) / n)), col = color || INK;
  return (
    <View>
      {rows.map((r, ri) => (
        <View key={ri} style={{flexDirection: 'row'}}>
          {r.split('').map((ch, ci) => <View key={ci} style={{width: cell, height: cell, backgroundColor: ch === '#' ? col : 'transparent'}} />)}
        </View>
      ))}
    </View>
  );
}

// The 15-Puzzle goal image WITH tile-boundary gridlines, so you see how it splits.
function TargetPic({rows, size, box}: {rows: string[]; size: number; box: number}): React.JSX.Element {
  const n = rows.length, cell = Math.max(2, Math.floor(box / n)), dim = cell * n;
  const lines: React.JSX.Element[] = [];
  for (let k = 1; k < size; k++) {
    const off = Math.round((k * dim) / size);
    lines.push(<View key={'v' + k} pointerEvents="none" style={{position: 'absolute', left: off, top: 0, width: 1, height: dim, backgroundColor: '#8A8A8A'}} />);
    lines.push(<View key={'h' + k} pointerEvents="none" style={{position: 'absolute', left: 0, top: off, width: dim, height: 1, backgroundColor: '#8A8A8A'}} />);
  }
  return (
    <View style={{width: dim, height: dim, position: 'relative'}}>
      {rows.map((r, ri) => (
        <View key={ri} style={{flexDirection: 'row'}}>
          {r.split('').map((ch, ci) => <View key={ci} style={{width: cell, height: cell, backgroundColor: ch === '#' ? INK : PAPER}} />)}
        </View>
      ))}
      {lines}
    </View>
  );
}

function Records({stats, onMenu, onToggle, onReset}: {stats: any; onMenu: () => void; onToggle: () => void; onReset: () => void}): React.JSX.Element {
  const badges = STATS.computeBadges(stats, {nonoTotal: NONO_TOTAL});
  const c = stats.counters || {};
  const order: Diff[] = ['easy', 'medium', 'hard'];
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={onMenu}><Text style={s.iconText}>‹ Menu</Text></Pressable>
        <Text style={s.gameTitle}>🏆 Records</Text>
        <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
      </View>
      <Text style={s.tttLegend}>{c.plays || 0} games played in total</Text>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 20}}>
        <Pressable onPress={onToggle} style={s.toggleRow}>
          <Text style={s.toggleLbl}>Show my best scores inside games</Text>
          <View style={[s.toggle, stats.showBest && s.toggleOn]}><Text style={[s.toggleTxt, stats.showBest && s.solidText]}>{stats.showBest ? 'ON' : 'OFF'}</Text></View>
        </Pressable>

        <Text style={s.sectionLabel}>Personal bests (top 3)</Text>
        {BEST_GAMES.map(g => {
          const rows = order.map(d => ({d, arr: STATS.topOf(stats, g, d)})).filter(x => x.arr.length);
          const plays = c['plays_' + g] || 0;
          return (
            <View key={g} style={s.recCard}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                <GameIcon game={g} size={22} color={INK} />
                <Text style={s.recGame}>{GAME_META[g].label}</Text>
                <Text style={s.recMetric}>· {(STATS.BEST as any)[g].label}</Text>
                <View style={{flex: 1}} />
                <Text style={s.recMetric}>played {plays}</Text>
              </View>
              {rows.length === 0 ? <Text style={s.recEmpty}>no records yet — go play!</Text>
                : rows.map(x => <Text key={x.d} style={s.recLine}>{DIFFICULTIES[x.d].label}: <Text style={s.bold}>{x.arr.join(' · ')}</Text></Text>)}
            </View>
          );
        })}

        <Text style={s.sectionLabel}>Nonogram gallery — {stats.gallery.length}/{NONO_TOTAL} pictures</Text>
        {(['5', '8', '10'] as string[]).map(sz => (
          <View key={sz} style={{marginBottom: 10}}>
            <Text style={s.recMetric}>{sz}×{sz}</Text>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6}}>
              {(NONO.PICTURES as any)[sz].map((pic: any, i: number) => {
                const got = stats.gallery.indexOf(sz + ':' + pic.name) !== -1;
                return (
                  <View key={i} style={s.galCell}>
                    <View style={[s.galArt, got && s.galArtOn]}>
                      {got ? <MiniPic rows={pic.rows} /> : <Text style={s.galQ}>?</Text>}
                    </View>
                    <Text style={s.galName} numberOfLines={1}>{got ? pic.name : '—'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={s.sectionLabel}>Tally</Text>
        <View style={s.recCard}>
          <Text style={s.recLine}>Minefields cleared — Easy <Text style={s.bold}>{c.mines_easy || 0}</Text> · Medium <Text style={s.bold}>{c.mines_medium || 0}</Text> · Hard <Text style={s.bold}>{c.mines_hard || 0}</Text></Text>
          <Text style={s.recLine}>Word Search grids finished — <Text style={s.bold}>{c.words || 0}</Text></Text>
        </View>

        <Text style={s.sectionLabel}>Badges</Text>
        {badges.map(b => (
          <View key={b.id} style={s.badgeRow}>
            <Text style={[s.badgeMark, b.earned && s.badgeMarkOn]}>{b.earned ? '★' : '☆'}</Text>
            <View style={{flex: 1}}>
              <Text style={[s.badgeLbl, !b.earned && {color: MUTE}]}>{b.label}</Text>
              <Text style={s.badgeHint}>{b.hint}</Text>
            </View>
          </View>
        ))}

        <Pressable style={[s.resetBtn, confirmReset && s.resetBtnArmed]} onPress={() => { if (confirmReset) { onReset(); setConfirmReset(false); } else setConfirmReset(true); }}>
          <Text style={[s.resetTxt, confirmReset && s.solidText]}>{confirmReset ? 'Tap again to erase ALL records' : 'Reset all records'}</Text>
        </Pressable>
        {confirmReset ? <Pressable style={{alignSelf: 'center', padding: 8}} onPress={() => setConfirmReset(false)}><Text style={s.recMetric}>cancel</Text></Pressable> : null}
      </ScrollView>
    </View>
  );
}

/* --------------------------------------------------------- Battleship */

// One Battleship cell, memoized so a tap only re-renders the cell that changed
// (a 10×10 — or two, in 2-player — is otherwise 100–200 Pressables per tap).
const BsCell = React.memo(function BsCell({cell, v, ship, i, onTap}: {cell: number; v: number; ship: boolean; i: number; onTap: (i: number) => void}) {
  const bg = v === 3 ? INK : (ship ? '#D2D2D2' : PAPER); // 3 = cell of a SUNK ship
  return (
    <Pressable onPress={() => onTap(i)} style={{width: cell, height: cell, borderWidth: StyleSheet.hairlineWidth, borderColor: '#9A9A9A', alignItems: 'center', justifyContent: 'center', backgroundColor: bg}}>
      {v === 3 ? <Text style={{fontSize: cell * 0.6, fontWeight: '900', color: PAPER}}>✗</Text>
        : v === 2 ? <Text style={{fontSize: cell * 0.62, fontWeight: '900', color: INK}}>✗</Text>
        : v === 1 ? <View style={{width: cell * 0.4, height: cell * 0.4, borderRadius: cell * 0.2, borderWidth: 2.5, borderColor: INK, backgroundColor: PAPER}} /> : null}
    </Pressable>
  );
});
function Battleship({diff, mode, names, emojis, onMenu, saves, onSave, onDelete}: {diff: Diff; mode: Mode; names: Names; emojis?: Names; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void}): React.JSX.Element {
  const cfg = SHIP.CFG[diff];
  const size = cfg.size, N = size * size;
  const verbal = mode === '2p';
  const totalCells = SHIP.FLEET.reduce((a: number, f: any) => a + f.size, 0);

  const [enemy, setEnemy] = useState<any>(() => SHIP.placeFleet(size, SHIP.FLEET, Math.random));
  const [my, setMy] = useState<any>(() => SHIP.emptyBoard(size)); // solo: you place it · 2p paper: you mark it yourself
  const [phase, setPhase] = useState<'place' | 'battle'>(verbal ? 'battle' : 'place'); // solo: place your fleet first
  const [placeIdx, setPlaceIdx] = useState(0);
  const [horiz, setHoriz] = useState(true);
  const [youFired, setYouFired] = useState<number[]>(() => new Array(N).fill(0)); // 0 none 1 miss 2 hit
  const [aiFired, setAiFired] = useState<number[]>(() => new Array(N).fill(0));
  const aiHitsOpen = useRef<number[]>([]);
  const [turn, setTurn] = useState<'you' | 'ai'>('you');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const [incoming, setIncoming] = useState<number[]>(() => new Array(N).fill(0)); // verbal: shots called on YOUR fleet
  const [shots, setShots] = useState<number[]>(() => new Array(N).fill(0));       // verbal: your calls (1 hit / 2 miss)
  const [sunkMask, setSunkMask] = useState<boolean[]>(() => new Array(SHIP.FLEET.length).fill(false)); // verbal: enemy ships you cross off
  const toggleSunk = (i: number) => setSunkMask(m => m.map((v, k) => (k === i ? !v : v)));

  const [end, setEnd] = useState<{msg: string} | null>(null);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const serBoard = (b: any) => ({size: b.size, ship: Array.from(b.ship), ships: b.ships});
  const deBoard = (d: any) => ({size: d.size, ship: Int8Array.from(d.ship), ships: d.ships});
  const loadSave = (sv: GameSave) => {
    if (timer.current) clearTimeout(timer.current);
    const d = sv.data || {};
    if (!d.my || !d.enemy || d.my.size !== size) return;
    setEnemy(deBoard(d.enemy)); setMy(deBoard(d.my));
    setYouFired(Array.isArray(d.youFired) ? d.youFired.slice() : new Array(N).fill(0));
    setAiFired(Array.isArray(d.aiFired) ? d.aiFired.slice() : new Array(N).fill(0));
    aiHitsOpen.current = Array.isArray(d.aiHitsOpen) ? d.aiHitsOpen.slice() : [];
    setTurn('you'); setBusy(false); setFlash('');
    setIncoming(Array.isArray(d.incoming) ? d.incoming.slice() : new Array(N).fill(0));
    setShots(Array.isArray(d.shots) ? d.shots.slice() : new Array(N).fill(0));
    setSunkMask(Array.isArray(d.sunkMask) ? d.sunkMask.slice() : new Array(SHIP.FLEET.length).fill(false));
    setEnd(null); setShowSaved(false); setPhase('battle'); // a loaded game is already past placement
  };
  useResume(() => resumeSave('battle', diff, !end && !busy && (verbal ? (incoming.some(v => v) || shots.some(v => v)) : (turn === 'you' && youFired.some(v => v))), verbal ? '2-player (paper)' : `vs SuperFun (${DIFFICULTIES[diff].label})`, {verbal, enemy: serBoard(enemy), my: serBoard(my), youFired, aiFired, aiHitsOpen: aiHitsOpen.current, turn, incoming, shots, sunkMask}));
  const saveNow = () => { if (placing) return; onSave({game: 'battle', key: String(Date.now()).slice(-6), ts: Date.now(), diff, label: verbal ? '2-player (paper)' : `vs SuperFun (${DIFFICULTIES[diff].label})`, data: {verbal, enemy: serBoard(enemy), my: serBoard(my), youFired, aiFired, aiHitsOpen: aiHitsOpen.current, turn, incoming, shots, sunkMask}}); };

  const newGame = () => {
    if (timer.current) clearTimeout(timer.current);
    setEnemy(SHIP.placeFleet(size, SHIP.FLEET, Math.random));
    setMy(SHIP.emptyBoard(size));
    setYouFired(new Array(N).fill(0)); setAiFired(new Array(N).fill(0));
    aiHitsOpen.current = []; setTurn('you'); setBusy(false); setFlash('');
    setIncoming(new Array(N).fill(0)); setShots(new Array(N).fill(0)); setSunkMask(new Array(SHIP.FLEET.length).fill(false));
    setEnd(null); setPhase(verbal ? 'battle' : 'place'); setPlaceIdx(0); setHoriz(true);
  };

  // --- manual placement (solo) ---
  const placing = !verbal && phase === 'place';
  const placeAt = (idx: number) => {
    if (placeIdx >= SHIP.FLEET.length) return;
    const f = SHIP.FLEET[placeIdx];
    const cells = SHIP.tryPlaceAt(my, f.size, (idx / size) | 0, idx % size, horiz);
    if (!cells) { setFlash("Doesn't fit — ships can't touch. Rotate or pick another cell."); return; }
    const nb = {size: my.size, ship: Int8Array.from(my.ship), ships: my.ships.slice()};
    SHIP.addShip(nb, cells, f.size, f.name);
    setMy(nb); setPlaceIdx(placeIdx + 1); setFlash('');
  };
  const autoPlace = () => { setMy(SHIP.placeFleet(size, SHIP.FLEET, Math.random)); setPlaceIdx(SHIP.FLEET.length); setFlash('Fleet placed at random — tweak with Reset, or start.'); };
  const resetPlace = () => { setMy(SHIP.emptyBoard(size)); setPlaceIdx(0); setFlash(''); };
  const startBattle = () => { setPhase('battle'); setFlash(''); };

  const aiTurn = (afState: number[]) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      const pick = SHIP.aiPick(my, afState.map(v => v !== 0), aiHitsOpen.current, cfg.ai, Math.random);
      if (pick < 0) { setBusy(false); return; }
      const res = SHIP.fire(my, pick);
      const af = afState.slice(); af[pick] = res.hit ? 2 : 1;
      if (res.hit) {
        aiHitsOpen.current.push(pick);
        if (res.sunk) { const sc = my.ships[res.shipIndex].cells; for (let k = 0; k < sc.length; k++) af[sc[k]] = 3; aiHitsOpen.current = aiHitsOpen.current.filter(x => sc.indexOf(x) < 0); setFlash(`SuperFun sank your ${my.ships[res.shipIndex].name}!`); }
        else setFlash('SuperFun hit your fleet.');
      } else setFlash('SuperFun missed.');
      setAiFired(af);
      setBusy(false);
      if (SHIP.allSunk(my)) { onDelete(RESUME_KEY); setEnd({msg: 'Your whole fleet is sunk 🤖'}); return; }
      setTurn('you');
    }, 400);
  };

  const fireYou = (idx: number) => {
    if (busy || end || turn !== 'you' || youFired[idx]) return;
    const res = SHIP.fire(enemy, idx);
    const yf = youFired.slice(); yf[idx] = res.hit ? 2 : 1;
    if (res.sunk) { const sc = enemy.ships[res.shipIndex].cells; for (let k = 0; k < sc.length; k++) yf[sc[k]] = 3; setFlash(`You sank their ${enemy.ships[res.shipIndex].name} (${sc.length} squares)! 🎯`); }
    else setFlash(res.hit ? 'A hit! 🔥' : 'Miss.');
    setYouFired(yf);
    if (SHIP.allSunk(enemy)) { onDelete(RESUME_KEY); setEnd({msg: 'You sank the whole fleet! 🎉'}); return; }
    setTurn('ai'); aiTurn(aiFired);
  };

  const markIncoming = (idx: number) => {
    if (end) return;
    const ni = incoming.slice();
    ni[idx] = (ni[idx] + 1) % 3; // 0 empty → 1 your ship (grey) → 2 hit ✗ → 0
    setIncoming(ni);
    let hits = 0; for (let i = 0; i < N; i++) if (ni[i] === 2) hits++;
    if (hits >= totalCells) { onDelete(RESUME_KEY); setEnd({msg: 'Your whole fleet is sunk — you lose.'}); }
  };
  const cycleShot = (idx: number) => {
    if (end) return;
    const ns = shots.slice(); ns[idx] = (ns[idx] + 1) % 3; setShots(ns);
    let hits = 0; for (let i = 0; i < N; i++) if (ns[i] === 1) hits++;
    if (hits >= totalCells) { onDelete(RESUME_KEY); setEnd({msg: 'You sank their fleet — you win! 🎉'}); }
  };

  // Stable tap callbacks (via refs) so BsCell's memo isn't defeated by a new closure each render.
  const fireRef = useRef(fireYou); fireRef.current = fireYou;
  const markRef = useRef(markIncoming); markRef.current = markIncoming;
  const cycleRef = useRef(cycleShot); cycleRef.current = cycleShot;
  const onFire = useCallback((i: number) => fireRef.current(i), []);
  const onMark = useCallback((i: number) => markRef.current(i), []);
  const onCycle = useCallback((i: number) => cycleRef.current(i), []);
  const onNoop = useCallback((_i: number) => undefined, []);
  const placeRef = useRef(placeAt); placeRef.current = placeAt;
  const onPlace = useCallback((i: number) => placeRef.current(i), []);

  // Fit BOTH stacked grids on one page (no scroll); the top grid is ~20% bigger than the fleet one.
  const base = Math.max(14, Math.floor(Math.min((SCREEN_W - 16) / (size * 1.2), (SCREEN_H - 300) / (2.2 * size), 42)));
  const EC = Math.round(base * 1.2), FC = base;
  const LBL = 20;

  // grid with A–J column headers and 1–10 row labels
  const CoordGrid = ({cell, state, onTap, showShips, ships}: {cell: number; state: number[]; onTap: (i: number) => void; showShips: boolean; ships?: boolean[]}) => (
    <View style={{alignSelf: 'center', borderWidth: 2, borderColor: INK}}>
      <View style={{flexDirection: 'row'}}>
        <View style={{width: LBL, height: LBL}} />
        {Array.from({length: size}).map((_, c) => <View key={c} style={{width: cell, height: LBL, alignItems: 'center', justifyContent: 'center'}}><Text style={s.bsCoord}>{String.fromCharCode(65 + c)}</Text></View>)}
      </View>
      {Array.from({length: size}).map((_, r) => (
        <View key={r} style={{flexDirection: 'row'}}>
          <View style={{width: LBL, height: cell, alignItems: 'center', justifyContent: 'center'}}><Text style={s.bsCoord}>{r + 1}</Text></View>
          {Array.from({length: size}).map((_, c) => {
            const i = r * size + c;
            return <BsCell key={c} cell={cell} v={state[i]} ship={ships ? ships[i] : (showShips && my.ship[i] >= 0)} i={i} onTap={onTap} />;
          })}
        </View>
      ))}
    </View>
  );

  const Roster = ({ships, onToggle, sunkAt}: {ships: any[]; onToggle?: (i: number) => void; sunkAt?: boolean[]}) => (
    <View style={s.bsRoster}>
      {ships.map((sh: any, i: number) => {
        const sunk = sunkAt ? !!sunkAt[i] : sh.hits >= sh.size;
        const row = (
          <>
            <Text style={[s.bsShipName, sunk && s.bsSunkName]}>{sh.name}</Text>
            <View style={{flexDirection: 'row', gap: 2}}>
              {Array.from({length: sh.size}).map((_, k) => <View key={k} style={[s.bsPip, sunk && s.bsPipSunk]} />)}
            </View>
            {sunk ? <Text style={s.bsSunkBadge}>SUNK</Text> : (onToggle ? <Text style={s.bsTapHint}>tap ✓</Text> : null)}
          </>
        );
        return onToggle
          ? <Pressable key={i} style={s.bsShipRow} onPress={() => onToggle(i)}>{row}</Pressable>
          : <View key={i} style={s.bsShipRow}>{row}</View>;
      })}
    </View>
  );

  const status = end ? ''
    : placing ? (flash || (placeIdx < SHIP.FLEET.length ? `Place your ${SHIP.FLEET[placeIdx].name} (${SHIP.FLEET[placeIdx].size} squares)` : 'Fleet ready — Start battle ▸'))
    : verbal ? (flash || 'Call your shots aloud · mark each reply')
    : (flash || (busy ? 'SuperFun is firing…' : 'Your shot — tap a square on Enemy waters'));

  return (
    <View style={s.container}>
      <GameHeader title="Battleship" onMenu={onMenu} onSave={saveNow} savedCount={saves.length} onShowSaved={() => setShowSaved(true)} onRules={() => setRules(true)} onNew={newGame} />

      <View style={{flex: 1, position: 'relative'}}>
        <ScrollView contentContainerStyle={{alignItems: 'center', paddingVertical: 6, paddingBottom: 14}}>
          <Text style={[s.statusBig, {textAlign: 'center', paddingHorizontal: 10}]}>{status}</Text>

          {placing ? (
            <>
              <View style={s.bsPlaceRow}>
                <Pressable onPress={() => setHoriz(h => !h)} style={s.segBtn}><Text style={s.segTxt}>{horiz ? 'Horizontal ↔' : 'Vertical ↕'}</Text></Pressable>
                <Pressable onPress={autoPlace} style={s.segBtn}><Text style={s.segTxt}>Auto-place</Text></Pressable>
                <Pressable onPress={resetPlace} style={s.segBtn}><Text style={s.segTxt}>Reset</Text></Pressable>
              </View>
              <Text style={s.bsLabel}>Your waters — tap a square to drop each ship</Text>
              {CoordGrid({cell: EC, state: Array.from({length: N}, () => 0), onTap: onPlace, showShips: true})}
              <Text style={s.bsHint}>Fleet to place:</Text>
              <View style={s.bsRoster}>
                {SHIP.FLEET.map((f: any, i: number) => (
                  <View key={i} style={s.bsShipRow}>
                    <Text style={[s.bsShipName, i < placeIdx && s.bsSunkName]}>{f.name}</Text>
                    <View style={{flexDirection: 'row', gap: 2}}>{Array.from({length: f.size}).map((_, k) => <View key={k} style={s.bsPip} />)}</View>
                    {i < placeIdx ? <Text style={s.bsSunkBadge}>✓ placed</Text> : i === placeIdx ? <Text style={[s.bsSunkBadge, {color: INK}]}>◄ next</Text> : null}
                  </View>
                ))}
              </View>
            </>
          ) : verbal ? (
            <>
              <Text style={s.bsLabel}>Your shots — tap: ✗ hit → ○ miss (water) → clear</Text>
              {CoordGrid({cell: EC, state: shots.map(v => (v === 1 ? 2 : v === 2 ? 1 : 0)), onTap: onCycle, showShips: false})}
              <Text style={s.bsHint}>Enemy fleet — tap a ship to cross it off:</Text>
              {Roster({ships: SHIP.FLEET, sunkAt: sunkMask, onToggle: toggleSunk})}
              <Text style={[s.bsLabel, {marginTop: 12}]}>Your fleet — tap to place a ship (grey), tap again to mark it hit ✗</Text>
              {CoordGrid({cell: FC, state: incoming.map(x => (x === 2 ? 2 : 0)), onTap: onMark, showShips: false, ships: incoming.map(x => x >= 1)})}
            </>
          ) : (
            <>
              <Text style={s.bsLabel}>Enemy waters — fire here</Text>
              {CoordGrid({cell: EC, state: youFired, onTap: onFire, showShips: false})}
              <Text style={s.bsHint}>Enemy fleet:</Text>
              {Roster({ships: enemy.ships})}
              <Text style={[s.bsLabel, {marginTop: 12}]}>Your fleet</Text>
              {CoordGrid({cell: FC, state: aiFired, onTap: onNoop, showShips: true})}
            </>
          )}
        </ScrollView>
        {end ? <EndOverlay text={end.msg} /> : null}
      </View>

      <View style={s.belowZone}>
        {end ? <Pressable style={s.playAgainBtn} onPress={newGame}><Text style={s.playText}>Play again ▸</Text></Pressable>
          : placing && placeIdx >= SHIP.FLEET.length ? <Pressable style={s.playAgainBtn} onPress={startBattle}><Text style={s.playText}>Start battle ▸</Text></Pressable>
          : null}
      </View>

      {showSaved ? <SavedModal saves={saves} onLoad={loadSave} onDelete={onDelete} onClose={() => setShowSaved(false)} /> : null}
      {rules ? <RulesModal game="battle" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* --------------------------------------------------------------- styles */

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: PAPER, padding: 12},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  brand: {fontSize: 26, fontWeight: '800', color: INK, flexShrink: 1},
  brandIcon: {width: 30, height: 30, marginRight: 9},
  tabs: {flexDirection: 'row', gap: 10, marginTop: 2, marginBottom: 6},
  tabBtn: {flex: 1, borderWidth: 2, borderColor: INK, borderRadius: 10, paddingVertical: 14, alignItems: 'center'},
  tabOn: {backgroundColor: INK},
  tabText: {fontSize: 16, fontWeight: '800', color: INK},
  tileGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between'},
  gTile: {width: '48%', borderWidth: 2, borderColor: INK, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 11},
  gTileOn: {backgroundColor: INK},
  gTileName: {fontSize: 15, fontWeight: '700', color: INK, flexShrink: 1},
  gTileBlurb: {fontSize: 11.5, fontWeight: '600', color: MUTE, marginTop: 1},
  homeBottom: {borderTopWidth: 1, borderColor: '#E6E6E6', paddingTop: 6},
  gameTitle: {fontSize: 18, fontWeight: '700', color: INK, flexShrink: 1},
  iconBtn: {borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, marginLeft: 5},
  iconText: {fontSize: 15, fontWeight: '700', color: INK},
  bold: {fontWeight: '800'},

  sectionLabel: {fontSize: 11, letterSpacing: 1.6, fontWeight: '700', color: INK, textTransform: 'uppercase', marginTop: 12, marginBottom: 7},
  labelDim: {color: '#B7B7B7'},

  solidText: {color: PAPER},
  solidTextDim: {color: '#CFCFCF'},

  diffRow: {flexDirection: 'row', gap: 10},
  diffBtn: {flex: 1, borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 16, alignItems: 'center'},
  diffText: {fontSize: 15, fontWeight: '700', color: INK},
  diffHint: {fontSize: 12, color: MUTE, marginTop: 8},
  nameRow: {flexDirection: 'row', gap: 10},
  nameField: {flex: 1},
  nameTag: {fontSize: 11, fontWeight: '700', color: MUTE, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6},
  nameInput: {borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 12, fontSize: 16, fontWeight: '700', color: INK},
  snPop: {backgroundColor: PAPER, borderWidth: 2, borderColor: INK, borderRadius: 14, paddingVertical: 18, paddingHorizontal: 22, alignItems: 'center', maxWidth: SCREEN_W - 60},
  snPopEmoji: {fontSize: 54, marginBottom: 6},
  snPopText: {fontSize: 18, fontWeight: '800', color: INK, textAlign: 'center'},
  playBtn: {backgroundColor: INK, borderRadius: 10, paddingVertical: 19, alignItems: 'center', marginTop: 18},
  playText: {fontSize: 17, fontWeight: '800', color: PAPER},

  centerArea: {flex: 1, justifyContent: 'center'},
  // Fixed-height message band ABOVE the board so its content can change size
  // (big win banner ↔ small hint) without ever moving the board.
  msgZone: {height: 58, justifyContent: 'center', alignItems: 'center'},
  hintText: {fontSize: 14, color: INK, opacity: 0.72, textAlign: 'center'},
  statusBig: {fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center'},
  // Feedback shown next to the action buttons (Check / Hint / Save results).
  feedbackZone: {height: 26, justifyContent: 'center'},
  feedbackText: {fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center'},
  // Reserved slot under the board (e.g. Play again) so the board never shifts.
  belowZone: {height: 64, justifyContent: 'center', alignItems: 'center'},
  // Big end-of-game message, centred over the play area.
  endOverlay: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16},
  endBig: {fontSize: 38, fontWeight: '800', color: INK, textAlign: 'center', backgroundColor: PAPER, borderWidth: 2, borderColor: INK, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 24, overflow: 'hidden'},

  actionRow: {flexDirection: 'row', gap: 6, marginBottom: 6},
  actionBtn: {flex: 1, borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 15, alignItems: 'center'},
  actionText: {fontSize: 14, fontWeight: '700', color: INK},

  board: {width: GSIZE + 2, alignSelf: 'center', borderTopWidth: 2, borderLeftWidth: 2, borderColor: INK, marginBottom: 2},
  boardRow: {flexDirection: 'row', height: CELL},
  cell: {flex: 1, alignItems: 'center', justifyContent: 'center', borderColor: INK},
  cellSel: {backgroundColor: INK},
  cellGiven: {fontSize: Math.round(CELL * 0.54), color: INK, fontWeight: '800', fontVariant: ['tabular-nums']},
  cellUser: {fontSize: Math.round(CELL * 0.6), color: INK, fontWeight: '400', fontFamily: HAND},
  cellTextSel: {color: PAPER},
  notesGrid: {width: '100%', height: '100%', flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 1},
  noteMark: {width: '33.33%', height: '33.33%', textAlign: 'center', fontSize: Math.round(CELL * 0.2), lineHeight: Math.round(CELL / 3), color: INK, fontVariant: ['tabular-nums']},
  wrongBox: {position: 'absolute', left: '12%', top: '12%', right: '12%', bottom: '12%', borderWidth: 2, borderColor: INK, borderRadius: 3},
  wrongBoxSel: {borderColor: PAPER},
  wrongStrike: {position: 'absolute', left: '12%', right: '12%', top: '50%', height: 2.5, backgroundColor: INK, transform: [{rotate: '-45deg'}]},
  wrongStrikeSel: {backgroundColor: PAPER},

  padRow: {flexDirection: 'row', gap: 5},
  ansBtn: {flex: 1, aspectRatio: 1, borderWidth: 2, borderColor: INK, borderRadius: 8, alignItems: 'center', justifyContent: 'center', maxHeight: 68},
  ansText: {fontSize: 20, fontWeight: '700', color: INK, fontVariant: ['tabular-nums']},
  noteBtn: {flex: 1, aspectRatio: 1, borderWidth: 1.5, borderColor: INK, borderRadius: 999, alignItems: 'center', justifyContent: 'center', maxHeight: 56},
  noteText: {fontSize: 16, fontWeight: '600', color: INK, fontVariant: ['tabular-nums']},
  solidBtn: {backgroundColor: INK},
  solidPill: {backgroundColor: INK},
  disabledBtn: {borderColor: '#C9C9C9'},
  disabledText: {color: '#C9C9C9'},

  // tic-tac-toe
  tttLegend: {fontSize: 13, color: INK, opacity: 0.75},
  tttBoard: {width: TCELL * 3, height: TCELL * 3, alignSelf: 'center', marginTop: 6, position: 'relative'},
  tttRow: {flexDirection: 'row', height: TCELL},
  tttCell: {width: TCELL, height: TCELL, alignItems: 'center', justifyContent: 'center'},
  tttCellWin: {backgroundColor: INK},
  tttLineV: {position: 'absolute', top: 0, bottom: 0, width: 4, backgroundColor: INK},
  tttLineH: {position: 'absolute', left: 0, right: 0, height: 4, backgroundColor: INK},
  tttO: {fontSize: Math.round(TCELL * 0.62), color: INK, fontWeight: '400', fontFamily: HAND},
  tttX: {fontSize: Math.round(TCELL * 0.56), color: INK, fontWeight: '800'},

  // Ultimate TTT
  uBoard: {alignSelf: 'center', marginTop: 4},
  uMetaRow: {flexDirection: 'row'},
  uSub: {width: UCELL * 3, height: UCELL * 3, borderWidth: 2, borderColor: '#B8B8B8', margin: 3, position: 'relative', backgroundColor: PAPER},
  uSubOn: {borderColor: INK, borderWidth: 3, margin: 2}, // playable board: crisp black frame (margin −1 keeps size constant)
  uSubOff: {backgroundColor: '#E4E4E4', borderColor: '#CFCFCF'}, // locked this turn: greyed out
  uCellRow: {flexDirection: 'row'},
  uCell: {width: UCELL, height: UCELL, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#AAAAAA'},
  uCellReject: {backgroundColor: '#BDBDBD'},
  uHint: {fontSize: 12, color: MUTE, textAlign: 'center', paddingHorizontal: 12},
  rejectText: {fontWeight: '800'},
  uO: {fontSize: Math.round(UCELL * 0.72), color: INK, fontFamily: HAND, lineHeight: Math.round(UCELL * 0.9)},
  uX: {fontSize: Math.round(UCELL * 0.64), color: INK, fontWeight: '800', lineHeight: Math.round(UCELL * 0.9)},
  uWon: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER},
  uWonMark: {fontSize: UCELL * 1.9, fontWeight: '800', color: INK},

  // Word Search
  wsTheme: {fontSize: 15, fontWeight: '800', color: INK, flexShrink: 1, marginRight: 8},
  wsLangBtn: {borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12},
  wsLangText: {fontSize: 13, fontWeight: '800', color: INK},
  wsBoard: {borderWidth: 2, borderColor: INK, alignSelf: 'center', marginTop: 2},
  wsCell: {alignItems: 'center', justifyContent: 'center', borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#C8C8C8'},
  wsFound: {backgroundColor: '#D6D6D6'},
  wsSpot: {backgroundColor: '#AEAEAE'},
  wsHintCell: {borderWidth: 3, borderColor: INK},
  wsStart: {backgroundColor: INK},
  wsControls: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, alignSelf: 'center'},
  wsTip: {fontSize: 12, color: '#8A8A8A', textAlign: 'center', marginTop: 4},
  wsWordsWrap: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 8, marginTop: 10, gap: 8},
  wsHidden: {fontSize: 15, fontWeight: '700', color: '#8A8A8A', fontStyle: 'italic'},
  wsWord: {fontSize: 15, fontWeight: '700', color: INK, letterSpacing: 0.5},
  wsWordFound: {color: '#B0B0B0', textDecorationLine: 'line-through'},

  // 2048 & 15-Puzzle shared board + 2048 pad
  gBoard: {borderWidth: 2, borderColor: INK, alignSelf: 'center', marginTop: 4},
  padArea: {alignItems: 'center', justifyContent: 'center', marginTop: 18, gap: 12, height: 120},
  padBtn: {borderWidth: 2, borderColor: INK, borderRadius: 12, width: 66, height: 54, alignItems: 'center', justifyContent: 'center'},
  padTxt: {fontSize: 28, fontWeight: '800', color: INK},

  // Mastermind
  mmRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 5, paddingHorizontal: 4},
  mmRowNum: {fontSize: 12, fontWeight: '800', color: '#888888', width: 18, textAlign: 'center'},
  mmPeg: {width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER},
  mmPegTxt: {fontSize: 21, fontWeight: '800', color: INK},
  mmPegEmpty: {borderColor: '#BBBBBB', borderStyle: 'dashed', backgroundColor: 'transparent'},
  mmRowGhost: {backgroundColor: '#F2F2F2', borderRadius: 10, opacity: 0.7},
  fbGrid: {marginLeft: 8, gap: 4, justifyContent: 'center'},
  fbBlack: {width: 14, height: 14, borderRadius: 7, backgroundColor: INK},
  fbWhite: {width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: INK},
  fbEmpty: {width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#D8D8D8'},
  mmMarkExact: {width: 15, height: 15, borderRadius: 8, backgroundColor: INK},
  mmMarkClose: {width: 15, height: 15, borderRadius: 8, borderWidth: 2.5, borderColor: INK},
  mmMarkAbsent: {width: 12, height: 3, borderRadius: 2, backgroundColor: '#CBCBCB'},
  mmControls: {borderTopWidth: 1, borderColor: INK, paddingTop: 10},
  mmCurRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10},
  mmBack: {borderWidth: 2, borderColor: INK, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 18, marginLeft: 4},
  mmBackTxt: {fontSize: 23, fontWeight: '800', color: INK},
  mmPalette: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10},
  mmPalBtn: {width: 76, height: 76, borderRadius: 14, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center'},
  mmPalTxt: {fontSize: 31, fontWeight: '800', color: INK},
  mmSubmitOff: {opacity: 0.4},

  // Peg Solitaire
  undoBtn: {borderWidth: 2, borderColor: INK, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 30, alignItems: 'center', alignSelf: 'center'},
  undoTxt: {fontSize: 16, fontWeight: '800', color: INK},

  // Memory
  memPlayers: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 2},
  memCardsRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 2},
  diceCountRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6},
  emojiRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5},
  emojiBtn: {width: 34, height: 34, borderRadius: 8, borderWidth: 1.5, borderColor: '#CCCCCC', alignItems: 'center', justifyContent: 'center'},
  emojiBtnOn: {borderColor: INK, borderWidth: 2.5, backgroundColor: '#E8E8E8'},
  emojiBtnOff: {borderColor: '#EEEEEE', backgroundColor: '#F6F6F6'},
  emojiTxt: {fontSize: 18},
  turnBig: {fontSize: 30, fontWeight: '900', color: INK, textAlign: 'center'},
  scoreCard: {alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 2, borderColor: '#DDDDDD'},
  scoreCardOn: {borderColor: INK, backgroundColor: '#EDEDED'},
  scoreWho: {fontSize: 18, fontWeight: '800', color: INK},
  mpNum: {fontSize: 30, fontWeight: '900', color: INK},
  diceTotal: {fontSize: 26, fontWeight: '900', color: INK},
  memCardsLbl: {fontSize: 12, fontWeight: '700', color: MUTE},
  taqControls: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 2, flexWrap: 'wrap', justifyContent: 'center'},
  segBtn: {borderWidth: 2, borderColor: INK, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 14},
  segOn: {backgroundColor: INK},
  segTxt: {fontSize: 14, fontWeight: '800', color: INK},
  memPlayersLbl: {fontSize: 13, fontWeight: '700', color: MUTE, marginRight: 4},
  pSelBtn: {borderWidth: 2, borderColor: INK, borderRadius: 8, width: 42, height: 40, alignItems: 'center', justifyContent: 'center'},
  pSelTxt: {fontSize: 17, fontWeight: '800', color: INK},
  memCard: {flex: 1, borderWidth: 2, borderColor: INK, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8E8E8'},
  memCardUp: {backgroundColor: PAPER},
  memCardDone: {borderColor: '#C2C2C2'},
  memCardTxt: {fontWeight: '800', color: INK},
  memScoreRow: {flexDirection: 'row', gap: 8, justifyContent: 'center'},
  memScoreCell: {borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12, alignItems: 'center', minWidth: 46},
  memScoreOn: {backgroundColor: INK},
  memScoreNum: {fontSize: 18, fontWeight: '800', color: INK},
  memScoreLbl: {fontSize: 10, fontWeight: '700', color: MUTE},

  // Reversi / Checkers / Dots boards
  rvBoard: {borderWidth: 2, borderColor: INK, alignSelf: 'center', backgroundColor: '#EDEDED', marginTop: 4},
  ckBoard: {borderWidth: 2, borderColor: INK, alignSelf: 'center', marginTop: 4},
  dotsWrap: {alignSelf: 'center', marginTop: 6},

  // Dice games (Pig / Snakes)
  pigTotal: {fontSize: 20, fontWeight: '800', color: INK},
  pigBtn: {borderWidth: 2, borderColor: INK, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 30, alignItems: 'center'},
  pigBtnTxt: {fontSize: 18, fontWeight: '800', color: INK},
  bsLabel: {fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: MUTE, marginTop: 8, marginBottom: 4},
  bsCoord: {fontSize: 11, fontWeight: '800', color: '#888888'},
  bsHint: {fontSize: 11.5, fontWeight: '700', color: MUTE, marginTop: 8, marginBottom: 3},
  bsRoster: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: 460},
  bsPlaceRow: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginVertical: 6},
  bsShipRow: {flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 8},
  bsShipName: {fontSize: 12.5, fontWeight: '700', color: INK},
  bsSunkName: {color: '#B0B0B0', textDecorationLine: 'line-through'},
  bsPip: {width: 9, height: 9, borderWidth: 1.4, borderColor: INK, backgroundColor: PAPER},
  bsPipSunk: {backgroundColor: INK, borderColor: INK},
  bsSunkBadge: {fontSize: 10, fontWeight: '900', color: PAPER, backgroundColor: INK, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden'},
  bsTapHint: {fontSize: 10, fontWeight: '700', color: '#A0A0A0'},

  // Records screen
  toggleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: INK, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 6},
  toggleLbl: {fontSize: 14, fontWeight: '700', color: INK, flex: 1},
  toggle: {borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 12, minWidth: 52, alignItems: 'center'},
  toggleOn: {backgroundColor: INK},
  toggleTxt: {fontSize: 13, fontWeight: '800', color: INK},
  recCard: {borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8},
  recGame: {fontSize: 15, fontWeight: '800', color: INK},
  recMetric: {fontSize: 12.5, fontWeight: '700', color: MUTE},
  recLine: {fontSize: 13.5, color: INK, marginTop: 4},
  recEmpty: {fontSize: 12.5, color: MUTE, marginTop: 4, fontStyle: 'italic'},
  galCell: {alignItems: 'center', width: 46},
  galArt: {width: 40, height: 40, borderWidth: 1, borderColor: '#CFCFCF', borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F4F4'},
  galArtOn: {borderColor: INK, backgroundColor: PAPER},
  galQ: {fontSize: 20, fontWeight: '800', color: '#C4C4C4'},
  galName: {fontSize: 9.5, fontWeight: '700', color: MUTE, marginTop: 2},
  resetBtn: {borderWidth: 2, borderColor: '#C0392B', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18},
  resetBtnArmed: {backgroundColor: '#C0392B', borderColor: '#C0392B'},
  resetTxt: {fontSize: 14, fontWeight: '800', color: '#C0392B'},
  badgeRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6},
  badgeMark: {fontSize: 22, color: '#CCCCCC'},
  badgeMarkOn: {color: INK},
  badgeLbl: {fontSize: 14, fontWeight: '800', color: INK},
  badgeHint: {fontSize: 12, color: MUTE},
  playAgainBtn: {backgroundColor: INK, borderRadius: 10, paddingVertical: 18, paddingHorizontal: 34, alignItems: 'center', alignSelf: 'center'},

  scoreRow: {flexDirection: 'row', borderTopWidth: 2, borderColor: INK, paddingTop: 10, marginTop: 6},
  scoreCell: {flex: 1, alignItems: 'center'},
  scoreNum: {fontSize: 26, fontWeight: '800', color: INK, fontVariant: ['tabular-nums']},
  scoreLbl: {fontSize: 12, fontWeight: '700', color: MUTE, textTransform: 'uppercase', letterSpacing: 1},

  // shared grid-line overlays
  gridLineV: {position: 'absolute', top: 0, width: 2, backgroundColor: INK},
  gridLineH: {position: 'absolute', left: 0, height: 2, backgroundColor: INK},

  // connect four
  c4Board: {width: C4CELL * 7 + 4, height: C4CELL * 6 + 4, alignSelf: 'center', marginTop: 6, position: 'relative', borderWidth: 2, borderColor: INK},
  c4Row: {flexDirection: 'row', height: C4CELL},
  c4Cell: {width: C4CELL, height: C4CELL, alignItems: 'center', justifyContent: 'center'},
  c4O: {fontSize: Math.round(C4CELL * 0.6), color: INK, fontWeight: '400', fontFamily: HAND},
  c4X: {fontSize: Math.round(C4CELL * 0.56), color: INK, fontWeight: '800'},

  // minesweeper
  mineBoard: {alignSelf: 'center', borderWidth: 2, borderColor: INK, marginTop: 4},
  mineCellTile: {borderWidth: 1.5, borderColor: INK, borderRadius: 3, alignItems: 'center', justifyContent: 'center'},
  mineCellOpen: {alignItems: 'center', justifyContent: 'center'},
  mineCellBoom: {backgroundColor: INK, alignItems: 'center', justifyContent: 'center'},
  mineNum: {fontSize: 18, fontWeight: '800', color: INK, fontVariant: ['tabular-nums']},
  mineFlag: {fontSize: 18, color: INK},
  mineBoomText: {fontSize: 18, color: PAPER, fontWeight: '800'},

  // nonogram
  clueText: {fontSize: 13, fontWeight: '700', color: INK, lineHeight: 15, fontVariant: ['tabular-nums']},
  nonoFill: {backgroundColor: INK},
  nonoMark: {fontSize: 15, color: INK, fontWeight: '700'},

  // ko-fi (pinned)
  kofiRow: {flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: INK, paddingTop: 10, marginTop: 8},
  kofiText: {fontSize: 12, color: INK, lineHeight: 17},
  kofiLink: {fontSize: 12, color: INK, fontWeight: '700', marginTop: 3},
  kofiQr: {width: 74, height: 74, borderWidth: 1, borderColor: INK, marginLeft: 10},

  // rules / saved modal
  modalWrap: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#00000022', alignItems: 'center', justifyContent: 'center', padding: 24},
  modalCard: {backgroundColor: PAPER, borderWidth: 2, borderColor: INK, borderRadius: 14, padding: 20, maxWidth: 520, width: '100%'},
  modalTitle: {fontSize: 18, fontWeight: '800', color: INK, marginBottom: 12},
  ruleLine: {flexDirection: 'row', marginBottom: 8},
  ruleDot: {fontSize: 15, color: INK, marginRight: 8, lineHeight: 21},
  ruleText: {flex: 1, fontSize: 14.5, color: INK, lineHeight: 21},
  modalBtn: {backgroundColor: INK, borderRadius: 8, paddingVertical: 15, alignItems: 'center', marginTop: 12},
  modalBtnText: {fontSize: 15, fontWeight: '800', color: PAPER},
  savedEmpty: {fontSize: 14, color: MUTE, paddingVertical: 12},
  savedRow: {flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#DDDDDD', paddingVertical: 9},
  resumeRow: {backgroundColor: '#F2F2F2', borderRadius: 10, borderBottomWidth: 0, paddingHorizontal: 8, marginBottom: 6},
  resumeBtn: {backgroundColor: INK, borderColor: INK},
  savedText: {fontSize: 15, fontWeight: '600', color: INK},
  savedSub: {fontSize: 12, color: MUTE, marginTop: 2},
  savedBtn: {borderWidth: 1.5, borderColor: INK, borderRadius: 7, paddingVertical: 9, paddingHorizontal: 14, marginLeft: 8},
  savedBtnText: {fontSize: 13, fontWeight: '700', color: INK},

  // rules example illustration
  exWrap: {marginTop: 12, marginBottom: 4, alignItems: 'center'},
  exGridRow: {flexDirection: 'row'},
  exCell: {width: 34, height: 34, borderWidth: 1, borderColor: INK, alignItems: 'center', justifyContent: 'center'},
  exInv: {backgroundColor: INK},
  exInvText: {color: PAPER},
  exGiven: {fontSize: 18, fontWeight: '800', color: INK},
  exHand: {fontSize: 19, color: INK, fontWeight: '400', fontFamily: HAND},
  exNum: {fontSize: 18, fontWeight: '800', color: INK},
  exMine: {fontSize: 16, color: PAPER, fontWeight: '800'},
  exFlag: {fontSize: 16, color: INK},
  exNotes: {width: '100%', height: '100%', flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 1},
  exNoteMark: {width: '33.33%', height: '33.33%', textAlign: 'center', fontSize: 9, lineHeight: 11, color: INK},
  exCaption: {fontSize: 12, color: MUTE, marginTop: 8, textAlign: 'center', maxWidth: 260},
  exArrowT: {fontSize: 20, fontWeight: '800', color: INK, marginHorizontal: 4},
  exClueLabel: {fontSize: 15, fontWeight: '800', color: INK, marginRight: 8},

  // bench
});

export default App;
