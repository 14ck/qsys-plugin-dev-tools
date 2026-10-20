# Qsys Plugin Dev Tools

Starting point for a Q-SYS plugin written in Lua, with a live-push dev loop to a Text Controller and a one-command
build (compile, evaluate, encrypt, install).

**New here? Read the [Developer Guide](docs/GUIDE.md).** It covers machine setup on Windows, macOS and Linux
(including Docker Desktop on Windows via WSL 2 and on Mac), the Core and Text Controller setup, the dev loop, builds,
releases and troubleshooting.

## Starting a new plugin

1. Run `npm run init`. It asks for the plugin name, manufacturer, package name, description and author, generates a
   fresh `PluginInfo.Id`, and fills them into `plugin/info.lua`, `package.json`, `package-lock.json`, and the
   "Qsys Plugin Dev Tools" text in `plugin.lua`, `layout.lua`, `runtime.lua` and this README's title. The package name
   names the `.qplug` and its install folder. Init runs only while `info.lua` has the all-zeros template Id; until
   then, `build` and `push` print a warning.
2. Set `PageNames` in `plugin/plugin.lua`.
3. Replace this README and the project description in `CLAUDE.md`.

## Layout

```
plugin/               -- compiled into the .qplug by PLUGCC
  plugin.lua          -- skeleton; #includes the files below
  info.lua            -- PluginInfo (name, version, id)
  pages.lua           -- page list (from PageNames in plugin.lua)
  properties.lua      -- GetProperties
  rectify_properties.lua
  controls.lua        -- GetControls
  layout.lua          -- GetControlLayout
  runtime.lua         -- runtime logic (also pushed live to a Text Controller)
dev/
  shim.lua            -- fakes Properties for the Text Controller; never in the build
scripts/build.js      -- version bump, compile, evaluate, encrypt, install
scripts/init.js       -- one-time setup of a new plugin (name, Id)
scripts/publish-image.js -- build docker/ and push it to QSYS_TOOLS_IMAGE (e.g. Docker Hub)
docker/               -- image that runs the QSC tools on any OS (used by build.js)
docs/GUIDE.md         -- full developer guide
dist/                 -- build output (.qplug, .qplugx); git-ignored
index.js              -- live push/pull to a Text Controller (ide_qsys)
```

## Setup

```
npm install
copy .env.example .env   # then fill in Core IP, credentials, Text Controller name, tools image
```

The build uses the QSC plugin tools, which are Windows programs. **On every OS** (Windows included) it runs them in a
self-contained Docker image (`docker/`), so only Docker is needed. The image holds PLUGCC
([qsys-plugins/PluginCompile](https://github.com/qsys-plugins/PluginCompile)), the encryptor
([qsys-plugins/PluginEncryptionTool](https://github.com/qsys-plugins/PluginEncryptionTool)) and the
[evaluation script](https://github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script) at pinned commits,
and runs them with Mono, Wine and Lua 5.3. Set `QSYS_TOOLS_IMAGE` to pull a published image (e.g. from Docker Hub;
`npm run image:publish` pushes one). Without it, the image is built on the first build and rebuilt whenever `docker/`
changes. On Apple Silicon the image runs under x86-64 emulation.

**`--native` (Windows only)** skips Docker and runs the `.exe` files from the folder that `PLUGIN_TOOLS_DIR` names,
with these repos cloned side by side:

- [`basicpluginframework`](https://bitbucket.org/qsc-communities/basicpluginframework/src/main/): `plugincompile/PLUGCC.exe` compiles the plugin
- [`PluginEncryptionTool`](https://github.com/qsys-plugins/PluginEncryptionTool): `release/plugin_tool_release.exe` encrypts it
- [`Plugin-Evaluation-Script`](https://github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script): `lua53.exe` + `evaluateDesignTime.lua` run the design-time check (skipped when missing)

Step-by-step setup for each platform, with links, is in the guide:
[Windows + Docker Desktop](docs/GUIDE.md#41-windows-with-docker-desktop),
[Windows (native)](docs/GUIDE.md#42-windows-native-no-docker),
[Windows with WSL 2 + Docker Desktop](docs/GUIDE.md#43-windows-with-wsl-2-and-docker-desktop),
[macOS + Docker Desktop](docs/GUIDE.md#44-macos-with-docker-desktop), [Linux](docs/GUIDE.md#45-linux-with-docker-engine).

## Development loop

1. **Fast loop (runtime only):** in the design, add a Text Controller with **Script Access** enabled
   and controls that match `controls.lua` exactly (names, types, counts):

   | Name | Type |
   |---|---|
   | Status | Status Indicator |

   Keep `dev/shim.lua` in step with `properties.lua`, since a Text Controller has no `Properties`.

   Then run `npm run push`. nodemon watches `runtime.lua`, `info.lua`, and `shim.lua`. On each change it
   pushes `info.lua + dev/shim.lua + runtime.lua` to the Text Controller and prints the error count and log.

   - `npm run push:once` pushes one time.
   - `npm run pull` pulls the Text Controller's code back into `runtime.lua`, with the dev preamble removed.
   - `npm run config:get` lists the component's controls.

2. **Build:** run `npm run build` (or Ctrl+Shift+B in VS Code, which asks for the version bump and whether to install). It:
   1. bumps `BuildVersion` in `info.lua` (`Version` follows the first two fields),
   2. compiles `plugin/plugin.lua` with PLUGCC into `dist/<name>.qplug`,
   3. runs the design-time evaluation (a Lua error fails the build; reported SDK errors are only printed),
   4. encrypts it to `dist/<name>.qplugx`,
   5. with `--install`, copies it to `Documents/QSC/Q-Sys Designer/Plugins/<name>/`, or to
      `QSYS_PLUGIN_DIR/<name>/` when that's set. `--install` needs `QSYS_PLUGIN_DIR` on macOS and Linux,
      for example a VM's shared folder or a mounted share that Designer reads.

   `<name>` is the `package.json` name. The bump defaults to `dev`. Pass another with `npm run build -- fix` (`maj`, `min`,
   `fix`, `dev`, `none`), and add `--install` to install it: `npm run build -- dev --install`. `--no-encrypt` builds and
   installs the plain `.qplug` instead. `--native` (Windows) uses `PLUGIN_TOOLS_DIR` instead of Docker. If any step
   fails, `info.lua` is restored.

3. **Slow loop (Designer):** go through Designer when properties, controls, layout, or pages change. A Text Controller can't emulate any of those.
