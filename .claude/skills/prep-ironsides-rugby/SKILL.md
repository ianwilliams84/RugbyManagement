---
name: prep-ironsides-rugby
description: Prepare a fresh working session on Ironsides Rugby Management (the squad / team builder / lineup photo / Spond / results site in dev\IronsidesRugbyManagement). Checks git commits and pushes as ianwilliams84, syncs with GitHub (pulls what's waiting, surfaces what needs committing), makes sure no player names, photos or Spond credentials are heading for git, syncs the AI_Skills repo and loads the skills from it that this project uses, checks Node and dependencies, confirms the shared NAS squad folder is reachable, and checks the running server is up and on the current code. Use at the start of any Ironsides session, or when the user says "prep ironsides rugby", "prep ironsides", "prep IRM", "start an Ironsides session", "get Ironsides ready", or asks what state the rugby site is in.
---

# Prep an Ironsides Rugby Management session

Run this before doing any work on Ironsides. Work through the stages in order.
Each one can change what the next should do.

0. Will git talk to GitHub as `ianwilliams84`, the only account allowed here?
1. Is this machine in step with GitHub?
2. Is there uncommitted work, and is any of it private?
3. Is AI_Skills current, and are the skills this project uses loaded?
4. Are Node and the dependencies in place?
5. Are the secrets file and the NAS squad folder reachable?
6. Is the server up, and is it running the current code?

Finish by reporting state, not by starting work. The user decides what happens
next.

| Thing | Where |
| --- | --- |
| Repo | `%USERPROFILE%\dev\IronsidesRugbyManagement` → `github.com/ianwilliams84/RugbyManagement` (**public** since 2026-11-08; renamed from IronsidesRugbyManagement) |
| Skills repo | `%USERPROFILE%\dev\AI_Skills` → `github.com/helpskile/AI_Skills` |
| Secrets | `%USERPROFILE%\dev\secrets\ironsides.env` (`SPOND_EMAIL`, `SPOND_PASSWORD`, `PORT`, `IRONSIDES_DATA_DIR`) |
| Squad data | `\\IanNAS\home\IronsidesRugbyData` (squad, matches, selection, fixtures, photos, videos) |
| Port | `PORT` in the secrets file, normally **3001** |
| Node | `C:\Program Files\nodejs` (not on PATH) |
| gh | `C:\Program Files\GitHub CLI\gh.exe` (not on PATH) |

Prefix every Node command with:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
```

**This project holds children's names and faces.** The user's rule
(2026-11-06): no player names, photos or videos ever go to GitHub. Stage 2 is
built around that rule.

---

## Scope: Ironsides only

The session may have other working directories attached (TMP, TaskManager,
Graveney, HomeFinances, IanAdmin, BICC…). **Ignore them for the whole
session.** Don't search them, don't offer fixes for them, don't mention what
you noticed in them. The exceptions are `AI_Skills`, which Stage 3 reads from,
and `dev\secrets`, where only the key names are checked. If the user's request
genuinely needs another project, say so and ask first.

BICC_Team_Management is the cricket sibling this site was modelled on. It's
fine to *read* it for a pattern when the user asks for something "like BICC
does", but say you're doing it, and never edit it from an Ironsides session.

---

## Stage 0: commits and pushes are only ever `ianwilliams84`

**The user's rule: this repo is committed and pushed as `ianwilliams84`, never
`helpskile`.** This PC's `gh` is logged into both accounts, and other sessions
flip the *active* one mid-task. The repo is public, so the wrong account can
still pull, but a push as helpskile is refused. So the repo pins its own credential in `.git/config`. Check the pin is
still there:

```bash
cd "$HOME/dev/IronsidesRugbyManagement"
git config --local --get-all credential.https://github.com.helper
git config --local user.name
git config --local user.email
```

Expect **two** helper lines: an empty one first (it clears the inherited global
gh helper, which would otherwise answer first and win), then one naming
`--user ianwilliams84`. Expect `ianwilliams84` / `ianwilliams84@gmail.com`. If
anything is missing or names another account, repair it:

```bash
git config --local --unset-all credential.https://github.com.helper
git config --local --add credential.https://github.com.helper ""
git config --local --add credential.https://github.com.helper '!f() { test "$1" = get && echo username=ianwilliams84 && echo "password=$("/c/Program Files/GitHub CLI/gh.exe" auth token --user ianwilliams84)"; }; f'
git config --local user.name ianwilliams84
git config --local user.email ianwilliams84@gmail.com
```

Then prove the account can actually see the repo. `gh` commands (`gh pr`,
`gh release`, `gh api`) ignore the git pin and use the active account, so hand
them the token per command:

```bash
GH="/c/Program Files/GitHub CLI/gh.exe"
GH_TOKEN="$("$GH" auth token --user ianwilliams84)" "$GH" repo view ianwilliams84/RugbyManagement --json nameWithOwner,visibility -q '.nameWithOwner + " " + .visibility'
```

Expect `ianwilliams84/RugbyManagement PUBLIC`. **Because it's public, anything
committed is visible to everyone**, which makes the Stage 2 privacy check matter
even more. If `auth token --user
ianwilliams84` fails, the ianwilliams84 login has fallen out of the gh keyring:
stop and ask the user to run `gh auth login` for it. Don't work around it with
the helpskile account.

**Never** run `gh auth switch`, because it changes the account under every
other project's feet. Never commit with `-c user.email=...` or `--author` for
another account here.

---

## Stage 1: where does this machine stand?

```bash
cd "$HOME/dev/IronsidesRugbyManagement" && git fetch origin -q
git status --porcelain
git rev-list --left-right --count main...origin/main
git log --oneline -3
```

Read `rev-list` as `<ahead> <behind>`:

| Ahead | Behind | Means | Do |
| --- | --- | --- | --- |
| 0 | 0 | In step | Nothing. Go to Stage 2. |
| 0 | N | Another machine pushed | Pull (below). |
| N | 0 | Local commits never pushed | List them and offer to push. Don't push unasked. |
| N | M | Diverged | **Stop and tell the user.** Don't merge or rebase on your own judgement. |

Before pulling, check for collisions with uncommitted work:

```bash
comm -12 <(git diff --name-only main..origin/main | sort) \
         <(git status --porcelain | sed 's/^...//' | sort)
```

Empty output means `git pull --ff-only` is safe even with a dirty tree. If it
lists files, stop and show the user: those are where their uncommitted work
meets incoming changes.

Always report the uncommitted file count alongside the ahead/behind. "Clean and
2 behind" and "12 uncommitted and 2 behind" are very different situations.

---

## Stage 2: uncommitted work, and the privacy check

Report uncommitted work; don't resolve it unasked. Group it ("11 modified, 1
new") and say what it looks like (a feature in the builder, a launcher
rebuild…). Flag untracked files that are clearly new work, since no other
machine has them.

Then run the privacy check. **Every line of it must come back clean:**

```bash
cd "$HOME/dev/IronsidesRugbyManagement"
# 1. Nothing private tracked or staged
git ls-files data pw.env .env | head
git ls-files photos videos | grep -v README.md
git status --porcelain | grep -E ' (data/|photos/|videos/|pw\.env|\.env$)'
# 2. The ignore rules are still there
for p in data/x photos/x.jpg videos/x.mp4 pw.env .env; do git check-ignore -q "$p" || echo "NOT IGNORED: $p"; done
# 3. The tracked template is still blank (prints key names only, never values)
sed -E 's/=.+/=<HAS A VALUE>/; s/=$/=<empty>/' "BLANK pw.env"
# 4. No credentials crept into changed or new files
git diff --name-only; git ls-files --others --exclude-standard
git diff HEAD | grep -nE '^\+.*SPOND_(EMAIL|PASSWORD)\s*[=:]\s*\S' | sed -E 's/([=:]\s*).*/\1<redacted>/'
```

In `BLANK pw.env`, `SPOND_EMAIL` and `SPOND_PASSWORD` must be `<empty>`.
`PORT` having a value is fine.

**If any check fails, say so first in the report, in bold, and do not commit.**
That includes a real player name hard-coded into a new JS or EJS file (sample
data, a test fixture, a comment). Names belong only in the NAS folder. When you
read the squad files to answer a question, keep player names out of anything
written to the repo.

Never print the values from `dev\secrets\ironsides.env` or any `pw.env`. Show
key names only.

Only commit when the user asks. A commit here also means rebuilding `runme.exe`
when `tools/runme-launcher.cs` changed, so ask whether the `.exe` in the
working tree is the one they want to ship.

---

## Stage 3: AI_Skills, and the skills this project uses

The user's reusable skills live in the **AI_Skills** repo. Ironsides doesn't run
any of them itself, but several are useful for rugby-club work. Load them at
the start of the session so they're ready.

### 3a. Find and sync AI_Skills

Use the first of these that contains `.claude/skills`:
`$SKILL_PROJECT`, `~/IansAISkills`, `~/dev/AI_Skills`, `../AI_Skills`.

```bash
cd "$HOME/dev/AI_Skills" && git fetch origin -q
git status --porcelain
git rev-list --left-right --count main...origin/main
```

- **Behind, no collisions** (same `comm -12` check as Stage 1): `git pull --ff-only`.
- **Ahead or dirty:** report it and leave it alone. That's another session's
  unfinished skill work.
- **Diverged:** report it, don't touch it.

**This session never commits or pushes AI_Skills.** That repo belongs to the
`helpskile` account, which is a different identity from this project. If the
user wants a skill changed, say so, and handle it as AI_Skills work with its
own account rules, not as part of Ironsides.

If the pull changed any skills, list them
(`git diff --stat HEAD@{1} HEAD -- .claude/skills`). Claude Code reads skill
definitions when a session starts, so a **new or renamed** skill only becomes
a `/command` in a new session. Until then, follow it by reading its `SKILL.md`.

### 3b. Load the relevant skills

| Skill | Why Ironsides uses it | Load |
| --- | --- | --- |
| `show-repo-status` | Confirms which GitHub account each repo pushes as. It's the quick cross-check for the ianwilliams84 rule. | **Always** |
| `organize-photos-by-month` | Tidies the match photos and videos in `\\IanNAS\home\IronsidesRugbyData\photos` and `\videos` into `YYYY.MM` folders by capture date. | **Always** |
| `series-trophy` | Two-team trophy with crests built from a club logo. It's cricket-styled, but it's the starting point for a rugby fixture or end-of-season trophy. | When the user mentions a trophy, crest, plaque or award |
| `render-scad-to-stl` | Turns any of the OpenSCAD models into a printable STL. `series-trophy` depends on it. | With `series-trophy`, or for any 3D print |

Check they're all present:

```bash
S="$HOME/dev/AI_Skills/.claude/skills"
for s in show-repo-status organize-photos-by-month series-trophy render-scad-to-stl; do
  [ -f "$S/$s/SKILL.md" ] && echo "ok       $s" || echo "MISSING  $s"; done
```

Then **read the full `SKILL.md`** of each "Always" skill with the Read tool, so
its instructions are in context for the session. Read the on-request ones only
when the work calls for them, because `series-trophy` is long.

If AI_Skills is an attached working directory, these skills also appear as
`/commands`. If it isn't (the session was opened in Ironsides alone), they
won't. Follow them from the `SKILL.md` you read, and mention that
`/add-dir ..\AI_Skills` makes them proper commands.

`organize-photos-by-month` **moves files**. On the NAS photos folder, always run
its plan (dry-run) step and show the user the plan before any move. The site's
photo pages read from those folders, so tell the user that moved files may need
re-linking in the app.

Don't run any of these skills as part of the prep. Loading means "ready to
use", not "used".

---

## Stage 4: Node and dependencies

There's no build step: Express and EJS run straight from source.

```bash
cd "$HOME/dev/IronsidesRugbyManagement" && export PATH="/c/Program Files/nodejs:$PATH"
node -v
git diff --name-only HEAD@{1} HEAD -- package.json package-lock.json 2>/dev/null
ls node_modules/express >/dev/null 2>&1 || echo "node_modules missing"
npm ls --depth=0 2>&1 | tail -5
```

Run `npm install` if the pull moved `package.json`/`package-lock.json`, if
`node_modules` is missing, or if `npm ls` reports missing or invalid packages.

There's no test suite. As a quick check that the code loads, syntax-check every
server file plus anything changed in `public/js`:

```bash
for f in $(git ls-files 'server/*.js' 'server/**/*.js') $(git ls-files --others --exclude-standard -- 'public/js/*.js') $(git diff --name-only -- 'public/js/*.js'); do
  node --check "$f" 2>&1 | head -3 | sed "s|^|$f: |"; done
```

No output means it's clean. A failure here explains a server that won't start
or a page that's gone blank.

---

## Stage 5: secrets file and the NAS

```bash
E="$HOME/dev/secrets/ironsides.env"
[ -f "$E" ] && sed -E 's/=.+/=<set>/; s/=$/=<EMPTY>/' "$E" | grep -v '^$' || echo "MISSING: $E"
ls "//IanNAS/home/IronsidesRugbyData" 2>&1
for f in squad.json matches.json selection.json fixtures.json; do
  [ -f "//IanNAS/home/IronsidesRugbyData/$f" ] && echo "ok $f ($(date -r "//IanNAS/home/IronsidesRugbyData/$f" '+%d %b %H:%M'))" || echo "missing $f"; done
```

- The keys should be `<set>`. `CLAUDE_MODE` (`cli` / `api` / `off`) and
  `ANTHROPIC_API_KEY` are optional; unset means off (no match reports).
- Then ask the app whether first-run setup is complete. This is read-only, and
  it prints no secrets:

  ```bash
  cd "$HOME/dev/IronsidesRugbyManagement" && export PATH="/c/Program Files/nodejs:$PATH"
  node --input-type=module -e "const {setupStatus}=await import('./server/config.js');const s=await setupStatus({fresh:true});console.log(JSON.stringify({complete:s.complete,dataFolder:s.dataFolder.done,team:s.team.done,spond:s.spond.done,claude:s.claude.mode}))"
  ```

  If `complete` is false, every page redirects to `/setup` until it's
  finished. Say which sections are missing. The user fills them in through the
  browser, so don't write them into the env file or `settings.json` yourself.
- **NAS unreachable:** the app holds every page on the Setup screen with a
  "can't reach" warning rather than write a fresh, empty squad locally. Say
  that plainly. Don't "fix" it by blanking
  `IRONSIDES_DATA_DIR` or pointing it at the local `data/`, which is an old copy
  that would drift from the shared squad. Ask the user.
- Report squad size and the latest match date at the level of "38 players, last
  result 1 Nov". **No names in the report.**

To edit the secrets file, use the Edit tool. Writing the UNC path from bash eats
the backslashes.

---

## Stage 6: is the server up and current?

```bash
PORT=$(grep -E '^PORT=' "$HOME/dev/secrets/ironsides.env" | cut -d= -f2 | tr -d '\r'); PORT=${PORT:-3001}
netstat -ano | grep -E ":$PORT .*LISTEN"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:$PORT/"
```

`302` or `200` means it's up. To see whether it's on the current code, compare
when it started with the newest edit:

```bash
wmic process where ProcessId=<PID> get CommandLine,CreationDate
cd "$HOME/dev/IronsidesRugbyManagement"
ls -t --time-style=+'%Y-%m-%d %H:%M' -l server/*.js server/*/*.js views/*.ejs views/partials/*.ejs | head -1
```

- **A `server/` file is newer than the process:** the server is on old code and
  needs a restart. That's not true if it was started with `npm run dev`
  (`node --watch`), which restarts itself.
- **Only `views/` or `public/` are newer:** a browser refresh is enough. Use a
  hard refresh (Ctrl+F5) for CSS and JS.
- **Not running:** say so. The user starts it by double-clicking `runme.exe`,
  which opens the browser.

Don't kill or restart the server unasked. It may be serving someone on match
day.

The Match Report page shells out to the Claude Code CLI
(`server/claude/reportGenerator.js` looks in `%APPDATA%\npm`, `~\.local\bin`,
then the VS Code extension's bundled `claude.exe`). Check one exists, and report
"Match reports: Claude CLI found / not found":

```bash
ls "$APPDATA/npm/claude.cmd" "$USERPROFILE/.local/bin/claude.exe" 2>/dev/null; ls -d "$USERPROFILE"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe 2>/dev/null | tail -1
```

---

## Stage 7: report, then stop

A short, factual summary, as a table where it helps. No preamble.

- **Account:** commits and pushes as ianwilliams84, pin in place / repaired, gh token can see the repo
- **GitHub:** in step / pulled N commits / N local commits unpushed (list them) / diverged
- **Uncommitted:** count and shape, or "clean"
- **Privacy:** clean, or **in bold** exactly what failed
- **AI_Skills:** in step / pulled N (skills changed: …) / dirty, left alone. Skills loaded: show-repo-status, organize-photos-by-month. Available on request: series-trophy, render-scad-to-stl.
- **Node / deps:** version, installed or not needed, syntax check clean
- **Secrets & NAS:** keys set, NAS reachable, squad size and last result date
- **Server:** up on :PORT on current code / needs restart / needs refresh / not running. Match reports: CLI found or not.

Then ask what they want to work on. **Do not start work, do not commit, push
or restart unasked, and do not tidy up while you're there.**
