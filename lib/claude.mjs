import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { config, LI_DIR, ROOT } from './config.mjs';

// Runs Claude Code headless with a narrow tool allowlist. Uses the user's existing login.
export function runClaude(prompt, { cwd = ROOT, addDirs = [], timeoutMs = 25 * 60 * 1000, onLine } = {}) {
  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Read,Write,Edit,Glob,Grep,Skill,WebSearch,WebFetch,Bash(python3:*),Bash(ls:*),Bash(cat:*),Bash(wc:*),Bash(grep:*),Bash(node ' + ROOT + '/scripts/humanize-file.mjs:*)',
    '--add-dir', LI_DIR,
    '--add-dir', path.join(os.homedir(), '.claude', 'skills'),
    ...addDirs.flatMap((d) => ['--add-dir', d]),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(config.claudeBin, args, {
      cwd,
      env: { ...process.env, PATH: `${path.dirname(config.claudeBin)}:${process.env.PATH || '/usr/bin:/bin'}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('claude timed out')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; onLine?.(String(d).trim().slice(0, 300)); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* non-JSON output */ }
      if (code !== 0 || parsed?.is_error) {
        return reject(new Error(`claude exited ${code}: ${(parsed?.result || err || out).slice(0, 800)}`));
      }
      resolve({ result: parsed?.result ?? out, cost: parsed?.total_cost_usd, raw: parsed });
    });
  });
}
