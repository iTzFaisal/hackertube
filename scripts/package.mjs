/* Package app/ as an unsigned Tizen .wgt.
 *
 * A .wgt is a zip with config.xml at its root. Tizen Homebrew re-signs what
 * it installs; Tizen Studio can also import the staged folder and sign it
 * with a Samsung certificate.
 *
 * Use a seekable zip (not a streaming zip with data descriptors): Tizen's
 * package parser rejects the "extended local header" form with
 * "unexpected end of file". fflate writes standard local headers.
 *
 * Usage:
 *   npm run package -- --api https://hackertube-proxy.example.workers.dev
 *   HACKERTUBE_API_BASE=https://... npm run package
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const BUILD = path.join(ROOT, 'build', 'HackerTube');
const DIST = path.join(ROOT, 'dist');
const OUTPUT = path.join(DIST, 'HackerTube.wgt');

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  const prefix = name + '=';
  for (const value of process.argv) {
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }
  return '';
}

function copy(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copy(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function normalizeApi(value) {
  value = String(value || '').trim().replace(/\/+$/, '');
  if (!value) {
    return '';
  }
  return /\/api$/i.test(value) ? value : value + '/api';
}

function patchConfig(apiBase) {
  if (!apiBase) {
    return;
  }
  const file = path.join(BUILD, 'js', 'config.js');
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/apiBase:\s*''/, 'apiBase: ' + JSON.stringify(apiBase));
  fs.writeFileSync(file, text);
}

function validate() {
  const config = fs.readFileSync(path.join(BUILD, 'config.xml'), 'utf8');
  const required = [
    '<tizen:application',
    'package="',
    '<content src="index.html"',
    '<icon src="icon.png"',
    '<tizen:profile name="tv-samsung"'
  ];
  for (const marker of required) {
    if (!config.includes(marker)) {
      throw new Error('config.xml is missing ' + marker);
    }
  }
  if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
    throw new Error('index.html is missing');
  }
  if (!fs.existsSync(path.join(BUILD, 'icon.png'))) {
    throw new Error('icon.png is missing');
  }
}

function collect(directory, prefix, files) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue;
    }
    const full = path.join(directory, entry.name);
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      collect(full, name, files);
    } else if (entry.isFile()) {
      files[name] = fs.readFileSync(full);
    }
  }
}

function zip() {
  fs.mkdirSync(DIST, { recursive: true });
  const files = {};
  collect(BUILD, '', files);
  const archive = zipSync(files, { level: 9 });
  fs.writeFileSync(OUTPUT, Buffer.from(archive));
}

async function main() {
  const provided = argument('--api') || process.env.HACKERTUBE_API_BASE || '';
  const apiBase = normalizeApi(provided);

  fs.rmSync(BUILD, { recursive: true, force: true });
  copy(APP, BUILD);
  patchConfig(apiBase);
  validate();
  zip();

  const size = fs.statSync(OUTPUT).size;
  console.log('');
  console.log('Built ' + path.relative(ROOT, OUTPUT) + ' (' + Math.round(size / 1024) + ' KB)');
  console.log('Tizen Studio project: ' + path.relative(ROOT, BUILD));
  if (apiBase) {
    console.log('API proxy: ' + apiBase);
  } else {
    console.log('');
    console.log('WARNING: no API proxy was set.');
    console.log('The app will show a setup screen on the TV. Deploy proxy/ and rebuild:');
    console.log('  npm run package -- --api https://YOUR-WORKER.workers.dev');
  }
  console.log('');
  console.log('This package is unsigned. Install it with Tizen Homebrew, or sign it in');
  console.log('Tizen Studio with a Samsung certificate. See README.md.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
