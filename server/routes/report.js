import express from 'express';
import { loadSettings, loadMatches, loadSquad, teamName } from '../data.js';
import { playerPoints } from '../stats.js';
import { getFormat, resultLetter } from '../../public/js/rugby.js';
import { generateMatchReport, reportEngine } from '../claude/reportGenerator.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [settings, { matches }, engine] = await Promise.all([loadSettings(), loadMatches(), reportEngine()]);
    const list = matches.map(m => ({
      id: m.id, date: m.date, opposition: m.opposition, homeAway: m.homeAway,
      teamName: teamName(settings, m.team),
      scoreFor: m.scoreFor, scoreAgainst: m.scoreAgainst,
      letter: resultLetter(m.scoreFor, m.scoreAgainst),
    }));
    res.render('report', { settings, engine, cliReady: engine.ready, matches: list, openId: req.query.id || '' });
  } catch (e) { next(e); }
});

// Turn a stored match into a readable, name-resolved summary — this is what
// the coach previews and what Claude is given to write from.
async function matchSummary(id) {
  const [{ matches }, squad, settings] = await Promise.all([loadMatches(), loadSquad(), loadSettings()]);
  const m = matches.find(x => x.id === id);
  if (!m) return null;
  const byId = Object.fromEntries(squad.players.map(p => [p.id, p]));
  const name = (pid) => byId[pid]?.name || 'Unknown player';
  const fmt = getFormat(m.format);
  const posFor = (shirt) => fmt.slots.find(s => s.num === shirt)?.pos || 'Replacement';
  const lines = (m.players || []).map(l => ({
    shirt: l.shirt,
    name: name(l.id),
    position: l.role === 'start' ? posFor(l.shirt) : 'Replacement',
    role: l.role,
    cameOn: l.role === 'bench' ? l.played !== false : undefined,
    tries: l.tries, conversions: l.cons, penalties: l.pens, dropGoals: l.dgs,
    points: playerPoints(l),
    yellowCards: l.yellow, redCards: l.red,
  }));
  return {
    id: m.id,
    club: settings.club.name,
    team: teamName(settings, m.team),
    date: m.date,
    kickoff: m.kickoff,
    competition: m.competition,
    homeAway: m.homeAway,
    venue: m.venue,
    opposition: m.opposition,
    format: fmt.label,
    fullTime: { [settings.club.shortName || 'Us']: m.scoreFor, [m.opposition]: m.scoreAgainst },
    halfTime: (m.htFor !== '' && m.htAgainst !== '') ? { [settings.club.shortName || 'Us']: m.htFor, [m.opposition]: m.htAgainst } : null,
    result: { W: 'Won', L: 'Lost', D: 'Drawn' }[resultLetter(m.scoreFor, m.scoreAgainst)] || 'Unknown',
    captain: m.captainId ? name(m.captainId) : null,
    playerOfTheMatch: m.momId ? name(m.momId) : null,
    scorers: lines.filter(l => l.points > 0).map(l => ({ name: l.name, tries: l.tries, conversions: l.conversions, penalties: l.penalties, dropGoals: l.dropGoals, points: l.points })),
    cards: lines.filter(l => l.yellowCards || l.redCards).map(l => ({ name: l.name, yellow: l.yellowCards, red: l.redCards })),
    teamSheet: lines,
    oppositionScorers: m.oppositionScorers || '',
    coachNotes: m.notes || '',
  };
}

router.get('/match/:id', async (req, res) => {
  const summary = await matchSummary(req.params.id);
  if (!summary) return res.status(404).json({ ok: false, error: 'Match not found' });
  res.json({ ok: true, summary });
});

router.post('/generate', async (req, res) => {
  try {
    const summary = await matchSummary(req.body?.id);
    if (!summary) return res.status(404).json({ ok: false, error: 'Match not found — record it on the Results page first.' });
    const settings = await loadSettings();
    const report = await generateMatchReport({
      summary,
      tone: settings.matchReport?.tone,
      lengthWords: settings.matchReport?.lengthWords,
      clubName: settings.club?.name || 'Ironsides Rugby',
      ageGroup: settings.club?.ageGroup,
      teamName: settings.club?.teamName,
    });
    res.json({ ok: true, report });
  } catch (e) {
    console.error('Report generation failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
