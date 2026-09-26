import express from 'express';
import { loadSettings, loadFixtures, saveFixtures, loadMatches, newId, teamName } from '../data.js';
import { drivingRoute } from '../geo/distance.js';
import { resultLetter } from '../../public/js/rugby.js';

const router = express.Router();
const todayIso = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

router.get('/', async (req, res, next) => {
  try {
    const settings = await loadSettings();
    res.render('fixtures', { settings, homePostcode: settings.homePostcode || '' });
  } catch (e) { next(e); }
});

// Next fixture from today's date — used by the Team Builder to prefill match
// details. Optional ?team= limits it to one side.
router.get('/next', async (req, res) => {
  try {
    const { fixtures } = await loadFixtures();
    const team = Number(req.query.team) || 0;
    const next = fixtures
      .filter(f => f.date && f.date >= todayIso() && (!team || Number(f.team) === team))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.kickoff).localeCompare(String(b.kickoff)))[0] || null;
    res.json({ ok: true, fixture: next });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/data', async (req, res) => {
  try {
    const [settings, { fixtures }, { matches }] = await Promise.all([loadSettings(), loadFixtures(), loadMatches()]);
    const team = Number(req.query.team) || 0;
    const homePostcode = settings.homePostcode || '';
    const list = fixtures.filter(f => !team || Number(f.team) === team);

    // Driving distance once per unique postcode (home games skip it).
    const distanceByPc = {};
    if (homePostcode) {
      const pcs = [...new Set(list.filter(f => f.postcode && f.homeAway === 'away').map(f => f.postcode))];
      await Promise.all(pcs.map(async pc => { distanceByPc[pc] = await drivingRoute(homePostcode, pc); }));
    }
    const matchByFixture = new Map(matches.filter(m => m.fixtureId).map(m => [m.fixtureId, m]));
    const decorate = (f) => {
      const d = f.postcode ? distanceByPc[f.postcode] : null;
      const m = matchByFixture.get(f.id);
      return {
        ...f,
        teamName: teamName(settings, f.team),
        distanceMiles: d ? d.km * 0.621371 : null,
        durationMin: d?.minutes ?? null,
        result: m ? { id: m.id, scoreFor: m.scoreFor, scoreAgainst: m.scoreAgainst, letter: resultLetter(m.scoreFor, m.scoreAgainst) } : null,
      };
    };
    const today = todayIso();
    res.json({
      ok: true,
      homePostcode,
      upcoming: list.filter(f => f.date >= today).map(decorate),
      past: list.filter(f => f.date < today).reverse().map(decorate),
    });
  } catch (e) {
    console.error('fixtures/data failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

function cleanFixture(b, existing = {}) {
  const s = (v, n) => String(v ?? '').trim().slice(0, n);
  return {
    ...existing,
    date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : (existing.date || ''),
    kickoff: s(b.kickoff, 10),
    team: [1, 2, 3].includes(Number(b.team)) ? Number(b.team) : 1,
    opposition: s(b.opposition, 100),
    homeAway: b.homeAway === 'away' ? 'away' : 'home',
    venue: s(b.venue, 120),
    postcode: s(b.postcode, 12).toUpperCase(),
    competition: s(b.competition, 80),
    notes: s(b.notes, 300),
  };
}

router.post('/save', async (req, res, next) => {
  try {
    const b = req.body || {};
    const data = await loadFixtures();
    const cleaned = b.id ? null : cleanFixture(b);
    if (cleaned && (!cleaned.date || !cleaned.opposition)) {
      return res.status(400).json({ ok: false, error: 'Date and opposition are required.' });
    }
    let fx;
    if (b.id) {
      const i = data.fixtures.findIndex(f => f.id === b.id);
      if (i < 0) return res.status(404).json({ ok: false, error: 'Fixture not found' });
      fx = cleanFixture(b, data.fixtures[i]);
      if (!fx.date || !fx.opposition) return res.status(400).json({ ok: false, error: 'Date and opposition are required.' });
      data.fixtures[i] = fx;
    } else {
      fx = { id: newId('fx'), ...cleaned };
      data.fixtures.push(fx);
    }
    await saveFixtures(data);
    res.json({ ok: true, fixture: fx });
  } catch (e) { next(e); }
});

router.post('/delete', async (req, res, next) => {
  try {
    const data = await loadFixtures();
    const before = data.fixtures.length;
    data.fixtures = data.fixtures.filter(f => f.id !== req.body?.id);
    if (data.fixtures.length === before) return res.status(404).json({ ok: false, error: 'Fixture not found' });
    await saveFixtures(data);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
