// Shared rugby knowledge — imported by the server (EJS views, stats) and the
// browser (Team Builder, formation editor). Keep it dependency-free.

// Match formats. Each slot is one shirt number in the starting side, with the
// position name and a default spot on the formation pitch (x/y as % of a
// portrait pitch, attacking towards the top).
export const FORMATS = {
  15: {
    label: '15-a-side',
    maxBench: 8,
    defaultBench: 8,
    slots: [
      { num: 1,  pos: 'Loosehead Prop',   short: 'LHP', unit: 'fwd', x: 40, y: 37 },
      { num: 2,  pos: 'Hooker',           short: 'HK',  unit: 'fwd', x: 50, y: 37 },
      { num: 3,  pos: 'Tighthead Prop',   short: 'THP', unit: 'fwd', x: 60, y: 37 },
      { num: 4,  pos: 'Lock',             short: 'LK',  unit: 'fwd', x: 44, y: 43 },
      { num: 5,  pos: 'Lock',             short: 'LK',  unit: 'fwd', x: 56, y: 43 },
      { num: 6,  pos: 'Blindside Flanker', short: 'BF', unit: 'fwd', x: 33, y: 45 },
      { num: 7,  pos: 'Openside Flanker', short: 'OF',  unit: 'fwd', x: 67, y: 45 },
      { num: 8,  pos: 'Number 8',         short: 'N8',  unit: 'fwd', x: 50, y: 50 },
      { num: 9,  pos: 'Scrum-half',       short: 'SH',  unit: 'back', x: 36, y: 55 },
      { num: 10, pos: 'Fly-half',         short: 'FH',  unit: 'back', x: 28, y: 61 },
      { num: 11, pos: 'Left Wing',        short: 'LW',  unit: 'back', x: 7, y: 76 },
      { num: 12, pos: 'Inside Centre',    short: 'IC',  unit: 'back', x: 21, y: 66 },
      { num: 13, pos: 'Outside Centre',   short: 'OC',  unit: 'back', x: 14, y: 71 },
      { num: 14, pos: 'Right Wing',       short: 'RW',  unit: 'back', x: 90, y: 64 },
      { num: 15, pos: 'Full-back',        short: 'FB',  unit: 'back', x: 50, y: 85 },
    ],
  },
  13: {
    label: '13-a-side',
    maxBench: 8,
    defaultBench: 5,
    slots: [
      { num: 1,  pos: 'Loosehead Prop',   short: 'LHP', unit: 'fwd', x: 40, y: 37 },
      { num: 2,  pos: 'Hooker',           short: 'HK',  unit: 'fwd', x: 50, y: 37 },
      { num: 3,  pos: 'Tighthead Prop',   short: 'THP', unit: 'fwd', x: 60, y: 37 },
      { num: 4,  pos: 'Lock',             short: 'LK',  unit: 'fwd', x: 44, y: 43 },
      { num: 5,  pos: 'Lock',             short: 'LK',  unit: 'fwd', x: 56, y: 43 },
      { num: 6,  pos: 'Number 8',         short: 'N8',  unit: 'fwd', x: 50, y: 49 },
      { num: 7,  pos: 'Scrum-half',       short: 'SH',  unit: 'back', x: 36, y: 54 },
      { num: 8,  pos: 'Fly-half',         short: 'FH',  unit: 'back', x: 28, y: 60 },
      { num: 9,  pos: 'Inside Centre',    short: 'IC',  unit: 'back', x: 21, y: 65 },
      { num: 10, pos: 'Outside Centre',   short: 'OC',  unit: 'back', x: 14, y: 70 },
      { num: 11, pos: 'Left Wing',        short: 'LW',  unit: 'back', x: 7, y: 76 },
      { num: 12, pos: 'Right Wing',       short: 'RW',  unit: 'back', x: 90, y: 64 },
      { num: 13, pos: 'Full-back',        short: 'FB',  unit: 'back', x: 50, y: 85 },
    ],
  },
  10: {
    label: '10-a-side',
    maxBench: 6,
    defaultBench: 4,
    slots: [
      { num: 1,  pos: 'Loosehead Prop',   short: 'LHP', unit: 'fwd', x: 40, y: 40 },
      { num: 2,  pos: 'Hooker',           short: 'HK',  unit: 'fwd', x: 50, y: 40 },
      { num: 3,  pos: 'Tighthead Prop',   short: 'THP', unit: 'fwd', x: 60, y: 40 },
      { num: 4,  pos: 'Flanker',          short: 'FL',  unit: 'fwd', x: 36, y: 47 },
      { num: 5,  pos: 'Flanker',          short: 'FL',  unit: 'fwd', x: 64, y: 47 },
      { num: 6,  pos: 'Scrum-half',       short: 'SH',  unit: 'back', x: 34, y: 54 },
      { num: 7,  pos: 'Fly-half',         short: 'FH',  unit: 'back', x: 25, y: 61 },
      { num: 8,  pos: 'Centre',           short: 'CE',  unit: 'back', x: 16, y: 67 },
      { num: 9,  pos: 'Wing',             short: 'WG',  unit: 'back', x: 7, y: 74 },
      { num: 10, pos: 'Full-back',        short: 'FB',  unit: 'back', x: 50, y: 83 },
    ],
  },
  7: {
    label: '7-a-side',
    maxBench: 5,
    defaultBench: 5,
    slots: [
      { num: 1,  pos: 'Loosehead Prop',   short: 'LHP', unit: 'fwd', x: 40, y: 44 },
      { num: 2,  pos: 'Hooker',           short: 'HK',  unit: 'fwd', x: 50, y: 44 },
      { num: 3,  pos: 'Tighthead Prop',   short: 'THP', unit: 'fwd', x: 60, y: 44 },
      { num: 4,  pos: 'Scrum-half',       short: 'SH',  unit: 'back', x: 36, y: 53 },
      { num: 5,  pos: 'Fly-half',         short: 'FH',  unit: 'back', x: 26, y: 61 },
      { num: 6,  pos: 'Centre',           short: 'CE',  unit: 'back', x: 16, y: 68 },
      { num: 7,  pos: 'Wing',             short: 'WG',  unit: 'back', x: 7, y: 75 },
    ],
  },
};

export const DEFAULT_FORMAT = 15;

export function getFormat(n) {
  return FORMATS[Number(n)] || FORMATS[DEFAULT_FORMAT];
}

export function normaliseFormat(n) {
  return FORMATS[Number(n)] ? Number(n) : DEFAULT_FORMAT;
}

// Positions a coach can tag a player with (Settings → Players). Broader than
// the slot names so a player can be "Prop" rather than a specific side.
export const POSITION_TAGS = [
  'Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8',
  'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Full-back',
];

// Which tags suit a given slot name — used to flag "out of position" picks.
export function tagsForSlot(pos) {
  const p = String(pos || '');
  if (/Prop/.test(p)) return ['Prop'];
  if (/Hooker/.test(p)) return ['Hooker'];
  if (/Lock/.test(p)) return ['Lock'];
  if (/Flanker/.test(p)) return ['Flanker'];
  if (/Number 8/.test(p)) return ['Number 8'];
  if (/Scrum-half/.test(p)) return ['Scrum-half'];
  if (/Fly-half/.test(p)) return ['Fly-half'];
  if (/Centre/.test(p)) return ['Centre'];
  if (/Wing/.test(p)) return ['Wing'];
  if (/Full-back/.test(p)) return ['Full-back'];
  return [];
}

// Points values (union).
export const POINTS = { try: 5, con: 2, pen: 3, dg: 3 };

// Rugby seasons run roughly August → May, so "2025/26" covers Aug 2025–Jul 2026.
export function seasonForDate(iso) {
  const d = iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00') : new Date();
  if (isNaN(d)) return seasonForDate();
  const y = d.getFullYear();
  const start = d.getMonth() >= 7 ? y : y - 1;   // Aug (7) onwards = new season
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

export function resultLetter(forPts, againstPts) {
  const f = Number(forPts), a = Number(againstPts);
  if (!Number.isFinite(f) || !Number.isFinite(a)) return '';
  return f > a ? 'W' : f < a ? 'L' : 'D';
}
