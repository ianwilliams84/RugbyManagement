// First-run setup: what has to be configured before the app can be used, and
// where those answers are stored.
//
//   Per PC, in an env file (never in git):  Spond login, data folder, Claude choice
//   Shared, in settings.json in the data folder:  age group, team name
//
// The env file is the shared dev\secrets\ironsides.env when that exists (or
// IRONSIDES_ENV names one), otherwise the project's gitignored pw.env. That
// way a PC someone was given the app on needs no folder outside the project.
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { paths, secretsEnvPath, localEnvPath, setDataRoot } from './envPath.js';

export function envFilePath() {
  if (process.env.IRONSIDES_ENV || fs.existsSync(secretsEnvPath)) return secretsEnvPath;
  return localEnvPath;
}

// Quote a value so dotenv reads it back byte-for-byte. dotenv strips the outer
// quotes but never un-escapes inside single quotes or backticks, so pick a quote
// character the value doesn't contain rather than escaping. UNC paths
// (\\NAS\share) and passwords with # or spaces round-trip intact.
export function quoteEnvValue(value) {
  const v = String(value ?? '');
  if (/[\r\n]/.test(v)) throw new Error('Values can\'t contain line breaks.');
  if (v === '' || /^[A-Za-z0-9_@.\-+/:]+$/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('`')) return `\`${v}\``;
  if (!v.includes('"') && !v.includes('\\')) return `"${v}"`;
  throw new Error('That value mixes \', ` and " quotes, which the settings file can\'t store.');
}

export function upsertEnvText(text, key, value) {
  const line = `${key}=${quoteEnvValue(value)}`;
  const re = new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm');
  if (re.test(text)) return text.replace(re, () => line);
  const sep = text.length === 0 || text.endsWith('\n') ? '' : '\n';
  return `${text}${sep}${line}\n`;
}

// Write keys to the env file (keeping every other line) and to process.env, so
// the change applies straight away without a restart.
export async function saveEnv(values) {
  const file = envFilePath();
  let text = '';
  try { text = await fsp.readFile(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const [k, v] of Object.entries(values)) text = upsertEnvText(text, k, v);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, 'utf8');
  for (const [k, v] of Object.entries(values)) process.env[k] = String(v ?? '');
  return file;
}

export function suggestedDataFolder() {
  return path.join(os.homedir(), 'Documents', 'Ironsides Rugby Data');
}

// Check a folder can hold the squad: create it (and photos/videos) if needed,
// then prove it's writable. Returns { ok, error?, existing? } where `existing`
// says whether a squad is already there (joining another PC's shared folder).
export async function checkDataFolder(folder, { create = false } = {}) {
  const dir = String(folder || '').trim();
  if (!dir) return { ok: false, error: 'Choose a folder.' };
  if (!path.isAbsolute(dir)) return { ok: false, error: 'Use a full path, e.g. C:\\Users\\you\\Documents\\Ironsides Rugby Data or \\\\NAS\\share\\folder.' };
  try {
    if (create) {
      await fsp.mkdir(path.join(dir, 'photos'), { recursive: true });
      await fsp.mkdir(path.join(dir, 'videos'), { recursive: true });
    }
    const st = await fsp.stat(dir);
    if (!st.isDirectory()) return { ok: false, error: 'That path is a file, not a folder.' };
    const probe = path.join(dir, `.write-test-${process.pid}`);
    await fsp.writeFile(probe, 'ok');
    await fsp.unlink(probe);
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, error: `Can't find ${dir}. If it's on a NAS, check the NAS is on and the share is reachable.` };
    if (e.code === 'EACCES' || e.code === 'EPERM') return { ok: false, error: `This PC isn't allowed to write to ${dir}.` };
    return { ok: false, error: `Can't use ${dir}: ${e.message}` };
  }
  let existing = null;
  try {
    const squad = JSON.parse(await fsp.readFile(path.join(dir, 'squad.json'), 'utf8'));
    existing = { players: Array.isArray(squad.players) ? squad.players.length : 0 };
  } catch { /* no squad yet */ }
  return { ok: true, existing };
}

export async function useDataFolder(folder) {
  const dir = String(folder).trim();
  await saveEnv({ IRONSIDES_DATA_DIR: dir });
  setDataRoot(dir);
  invalidateSetupStatus();
}

// ── Status ────────────────────────────────────────────────────────────────
// Checked on every page load by the setup gate, so it's cached briefly: a
// stat on an unreachable NAS share can take seconds to fail on Windows.
let cached = null;
const TTL_MS = 5000;

export function invalidateSetupStatus() { cached = null; }

async function folderReachable(dir) {
  try { return (await fsp.stat(dir)).isDirectory(); } catch { return false; }
}

async function readClub() {
  try {
    const s = JSON.parse(await fsp.readFile(path.join(paths.dataDir, 'settings.json'), 'utf8'));
    return s.club || {};
  } catch { return {}; }
}

export async function setupStatus({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.status;
  const folder = (process.env.IRONSIDES_DATA_DIR || '').trim();
  const reachable = folder ? await folderReachable(folder) : false;
  const club = reachable ? await readClub() : {};
  const claudeMode = (process.env.CLAUDE_MODE || '').trim();
  const status = {
    dataFolder: { done: !!folder && reachable, folder, reachable },
    team: { done: !!(String(club.ageGroup || '').trim() && String(club.teamName || '').trim()), ageGroup: club.ageGroup || '', teamName: club.teamName || '' },
    spond: { done: !!(process.env.SPOND_EMAIL && process.env.SPOND_PASSWORD), email: process.env.SPOND_EMAIL || '' },
    // Optional: never blocks setup.
    claude: { mode: claudeMode || 'off', hasApiKey: !!process.env.ANTHROPIC_API_KEY },
    envFile: envFilePath(),
  };
  status.complete = status.dataFolder.done && status.team.done && status.spond.done;
  cached = { at: Date.now(), status };
  return status;
}
