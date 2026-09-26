import express from 'express';
import {
  loadSquad, loadSelection, loadSettings, loadMatches, saveMatches, loadFixtures, newId, teamName,
} from '../data.js';
import { teamRecord, availableSeasons, playerPoints } from '../stats.js';
import { getFormat, normaliseFormat, seasonForDate, resultLetter } from '../../public/js/rugby.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [squad, settings, { matches }, { fixtures }] = await Promise.all([loadSquad(), loadSettings(), loadMatches(), loadFixtures()]);
    const seasons = availableSeasons(matches, settings.season.current);
    const season = seasons.includes(req.query.season) ? req.query.season : settings.season.current;
    const inSeason = matches.filter(m => m.season === season);
    res.render('results', {
      squad, settings, seasons, season,
      matches: inSeason.map(m => ({ ...m, letter: resultLetter(m.scoreFor, m.scoreAgainst), teamName: teamName(settings, m.team) })),
      record: teamRecord(inSeason),
      fixtures,
      openId: req.query.id || '',
      fixtureId: req.query.fixture || '',
    });
  } catch (e) { next(e); }
});

router.get('/match/:id', async (req, res) => {
  const { matches } = await loadMatches();
  const m = matches.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Match not found' });
  res.json({ ok: true, match: m });
});

// A blank match pre-filled from the Team Builder's current selection (and,
// when ?fixture= is given, that fixture's date / opposition / venue).
router.get('/draft', async (req, res) => {
  const [sel, { fixtures }] = await Promise.all([loadSelection(), loadFixtures()]);
  const fx = req.query.fixture ? fixtures.find(f => f.id === req.query.fixture) : null;
  const fmt = getFormat(sel.format);
  const players = [];
  sel.lineup.forEach((id, i) => { if (id) players.push(blankLine(id, fmt.slots[i]?.num ?? i + 1, 'start')); });
  sel.bench.forEach((id, i) => { if (id) players.push(blankLine(id, fmt.slots.length + i + 1, 'bench')); });
  const date = fx?.date || sel.matchDate || new Date().toLocaleDateString('en-CA');
  res.json({
    ok: true,
    match: {
      id: '',
      date,
      kickoff: fx?.kickoff || sel.kickoff || '',
      season: seasonForDate(date),
      team: fx?.team || sel.team || 1,
      fixtureId: fx?.id || sel.fixtureId || null,
      opposition: fx?.opposition || sel.opposition || '',
      venue: fx?.venue || sel.venue || '',
      homeAway: fx?.homeAway || sel.homeAway || 'home',
      competition: fx?.competition || '',
      format: sel.format,
      scoreFor: '', scoreAgainst: '', htFor: '', htAgainst: '',
      players,
      captainId: sel.captainId || null,
      momId: null,
      oppositionScorers: '',
      notes: '',
    },
  });
});

function blankLine(id, shirt, role) {
  return { id, shirt, role, played: true, tries: 0, cons: 0, pens: 0, dgs: 0, yellow: 0, red: 0 };
}

const int = (v, max = 999) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };
const optInt = (v) => (v === '' || v == null) ? '' : int(v);
const str = (v, n) => String(v ?? '').trim().slice(0, n);

router.post('/save', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) return res.status(400).json({ ok: false, error: 'A match date is required.' });
    if (!str(b.opposition, 100)) return res.status(400).json({ ok: false, error: 'Opposition is required.' });
    const squad = await loadSquad();
    const known = new Set(squad.players.map(p => p.id));
    const seen = new Set();
    const players = (Array.isArray(b.players) ? b.players : [])
      .filter(l => l && typeof l.id === 'string' && known.has(l.id) && !seen.has(l.id) && seen.add(l.id))
      .map(l => ({
        id: l.id,
        shirt: int(l.shirt, 99),
        role: l.role === 'bench' ? 'bench' : 'start',
        played: l.role === 'bench' ? l.played !== false : true,
        tries: int(l.tries, 20), cons: int(l.cons, 30), pens: int(l.pens, 30), dgs: int(l.dgs, 10),
        yellow: int(l.yellow, 2), red: int(l.red, 1),
      }))
      .sort((a, b2) => a.shirt - b2.shirt);
    const match = {
      id: b.id || newId('m'),
      date: b.date,
      kickoff: str(b.kickoff, 10),
      season: seasonForDate(b.date),
      team: [1, 2, 3].includes(Number(b.team)) ? Number(b.team) : 1,
      fixtureId: typeof b.fixtureId === 'string' && b.fixtureId ? b.fixtureId : null,
      opposition: str(b.opposition, 100),
      venue: str(b.venue, 120),
      homeAway: b.homeAway === 'away' ? 'away' : 'home',
      competition: str(b.competition, 80),
      format: normaliseFormat(b.format),
      scoreFor: optInt(b.scoreFor),
      scoreAgainst: optInt(b.scoreAgainst),
      htFor: optInt(b.htFor),
      htAgainst: optInt(b.htAgainst),
      players,
      captainId: known.has(b.captainId) ? b.captainId : null,
      momId: known.has(b.momId) ? b.momId : null,
      oppositionScorers: str(b.oppositionScorers, 1000),
      notes: str(b.notes, 4000),
      updatedAt: new Date().toISOString(),
    };
    const data = await loadMatches();
    const i = data.matches.findIndex(m => m.id === match.id);
    if (i >= 0) data.matches[i] = match; else data.matches.push(match);
    await saveMatches(data);
    const scored = players.reduce((s, l) => s + playerPoints(l), 0);
    res.json({ ok: true, match, scorerPoints: scored });
  } catch (e) { next(e); }
});

router.post('/delete', async (req, res, next) => {
  try {
    const data = await loadMatches();
    const before = data.matches.length;
    data.matches = data.matches.filter(m => m.id !== req.body?.id);
    if (data.matches.length === before) return res.status(404).json({ ok: false, error: 'Match not found' });
    await saveMatches(data);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
