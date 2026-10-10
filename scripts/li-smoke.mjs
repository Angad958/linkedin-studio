// Live check of the LinkedIn integration: posts a connections-only test post with reserved characters
// and a comment, prints the URL, waits for you to look, then deletes it. Usage: node scripts/li-smoke.mjs
import readline from 'node:readline/promises';
import { createClient, getAuth } from '../lib/linkedin.mjs';
import { escapeLittle, postUrl } from '../lib/linkedin-format.mjs';

const auth = getAuth();
if (!auth) { console.error('Not connected. Connect LinkedIn in Settings first.'); process.exit(1); }
const li = createClient(auth);
const urn = await li.createPost({ visibility: 'CONNECTIONS', commentary: escapeLittle('Test, please ignore (deleting in a minute). [brackets] snake_case *stars* C# #Testing') });
await li.createComment(urn, 'Source (test): https://example.com/a_b?x=(1)');
console.log(`Posted: ${postUrl(urn)}\nCheck the text and comment look exactly right.`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Press Enter to delete it… ');
rl.close();
await li.deletePost(urn);
console.log('Deleted.');
