import { spondJson } from './auth.js';

export async function listEvents({ max = 30 } = {}) {
  // NB: `includeHidden=true` now 400s ("only available inside a group"), so it's
  // dropped here — this lists the account's upcoming events directly.
  return spondJson(`/sponds?max=${max}&includeComments=false`);
}

export async function getEvent(eventId) {
  return spondJson(`/sponds/${encodeURIComponent(eventId)}`);
}

// Try every plausible path Spond might have stuck the name under.
// For junior teams it's often the kid's name in m.firstName/lastName, but Spond's
// schema also stores under m.profile.* and historically under m.user.profile.*.
function pickName(m) {
  const candidates = [
    [m?.firstName, m?.lastName],
    [m?.profile?.firstName, m?.profile?.lastName],
    [m?.user?.profile?.firstName, m?.user?.profile?.lastName],
    ...(m?.name ? [[m.name.split(/\s+/, 1)[0], m.name.split(/\s+/).slice(1).join(' ')]] : []),
    ...(m?.profile?.name ? [[m.profile.name.split(/\s+/, 1)[0], m.profile.name.split(/\s+/).slice(1).join(' ')]] : []),
  ];
  for (const [f, l] of candidates) {
    const first = (f || '').trim();
    const last = (l || '').trim();
    if (first || last) return { firstName: first, lastName: last };
  }
  return { firstName: '', lastName: '' };
}

export function extractAvailability(event) {
  const r = event.responses || {};
  const status = new Map();
  for (const id of r.acceptedIds || []) status.set(id, 'accepted');
  for (const id of r.declinedIds || []) status.set(id, 'declined');
  for (const id of r.unansweredIds || []) status.set(id, 'unanswered');
  for (const id of r.waitinglistIds || []) status.set(id, 'waitinglist');
  for (const id of r.unconfirmedIds || []) status.set(id, 'unconfirmed');

  const members = [];
  const groupMembers = event.recipients?.group?.members || [];
  for (const m of groupMembers) {
    // 1) The member itself (often the parent for junior teams)
    const own = pickName(m);
    if (own.firstName || own.lastName) {
      members.push({
        id: m.id,
        firstName: own.firstName,
        lastName: own.lastName,
        status: status.get(m.id) || 'unanswered',
        _raw: { from: 'member', firstName: m.firstName, lastName: m.lastName, profileFirst: m.profile?.firstName, profileLast: m.profile?.lastName, name: m.name },
      });
    }

    // 2) Sub-members / dependents (kids attached to a parent's profile in Spond
    //    junior groups). Spond uses several different keys depending on schema
    //    version — pull them all and dedupe by id.
    const subSources = [
      m.subMembers, m.subProfiles, m.dependents,
      m.profile?.subProfiles, m.profile?.subMembers,
      m.children, m.profile?.children,
    ].filter(Array.isArray);
    const subs = [].concat(...subSources);

    for (const sub of subs) {
      const subName = pickName(sub);
      if (!subName.firstName && !subName.lastName) continue;
      const subId = sub.id || sub.profileId || `${m.id}-sub-${members.length}`;
      // For kids, the response status may be on the parent's id (most common
      // — parent responds on behalf of the child), or their own id if Spond is
      // tracking each child independently.
      const subStatus = status.get(subId) || status.get(m.id) || 'unanswered';
      members.push({
        id: subId,
        firstName: subName.firstName,
        lastName: subName.lastName,
        status: subStatus,
        parentId: m.id,
        _raw: {
          from: 'sub', parentId: m.id,
          firstName: sub.firstName, lastName: sub.lastName,
          profileFirst: sub.profile?.firstName, profileLast: sub.profile?.lastName,
          name: sub.name,
        },
      });
    }
  }
  return members;
}

// Normalise a name for matching: lowercase, strip diacritics/zero-width/apostrophes,
// collapse whitespace, drop anything that isn't a letter / whitespace / hyphen.
// Built with new RegExp + \uXXXX escapes because some target chars are line-break
// characters that break a literal /.../ regex when pasted into source.
const COMBINING_RX   = new RegExp('[̀-ͯ]', 'g');
const ZERO_WIDTH_RX  = new RegExp('[​-‏ - ⁠-⁯﻿]', 'g');
const NBSP_RX        = new RegExp('[  ]', 'g');
const APOSTROPHE_RX  = new RegExp("[‘’ʼʹ´`']", 'g');
const NON_LETTER_RX  = /[^\p{L}\s-]/gu;
const WHITESPACE_RX  = /\s+/g;

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(COMBINING_RX, '')
  .replace(ZERO_WIDTH_RX, '')
  .replace(NBSP_RX, ' ')
  .replace(APOSTROPHE_RX, '')
  .replace(NON_LETTER_RX, '')
  .replace(WHITESPACE_RX, ' ')
  .trim();

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

const tokens = (s) => norm(s).split(' ').filter(Boolean);

export function autoMatch(spondMembers, squadPlayers) {
  const matched = [];
  const unmatchedSquad = [];
  const usedSpondIds = new Set();

  // Pre-compute squad tokens once
  const squadInfo = squadPlayers.map(sp => {
    const sq = tokens(sp.name);
    return { sp, sq, first: sq[0] || '', last: sq[sq.length - 1] || '' };
  });

  // Strict strategies — only used in pass 1. These don't claim a Spond entry on
  // ambiguous evidence (e.g. shared surname), so it's safe to run them in order
  // without worrying about consuming someone else's match.
  const STRICT = [
    { name: 'exact', test: (info, m) => {
        const fn = tokens(m.firstName); const ln = tokens(m.lastName);
        return fn[0] === info.first && ln[ln.length - 1] === info.last;
    } },
    { name: 'token-set', test: (info, m) => {
        const all = new Set([...tokens(m.firstName), ...tokens(m.lastName)]);
        return info.sq.every(t => all.has(t));
    } },
    { name: 'reverse-token-set', test: (info, m) => {
        const all = [...tokens(m.firstName), ...tokens(m.lastName)];
        return all.length > 0 && all.every(t => info.sq.includes(t));
    } },
  ];

  // Pass 1: strict matches only. Run all squad players through every strict
  // strategy first so that real exact matches (Hector Kenny → Hector Kenny)
  // claim their Spond entry BEFORE anyone else falls through to the unique-
  // last-name fallback. Without this, "Alfred Kenny" can incorrectly steal
  // "Hector Kenny" via the last-name fallback if Alfred is iterated first.
  const stillNeed = [...squadInfo];
  for (const strat of STRICT) {
    for (let i = stillNeed.length - 1; i >= 0; i--) {
      const info = stillNeed[i];
      if (!info.sq.length) continue;
      const pick = spondMembers.find(m => !usedSpondIds.has(m.id) && strat.test(info, m));
      if (pick) {
        matched.push({
          squadId: info.sp.id, squadName: info.sp.name,
          spondId: pick.id, spondName: `${pick.firstName} ${pick.lastName}`.trim(),
          status: pick.status,
          matchType: strat.name,
          fuzzy: strat.name !== 'exact',
        });
        usedSpondIds.add(pick.id);
        stillNeed.splice(i, 1);
      }
    }
  }

  // Pass 2: fuzzy uniqueness fallbacks for whatever's left.
  for (const info of stillNeed) {
    if (!info.sq.length) {
      unmatchedSquad.push({ squadId: info.sp.id, squadName: info.sp.name, reason: 'empty squad name' });
      continue;
    }
    const available = spondMembers.filter(m => !usedSpondIds.has(m.id));
    let pick = null;
    let matchType = '';

    // 4. Unique last-name
    const lastMatches = available.filter(m => {
      const ln = tokens(m.lastName);
      return ln[ln.length - 1] === info.last;
    });
    if (lastMatches.length === 1) { pick = lastMatches[0]; matchType = 'last-name'; }

    // 5. Unique first-name
    if (!pick) {
      const firstMatches = available.filter(m => {
        const fn = tokens(m.firstName);
        return fn[0] === info.first;
      });
      if (firstMatches.length === 1) { pick = firstMatches[0]; matchType = 'first-name'; }
    }

    const sp = info.sp;
    if (pick) {
      matched.push({
        squadId: sp.id, squadName: sp.name,
        spondId: pick.id, spondName: `${pick.firstName} ${pick.lastName}`.trim(),
        status: pick.status,
        matchType,
        fuzzy: true,
      });
      usedSpondIds.add(pick.id);
    } else {
      const sqNormFull = norm(sp.name);
      let closest = null;
      let closestDist = Infinity;
      for (const m of available) {
        const fullNorm = norm(`${m.firstName} ${m.lastName}`);
        const d = levenshtein(sqNormFull, fullNorm);
        if (d < closestDist) {
          closest = { id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), distance: d, raw: m._raw };
          closestDist = d;
        }
      }
      unmatchedSquad.push({
        squadId: sp.id,
        squadName: sp.name,
        squadNameNorm: sqNormFull,
        closestSpond: closest && closestDist <= Math.max(3, Math.floor(sqNormFull.length / 3)) ? closest : null,
      });
    }
  }

  const unmatchedSpond = spondMembers
    .filter(m => !usedSpondIds.has(m.id))
    .map(m => ({
      spondId: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      nameNorm: norm(`${m.firstName} ${m.lastName}`),
      status: m.status,
      raw: m._raw,
    }));

  return { matched, unmatchedSquad, unmatchedSpond };
}
