import { execFile } from 'node:child_process';

export function macNotify(title, message) {
  const esc = (s) => String(s).replace(/["\\]/g, '\\$&');
  execFile('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`], () => {});
}
