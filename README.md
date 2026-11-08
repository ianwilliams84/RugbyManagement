# Rugby Management

Team-management tool for Rugby. Squad and stat cards, a
drag-and-drop matchday builder (starting XV + replacements), Sky-Sports-style
lineup graphics, a Spond-ready team sheet with a pitch formation, results
tracking and AI match reports.

A rugby sibling of the BICC Team Management site.

## Requirements

- **Windows**, for `runme.exe` and the folder picker. The site itself runs
  anywhere Node does.
- **Node.js 20 or newer**, from https://nodejs.org (the LTS installer is
  fine). The Windows download on the Releases page already includes Node in
  its `node` folder, so it runs without installing it. Running from the
  source code needs Node installed on the machine.

## Setup

```
npm install
```

Run the site with `runme.exe` / `runme.bat` (installs dependencies on the
first run and opens the browser), or:

```
npm run dev
```

Open http://localhost:3001. **On first run every page opens the Setup screen**
(`/setup`) until these are filled in:

1. **Data folder**: where the squad, results, photos and videos are saved. Use a
   shared folder (e.g. a NAS share) on each PC to share one squad.
2. **Your team**: age group and team name, free text.
3. **Spond login**: used to read match availability.
4. **Match reports** (optional, off by default): Claude Code on this PC, an
   Anthropic API key, or off.

Setup saves the per-PC answers (Spond login, data folder, Claude choice, API
key) to `..\secrets\ironsides.env` when that file exists (or wherever
`IRONSIDES_ENV` points), otherwise to the gitignored `pw.env` in this folder.
The age group and team name go in `settings.json` in the data folder, so every
PC sharing it sees the same team. Settings ▸ **Run setup again** changes any
of it later. `PORT` (default 3001) can be set in the same env file.

If the data folder is set but can't be reached (NAS off), the app shows the
Setup screen with a warning rather than starting an empty squad somewhere else.

## Sections

- **Squad** — `/squad`: a stat card per player (appearances, starts, tries, points,
  conversions, penalties, drop goals, Player of the Match awards, cards, last-5
  form). Filter by season and team.
- **Team Builder** — `/builder`: drag players from the pool onto shirt numbers
  1–15 and the bench (16+). Supports 15s, 13s, 10s and 7s. Pick a captain,
  vice-captain and goal kicker. Players picked out of their listed positions
  are shown in amber, and the builder warns if there's no front-row cover on
  the bench. Spond RSVPs float available players to the top of the pool.
- **Lineup Photo** — `/lineup-photo`: 1080×1350 PNG graphic for social media.
- **Spond Sheet** — `/spond`: team sheet PNG / print, plus a draggable pitch formation.
- **Results** — `/results`: record each match's score, who played and who
  scored. **All player stats are built from these records.**
- **Match Report** — `/report`: Claude writes a report from a recorded match.
- **Fixtures** — `/fixtures`: enter the season's fixtures by hand. Away games
  show the driving distance from your home postcode. The Team Builder's
  "Use next fixture" button reads from this list.
- **Settings** — `/settings`: club name and colours, team names, season, Spond
  login, report tone, and the player roster (paste names in bulk, tag positions).

## Data

Player names and photos never go in the repo. Everything is stored in the data
folder chosen during Setup (saved as `IRONSIDES_DATA_DIR`), e.g.
`\\YourNAS\share\IronsidesRugbyData` to share one squad between PCs. The JSON
files, `photos/` and `videos/` live there. If that folder can't be reached, the
app holds on the Setup screen, so it can't quietly create an empty squad
somewhere else. The old in-project `data/`, `photos/` and `videos/` folders are
gitignored and no longer used.

The JSON files:

- `squad.json`: players `{ id, name, positions, teams, notes }`
- `selection.json`: the Team Builder's current matchday squad
- `fixtures.json`: the season schedule
- `matches.json`: recorded results (the source of all stats)
- `settings.json`: club and tool settings

Player photos go in `photos/<player id>.jpg` (ids are shown in Settings → Players).

## Tech

- Node 20+, Express + EJS, vanilla JS
- `public/js/rugby.js`: shared formats, positions, points values and season
  helpers, used by both the server and the browser
- `html2canvas` (CDN) for PNG export
- Match reports are off until chosen in Setup: the local Claude Code CLI
  (`claude -p`, no key needed) or an Anthropic API key
- Driving distances: postcodes.io + the OSRM public router
