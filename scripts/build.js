// Builds the plugin with the QSC tools:
//   1. bump BuildVersion in plugin/info.lua           (replaces PluginCompile/compile_plugin.sh)
//   2. PLUGCC.exe expands the #includes into a .qplug  (github.com/qsys-plugins/PluginCompile)
//   3. design-time check with evaluateDesignTime.lua   (Plugin-Evaluation-Script; skipped if absent)
//   4. encrypt to .qplugx                              (github.com/qsys-plugins/PluginEncryptionTool)
//   5. with --install, copy into Designer's Plugins/<name>/ folder
//
// By default the tools run in the Docker image from docker/ on every OS (Mono for PLUGCC, Wine for the
// encryptor, Lua 5.3 for the evaluation). That's QSYS_TOOLS_IMAGE when set (pulled on first use; see
// scripts/publish-image.js), else an image built locally from docker/ and rebuilt whenever docker/ changes.
// With --native (Windows only) the .exe files run straight from PLUGIN_TOOLS_DIR (see .env.example).
//
// Usage: npm run build [-- maj|min|fix|dev|none] [--no-encrypt] [--install] [--native]   (default: dev)
// The version bump is reverted if any step fails.
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { isTemplateId, TemplateIdWarning } from './template-id.js';
dotenv.config({ quiet: true });

const expandHome = (p) => p?.replace(/^~(?=$|[\\/])/, os.homedir());

const args = process.argv.slice(2);
const encrypt = !args.includes('--no-encrypt');
const install = args.includes('--install');
const UseDocker = !args.includes('--native');
const bump = (args.find(a => !a.startsWith('--')) ?? 'dev').replace(/^ver_/, '');
const BumpIndex = { maj: 0, min: 1, fix: 2, dev: 3, none: -1 };

const ToolsDir = expandHome(process.env.PLUGIN_TOOLS_DIR);
const PluginName = JSON.parse(fs.readFileSync('./package.json', 'utf8')).name;
const RepoDir = path.resolve('.');
const PluginDir = path.resolve('plugin');
const DistDir = path.resolve('dist');
const InfoFile = path.join(PluginDir, 'info.lua');
const DockerDir = path.resolve('docker');
const EvalDir = ToolsDir && path.join(ToolsDir, 'Plugin-Evaluation-Script');

const Tools = ToolsDir && {
  compiler: path.join(ToolsDir, 'basicpluginframework', 'plugincompile', 'PLUGCC.exe'),
  lua: path.join(EvalDir, 'lua53.exe'),
  encryptor: path.join(ToolsDir, 'PluginEncryptionTool', 'release', 'plugin_tool_release.exe')
};

const fail = (msg) => { throw new Error(msg); };

// A published image (QSYS_TOOLS_IMAGE) is pulled when missing. Otherwise the image is built from docker/ and
// tagged with a hash of it, so editing the Dockerfile triggers a rebuild.
const DockerPlatform = 'linux/amd64';
const PublishedImage = process.env.QSYS_TOOLS_IMAGE;
const DockerImage = UseDocker && (PublishedImage || `qsys-plugin-tools:${crypto.createHash('sha256')
  .update(fs.readdirSync(DockerDir).sort().map(f => f + fs.readFileSync(path.join(DockerDir, f), 'utf8')).join())
  .digest('hex').slice(0, 12)}`);

const ensureImage = () => {
  const check = spawnSync('docker', ['image', 'inspect', DockerImage], { stdio: 'ignore' });
  if (check.error) fail('Docker is needed to build, and the docker command was not found (on Windows, --native runs the tools without it)');
  if (check.status === 0) return;
  if (PublishedImage) {
    console.log(`Pulling Docker image ${DockerImage} (first build only)`);
    const result = spawnSync('docker', ['pull', '--platform', DockerPlatform, DockerImage], { stdio: 'inherit' });
    if (result.status !== 0) fail(`Could not pull ${DockerImage}. Check QSYS_TOOLS_IMAGE in .env, and docker login for a private repo.`);
    return;
  }
  console.log(`Building Docker image ${DockerImage} (first build only)`);
  const result = spawnSync('docker', ['build', '--platform', DockerPlatform, '-t', DockerImage, DockerDir], { stdio: 'inherit' });
  if (result.status !== 0) fail('Docker image build failed');
};

// The repo is mounted at /work. Runs as the host user so outputs aren't owned by root (no uid on Windows,
// where Docker Desktop's mounts don't have that problem).
const toContainer = (p) => path.posix.join('/work', ...path.relative(RepoDir, p).split(path.sep));
const docker = (command, opts) => {
  const user = process.getuid ? ['--user', `${process.getuid()}:${process.getgid()}`] : [];
  return spawnSync('docker', ['run', '--rm', '--platform', DockerPlatform, ...user, '-v', `${RepoDir}:/work`, DockerImage, ...command], opts);
};

if (!(bump in BumpIndex)) {
  console.log(`Unknown version bump "${bump}". Use maj, min, fix, dev or none.`);
  process.exit(1);
}
if (!UseDocker && process.platform !== 'win32') {
  console.log('--native runs the QSC .exe files directly, so it only works on Windows. Leave it off to use Docker.');
  process.exit(1);
}
if (!UseDocker && (!Tools || !fs.existsSync(Tools.compiler))) {
  console.log('--native needs PLUGIN_TOOLS_DIR (with basicpluginframework) in .env.');
  process.exit(1);
}

// Step 1: BuildVersion a.b.c.d -> bump one field and zero the ones after it; Version tracks a.b
const originalInfo = fs.readFileSync(InfoFile, 'utf8');
if (isTemplateId(originalInfo)) console.log(TemplateIdWarning);
const bumpVersion = () => {
  const match = originalInfo.match(/BuildVersion = "(\d+)\.(\d+)\.(\d+)\.(\d+)"/);
  if (!match) fail('No BuildVersion = "a.b.c.d" found in info.lua');
  const parts = match.slice(1).map(Number);
  const i = BumpIndex[bump];
  if (i < 0) return parts.join('.');
  parts[i]++;
  parts.fill(0, i + 1);
  const buildVersion = parts.join('.');
  fs.writeFileSync(InfoFile, originalInfo
    .replace(match[0], `BuildVersion = "${buildVersion}"`)
    .replace(/^(\s*)Version = "[^"]*"/m, `$1Version = "${parts[0]}.${parts[1]}"`));
  return buildVersion;
};

// Step 2: PLUGCC writes <name>.qplug next to plugin.lua; move it to dist/
const compile = () => {
  const source = path.join(PluginDir, 'plugin.lua');
  const output = path.join(PluginDir, `${PluginName}.qplug`);
  const qplug = path.join(DistDir, `${PluginName}.qplug`);
  fs.rmSync(output, { force: true });
  const result = UseDocker
    ? docker(['compile', PluginName, toContainer(source)], { stdio: 'inherit' })
    : spawnSync(Tools.compiler, [PluginName, source], { stdio: 'inherit' });
  if (result.status !== 0 || !fs.existsSync(output)) fail('PLUGCC failed');
  // PLUGCC exits 0 on a missing or recursive include and writes the error into the plugin instead
  const includeErrors = fs.readFileSync(output, 'utf8').match(/ERROR - (NOT FOUND::|RECURSIVE INCLUDE:).*/g);
  if (includeErrors) fail(`PLUGCC include errors:\n  ${includeErrors.join('\n  ')}`);
  fs.mkdirSync(DistDir, { recursive: true });
  fs.renameSync(output, qplug);
  return qplug;
};

// Step 3: a Lua error here (syntax, or a crash in a design-time function) fails the build.
// Reported SDK errors/warnings are printed but do not, since Designer tolerates most of them.
// Also applies the two error checks that EvaluatePlugin.sh adds on top of the Lua output.
const evaluate = (qplug) => {
  if (!UseDocker && !fs.existsSync(Tools.lua)) {
    return console.log('\nPlugin-Evaluation-Script not found in PLUGIN_TOOLS_DIR, skipping evaluation');
  }
  const result = UseDocker
    ? docker(['evaluate', toContainer(qplug)], { encoding: 'utf8' })
    : spawnSync(Tools.lua, ['evaluateDesignTime.lua', qplug], { cwd: EvalDir, encoding: 'utf8' });
  let report;
  try { report = JSON.parse(result.stdout); } catch { report = null; }
  if (result.status !== 0 || !report) fail(`Evaluation failed (print() at design time breaks it)\n${result.stderr || result.stdout}`);

  const errors = [...report.Errors];
  for (const ctrl of Object.values(report.Controls ?? {})) {
    if (!ctrl.PinStyle) errors.push(`Control without PinStyle: ${ctrl.Name}`);
  }
  for (const [name, item] of Object.entries(report.Layout ?? {})) {
    if (item === null) errors.push(`Control without layout definition: ${name}`);
  }
  const print = (title, list) => list.length && console.log(`\n${title}:\n  ${[...list].sort().join('\n  ')}`);
  print('Evaluation notices', report.Notices);
  print('Evaluation warnings', report.Warnings);
  print('Evaluation errors', errors);
  console.log(`\nEvaluation: ${errors.length} errors, ${report.Warnings.length} warnings, ${report.Notices.length} notices`);
};

// Step 4
const encryptPlugin = (qplug) => {
  const qplugx = `${qplug}x`;
  fs.rmSync(qplugx, { force: true });
  const result = UseDocker
    ? docker(['encrypt', toContainer(qplug), toContainer(qplugx)], { stdio: 'inherit' })
    : spawnSync(Tools.encryptor, ['encrypt', qplug, qplugx], { stdio: 'inherit' });
  if (result.status !== 0 || !fs.existsSync(qplugx)) fail('Encryption failed');
  // The tool exits 0 and encrypts nothing when it can't read the input, so check the output grew
  if (fs.statSync(qplugx).size <= fs.statSync(qplug).size) fail('Encryption failed (the tool could not read the .qplug)');
  return qplugx;
};

// Step 5: Designer's Plugins folder: QSYS_PLUGIN_DIR if set (needed off Windows, e.g. a share or a
// VM's shared folder), else Documents/QSC/Q-Sys Designer/Plugins (same target as copy_plugin.cmd).
const pluginsDir = () => {
  const dir = expandHome(process.env.QSYS_PLUGIN_DIR);
  if (dir) return dir;
  if (process.platform !== 'win32') fail('--install needs QSYS_PLUGIN_DIR in .env on macOS/Linux (Designer\'s Plugins folder)');
  const docs = spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('MyDocuments')"], { encoding: 'utf8' })
    .stdout.trim();
  if (!docs) fail('Could not resolve the Documents folder');
  return path.join(docs, 'QSC', 'Q-Sys Designer', 'Plugins');
};

// Removes the other variant (.qplug/.qplugx) so Designer doesn't load two plugins with the same Id.
// Copies to a temp name then renames, so Designer's file watcher never reads a partial file.
const installPlugin = (file, plugins) => {
  const dir = path.join(plugins, PluginName);
  const ext = path.extname(file);
  const target = path.join(dir, `${PluginName}${ext}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(path.join(dir, `${PluginName}${ext === '.qplug' ? '.qplugx' : '.qplug'}`), { force: true });
  fs.copyFileSync(file, `${target}.tmp`);
  fs.renameSync(`${target}.tmp`, target);
  return target;
};

try {
  // Resolve the install target and the image first so a bad setup fails before anything is built
  const plugins = install && pluginsDir();
  if (UseDocker) ensureImage();
  const version = bumpVersion();
  console.log(bump === 'none' ? `BuildVersion ${version} (not bumped)` : `BuildVersion -> ${version}`);
  const qplug = compile();
  evaluate(qplug);
  const output = encrypt ? encryptPlugin(qplug) : qplug;
  console.log(`\nBuilt ${path.relative('.', output)} (v${version})`);
  console.log(plugins ? `Installed ${installPlugin(output, plugins)}` : 'Not installed (pass --install to copy it into Designer\'s Plugins folder)');
} catch (err) {
  fs.writeFileSync(InfoFile, originalInfo);
  console.log(`\n${err.message}\nBuild failed; info.lua restored.`);
  process.exit(1);
}
