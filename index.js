// Live-push tooling for plugin runtime development (ide_qsys v3).
// Pushes plugin/runtime.lua (with a dev preamble) to a Text Controller over QRC.
// Usage: node index.js <push|pull|config>
import Core from 'ide_qsys';
import fs from 'fs';
import dotenv from 'dotenv';
import { isTemplateId, TemplateIdWarning } from './scripts/template-id.js';
dotenv.config({ quiet: true });

const RuntimePath = './plugin/runtime.lua';
const InfoPath = './plugin/info.lua';
const ShimPath = './dev/shim.lua';

// Markers delimit the dev preamble so pull can strip it back out
const PreambleStart = '-- >>> DEV PREAMBLE (info.lua + dev/shim.lua) - not part of the plugin build';
const PreambleEnd = '-- <<< DEV PREAMBLE END';

const ComponentName = process.env.qComponent;

const core = new Core({
  ip: process.env.qCoreIp,
  username: process.env.qUsername,
  pw: process.env.qPassword,
  comp: ComponentName
});

// Text Controllers have no Properties/PluginInfo, so prepend info.lua and the shim
const buildPushCode = () => [
  PreambleStart,
  fs.readFileSync(InfoPath, 'utf8'),
  fs.readFileSync(ShimPath, 'utf8'),
  PreambleEnd,
  fs.readFileSync(RuntimePath, 'utf8')
].join('\n');

const stripPreamble = (code) => {
  const start = code.indexOf(PreambleStart);
  const end = code.indexOf(PreambleEnd);
  if (start === -1 || end === -1) return code;
  return code.slice(0, start) + code.slice(end + PreambleEnd.length).replace(/^\r?\n/, '');
};

const pushRuntime = async () => {
  if (isTemplateId(fs.readFileSync(InfoPath, 'utf8'))) console.log(TemplateIdWarning);
  const result = await core.updateCode(ComponentName, buildPushCode());
  const { errorCount, errorDetails, logs } = result.deployment;
  console.log(`${RuntimePath} pushed to ${ComponentName} on ${core.ip} with ${errorCount} errors\n`);
  if (errorCount > 0 && errorDetails) console.log(errorDetails);
  for (const str of logs || []) {
    if (str) console.log(str);
  }
};

const pullRuntime = async () => {
  console.log(`Pulling code from ${ComponentName}...`);
  const code = await core.getCode(ComponentName);
  fs.writeFileSync(RuntimePath, stripPreamble(code));
  console.log(`${RuntimePath} updated!`);
};

const getConfig = async () => {
  const controls = await core.getControls(ComponentName);
  console.log(JSON.stringify(controls, null, 2));
};

const Modes = {
  push: pushRuntime,
  pull: pullRuntime,
  config: getConfig
};

const run = Modes[process.argv[2]];
if (!run) {
  console.log('Usage: node index.js <push|pull|config>');
} else if (!process.env.qCoreIp || !ComponentName) {
  console.log('Set qCoreIp and qComponent in .env to connect to the Core');
} else {
  try {
    await core.connect();
    await run();
  } catch (e) {
    console.log(e.message || e);
  } finally {
    await core.disconnect();
  }
}
