// Turns a fresh copy of the template into a new plugin: asks for the plugin's name and details, generates a new
// PluginInfo.Id, and writes them into info.lua, package.json, package-lock.json and the "Qsys Plugin Dev Tools" strings in
// plugin.lua, layout.lua, runtime.lua and README.md.
//
// Usage: npm run init [-- --force]
// Runs only while info.lua still has the template Id (see template-id.js). --force re-runs it on an initialized
// plugin and generates another Id, so existing designs will no longer recognize the plugin.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { TemplateId, isTemplateId } from './template-id.js';

const InfoFile = 'plugin/info.lua';
const force = process.argv.includes('--force');

const info = fs.readFileSync(InfoFile, 'utf8');
if (!isTemplateId(info) && !force) {
  console.log(`${InfoFile} no longer has the template Id (${TemplateId}), so this plugin is already initialized.`);
  console.log('Pass --force to run init again. It generates a new Id, and existing designs will lose the plugin.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Reads answers through the line iterator, which buffers, so piped input works as well as a terminal
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = rl[Symbol.asyncIterator]();
const ask = async (question, { fallback = '', check = () => null } = {}) => {
  for (;;) {
    process.stdout.write(fallback ? `${question} [${fallback}]: ` : `${question}: `);
    const { value, done } = await lines.next();
    if (!process.stdin.isTTY) process.stdout.write(`${value ?? ''}\n`);
    const answer = (value ?? '').trim() || fallback;
    // Values go into Lua and JSON strings unescaped
    const error = /["\\]/.test(answer) ? 'Quotes and backslashes are not allowed' : check(answer);
    if (!error) return answer;
    console.log(`  ${error}`);
    if (done) throw new Error('Input ended before all answers were given');
  }
};

let answers;
try {
  const display = await ask('Plugin name (shown in Designer)', { check: (a) => !a && 'Required' });
  // "none" leaves Manufacturer empty and drops the "Manufacturer~" group from Name
  const manufacturer = await ask('Manufacturer, or "none"', { fallback: 'Manufacturer' })
    .then((a) => (a.toLowerCase() === 'none' ? '' : a));
  // The folder name is usually the project name, unless the template was cloned without renaming it.
  // A forced re-run keeps the current name.
  const folder = slug(path.basename(path.resolve('.')));
  const name = await ask('Package name (names the .qplug and its install folder)', {
    fallback: force ? pkg.name : folder && folder !== pkg.name ? folder : slug(display),
    check: (a) => !/^[a-z0-9][a-z0-9._-]*$/.test(a) && 'Use lowercase letters, digits, ".", "_" and "-"'
  });
  const description = await ask('Description', { fallback: `${display} plugin` });
  const author = await ask('Author', { check: (a) => !a && 'Required' });
  answers = { display, manufacturer, name, description, author };
} catch (err) {
  console.log(`\n${err.message}. Nothing was changed.`);
  process.exit(1);
} finally {
  rl.close();
}
const { display, manufacturer, name, description, author } = answers;
const id = crypto.randomUUID();

const luaString = '"(?:[^"\\\\]|\\\\.)*"';
const luaField = (field, value) => [new RegExp(`^(\\s*${field} = )${luaString}`, 'm'), (_, pre) => `${pre}"${value}"`];

// Replacements are functions so a "$" in an answer isn't read as a group reference.
// Each edit must match, so a template change that breaks one stops init before it writes anything. With --force the
// cosmetic ones may already have been changed by hand, so a miss there is only reported.
const edits = [
  [InfoFile, true, [
    luaField('Name', manufacturer ? `${manufacturer}~${display}` : display),
    luaField('Version', '0.1'),
    luaField('BuildVersion', '0.1.0.0'),
    luaField('Id', id),
    luaField('Author', author),
    luaField('Manufacturer', manufacturer),
    luaField('Description', description)
  ]],
  ['plugin/plugin.lua', false, [
    [new RegExp(`(function GetPrettyName\\(props\\)\\s*return )${luaString}`), (_, pre) => `${pre}"${display} v"`]
  ]],
  ['plugin/layout.lua', false, [
    [new RegExp(`(Type = "GroupBox",\\s*Text = )${luaString}`), (_, pre) => `${pre}"${display}"`]
  ]],
  ['plugin/runtime.lua', false, [
    [/^(--\[\[\s*).*( - Runtime)$/m, (_, pre, post) => `${pre}${display}${post}`]
  ]],
  ['README.md', false, [
    [/^# .*/, () => `# ${display}`]
  ]]
];

const output = {};
const skipped = [];
for (const [file, required, replacements] of edits) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(text)) {
      if (required || !force) {
        console.log(`\n${file} has no match for ${pattern}, so the template has changed. Nothing was changed.`);
        process.exit(1);
      }
      skipped.push(file);
      continue;
    }
    text = text.replace(pattern, replacement);
  }
  output[file] = text;
}

const toJson = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
output['package.json'] = toJson({ ...pkg, name, description, author });
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
lock.name = name;
if (lock.packages?.['']) lock.packages[''].name = name;
output['package-lock.json'] = toJson(lock);

for (const [file, text] of Object.entries(output)) fs.writeFileSync(file, text);

console.log(`\nInitialized ${display} (${name}) with Id ${id}`);
console.log(`Updated ${Object.keys(output).filter(f => !skipped.includes(f)).join(', ')}`);
if (skipped.length) console.log(`Left unchanged (no template text found): ${[...new Set(skipped)].join(', ')}`);
console.log('\nStill to do by hand:');
console.log('  - PageNames in plugin/plugin.lua');
console.log('  - the rest of README.md, and the project description at the top of CLAUDE.md');
