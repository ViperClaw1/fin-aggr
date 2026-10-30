// Cursor afterFileEdit hook: format the edited file with the repo's Prettier, like the
// PostToolUse hook in .claude/settings.json. Node instead of jq/xargs so it runs on Windows too.
// Informational only: a formatting failure never blocks the agent (the gates catch it).
import process from 'node:process';
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    const file = JSON.parse(input).file_path;
    if (typeof file !== 'string' || file === '') return;
    spawnSync('pnpm', ['exec', 'prettier', '--write', '--ignore-unknown', file], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
  } catch {
    // a malformed payload is not worth failing the edit over
  }
});
