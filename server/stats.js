import { POINTS, resultLetter } from '../public/js/rugby.js';

export function playerPoints(line) {
  return (Number(line.tries) || 0) * POINTS.try
    + (Number(line.cons) || 0) * POINTS.con
    + (Number(line.pens) || 0) * POINTS.pen
    + (Number(line.dgs) || 0) * POINTS.dg;
}

// Build season stats for every player from the recorded matches.
// Returns { [playerId]: { apps, starts, subs, tries, cons, pens, dgs, points,
//   mom, yellow, red, last5: [{ code, tries, points, date, opposition }] } }
// where code is S (started), B (came off the bench) or – (not selected).
// `team` (1–3) limits the stats to one side's matches when given.
export function computeStats(matches, { season, team } = {}) {
  const inScope = matches
    .filter(m => !season || m.season === season)
    .filter(m => !team || Number(m.team) === Number(team))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));   // newest first

  const out = {};
  const blank = () => ({ apps: 0, starts: 0, subs: 0, tries: 0, cons: 0, pens: 0, dgs: 0, points: 0, mom: 0, yellow: 0, red: 0, last5: [] });

  for (const m of inScope) {
    for (const line of m.players || []) {
      if (!line.id) continue;
      const s = out[line.id] || (out[line.id] = blank());
      const played = line.role === 'start' || line.played !== false;
      if (!played) continue;
      s.apps++;
      if (line.role === 'start') s.starts++; else s.subs++;
      s.tries += Number(line.tries) || 0;
      s.cons += Number(line.cons) || 0;
      s.pens += Number(line.pens) || 0;
      s.dgs += Number(line.dgs) || 0;
      s.yellow += Number(line.yellow) || 0;
      s.red += Number(line.red) || 0;
      s.points += playerPoints(line);
    }
    if (m.momId) (out[m.momId] || (out[m.momId] = blank())).mom++;
  }

  // Last-5 form: the five most recent matches in scope, per player, with
  // "–" for matches they weren't involved in.
  const recent = inScope.slice(0, 5);
  for (const [id, s] of Object.entries(out)) {
    s.last5 = recent.map(m => {
      const line = (m.players || []).find(l => l.id === id);
      const played = line && (line.role === 'start' || line.played !== false);
      if (!played) return { code: '–', tries: 0, points: 0, date: m.date, opposition: m.opposition };
      return {
        code: line.role === 'start' ? 'S' : 'B',
        tries: Number(line.tries) || 0,
        points: playerPoints(line),
        date: m.date,
        opposition: m.opposition,
        mom: m.momId === id,
      };
    });
  }
  return out;
}

// Team record for a set of matches: P W D L, points for/against.
export function teamRecord(matches) {
  const r = { played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0 };
  for (const m of matches) {
    const res = resultLetter(m.scoreFor, m.scoreAgainst);
    if (!res) continue;
    r.played++;
    if (res === 'W') r.won++; else if (res === 'L') r.lost++; else r.drawn++;
    r.pointsFor += Number(m.scoreFor) || 0;
    r.pointsAgainst += Number(m.scoreAgainst) || 0;
  }
  return r;
}

export function availableSeasons(matches, current) {
  const set = new Set(matches.map(m => m.season).filter(Boolean));
  if (current) set.add(current);
  return [...set].sort().reverse();
}
