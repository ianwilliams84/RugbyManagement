import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

// Resolved on every call, not once at startup: the VS Code extension's copy
// moves to a new versioned folder (and the old one is deleted) on each update.
function resolveClaudeCmd() {
  // 0) Explicit override
  if (process.env.CLAUDE_CLI_PATH && fs.existsSync(process.env.CLAUDE_CLI_PATH)) return `"${process.env.CLAUDE_CLI_PATH}"`;
  // 1) npm global bin: %APPDATA%\npm\claude.cmd
  // 2) native installer: %USERPROFILE%\.local\bin\claude.exe
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'claude.cmd'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return `"${c}"`;
  // 3) the copy bundled with the VS Code extension (newest version wins)
  const extDir = process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.vscode', 'extensions');
  try {
    const bundled = fs.readdirSync(extDir)
      .filter(d => d.startsWith('anthropic.claude-code-'))
      .map(d => path.join(extDir, d, 'resources', 'native-binary', 'claude.exe'))
      .filter(p => fs.existsSync(p))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (bundled.length) return `"${bundled[0]}"`;
  } catch { /* no VS Code extensions folder */ }
  // 4) On PATH
  return 'claude';
}

const SYSTEM_PROMPT = `You write match reports for an amateur rugby union club's website and members' group, in the style of a Sky Sports / BBC Sport rugby report.

AUDIENCE
- Players, families and club members reading on their phone after the game.
- Keep it warm, positive and accurate — celebrate good performances without exaggerating. Don't fabricate stats, scorers, minutes or incidents.

STRUCTURE (produce all of the following in this order)
1. **One-line headline** — bold, factual (result + score).
2. **Lede paragraph** (~50 words) — the result, the score, where it was played, Player of the Match in passing.
3. **Scorers** — a bullet list of our points scorers.
4. **First half** (~100 words) — use the half-time score and coach notes if present.
5. **Second half** (~100 words).
6. **Key moments & standout performers** (~100 words) — lean on the coach notes, Player of the Match and scorers.
7. **Looking ahead** (~50 words) — short, upbeat close.

RULES
- Output **HTML**: <h1> headline, <h2> for each section, <p> paragraphs, <ul><li> for the scorers list, <em>/<strong> sparingly.
- Scorer bullets: "<strong>Name</strong> — 2 tries, 3 conversions (16 pts)". Omit zero categories.
- Use ONLY facts present in the match data. If there's no half-time score or notes, keep those sections general rather than inventing detail.
- British English. Rugby terminology is fine (tries, conversions, breakdown, lineout, scrum).
- No preamble — start directly with <h1>.
- DO NOT call tools. Just generate the HTML.`;

const TIMEOUT_MS = 180_000;

export async function generateMatchReport({ summary, tone = '', lengthWords = 500, clubName, ageGroup = '', teamName = '' }) {
  const tonePrefix = tone ? `\n\nADDITIONAL TONE NOTE FROM THE COACH: ${tone}` : '';
  const lengthGuide = `\n\nTARGET LENGTH: about ${lengthWords} words total (excluding the scorers list).`;
  const fullSystem = SYSTEM_PROMPT + tonePrefix + lengthGuide;

  // The age group from setup changes how the report should read: a junior
  // side's report is for parents and should stay encouraging.
  const team = [ageGroup, teamName].map(s => String(s || '').trim()).filter(Boolean).join(' ');
  const parts = [
    `CLUB: ${clubName}`,
    ...(team ? [`TEAM: ${team}${ageGroup ? ' (pitch the report for this age group; for junior sides keep it encouraging and team-focused)' : ''}`] : []),
    '',
    'MATCH DATA (JSON):',
    JSON.stringify(summary, null, 2),
  ];

  const mode = reportMode();
  if (mode === 'off') throw new Error('AI match reports are turned off. Turn them on in Setup (Settings ▸ Run setup again).');
  if (mode === 'api') return runClaudeApi(fullSystem, parts.join('\n'));
  const fullPrompt = `${fullSystem}\n\n---\n\n${parts.join('\n')}`;
  return runClaudeCli(fullPrompt);
}

// How match reports are written on this PC, chosen during setup:
//   cli : the Claude Code CLI (uses the PC owner's Claude subscription)
//   api : an Anthropic API key (pay per use, for PCs without Claude Code)
//   off : no AI reports. Default, so a new PC opts in during setup.
export function reportMode() {
  const m = String(process.env.CLAUDE_MODE || '').trim().toLowerCase();
  if (m === 'cli' || m === 'api') return m;
  return 'off';
}

// { mode, ready, problem } for the Match Report and Settings pages.
export async function reportEngine() {
  const mode = reportMode();
  if (mode === 'off') return { mode, ready: false, problem: 'AI match reports are turned off on this PC.' };
  if (mode === 'api') {
    return process.env.ANTHROPIC_API_KEY
      ? { mode, ready: true, problem: '' }
      : { mode, ready: false, problem: 'No Anthropic API key is saved on this PC.' };
  }
  const ok = await detectClaudeCli();
  return { mode, ready: ok, problem: ok ? '' : 'Claude Code CLI not detected on this PC.' };
}

const API_MODEL = 'claude-opus-5-5';

function apiClient(apiKey = process.env.ANTHROPIC_API_KEY) {
  return new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });
}

// Cheap key check for setup: listing models costs nothing.
export async function testApiKey(apiKey) {
  try {
    await apiClient(apiKey).models.list({ limit: 1 });
    return { ok: true };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: 'Anthropic rejected that API key.' };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: 'That API key isn\'t allowed to use the API.' };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: 'Couldn\'t reach Anthropic. Check the internet connection.' };
    return { ok: false, error: e.message };
  }
}

async function runClaudeApi(system, userText) {
  const started = Date.now();
  let response;
  try {
    // `fallbacks: "default"` lets Anthropic retry on a suitable model if the
    // first one declines, instead of the report simply failing.
    response = await apiClient().beta.messages.create({
      model: API_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: userText }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected the saved API key. Update it in Setup.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Anthropic is rate-limiting this API key. Try again in a minute.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Couldn\'t reach Anthropic. Check the internet connection.');
    if (e instanceof Anthropic.APIError) throw new Error(`Anthropic API error ${e.status ?? ''}: ${e.message}`);
    throw e;
  }
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to write this report. Try rewording the coach notes.');
  }
  const html = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!html) throw new Error('Claude returned an empty report.');
  return { html, usage: response.usage || null, model: response.model, durationMs: Date.now() - started, totalCostUsd: null };
}

function runClaudeCli(prompt) {
  return new Promise((resolve, reject) => {
    const cmd = `${resolveClaudeCmd()} -p --output-format json --max-turns 1`;
    const proc = spawn(cmd, { shell: true, windowsHide: true });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Claude CLI timed out after ${TIMEOUT_MS / 1000}s.`));
    }, TIMEOUT_MS);

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('error', err => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error('claude CLI not found on PATH. Install Claude Code from https://docs.claude.com/claude-code, or check that running "claude --version" works in a fresh terminal.'));
      } else {
        reject(err);
      }
    });

    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`claude exited with code ${code}. stderr: ${stderr.slice(0, 800) || '(empty)'}`));
      }
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        if (stdout.trim()) {
          return resolve({ html: stdout.trim(), usage: null, model: 'claude-cli', durationMs: null, totalCostUsd: null });
        }
        return reject(new Error('claude returned empty / unparseable output. stderr: ' + (stderr.slice(0, 500) || '(empty)')));
      }
      if (parsed.is_error) {
        return reject(new Error('claude reported an error: ' + (parsed.result || JSON.stringify(parsed).slice(0, 400))));
      }
      const text = parsed.result ?? parsed.text ?? '';
      resolve({
        html: text,
        usage: parsed.usage || null,
        model: parsed.model || 'claude-code',
        durationMs: parsed.duration_ms || null,
        totalCostUsd: parsed.total_cost_usd ?? null,
      });
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

export function detectClaudeCli() {
  return new Promise((resolve) => {
    const proc = spawn(`${resolveClaudeCmd()} --version`, { shell: true, windowsHide: true });
    const timer = setTimeout(() => { try { proc.kill(); } catch {} resolve(false); }, 5000);
    proc.on('error', () => { clearTimeout(timer); resolve(false); });
    proc.on('close', code => { clearTimeout(timer); resolve(code === 0); });
  });
}
