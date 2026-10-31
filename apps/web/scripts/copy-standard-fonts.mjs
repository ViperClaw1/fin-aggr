// Copies pdf.js standard fonts onto this origin (ADR-018). pdfjs-dist is a dependency of @fa/web,
// so the script lives here: a root tool cannot import it without knip calling it unlisted.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts');
const dest = join(dirname(fileURLToPath(import.meta.url)), '../public/pdfjs/standard_fonts');

if (existsSync(join(dest, 'LiberationSans-Regular.ttf'))) {
  process.stdout.write('pdfjs standard fonts already copied\n');
} else {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  process.stdout.write('pdfjs standard fonts copied\n');
}
