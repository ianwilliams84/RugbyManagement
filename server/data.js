import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_FORMAT, getFormat, normaliseFormat, seasonForDate } from '../public/js/rugby.js';
import { paths } from './envPath.js';

export { paths };

async function readJson(file, fallback) {
  try {
    const text = await fs.readFile(path.join(paths.dataDir, file), 'utf8');
    return JSON.parse(text);
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.writeFile(path.join(paths.dataDir, file), JSON.stringify(data, null, 2));
}

// ── Squad ──────────────────────────────────────────────────────────────────
// { players: [{ id, name, positions: ['Prop', …], teams: [1,2], notes }] }
export async function loadSquad() {
  const squad = await readJson('squad.json', { players: [] });
  squad.players = (squad.players || []).map(p => ({
    ...p,
    positions: Array.isArray(p.positions) ? p.positions : [],
    teams: Array.isArray(p.teams) ? p.teams : [],
    notes: p.notes || '',
  }));
  return squad;
}

export async function saveSquad(squad) {
  await writeJson('squad.json', squad);
}

// ── Current selection (the Team Builder's working team) ────────────────────
export function emptySelection() {
  return {
    matchTitle: '', matchDate: '', kickoff: '', opposition: '', venue: '', homeAway: 'home',
    team: 1, teamName: '', fixtureId: null,
    format: DEFAULT_FORMAT, benchSize: getFormat(DEFAULT_FORMAT).defaultBench,
    lineup: [], bench: [],
    captainId: null, viceCaptainId: null, kickerId: null,
  };
}

export async function loadSelection() {
  const s = { ...emptySelection(), ...(await readJson('selection.json', {})) };
  s.format = normaliseFormat(s.format);
  const fmt = getFormat(s.format);
  s.benchSize = Math.max(0, Math.min(fmt.maxBench, Number.isFinite(Number(s.benchSize)) ? Number(s.benchSize) : fmt.defaultBench));
  s.lineup = Array.isArray(s.lineup) ? s.lineup.slice(0, fmt.slots.length) : [];
  s.bench = Array.isArray(s.bench) ? s.bench.slice(0, s.benchSize) : [];
  return s;
}

export async function saveSelection(selection) {
  await writeJson('selection.json', selection);
}

// ── Settings ───────────────────────────────────────────────────────────────
export async function loadSettings() {
  const s = await readJson('settings.json', {});
  s.club = {
    name: 'Ironsides Rugby', shortName: 'Ironsides', founded: '1943',
    primaryColor: '#1C7732', primaryDark: '#0E3F1A',
    ageGroup: '', teamName: '',
    ...(s.club || {}),
  };
  s.teams = s.teams || {};
  const names = Array.isArray(s.teams.names) ? s.teams.names.slice(0, 3) : [];
  while (names.length < 3) names.push('');
  if (!names.some(Boolean)) names.splice(0, 3, '1st XV', '2nd XV', '3rd XV');
  s.teams.names = names;
  s.season = s.season || {};
  s.season.current = s.season.current || seasonForDate();
  s.homePostcode = typeof s.homePostcode === 'string' ? s.homePostcode : '';
  s.spond = { currentEventId: '', ...(s.spond || {}) };
  s.lineup = { featuredPlayerId: null, ...(s.lineup || {}) };
  s.matchReport = {
    tone: 'Upbeat club-website style. Celebrate the effort and the standout performers; be honest but generous in defeat.',
    lengthWords: 500,
    ...(s.matchReport || {}),
  };
  return s;
}

export async function saveSettings(settings) {
  await writeJson('settings.json', settings);
}

export function teamName(settings, n) {
  const i = Number(n) - 1;
  return (settings.teams?.names?.[i] || '').trim() || `Team ${n}`;
}

// The Team Builder's free-text team name (e.g. "U14s II & IIIs"), falling
// back to the squad's name from Settings when it's left blank.
export function selectionTeamName(settings, selection) {
  return String(selection.teamName || '').trim() || teamName(settings, selection.team);
}

// ── Fixtures ───────────────────────────────────────────────────────────────
// { fixtures: [{ id, date, kickoff, team, opposition, homeAway, venue, postcode, competition, notes }] }
export async function loadFixtures() {
  const f = await readJson('fixtures.json', { fixtures: [] });
  f.fixtures = Array.isArray(f.fixtures) ? f.fixtures : [];
  return f;
}

export async function saveFixtures(fixtures) {
  fixtures.fixtures.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.kickoff).localeCompare(String(b.kickoff)));
  await writeJson('fixtures.json', fixtures);
}

// ── Recorded matches (results) ─────────────────────────────────────────────
// The rugby equivalent of a scorecard, and the source of every player stat.
export async function loadMatches() {
  const m = await readJson('matches.json', { matches: [] });
  m.matches = Array.isArray(m.matches) ? m.matches : [];
  return m;
}

export async function saveMatches(matches) {
  matches.matches.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  await writeJson('matches.json', matches);
}

export async function listPhotoFiles() {
  try {
    const files = await fs.readdir(paths.photosDir);
    return files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

export function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
