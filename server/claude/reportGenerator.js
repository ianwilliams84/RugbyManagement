import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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

export async function generateMatchReport({ summary, tone = '', lengthWords = 500, clubName }) {
  const tonePrefix = tone ? `\n\nADDITIONAL TONE NOTE FROM THE COACH: ${tone}` : '';
  const lengthGuide = `\n\nTARGET LENGTH: about ${lengthWords} words total (excluding the scorers list).`;
  const fullSystem = SYSTEM_PROMPT + tonePrefix + lengthGuide;

  const parts = [
    `CLUB: ${clubName}`,
    '',
    'MATCH DATA (JSON):',
    JSON.stringify(summary, null, 2),
  ];

  const fullPrompt = `${fullSystem}\n\n---\n\n${parts.join('\n')}`;
  return runClaudeCli(fullPrompt);
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
