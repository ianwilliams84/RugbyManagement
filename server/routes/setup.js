// First-run setup screen. Every other page redirects here until the data
// folder, team details and Spond login are all in place (see setupGate in
// index.js). Claude is optional and never blocks setup.
import express from 'express';
import { spawn } from 'child_process';
import { loadSettings, saveSettings } from '../data.js';
import {
  setupStatus, invalidateSetupStatus, checkDataFolder, useDataFolder,
  suggestedDataFolder, saveEnv,
} from '../config.js';
import { reloginWith, clearToken } from '../spond/auth.js';
import { detectClaudeCli, testApiKey } from '../claude/reportGenerator.js';

const router = express.Router();

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isLocal = req => LOCAL.has(req.socket.remoteAddress);

router.get('/', async (req, res, next) => {
  try {
    const [status, cliFound] = await Promise.all([setupStatus({ fresh: true }), detectClaudeCli()]);
    res.render('setup', {
      title: 'Setup',
      status,
      cliFound,
      suggestedFolder: suggestedDataFolder(),
      canBrowse: isLocal(req) && process.platform === 'win32',
    });
  } catch (e) { next(e); }
});

const clean = (v, n) => String(v ?? '').trim().slice(0, n);

// Saves whatever sections were filled in, section by section, so one bad
// answer (say, a mistyped API key) doesn't throw away the others.
// Body: { dataFolder, ageGroup, teamName, spondEmail, spondPassword, claudeMode, anthropicApiKey }
router.post('/save', async (req, res, next) => {
  try {
    const b = req.body || {};
    const errors = {};
    const notes = {};

    // 1. Data folder first: the team details are saved inside it.
    const folder = clean(b.dataFolder, 400);
    const current = (process.env.IRONSIDES_DATA_DIR || '').trim();
    if (folder && (folder !== current || !(await setupStatus({ fresh: true })).dataFolder.done)) {
      const check = await checkDataFolder(folder, { create: true });
      if (check.ok) {
        await useDataFolder(folder);
        if (check.existing) notes.dataFolder = `Found an existing squad here (${check.existing.players} players). This PC will share it.`;
      } else errors.dataFolder = check.error;
    } else if (!folder && !current) errors.dataFolder = 'Choose where to save the squad and results.';

    // 2. Team details (shared by every PC using this data folder).
    const ageGroup = clean(b.ageGroup, 40);
    const teamName = clean(b.teamName, 60);
    if ((await setupStatus({ fresh: true })).dataFolder.done) {
      if (!ageGroup) errors.ageGroup = 'Enter an age group, e.g. U14 or Seniors.';
      if (!teamName) errors.teamName = 'Enter a team name.';
      const settings = await loadSettings();
      if (ageGroup || teamName) {
        settings.club = { ...settings.club, ageGroup: ageGroup || settings.club.ageGroup, teamName: teamName || settings.club.teamName };
        await saveSettings(settings);
      }
    } else if (!errors.dataFolder) errors.team = 'Set the data folder first.';

    // 3. Spond login (per PC). A blank password keeps the saved one.
    const email = clean(b.spondEmail, 200);
    const password = String(b.spondPassword ?? '');
    if (!email) errors.spondEmail = 'Enter the email you sign in to Spond with.';
    else if (!password && !process.env.SPOND_PASSWORD) errors.spondPassword = 'Enter your Spond password.';
    else {
      const changed = email !== process.env.SPOND_EMAIL || password;
      if (changed) {
        try {
          await saveEnv(password ? { SPOND_EMAIL: email, SPOND_PASSWORD: password } : { SPOND_EMAIL: email });
          clearToken();
        } catch (e) { errors.spondPassword = e.message; }
      }
      if (!errors.spondPassword) {
        // Checked but not required: setup can be finished offline.
        try { await reloginWith({}); notes.spond = 'Signed in to Spond.'; }
        catch (e) { notes.spondWarning = `Saved, but Spond didn't accept the login: ${e.message}`; }
      }
    }

    // 4. Claude (optional).
    const mode = ['cli', 'api', 'off'].includes(b.claudeMode) ? b.claudeMode : null;
    const key = clean(b.anthropicApiKey, 300);
    if (mode === 'api' && !key && !process.env.ANTHROPIC_API_KEY) {
      errors.anthropicApiKey = 'Paste an Anthropic API key, or choose another option.';
    } else if (mode === 'api' && key) {
      const t = await testApiKey(key);
      if (t.ok) await saveEnv({ CLAUDE_MODE: 'api', ANTHROPIC_API_KEY: key });
      else errors.anthropicApiKey = t.error;
    } else if (mode) {
      await saveEnv({ CLAUDE_MODE: mode });
    }

    invalidateSetupStatus();
    const status = await setupStatus({ fresh: true });
    res.json({ ok: Object.keys(errors).length === 0, complete: status.complete, errors, notes, status });
  } catch (e) { next(e); }
});

// Opens Windows' folder picker on this PC. Only for a browser on the same PC:
// from anywhere else the dialog would pop up on the server's screen.
router.post('/browse', (req, res) => {
  if (!isLocal(req) || process.platform !== 'win32') {
    return res.status(403).json({ ok: false, error: 'Browse only works on the PC running the app. Type the path instead.' });
  }
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms',
    '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$d.Description = 'Choose where Ironsides Rugby saves the squad, results and photos'",
    '$d.ShowNewFolderButton = $true',
    'if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }',
  ].join('; ');
  const ps = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], { windowsHide: true });
  let out = '';
  const timer = setTimeout(() => { try { ps.kill(); } catch {} }, 5 * 60 * 1000);
  ps.stdout.on('data', d => { out += d.toString('utf8'); });
  ps.on('error', e => { clearTimeout(timer); res.status(500).json({ ok: false, error: e.message }); });
  ps.on('close', () => {
    clearTimeout(timer);
    if (res.headersSent) return;
    const folder = out.trim();
    res.json(folder ? { ok: true, folder } : { ok: false, cancelled: true });
  });
});

export default router;
