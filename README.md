# Ironsides Rugby Management

Team-management tool for Ironsides Rugby (est. 1943). Squad and stat cards, a
drag-and-drop matchday builder (starting XV + replacements), Sky-Sports-style
lineup graphics, a Spond-ready team sheet with a pitch formation, results
tracking and AI match reports.

A rugby sibling of the BICC Team Management site.

## Setup

```
npm install
```

Credentials live in `pw.env` (gitignored). Copy `BLANK pw.env` to `pw.env` and fill in:

```
SPOND_EMAIL=you@example.com
SPOND_PASSWORD=your-password
PORT=3001
```

Run the site with `runme.bat` (installs dependencies on the first run and opens
the browser), or:

```
npm run dev
```

Open http://localhost:3001.

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

Stored as JSON in `data/`:

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
- Match reports use your local Claude Code CLI (`claude -p`); no API key is needed
- Driving distances: postcodes.io + the OSRM public router
