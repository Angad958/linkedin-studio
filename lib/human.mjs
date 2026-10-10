import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HUMAN_DIR } from './config.mjs';

const tmp = (text) => {
  const f = path.join(os.tmpdir(), `li-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(f, text);
  return f;
};

// Automatic, meaning-preserving cleanup from the li-human pack (typography, invisible chars, slop words).
export function humanizeText(text) {
  // humanize.py turns → into -> ; the arrow is part of this post format, so protect it.
  const ARROW = 'ARROWTOKENX';
  const inFile = tmp(text.replaceAll('→', ARROW));
  const outFile = `${inFile}.out`;
  try {
    execFileSync('python3', [path.join(HUMAN_DIR, 'humanize.py'), inFile, '-o', outFile], { cwd: HUMAN_DIR, stdio: 'pipe' });
    return fs.readFileSync(outFile, 'utf8').replaceAll(ARROW, '→');
  } catch {
    return text;
  } finally {
    fs.rmSync(inFile, { force: true });
    fs.rmSync(outFile, { force: true });
  }
}

// Five-check score from detect.py. Returns { score, verdict, report }.
export function scoreText(text) {
  const f = tmp(text);
  try {
    let report;
    try {
      report = execFileSync('python3', [path.join(HUMAN_DIR, 'detect.py'), f], { cwd: HUMAN_DIR, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      report = String(e.stdout || '');
    }
    const m = report.match(/HUMAN SCORE\s+[#.]+\s+([\d.]+)\s+(PASS|REVIEW|FLAGGED)/);
    return { score: m ? Number(m[1]) : null, verdict: m ? m[2] : null, report: report.replace(f, 'post') };
  } finally {
    fs.rmSync(f, { force: true });
  }
}

// Lighter typographic cleanup for emails: humanize.py drops commas at line ends ("Hi Manish," / "Thanks,"),
// which is right for posts but wrong for letters, so emails get only the character-level fixes.
export function cleanEmail(text = '') {
  return text
    .replace(/[​-‏⁠-⁤﻿­᠎]/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/(\d)\s*–\s*(?=\d)/g, '$1-')
    .replace(/\s+–\s+/g, ', ')
    .replace(/–/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/,\s*([.;:!?])/g, '$1')
    .trim();
}
