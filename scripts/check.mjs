import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(ROOT, 'app', 'js'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join('app', 'js', name));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(ROOT, file)], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

const config = fs.readFileSync(path.join(ROOT, 'app', 'config.xml'), 'utf8');
const checks = [
  ['tizen:application', /<tizen:application\s+id="([A-Za-z0-9]{10})\.[A-Za-z0-9]+"\s+package="([A-Za-z0-9]{10})"/],
  ['content', /<content src="index\.html"\/>/],
  ['icon', /<icon src="icon\.png"\/>/],
  ['profile', /<tizen:profile name="tv-samsung"\/>/],
  ['internet', /http:\/\/tizen\.org\/privilege\/internet/],
  ['inputdevice', /http:\/\/tizen\.org\/privilege\/tv\.inputdevice/],
  ['launch', /http:\/\/tizen\.org\/privilege\/application\.launch/],
  ['hwkey', /hwkey-event="enable"/]
];

for (const [name, pattern] of checks) {
  if (!pattern.test(config)) {
    console.error('config.xml check failed: ' + name);
    process.exit(1);
  }
}

for (const asset of ['index.html', 'icon.png', 'css/app.css', 'js/app.js']) {
  if (!fs.existsSync(path.join(ROOT, 'app', asset))) {
    console.error('missing app/' + asset);
    process.exit(1);
  }
}

console.log('Checked ' + files.length + ' scripts, config.xml and the app assets.');
