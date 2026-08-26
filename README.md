<div align="center">

# SuperFun

**A pocket arcade of calm, paper‑friendly games for your Supernote.**

Turn your Supernote e‑ink tablet into a little games console — around **20 games**
in one plugin. Pure black &amp; white, finger‑first, no account, no network:
everything is generated and played right on the device.

<table>
  <tr>
    <td><img src="https://raw.githubusercontent.com/AgP42/SuperFun/main/docs/screenshots/home-solo.png" alt="SuperFun — Solo games" width="360"></td>
    <td><img src="https://raw.githubusercontent.com/AgP42/SuperFun/main/docs/screenshots/home-multi.png" alt="SuperFun — Multiplayer, with player names &amp; emojis" width="360"></td>
  </tr>
</table>

</div>

---

## Game gallery

<table>
  <tr>
    <td><img src="https://raw.githubusercontent.com/AgP42/SuperFun/main/docs/screenshots/gallery-1.png" alt="Two‑player duels" width="420"></td>
    <td><img src="https://raw.githubusercontent.com/AgP42/SuperFun/main/docs/screenshots/gallery-2.png" alt="Solo puzzles" width="420"></td>
  </tr>
  <tr>
    <td align="center"><em>Duels &amp; 2‑player</em></td>
    <td align="center"><em>Solo puzzles</em></td>
  </tr>
  <tr>
    <td><img src="https://raw.githubusercontent.com/AgP42/SuperFun/main/docs/screenshots/gallery-3.png" alt="More games" width="420"></td>
    <td><img src="https://raw.githubusercontent.com/AgP42/SuperFun/main/docs/screenshots/gallery-4.png" alt="Even more games" width="420"></td>
  </tr>
  <tr>
    <td align="center"><em>Dice, Snakes &amp; Ladders, picture puzzles…</em></td>
    <td align="center"><em>…and more</em></td>
  </tr>
</table>

## Games

**🧩 Solo puzzles**

| Game | What it does |
|------|--------------|
| **Sudoku** | Unique‑solution grids generated on device. Two‑list input (Answer / Notes), handwritten entries, Check &amp; Give‑a‑hint. |
| **Nonogram** (Picross) | Reveal the picture from row/column clues. Fill / Mark modes, Check, Hint and Solution. |
| **Minesweeper** | Classic sweep with a guaranteed‑safe first tap. Dig / Flag modes, three sizes. |
| **Word Search** | Find hidden words — **68 themes** across **5 languages** (EN · DE · FR · ES · IT). Show/Hide the word list for a harder round. |
| **2048** | Slide &amp; merge to the goal tile. Three grid sizes. |
| **15‑Puzzle** | Slide tiles into order — numbers or **picture** mode, with a hint solver. |
| **Mastermind** | Crack the hidden code. Per‑peg feedback (Easy) or classic aggregated pegs (Medium/Hard). |
| **Peg Solitaire** | Jump and clear the board — Triangle, Cross and Big‑Cross shapes. |
| **Memory** | Flip and match pairs (1–4 players). |
| **Dice Roller** | A simple 1–6 dice roller for any tabletop game. |

**🤖 vs SuperFun (the AI)** — three difficulty levels each

| Game | What it does |
|------|--------------|
| **Chess** | Full rules (castling, en‑passant, promotion), alpha‑beta AI. |
| **Ultimate Tic‑Tac‑Toe** | Nine boards in one, MCTS opponent. |
| **Connect Four** | Drop four in a row against an alpha‑beta AI. |
| **Reversi** | Outflank and flip discs. |
| **Checkers** | Jump, chain and crown kings (8×8). |
| **Dames** | International draughts with flying kings (10×10). |
| **Dots &amp; Boxes** | Claim boxes; also 2–4 players. |
| **Tic‑Tac‑Toe** | Minimax AI — **Hard is unbeatable.** |
| **Battleship** | Place your fleet, then hunt the AI’s ships. |

**👨‍👩‍👧‍👦 Multiplayer (2–4 players, hot‑seat)**

Chess · Tic‑Tac‑Toe · Ultimate TTT · Connect Four · Reversi · Checkers · Dames ·
Dots &amp; Boxes · **Pig** · **Snakes &amp; Ladders** — plus **Battleship** in
“paper mode” (two Supernotes, or one player keeps a paper grid; you can also
screenshot the grids and print them).

Every game ships with an in‑app **“Rules”** card (with a small worked example), so
there’s nothing to memorise.

## Highlights

- **Made on device** — Sudoku grids (guaranteed *unique* solution) and Minesweeper
  boards are generated fresh every time. Nonograms are hand‑drawn pixel‑art pictures,
  each verified to be *uniquely* solvable from its clues.
- **Real opponents** — the duel games use a proper game‑tree search (minimax /
  alpha‑beta / MCTS). Easy plays loose, Hard plays sharp.
- **Auto‑resume + manual saves** — close mid‑game and it’s right there when you
  reopen it; every game also keeps up to 10 manual saves, persisted as JSON in
  the plugin's private storage (kept across sessions, no permission prompt).
- **Family play** — pick 2–4 players, give each a **name and an emoji** (taken
  emojis grey out), with a big “whose turn” indicator.
- **Records &amp; badges** — a 🏆 **Records** page tracks every result: total games
  played, your **top‑3 personal bests** for each solo puzzle (per difficulty), a
  **Nonogram picture gallery** that fills in as you solve, minefield/word‑search
  tallies, and unlockable **achievement badges**. Optionally show your best score
  right inside each game.
- **Built for e‑ink** — high‑contrast B/W, large tap targets, no animation, and a
  layout where the board never jumps around while you play.
- **Offline &amp; private** — no account, no network, nothing leaves your device.

<div align="center">
  <img src="https://raw.githubusercontent.com/AgP42/SuperFun/main/docs/screenshots/records.png" alt="SuperFun Records page — personal bests, Nonogram gallery, tallies and badges" width="380">
  <br><em>The 🏆 Records page — personal bests, a Nonogram picture gallery, tallies and badges.</em>
</div>

## Which version do I need? (Supernote firmware)

Supernote's firmware is called **Chauvet** — that's the platform name (every
recent build is a "Chauvet", much like every recent phone build is an
"Android"), so what matters here is the **version number**. In August 2026
Supernote began rolling out Chauvet **`3.29.43`** (Manta / Nomad) and
**`2.26.40`** (A5 X / A6 X), which add a new plugin **permission system** and
other breaking plugin-API changes. It's a developer preview today and is
expected to reach everyone soon. A build made for one firmware version does
**not** run on the other, so pick the release that matches the version on your
device (check it in the device settings):

| Your Chauvet version | Download |
|---|---|
| Older than `3.29.43` (Manta/Nomad) / `2.26.40` (A5 X / A6 X) | **[v0.28.7](../../releases/tag/v0.28.7)** |
| `3.29.43` (Manta/Nomad) / `2.26.40` (A5 X / A6 X) or later | **[v1.0.1](../../releases/tag/v1.0.1)** |

Both builds carry the same games. **v1.0.1** is rebuilt for `sn-plugin-lib`
0.1.65 and keeps its saves in the plugin's private storage (no file-permission
prompt); once these firmware versions ship publicly it becomes the main build.
Installing the wrong build shows *"package not compatible"* or the plugin does
nothing.

## Install (on the device)

1. Copy `superfun-<version>.snplg` to the **`MyStyle/`** folder on your Supernote
   (USB, or `adb push … /storage/emulated/0/MyStyle/`).
2. On the device: **Settings → Apps → Plugins → Add Plugin → SuperFun**.
3. Open it from the plugin toolbar inside a note or document.

> Updating? Uninstall the old SuperFun first, then add the new one — it ships
> native code, so a clean reinstall is the reliable path.

## Build from source

Requires Node ≥ 18, JDK ≥ 19 and the Android SDK (Platform 35, Build‑Tools 35.0.0).

```bash
npm install
# point these at a JDK 19+ and the Android SDK (Platform 35, Build-Tools 35.0.0)
export JAVA_HOME=/path/to/jdk
export ANDROID_HOME=/path/to/android-sdk
./buildPlugin.sh          # → build/outputs/superfun.snplg
```

`buildPlugin.sh` bundles the JS, compiles the native module and packages the
`.snplg`. (`./bump-and-build.sh` does the same but auto-increments the version and
names the file `superfun-<version>.snplg`.)

The `main` branch targets the **plugin-preview (Chauvet) firmware**
(`sn-plugin-lib` 0.1.65). To build the **stable-firmware** version instead,
check out the `v0.28.7` tag first.

## Under the hood

- **React Native 0.79.2** on the Supernote **PluginHost** runtime, via
  [`sn-plugin-lib`](https://www.npmjs.com/package/sn-plugin-lib).
- Game engines are dependency‑free JavaScript modules in [`src/`](src) — one per
  game (`sudoku.js`, `nonogram.js`, `chess.js`, `uttt.js`, `reversi.js`,
  `checkers.js`, `dames.js`, `wordsearch.js`, `mastermind.js`, …) — usable and
  testable outside the app. The chess engine is perft‑validated.
- A tiny native Kotlin module (`FileStore`) provides `writeText`/`readText` so saves
  can persist to disk (the SDK exposes no generic file‑write from JS).

## Support

SuperFun is free. If it earns a spot in your breaks, you can drop a coffee in the jar:
**[ko‑fi.com/agp42](https://ko-fi.com/agp42)** ☕

## License

MIT — see [LICENSE](LICENSE).
