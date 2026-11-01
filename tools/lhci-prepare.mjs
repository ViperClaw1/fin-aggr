// Writes tools/lhci.runtime.json with Puppeteer's Chrome path. executablePath() is async in
// Puppeteer 25, and LHCI reads its config synchronously. Both scenarios then share that binary.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

process.env.LHCI_PROFILE = process.argv.includes('--profile') ? '1' : '0';

const require = createRequire(import.meta.url);
const config = require('./lhci.config.cjs');
config.ci.collect.chromePath = await puppeteer.executablePath();
const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(dir, 'lhci.runtime.json'), `${JSON.stringify(config)}\n`);
