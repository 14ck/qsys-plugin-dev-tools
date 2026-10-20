# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A template for a Q-SYS plugin (Lua, compiled to a `.qplug`). The plugin itself is a minimal skeleton (one page, a `Debug Print` property, a `Status` indicator); replace this paragraph with what the plugin does. The Node.js code is dev tooling only: it is not part of the plugin.

## Commands

Setup: `npm install`, then copy `.env.example` to `.env` and fill in `qCoreIp`, `qUsername`, `qPassword`, `qComponent` (Text Controller name), and optionally `QSYS_TOOLS_IMAGE` (published tools image) and `PLUGIN_TOOLS_DIR` (only for `--native`).

| Command | What it does |
|---|---|
| `npm run init [-- --force]` | One-time setup of a plugin made from the template: prompts for name, manufacturer, package name, description, author; writes a fresh `Id` and those values into `info.lua`, `package.json`, `package-lock.json` and the "Qsys Plugin Dev Tools" strings. Refuses once `Id` is no longer the all-zeros template Id unless `--force` |
| `npm run push` | nodemon watches `plugin/runtime.lua`, `plugin/info.lua`, `dev/shim.lua`; on each change pushes to the Text Controller over QRC and prints the error count and log |
| `npm run push:once` | Push once |
| `npm run pull` | Overwrite `plugin/runtime.lua` with the Text Controller's code (dev preamble stripped) |
| `npm run config:get` | Dump the Text Controller's controls as JSON |
| `npm run build [-- maj\|min\|fix\|dev\|none] [--no-encrypt] [--install] [--native]` | Bump `BuildVersion` (default `dev`), compile, evaluate, encrypt, and install only with `--install` (also the default VS Code build task, which offers a version and install picker) |
| `npm run image:publish` | Build `docker/` for `linux/amd64` and push it as `QSYS_TOOLS_IMAGE` (e.g. Docker Hub; `docker login` first) |

There are no tests or linters. "Testing" means pushing to a live Core and reading the printed errors and log. The build's design-time evaluation is the only static check. A Lua error there (syntax, or a crash in a design-time function) fails the build, and so does any `print()` at design time. The SDK errors it reports are printed but don't fail the build.

`scripts/build.js` runs the QSC tools in the Docker image from `docker/` on every OS, Windows included:

1. Bumps `BuildVersion` in `info.lua`, and `Version` becomes its first two fields. This replaces `compile_plugin.sh`.
2. `entrypoint.sh compile <name> plugin/plugin.lua` runs PLUGCC (a .NET exe) with Mono and writes `plugin/<name>.qplug`. The script moves it to `dist/`.
3. `entrypoint.sh evaluate <qplug>` runs `lua5.3 evaluateDesignTime.lua` from the baked-in Plugin-Evaluation-Script folder (it loads `json.lua` and `PluginEvalConfig.json` from the cwd). `EvaluatePlugin.sh` is not used because it needs jq.
4. `entrypoint.sh encrypt` runs the encryptor with Wine and writes `dist/<name>.qplugx`.
5. With `--install`, copies to `<plugins>/<name>/` and removes the other variant (`.qplug`/`.qplugx`) so Designer doesn't load two copies of the same Id. `<plugins>` is `QSYS_PLUGIN_DIR` if set, else `Documents/QSC/Q-Sys Designer/Plugins` (Windows only; elsewhere `QSYS_PLUGIN_DIR` is required).

`<name>` is the `package.json` name. If any step fails, `info.lua` is restored.

Each step is `docker run --platform linux/amd64` with the repo mounted at `/work`, and `--user` the host uid on macOS/Linux (Windows has none). The image is self-contained: it fetches PLUGCC and the encryptor from github.com/qsys-plugins and the evaluation script from github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script at pinned commits (build args in the Dockerfile). If `QSYS_TOOLS_IMAGE` is set, the build pulls that image when it isn't local and never re-pulls a tag it has. Otherwise it builds `qsys-plugin-tools:<hash of docker/>`, so editing those files makes the next build rebuild it. The encryptor exits 0 and encrypts nothing when it can't read its input, so `build.js` checks that the `.qplugx` is bigger than the `.qplug`.

`--native` (Windows only) runs the `.exe` files from `PLUGIN_TOOLS_DIR` instead: `basicpluginframework/plugincompile/PLUGCC.exe`, `Plugin-Evaluation-Script/lua53.exe` (cwd that folder; skipped when absent) and `PluginEncryptionTool/release/plugin_tool_release.exe`.

## Architecture

**Build by textual include.** `plugin/plugin.lua` is a skeleton. PLUGCC replaces each `--[[ #include "file.lua" ]]` comment with that file's contents, so each file in `plugin/` is a function *body*, not a module. It writes into locals that the skeleton declares (`props`, `ctrls`, `pages`, `layout`, `graphics`) and has no `return`. `PageNames` is a global defined in `plugin.lua` and read by `pages.lua` and `layout.lua`.

**`runtime.lua` runs in two hosts:**
1. Release: inlined into `if Controls then ... end` at the end of `plugin.lua`.
2. Dev: pushed to a Text Controller by `index.js` with a preamble of `info.lua` + `dev/shim.lua` between `-- >>> DEV PREAMBLE` / `-- <<< DEV PREAMBLE END` markers. `pull` uses these markers to strip the preamble, so don't remove or edit them.

Consequences:
- `runtime.lua` may only use `Properties` keys that `dev/shim.lua` fakes. When you add or rename a property in `properties.lua`, update the shim too.
- The Text Controller's controls must match `controls.lua` exactly (names, types, counts). The README has the table. Adding a control means adding it to the Text Controller in Designer before the fast loop works.
- Changes to properties, controls, layout or pages can only be checked by building and loading the plugin in Designer.
- `npm run pull` overwrites `runtime.lua`, including any unpushed local edits.

**Runtime structure (`runtime.lua`).** Everything is global, following the usual Q-SYS script style. Sections, in order: variables/constants/timers, functions, events, then the `Initialization()` call.
- `SetStatus(code, msg)` drives the `Status` indicator with a `StatusCodes` value. `DebugPrint(direction, msg)` prints according to the `Debug Print` property.
- A Control with a Count of 1 is a single control, not an array, so code indexing `Controls.X[i]` must handle that case.
- Async code (timers, `HttpClient`, sockets) that can outlive a reconnect should capture a generation counter and return early when it's stale.
- The generic helpers near the bottom (`funcInterlock`, `hex2str`, etc.) are a standard boilerplate block.

**Plugin identity.** The template's `PluginInfo.Id` is all zeros (`scripts/template-id.js`); `npm run init` replaces it with a fresh GUID, and `build`/`push` warn while it's still there. Keep the Id fixed after that so existing designs recognize upgraded builds. `rectify_properties.lua` hides `Debug Print` unless Designer's "Show Plugin Debug" is on. In `layout.lua`, `PrettyName` uses `Group~Label` to group pins.

## References

- The `qsys-developer` skill is available for Q-SYS Lua/plugin API questions.
