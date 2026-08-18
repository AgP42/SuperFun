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

import React, {useState, useCallback, useEffect, useRef} from 'react';
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {generate, DIFFICULTIES} from './src/sudoku';
import * as TTT from './src/tictactoe';
import * as C4 from './src/connect4';
import * as MINE from './src/minesweeper';
import * as NONO from './src/nonogram';
import {loadSaves, persistSaves} from './src/filestore';

const KOFI_QR = require('./assets/kofi-qr.png');
const INK = '#000000';
const PAPER = '#FFFFFF';
const MUTE = '#8A8A8A';
const HAND = Platform.OS === 'android' ? 'casual' : undefined;

const SCREEN_W = Dimensions.get('window').width;
const GRID = Math.min(SCREEN_W - 20, 660);
const CELL = Math.floor(GRID / 9);
const GSIZE = CELL * 9;
const TSIZE = Math.min(SCREEN_W - 40, 520);
const TCELL = Math.floor(TSIZE / 3);
const C4CELL = Math.floor(Math.min(SCREEN_W - 40, 490) / 7);
const gridCell = (cols: number, maxW: number) => Math.floor(Math.min(SCREEN_W - 24, maxW) / cols);

type Diff = keyof typeof DIFFICULTIES;
type GameKey = 'sudoku' | 'ttt' | 'c4' | 'mines' | 'nono';
type Screen =
  | {name: 'home'}
  | {name: 'sudoku'; diff: Diff}
  | {name: 'ttt'; diff: Diff}
  | {name: 'c4'; diff: Diff}
  | {name: 'mines'; diff: Diff}
  | {name: 'nono'; diff: Diff};

type GameSave = {
  game: 'sudoku' | 'nono';
  key: string; // checksum of the base puzzle — identifies which one this is
  ts: number; // saved-at epoch ms
  diff: Diff;
  label: string; // short human summary shown in the list
  data: any; // game-specific payload
};

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

const WIN_MSGS = [
  'Well done! 🎉', 'You crushed it! 🎉', 'Too easy 😎🎉', 'Brain beats machine 🧠',
  'Victory! 🎉', 'Flawless — chef\'s kiss 👌', 'You\'re on fire! 🔥',
  'GG! The paper bows to you 🎉', 'Unstoppable! 🎉', 'Genius move 🎉',
];
const LOSE_MSGS = [
  'The Supernote wins this one 🤖', 'Outsmarted by paper 😅', 'So close — run it back? 💪',
  'The machine strikes back 🤖', 'Ouch! Rematch? 🔁', 'The Supernote is showing off 😏',
  'Nice try — go again ✊', 'Beaten by pixels… barely 🤖',
];
const DRAW_MSGS = ['A draw — perfectly balanced ⚖️', 'Stalemate! 😐', 'Dead heat — go again 🔁', 'No winner… this time 🤝'];

const C4_WIN = [
  'Four in a row — you win! 🎉', 'Connected and collected 😎', 'The Supernote didn\'t see that coming 🎉',
  'Line \'em up, take \'em down 🔥', 'Gravity\'s on your side today 🎉', 'Dropped the winning disc! 👏',
  'Too sharp for the machine 🧠', 'Victory falls into place 🎉', 'You stacked the odds 🎉', 'GG — four and done 🎉',
];
const C4_LOSE = [
  'The Supernote lines up four 🤖', 'Beaten to the connection 😅', 'So close — one more disc 💪',
  'The machine drops the hammer 🤖', 'Outstacked this time 🔁', 'Gravity betrayed you 😏',
  'Nice try — run it back ✊', 'The Supernote connects first 🤖',
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
const NONO_WIN = [
  'Picture complete — beautiful! 🎉', 'You cracked the pattern 😎', 'Every clue satisfied ✅', 'Pixel-perfect 🖤',
  'Logic wins again 🧠', 'The grid reveals its secret 🎉', 'Filled to perfection 👏', 'Nono-genius 🎉',
  'Clues conquered 🎉', 'Masterpiece 🎨',
];
const NONO_LOSE = [
  'Not quite — some cells are off 🤔', 'A few clues still don\'t match 🔎', 'Close, but the pattern\'s off 😅',
  'Check the numbers again 💡', 'Some rows aren\'t happy yet 🤨', 'Almost — keep refining ✍️',
];
const pick = (pool: string[], i: number) => pool[i % pool.length];

const RULES: Record<GameKey, {title: string; lines: string[]}> = {
  ttt: {
    title: 'Tic-Tac-Toe',
    lines: [
      'You play O, the Supernote plays X.',
      'Take turns tapping an empty cell.',
      'First to line up three in a row — across, down or diagonally — wins.',
      'You always move first.',
      'Difficulty sets how sharp the Supernote plays (Hard is unbeatable).',
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
      'You play O, the Supernote plays X. You go first.',
      'Tap a column to drop your disc — it falls to the lowest free slot.',
      'First to line up four in a row — across, down or diagonally — wins.',
      'Difficulty sets how far ahead the Supernote thinks (Hard is tough).',
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
      'The puzzle completes itself the moment every clue is satisfied.',
    ],
  },
};

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({name: 'home'});
  const [saves, setSaves] = useState<GameSave[]>([]); // persisted to disk via FileStore

  useEffect(() => { loadSaves().then(setSaves); }, []); // load once on open

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
      next = next.filter(x => { cnt[x.game] = (cnt[x.game] || 0) + 1; return cnt[x.game] <= 10; });
      return next;
    });
  const delSave = (game: string, key: string) => mutate(prev => prev.filter(x => !(x.game === game && x.key === key)));

  const home = () => setScreen({name: 'home'});
  const play = (g: GameKey, d: Diff) => setScreen({name: g, diff: d} as Screen);
  switch (screen.name) {
    case 'sudoku':
      return <SudokuGame diff={screen.diff} onMenu={home} saves={saves.filter(x => x.game === 'sudoku')} onSave={addSave} onDelete={k => delSave('sudoku', k)} />;
    case 'ttt':
      return <TicTacToe diff={screen.diff} onMenu={home} />;
    case 'c4':
      return <ConnectFour diff={screen.diff} onMenu={home} />;
    case 'mines':
      return <Minesweeper diff={screen.diff} onMenu={home} />;
    case 'nono':
      return <Nonogram diff={screen.diff} onMenu={home} saves={saves.filter(x => x.game === 'nono')} onSave={addSave} onDelete={k => delSave('nono', k)} />;
    default:
      return <Home onPlay={play} />;
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
  return null;
}

function SavedModal({saves, onLoad, onDelete, onClose}: {
  saves: GameSave[]; onLoad: (s: GameSave) => void; onDelete: (key: string) => void; onClose: () => void;
}): React.JSX.Element {
  return (
    <View style={s.modalWrap}>
      <View style={s.modalCard}>
        <Text style={s.modalTitle}>Saved grids ({saves.length}/10)</Text>
        {saves.length === 0 ? (
          <Text style={s.savedEmpty}>No saved grids yet. Tap “Save grid” during a game.</Text>
        ) : (
          <ScrollView style={{maxHeight: 320}}>
            {saves.map(sv => (
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

const GAMES: Array<{key: GameKey; label: string; blurb: string}> = [
  {key: 'sudoku', label: 'Sudoku', blurb: 'Fill the 9×9 grid'},
  {key: 'nono', label: 'Nonogram', blurb: 'Reveal the picture from clues'},
  {key: 'mines', label: 'Minesweeper', blurb: 'Clear the field, dodge the mines'},
  {key: 'ttt', label: 'Tic-Tac-Toe', blurb: 'Beat the Supernote'},
  {key: 'c4', label: 'Connect Four', blurb: 'Drop four in a row vs the Supernote'},
];

const DIFF_HINT: Record<GameKey, string> = {
  sudoku: 'Difficulty sets how many clues you start with (Easy ≈40 · Medium ≈32 · Hard ≈26).',
  ttt: 'Difficulty sets how sharp the Supernote plays (Easy random · Medium tough · Hard unbeatable).',
  c4: 'Difficulty sets how far ahead the Supernote thinks (Easy light · Medium solid · Hard tough).',
  mines: 'Difficulty sets grid size and mines (Easy 8×8·10 · Medium 10×10·18 · Hard 12×12·30).',
  nono: 'Difficulty sets the grid size (Easy 5×5 · Medium 8×8 · Hard 10×10).',
};

function Home({onPlay}: {onPlay: (g: GameKey, d: Diff) => void}): React.JSX.Element {
  const [game, setGame] = useState<GameKey>('sudoku');
  const [diff, setDiff] = useState<Diff>('medium');
  const order: Diff[] = ['easy', 'medium', 'hard'];
  const diffHint = DIFF_HINT[game];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.brand}>SuperFun</Text>
        <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
      </View>

      <ScrollView style={{flex: 1}} contentContainerStyle={{paddingBottom: 12}}>
        <Text style={s.tagline}>Little games for your Supernote — generated fresh, played on paper.</Text>

        <Text style={s.sectionLabel}>Game</Text>
        {GAMES.map(g => {
          const on = game === g.key;
          return (
            <Pressable key={g.key} onPress={() => setGame(g.key)} style={[s.bigChoice, on && s.bigChoiceOn]}>
              <View>
                <Text style={[s.bigChoiceText, on && s.solidText]}>{g.label}</Text>
                <Text style={[s.bigChoiceBlurb, on && s.solidTextDim]}>{g.blurb}</Text>
              </View>
              {on ? <Text style={[s.tick, s.solidText]}>●</Text> : null}
            </Pressable>
          );
        })}
        <View style={[s.bigChoice, s.disabledChoice, {flexDirection: 'column', alignItems: 'flex-start'}]}>
          <Text style={[s.bigChoiceText, {color: '#BBBBBB'}]}>More games soon…</Text>
          <Text style={s.moreHint}>Any game you’d like to see? Let me know on Reddit or GitHub.</Text>
        </View>

        <Text style={s.sectionLabel}>Difficulty</Text>
        <View style={s.diffRow}>
          {order.map(d => {
            const on = diff === d;
            return (
              <Pressable key={d} onPress={() => setDiff(d)} style={[s.diffBtn, on && s.solidBtn]}>
                <Text style={[s.diffText, on && s.solidText]}>{DIFFICULTIES[d].label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.diffHint}>{diffHint}</Text>

        <Pressable style={s.playBtn} onPress={() => onPlay(game, diff)}>
          <Text style={s.playText}>Play {GAMES.find(g => g.key === game)!.label} ▸</Text>
        </Pressable>
      </ScrollView>

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

function TicTacToe({diff, onMenu}: {diff: Diff; onMenu: () => void}): React.JSX.Element {
  const [board, setBoard] = useState<string[]>(() => Array(9).fill(''));
  const [busy, setBusy] = useState(false);
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
    if (who === 'O') {
      setScore(v => ({...v, you: v.you + 1}));
      setEnd({msg: WIN_MSGS[idx.current.win++ % WIN_MSGS.length], kind: 'win'});
    } else if (who === 'X') {
      setScore(v => ({...v, sn: v.sn + 1}));
      setEnd({msg: LOSE_MSGS[idx.current.lose++ % LOSE_MSGS.length], kind: 'lose'});
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
  };
  const newMatch = () => {
    playAgain();
    setScore({you: 0, sn: 0, draw: 0}); // "New" starts a fresh match: reset the scoreboard
  };

  const play = (i: number) => {
    if (busy || over || board[i]) return;
    const nb = board.slice();
    nb[i] = 'O';
    setBoard(nb);
    const w1 = TTT.winner(nb);
    if (w1) { finish(w1.player as 'O' | 'draw'); return; }
    setBusy(true);
    timer.current = setTimeout(() => {
      const m = TTT.aiMove(nb.slice(), diff);
      const ab = nb.slice();
      if (m >= 0) ab[m] = 'X';
      setBoard(ab);
      setBusy(false);
      const w2 = TTT.winner(ab);
      if (w2) finish(w2.player as 'X' | 'draw');
    }, 1000); // 1s pause before the Supernote plays its X
  };

  const status = busy ? 'SuperFun is thinking…' : 'Your turn';

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={onMenu}><Text style={s.iconText}>‹ Menu</Text></Pressable>
        <Text style={s.gameTitle}>Tic-Tac-Toe</Text>
        <View style={{flexDirection: 'row'}}>
          <Pressable style={s.iconBtn} onPress={() => setRules(true)}><Text style={s.iconText}>Rules</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={newMatch}><Text style={s.iconText}>New</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
        </View>
      </View>

      <Text style={s.tttLegend}>You are <Text style={s.bold}>O</Text> · SuperFun is <Text style={s.bold}>X</Text> · {DIFFICULTIES[diff].label}</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={s.statusBig}>{status}</Text>}
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
        <View style={s.scoreCell}><Text style={s.scoreNum}>{score.you}</Text><Text style={s.scoreLbl}>You</Text></View>
        <View style={s.scoreCell}><Text style={s.scoreNum}>{score.draw}</Text><Text style={s.scoreLbl}>Draws</Text></View>
        <View style={s.scoreCell}><Text style={s.scoreNum}>{score.sn}</Text><Text style={s.scoreLbl}>SuperFun</Text></View>
      </View>

      {rules ? <RulesModal game="ttt" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------- Sudoku */

function SudokuGame({diff, onMenu, saves, onSave, onDelete}: {
  diff: Diff; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void;
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
  };

  const loadSave = (sv: GameSave) => {
    const d = sv.data;
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
    setWrong(new Set()); setSel(-1); setInfo('Revealed one cell');
  };

  let solved = true;
  for (let i = 0; i < 81; i++) if (val[i] !== solution[i]) { solved = false; break; }

  const selectable = sel >= 0 && !isLocked(sel);
  const notesEnabled = selectable && val[sel] === 0;
  const curVal = sel >= 0 ? val[sel] : 0;
  const curNotes = sel >= 0 ? notes[sel] : 0;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={onMenu}><Text style={s.iconText}>‹ Menu</Text></Pressable>
        <Text style={s.gameTitle}>Sudoku · {DIFFICULTIES[diff].label}</Text>
        <View style={{flexDirection: 'row'}}>
          <Pressable style={s.iconBtn} onPress={() => setRules(true)}><Text style={s.iconText}>Rules</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={doUndo}><Text style={s.iconText}>↶</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={newPuzzle}><Text style={s.iconText}>New grid</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={saveNow}><Text style={s.iconText}>Save</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => setShowSaved(true)}><Text style={s.iconText}>Saved ({saves.length})</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
        </View>
      </View>

      <View style={s.msgZone}>
        {solved ? null : <Text style={s.hintText}>{selectable ? (notesEnabled ? 'Answer = final value · Notes = candidates' : 'This cell has an answer — tap it again to clear it') : 'Tap an empty cell'}</Text>}
      </View>

      <View style={s.centerArea}>
        <Board givens={givens} val={val} notes={notes} sel={sel} wrong={wrong}
          onSelect={i => { clearTransient(); if (isLocked(i)) { setSel(-1); return; } setSel(prev => (prev === i ? -1 : i)); }}
        />
        {solved ? <EndOverlay text="Solved! 🎉" /> : null}
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

function ConnectFour({diff, onMenu}: {diff: Diff; onMenu: () => void}): React.JSX.Element {
  const [board, setBoard] = useState<string[]>(() => Array(42).fill(''));
  const [busy, setBusy] = useState(false);
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
    if (who === 'O') { setScore(v => ({...v, you: v.you + 1})); setEnd({msg: pick(C4_WIN, idx.current.win++), kind: 'win'}); }
    else if (who === 'X') { setScore(v => ({...v, sn: v.sn + 1})); setEnd({msg: pick(C4_LOSE, idx.current.lose++), kind: 'lose'}); }
    else { setScore(v => ({...v, draw: v.draw + 1})); setEnd({msg: pick(DRAW_MSGS, idx.current.draw++), kind: 'draw'}); }
  };
  const playAgain = () => { if (timer.current) clearTimeout(timer.current); setBoard(Array(42).fill('')); setBusy(false); setEnd(null); };
  const newMatch = () => { playAgain(); setScore({you: 0, sn: 0, draw: 0}); };

  const dropCol = (col: number) => {
    if (busy || over) return;
    const res = C4.drop(board, col, 'O');
    if (!res) return;
    const nb = res.board;
    setBoard(nb);
    const w1 = C4.winner(nb);
    if (w1) { finish(w1.player); return; }
    setBusy(true);
    timer.current = setTimeout(() => {
      const ac = C4.aiMove(nb.slice(), diff);
      const ar = C4.drop(nb, ac, 'X');
      const ab = ar ? ar.board : nb;
      setBoard(ab);
      setBusy(false);
      const w2 = C4.winner(ab);
      if (w2) finish(w2.player);
    }, 1000);
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={onMenu}><Text style={s.iconText}>‹ Menu</Text></Pressable>
        <Text style={s.gameTitle}>Connect Four</Text>
        <View style={{flexDirection: 'row'}}>
          <Pressable style={s.iconBtn} onPress={() => setRules(true)}><Text style={s.iconText}>Rules</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={newMatch}><Text style={s.iconText}>New</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
        </View>
      </View>
      <Text style={s.tttLegend}>You are <Text style={s.bold}>O</Text> · SuperFun is <Text style={s.bold}>X</Text> · {DIFFICULTIES[diff].label}</Text>

      <View style={s.centerArea}>
        <View style={s.msgZone}>
          {end ? null : <Text style={s.statusBig}>{busy ? 'SuperFun is thinking…' : 'Your turn — tap a column'}</Text>}
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
        <View style={s.scoreCell}><Text style={s.scoreNum}>{score.you}</Text><Text style={s.scoreLbl}>You</Text></View>
        <View style={s.scoreCell}><Text style={s.scoreNum}>{score.draw}</Text><Text style={s.scoreLbl}>Draws</Text></View>
        <View style={s.scoreCell}><Text style={s.scoreNum}>{score.sn}</Text><Text style={s.scoreLbl}>SuperFun</Text></View>
      </View>
      {rules ? <RulesModal game="c4" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* --------------------------------------------------------- Minesweeper */

function Minesweeper({diff, onMenu}: {diff: Diff; onMenu: () => void}): React.JSX.Element {
  const preset = MINE.PRESETS[diff];
  const R = preset.rows, C = preset.cols, MINES = preset.mines;
  const cell = Math.max(26, gridCell(C, 640));
  const [seed, setSeed] = useState(0);
  const [board, setBoard] = useState<{mine: boolean[]; count: Int8Array} | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(R * C).fill(false));
  const [flags, setFlags] = useState<boolean[]>(() => Array(R * C).fill(false));
  const [mode, setMode] = useState<'dig' | 'flag'>('dig');
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [end, setEnd] = useState<{msg: string; kind: 'win' | 'lose'} | null>(null);
  const [rules, setRules] = useState(false);
  const idx = useRef({win: 0, lose: 0});

  useEffect(() => {
    setBoard(null); setRevealed(Array(R * C).fill(false)); setFlags(Array(R * C).fill(false));
    setDead(false); setWon(false); setEnd(null); setMode('dig');
  }, [seed, R, C]);
  const newGame = () => setSeed(x => x + 1);

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
    if (mode === 'flag') { if (revealed[i]) return; setFlags(f => { const nf = f.slice(); nf[i] = !nf[i]; return nf; }); return; }
    if (flags[i] || revealed[i]) return;
    let b = board;
    if (!b) { b = MINE.generate(R, C, MINES, i); setBoard(b); }
    if (b.mine[i]) {
      const rev = revealed.slice();
      for (let k = 0; k < R * C; k++) if (b.mine[k]) rev[k] = true;
      setRevealed(rev); setDead(true); setEnd({msg: pick(MINE_LOSE, idx.current.lose++), kind: 'lose'});
      return;
    }
    const rev = revealed.slice();
    flood(b, rev, i);
    setRevealed(rev);
    let safe = 0, got = 0;
    for (let k = 0; k < R * C; k++) if (!b.mine[k]) { safe++; if (rev[k]) got++; }
    if (got === safe) { setWon(true); setEnd({msg: pick(MINE_WIN, idx.current.win++), kind: 'win'}); }
  };

  let flagCount = 0;
  for (let k = 0; k < flags.length; k++) if (flags[k]) flagCount++;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={onMenu}><Text style={s.iconText}>‹ Menu</Text></Pressable>
        <Text style={s.gameTitle}>Minesweeper · {DIFFICULTIES[diff].label}</Text>
        <View style={{flexDirection: 'row'}}>
          <Pressable style={s.iconBtn} onPress={() => setRules(true)}><Text style={s.iconText}>Rules</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={newGame}><Text style={s.iconText}>New</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
        </View>
      </View>

      <View style={s.msgZone}>
        {end ? null : <Text style={s.hintText}>Mines: {MINES} · Flags: {flagCount}</Text>}
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
      {rules ? <RulesModal game="mines" onClose={() => setRules(false)} /> : null}
    </View>
  );
}

/* --------------------------------------------------------- Nonogram */

function Nonogram({diff, onMenu, saves, onSave, onDelete}: {
  diff: Diff; onMenu: () => void; saves: GameSave[]; onSave: (s: GameSave) => void; onDelete: (key: string) => void;
}): React.JSX.Element {
  const [puz, setPuz] = useState(() => NONO.generate(NONO.SIZES[diff]));
  const size = puz.size; // follows the current puzzle (so a loaded save can differ)
  const [fill, setFill] = useState<boolean[]>(() => Array(NONO.SIZES[diff] * NONO.SIZES[diff]).fill(false));
  const [marks, setMarks] = useState<boolean[]>(() => Array(NONO.SIZES[diff] * NONO.SIZES[diff]).fill(false));
  const [mode, setMode] = useState<'fill' | 'mark'>('fill');
  const [end, setEnd] = useState<{msg: string; kind: 'win' | 'lose'} | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [rules, setRules] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const idx = useRef({win: 0, lose: 0});

  const newGame = () => {
    const p = NONO.generate(NONO.SIZES[diff]);
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
      data: {size, solution: puz.solution, rowClues: puz.rowClues, colClues: puz.colClues, fill: fill.map(Boolean), marks: marks.map(Boolean)},
    });
    setInfo(existed ? `Updated grid #${key}` : `Saved grid #${key}`);
  };
  const loadSave = (sv: GameSave) => {
    const d = sv.data;
    setPuz({size: d.size, solution: d.solution, rowClues: d.rowClues, colClues: d.colClues});
    setFill(d.fill.slice()); setMarks(d.marks.slice());
    setShown(false); setEnd(null); setInfo('Loaded a saved grid'); setShowSaved(false); setMode('fill');
  };

  const solved = NONO.validate(fill, puz.rowClues, puz.colClues, size);
  const won = end?.kind === 'win';
  useEffect(() => { if (solved && !won && !shown) setEnd({msg: pick(NONO_WIN, idx.current.win++), kind: 'win'}); }, [solved, won, shown]);

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
  const check = () => { if (!solved) setInfo(pick(NONO_LOSE, idx.current.lose++)); };

  const maxRC = Math.max(1, ...puz.rowClues.map(a => a.length));
  const maxCC = Math.max(1, ...puz.colClues.map(a => a.length));
  const cell = Math.max(26, Math.min(56, Math.floor((SCREEN_W - 28) / (size + maxRC * 0.62))));
  const clueW = Math.round(cell * 0.62);
  const leftGutter = maxRC * clueW;
  const topGutter = maxCC * clueW;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={onMenu}><Text style={s.iconText}>‹ Menu</Text></Pressable>
        <Text style={s.gameTitle}>Nonogram · {DIFFICULTIES[diff].label}</Text>
        <View style={{flexDirection: 'row'}}>
          <Pressable style={s.iconBtn} onPress={() => setRules(true)}><Text style={s.iconText}>Rules</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={newGame}><Text style={s.iconText}>New</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={saveNow}><Text style={s.iconText}>Save</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => setShowSaved(true)}><Text style={s.iconText}>Saved ({saves.length})</Text></Pressable>
          <Pressable style={s.iconBtn} onPress={() => PluginManager.closePluginView()}><Text style={s.iconText}>✕</Text></Pressable>
        </View>
      </View>

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
                        borderRightWidth: (c + 1) % 5 === 0 ? 2 : 1, borderBottomWidth: (r + 1) % 5 === 0 ? 2 : 1,
                        borderLeftWidth: c === 0 ? 2 : 0, borderTopWidth: r === 0 ? 2 : 0},
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

/* --------------------------------------------------------------- styles */

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: PAPER, padding: 12},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  brand: {fontSize: 26, fontWeight: '800', color: INK, flexShrink: 1},
  gameTitle: {fontSize: 18, fontWeight: '700', color: INK, flexShrink: 1},
  iconBtn: {borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, marginLeft: 5},
  iconText: {fontSize: 15, fontWeight: '700', color: INK},
  bold: {fontWeight: '800'},

  tagline: {fontSize: 13, color: INK, opacity: 0.7, marginBottom: 14},
  sectionLabel: {fontSize: 11, letterSpacing: 1.6, fontWeight: '700', color: INK, textTransform: 'uppercase', marginTop: 12, marginBottom: 7},
  labelDim: {color: '#B7B7B7'},

  bigChoice: {borderWidth: 2, borderColor: INK, borderRadius: 10, paddingVertical: 18, paddingHorizontal: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  bigChoiceOn: {backgroundColor: INK},
  disabledChoice: {borderColor: '#DDDDDD'},
  bigChoiceText: {fontSize: 19, fontWeight: '700', color: INK},
  bigChoiceBlurb: {fontSize: 12.5, fontWeight: '600', color: MUTE, marginTop: 2},
  moreHint: {fontSize: 12.5, fontWeight: '600', color: MUTE, marginTop: 6},
  tick: {fontSize: 16},
  solidText: {color: PAPER},
  solidTextDim: {color: '#CFCFCF'},

  diffRow: {flexDirection: 'row', gap: 10},
  diffBtn: {flex: 1, borderWidth: 2, borderColor: INK, borderRadius: 8, paddingVertical: 16, alignItems: 'center'},
  diffText: {fontSize: 15, fontWeight: '700', color: INK},
  diffHint: {fontSize: 12, color: MUTE, marginTop: 8},
  playBtn: {backgroundColor: INK, borderRadius: 10, paddingVertical: 19, alignItems: 'center', marginTop: 18},
  playText: {fontSize: 17, fontWeight: '800', color: PAPER},

  centerArea: {flex: 1, justifyContent: 'center'},
  // Fixed-height message band ABOVE the board so its content can change size
  // (big win banner ↔ small hint) without ever moving the board.
  msgZone: {height: 58, justifyContent: 'center', alignItems: 'center'},
  gameHint: {fontSize: 14, color: INK, opacity: 0.72, textAlign: 'center'},
  hintText: {fontSize: 14, color: INK, opacity: 0.72, textAlign: 'center'},
  statusBig: {fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center'},
  winBanner: {fontSize: 34, fontWeight: '800', color: INK, textAlign: 'center'},
  endBanner: {fontSize: 25, fontWeight: '800', color: INK, textAlign: 'center'},
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
  tttStatus: {fontSize: 15, fontWeight: '700', color: INK, textAlign: 'center', marginVertical: 10},
  tttBoard: {width: TCELL * 3, height: TCELL * 3, alignSelf: 'center', marginTop: 6, position: 'relative'},
  tttRow: {flexDirection: 'row', height: TCELL},
  tttCell: {width: TCELL, height: TCELL, alignItems: 'center', justifyContent: 'center'},
  tttCellWin: {backgroundColor: INK},
  tttLineV: {position: 'absolute', top: 0, bottom: 0, width: 4, backgroundColor: INK},
  tttLineH: {position: 'absolute', left: 0, right: 0, height: 4, backgroundColor: INK},
  tttO: {fontSize: Math.round(TCELL * 0.62), color: INK, fontWeight: '400', fontFamily: HAND},
  tttX: {fontSize: Math.round(TCELL * 0.56), color: INK, fontWeight: '800'},
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
  exClueLabel: {fontSize: 15, fontWeight: '800', color: INK, marginRight: 8},

  // bench
  table: {borderWidth: 2, borderColor: INK, borderRadius: 8, marginTop: 12, overflow: 'hidden'},
  tr: {flexDirection: 'row', borderBottomWidth: 1, borderColor: INK},
  trHead: {borderBottomWidth: 2},
  th: {flex: 1, fontSize: 12, fontWeight: '700', color: INK, paddingVertical: 8, textAlign: 'right', paddingRight: 8},
  td: {flex: 1, fontSize: 15, color: INK, paddingVertical: 10, textAlign: 'right', paddingRight: 8, fontVariant: ['tabular-nums']},
  unit: {fontSize: 11, color: INK, opacity: 0.6, padding: 8},
});

export default App;
