// node scripts/humanize-file.mjs <in.txt> <out.txt>  : li-human cleanup that keeps → arrows.
import fs from 'node:fs';
import { humanizeText } from '../lib/human.mjs';
const [inp, out] = process.argv.slice(2);
fs.writeFileSync(out, humanizeText(fs.readFileSync(inp, 'utf8')));
console.log(`cleaned -> ${out}`);
