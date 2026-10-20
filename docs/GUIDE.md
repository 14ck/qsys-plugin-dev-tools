# Developer Guide

A complete walkthrough of this repo: setting up a machine (Windows, macOS or Linux, with or without Docker), starting
a new plugin from the template, the live-push dev loop against a Core, building and installing the plugin, and fixing
the errors you're most likely to hit.

The [README](../README.md) is the short version. This guide covers the same ground in more detail.

## Contents

1. [How the repo works](#1-how-the-repo-works)
2. [Pick your setup](#2-pick-your-setup)
3. [Common prerequisites](#3-common-prerequisites)
4. [Platform setup](#4-platform-setup)
   - [Windows with Docker Desktop](#41-windows-with-docker-desktop)
   - [Windows (native, no Docker)](#42-windows-native-no-docker)
   - [Windows with WSL 2 and Docker Desktop](#43-windows-with-wsl-2-and-docker-desktop)
   - [macOS with Docker Desktop](#44-macos-with-docker-desktop)
   - [Linux with Docker Engine](#45-linux-with-docker-engine)
5. [Start a new plugin from the template](#5-start-a-new-plugin-from-the-template)
6. [Configure `.env`](#6-configure-env)
7. [Prepare the Core and the Text Controller](#7-prepare-the-core-and-the-text-controller)
8. [The fast loop: push runtime code live](#8-the-fast-loop-push-runtime-code-live)
9. [Writing runtime code](#9-writing-runtime-code)
10. [Changing properties, controls, layout or pages](#10-changing-properties-controls-layout-or-pages)
11. [Building the plugin](#11-building-the-plugin)
12. [The slow loop: testing in Designer](#12-the-slow-loop-testing-in-designer)
13. [Releasing](#13-releasing)
14. [The Docker image in detail](#14-the-docker-image-in-detail)
15. [Troubleshooting](#15-troubleshooting)
16. [Reference links](#16-reference-links)

---

## 1. How the repo works

There are two separate parts:

- **The plugin** (`plugin/`): Lua that QSC's compiler (PLUGCC) turns into a `.qplug` file Q-SYS Designer loads.
- **Dev tooling** (`index.js`, `scripts/`, `docker/`, `dev/`): Node.js scripts that push code to a Core while you
  develop and drive the QSC tools when you build. None of it ends up in the plugin.

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
scripts/template-id.js
scripts/publish-image.js -- build docker/ and push it to QSYS_TOOLS_IMAGE (e.g. Docker Hub)
docker/               -- image that runs the QSC tools on any OS (used by build.js)
dist/                 -- build output (.qplug, .qplugx); git-ignored
index.js              -- live push/pull to a Text Controller (ide_qsys)
.vscode/tasks.json    -- Ctrl+Shift+B build task and a push task
```

### The plugin is built by textual include

`plugin/plugin.lua` defines the functions Designer calls (`GetProperties`, `GetControls`, `GetControlLayout`, ...). Inside
each one is a comment such as `--[[ #include "controls.lua" ]]`. PLUGCC replaces each comment with the file's contents.
So every other file in `plugin/` is the **body of a function**, not a module:

- it writes into a local the skeleton declares (`props`, `ctrls`, `pages`, `layout`, `graphics`),
- it has no `return`,
- it can't declare things the other files need, except globals. `PageNames` is the one global shared this way. It is
  defined in `plugin.lua` and read by `pages.lua` and `layout.lua`.

`runtime.lua` is included inside `if Controls then ... end` at the bottom of `plugin.lua`. `Controls` exists only when
the plugin runs on a Core (or in Emulate), so that's where runtime code lives.

### Two development loops

| Loop | What you change | How you test | Turnaround |
|---|---|---|---|
| **Fast** | `runtime.lua` only | `npm run push` sends it to a Text Controller on a running Core | Seconds, on every save |
| **Slow** | Properties, controls, layout, pages | `npm run build -- --install`, then load the plugin in Designer | A build plus a Designer reload |

The fast loop works because a Text Controller runs the same Lua as a plugin's runtime. It has no `Properties` table or
`PluginInfo`, so `index.js` puts `info.lua` and `dev/shim.lua` in front of `runtime.lua` before pushing it.

---

## 2. Pick your setup

The build runs three QSC tools: PLUGCC (compiler), the design-time evaluation script, and the encryptor. They are
Windows programs. `scripts/build.js` runs them one of two ways:

- **Docker (the default, on every OS):** in a Linux container that has all three tools built in (Mono for PLUGCC,
  Wine for the encryptor, Lua 5.3 for the evaluation). You need Docker and nothing else. The image comes from Docker
  Hub when `QSYS_TOOLS_IMAGE` is set, otherwise the first build makes it from `docker/` (see
  [section 14](#14-the-docker-image-in-detail)).
- **Native (`npm run build -- --native`, Windows only):** runs the `.exe` files directly from `PLUGIN_TOOLS_DIR`.
  Docker isn't used. This is for Windows machines that can't run Docker.

| Setup | Build tools | Docker | Designer | Pick this if |
|---|---|---|---|---|
| [Windows + Docker Desktop](#41-windows-with-docker-desktop) | Docker Desktop | Required | Same machine | You develop on Windows. The default |
| [Windows, native](#42-windows-native-no-docker) | `.exe`s in `PLUGIN_TOOLS_DIR`, with `--native` | Not used | Same machine | You can't install Docker Desktop |
| [Windows + WSL 2](#43-windows-with-wsl-2-and-docker-desktop) | Docker Desktop | Required | Same machine (`/mnt/c/...`) | You work in a Linux shell |
| [macOS](#44-macos-with-docker-desktop) | Docker Desktop (or OrbStack/Colima) | Required | Windows VM or another PC | You develop on a Mac |
| [Linux](#45-linux-with-docker-engine) | Docker Engine | Required | Windows VM or another PC | You develop on Linux |

Q-SYS Designer is Windows-only. On macOS and Linux you still need a Windows machine or VM to run Designer for the slow
loop. The fast loop (`npm run push`) only needs network access to the Core, so it works from any OS.

---

## 3. Common prerequisites

Every setup needs:

- **Node.js 18 or newer** (current LTS recommended): <https://nodejs.org/en/download>. The scripts are ES modules
  that use top-level `await`.
- **Git**: <https://git-scm.com/downloads>.
- **Q-SYS Designer**, on Windows: <https://www.qsys.com/resources/software-and-firmware/q-sys-designer-software/>.
- **A Q-SYS Core you can reach on TCP port 1710** (QRC), running a design that you can add a Text Controller to.
- **VS Code** (optional): the repo ships a build task and a push task in `.vscode/tasks.json`.

---

## 4. Platform setup

### 4.1 Windows with Docker Desktop

Node runs on Windows (PowerShell, cmd, Git Bash, VS Code) and the build runs the tools in a Linux container through
Docker Desktop.

1. Install Node.js, Git and Designer (see [Common prerequisites](#3-common-prerequisites)).
2. **Install Docker Desktop for Windows**: <https://docs.docker.com/desktop/setup/install/windows-install/>.
   During setup, choose the **WSL 2 backend** (the default). It needs virtualization turned on in the BIOS. Leave
   Docker Desktop on **Linux containers** (the default), not Windows containers.
3. **Check Docker** in PowerShell:

   ```powershell
   docker version          # shows both Client and Server
   docker run --rm hello-world
   ```

4. Clone the repo anywhere on your Windows drives. With the WSL 2 backend, Docker Desktop can mount any of them.
5. `PLUGIN_TOOLS_DIR` isn't used. Set `QSYS_TOOLS_IMAGE` if your team publishes the image
   ([section 14](#14-the-docker-image-in-detail)). Without it, the first `npm run build` builds the image, which takes
   a few minutes.
6. Continue with [Start a new plugin](#5-start-a-new-plugin-from-the-template). With `--install`, the build copies the
   plugin to `Documents\QSC\Q-Sys Designer\Plugins\<name>\`. It asks Windows for the Documents folder, so a Documents
   folder redirected to OneDrive works too.

> Docker Desktop is free for personal use and small businesses. Larger organizations need a paid subscription:
> <https://docs.docker.com/subscription/desktop-license/>. Rancher Desktop (<https://rancherdesktop.io/>, with the
> **dockerd (moby)** engine) is a free alternative that provides the same `docker` command.

### 4.2 Windows (native, no Docker)

Every build needs `--native`: `npm run build -- --native`, or add it to the command in `.vscode/tasks.json`.

1. Install Node.js, Git and Designer (see [Common prerequisites](#3-common-prerequisites)).
2. Make a folder for the QSC tools. The `.env.example` default is `C:\Bitbucket\Qsys Plugin Development`. `build.js`
   expects this layout inside it:

   ```
   <PLUGIN_TOOLS_DIR>\
     basicpluginframework\plugincompile\PLUGCC.exe
     PluginEncryptionTool\release\plugin_tool_release.exe
     Plugin-Evaluation-Script\lua53.exe
     Plugin-Evaluation-Script\evaluateDesignTime.lua
   ```

3. Clone the three public tool repos into it:

   ```powershell
   cd "C:\Bitbucket\Qsys Plugin Development"
   git clone https://bitbucket.org/qsc-communities/basicpluginframework.git
   git clone https://github.com/qsys-plugins/PluginEncryptionTool
   git clone https://github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script
   ```

   - [qsc-communities/basicpluginframework](https://bitbucket.org/qsc-communities/basicpluginframework/src/main/) is
     QSC's plugin framework. It includes `plugincompile\PLUGCC.exe`, the only part this repo uses.
   - [qsys-plugins/PluginEncryptionTool](https://github.com/qsys-plugins/PluginEncryptionTool) has
     `release\plugin_tool_release.exe`.
   - [Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script](https://github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script)
     has `lua53.exe` and `evaluateDesignTime.lua`. The build runs these directly. It doesn't use the repo's
     `EvaluatePlugin.sh`, which needs `jq`. The evaluation is optional. Without this folder the build still works, skips
     the design-time check, and prints `Plugin-Evaluation-Script not found in PLUGIN_TOOLS_DIR, skipping evaluation`.

4. Continue with [Start a new plugin](#5-start-a-new-plugin-from-the-template). `--install` works as in
   [4.1](#41-windows-with-docker-desktop).

### 4.3 Windows with WSL 2 and Docker Desktop

In this setup Node runs inside Linux (WSL 2). Docker Desktop provides the Docker engine to your WSL distro.

1. **Install WSL 2** with Ubuntu (the default distro). In an administrator PowerShell:

   ```powershell
   wsl --install
   ```

   Reboot when asked, then open **Ubuntu** from the Start menu and create your Linux user.
   Docs: <https://learn.microsoft.com/en-us/windows/wsl/install>

2. **Install Docker Desktop for Windows**: <https://docs.docker.com/desktop/setup/install/windows-install/>.
   During setup, choose the **WSL 2 backend** (the default).

3. **Turn on WSL integration**: Docker Desktop → **Settings → Resources → WSL integration** → enable your distro
   (e.g. Ubuntu) → **Apply & restart**.
   Docs: <https://docs.docker.com/desktop/features/wsl/>

4. **Check Docker from inside WSL**:

   ```bash
   docker version          # shows both Client and Server
   docker run --rm hello-world
   ```

   If you see `Cannot connect to the Docker daemon`, Docker Desktop isn't running or integration is off for this distro.

5. **Install Node.js inside WSL**. Your Windows Node install doesn't count. Use your distro's package manager, or a
   version manager such as nvm: <https://nodejs.org/en/download> (pick Linux and nvm).

6. **Clone the repo into the WSL file system** (e.g. `~/src/my-plugin`), **not** under `/mnt/c/...`. Two reasons:
   - `npm run push` uses nodemon, which relies on file-change events. WSL 2 doesn't get those for files on `/mnt/c`
     that Windows programs edit, so saves from a Windows editor wouldn't trigger a push.
   - File access across `/mnt/c` is much slower.

7. **Edit with VS Code's WSL extension** so the editor, terminal and tasks all run inside WSL: run `code .` from the
   repo folder in Ubuntu. Docs: <https://code.visualstudio.com/docs/remote/wsl>

8. **Point `QSYS_PLUGIN_DIR` at the Windows Plugins folder through `/mnt/c`**. It's required for `--install`, because
   WSL can't ask Windows for the Documents folder:

   ```ini
   QSYS_PLUGIN_DIR=/mnt/c/Users/<you>/Documents/QSC/Q-Sys Designer/Plugins
   ```

   If Windows moved your Documents folder to OneDrive, use
   `/mnt/c/Users/<you>/OneDrive/Documents/QSC/Q-Sys Designer/Plugins`. Spaces in the values are fine, with no quotes needed.

9. Without `QSYS_TOOLS_IMAGE`, the first `npm run build` builds the Docker image, which takes a few minutes (see
   [section 14](#14-the-docker-image-in-detail)).

> Docker Desktop is free for personal use and small businesses. Larger organizations need a paid subscription:
> <https://docs.docker.com/subscription/desktop-license/>

### 4.4 macOS with Docker Desktop

1. **Install Docker Desktop for Mac** (pick Apple Silicon or Intel):
   <https://docs.docker.com/desktop/setup/install/mac-install/>

2. **Apple Silicon only:** the image is `linux/amd64` because the QSC tools are x86-64, so it runs under emulation.
   - Install Rosetta 2 if you haven't: `softwareupdate --install-rosetta --agree-to-license`
     (<https://support.apple.com/en-us/102527>).
   - In Docker Desktop → **Settings → General**, **Use Rosetta for x86_64/amd64 emulation on Apple Silicon** is
     faster than the default QEMU emulation. It needs the Apple Virtualization framework VMM.
     Settings reference: <https://docs.docker.com/desktop/settings-and-maintenance/settings/>
   - If the build fails at the **encrypt** step (Wine) with Rosetta on, turn the setting off to fall back to QEMU and
     build again.

3. **File sharing:** Docker Desktop shares `/Users`, `/Volumes`, `/private`, `/tmp` and `/var/folders` by default.
   A repo under your home folder works as is. If the repo is anywhere else, add it in
   **Settings → Resources → File sharing**, or the build fails with `Mounts denied`.

4. **Check Docker**:

   ```bash
   docker version
   docker run --rm --platform linux/amd64 hello-world
   ```

5. **Install Node.js** (<https://nodejs.org/en/download>, or `brew install node`).

6. **Designer and `--install`**: Designer runs in a Windows VM (Parallels, VMware Fusion, UTM) or on another PC. For
   `npm run build -- --install`, set `QSYS_PLUGIN_DIR` to a folder on your Mac that **is** that Windows machine's
   `Documents\QSC\Q-Sys Designer\Plugins` folder, for example:
   - the VM's Windows folders shared to macOS by your VM software, or
   - that folder shared over SMB from Windows and mounted on the Mac (Finder → Go → Connect to Server →
     `smb://<windows-host>/<share>`), which shows up under `/Volumes/...`.

   ```ini
   QSYS_PLUGIN_DIR=/Volumes/<share>/QSC/Q-Sys Designer/Plugins
   ```

   Without `--install`, the build leaves the plugin in `dist/` and you can copy it over yourself.

**Docker Desktop alternatives.** `build.js` only runs the `docker` CLI, so any engine that provides it works:

- OrbStack: <https://orbstack.dev/>. Runs amd64 images with Rosetta.
- Colima: <https://github.com/abiosoft/colima>. Free and open source. Install it with `brew install colima docker`. On
  Apple Silicon, start it with Rosetta so amd64 images run: `colima start --vm-type vz --vz-rosetta`.

> Docker Desktop's licensing applies on macOS too: <https://docs.docker.com/subscription/desktop-license/>

### 4.5 Linux with Docker Engine

1. Install Docker Engine for your distro: <https://docs.docker.com/engine/install/>
2. Let your user run `docker` without `sudo` (log out and back in afterwards):
   <https://docs.docker.com/engine/install/linux-postinstall/>
3. On an ARM machine, install QEMU emulation so `linux/amd64` images run:
   `docker run --privileged --rm tonistiigi/binfmt --install amd64`
   (<https://docs.docker.com/build/building/multi-platform/>). On x86-64 there's nothing extra to do.
4. Install Node.js. If you want `--install`, set `QSYS_PLUGIN_DIR` as in [macOS step 6](#44-macos-with-docker-desktop).

On macOS and Linux the container runs as your uid/gid (`--user`), so files it writes into `dist/` belong to you, not
root.

---

## 5. Start a new plugin from the template

1. **Copy the template** into a new repo named after the plugin (the folder name becomes the default package name).
2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Run init**:

   ```bash
   npm run init
   ```

   It asks for:

   | Prompt | Used for | Example |
   |---|---|---|
   | Plugin name | Name shown in Designer, the layout group box, `GetPrettyName` | `Auto Switcher` |
   | Manufacturer, or `none` | `PluginInfo.Manufacturer`, and the `Manufacturer~` folder in Designer's plugin list | `M3 Tech` |
   | Package name | `package.json` name, the `.qplug` file name and its install folder. Lowercase, digits, `.`, `_`, `-` | `auto-swx-plugin` |
   | Description | `PluginInfo.Description`, `package.json` | `Auto switcher plugin` |
   | Author | `PluginInfo.Author`, `package.json` | `Jane Doe` |

   It then writes a fresh GUID into `PluginInfo.Id`, resets the version to `0.1` / `0.1.0.0`, and updates
   `plugin/info.lua`, `package.json`, `package-lock.json`, the "Qsys Plugin Dev Tools" text in `plugin.lua`, `layout.lua`,
   `runtime.lua`, and the README title. Nothing is written if any answer is invalid.

   Init runs only once. When `info.lua` no longer has the all-zeros Id, it refuses. `npm run init -- --force` re-runs it
   and **generates a new Id**, so designs that already contain the plugin will no longer recognize it. Until init has
   run, `build` and `push` print a warning about the template Id.

4. **Set the pages** in `plugin/plugin.lua`: `PageNames = { "Control", "Setup" }`. Then add a matching
   `if CurrentPage == "..." then` block in `layout.lua` for each page.
5. **Replace** the README body and the project description at the top of `CLAUDE.md` with what your plugin does.
   Keep the link to this guide.

---

## 6. Configure `.env`

Copy the example and fill it in:

```bash
cp .env.example .env        # macOS / Linux / WSL
copy .env.example .env      # Windows cmd
```

`.env` is git-ignored. Never commit it, because it holds Core credentials.

| Variable | Needed for | Value |
|---|---|---|
| `qCoreIp` | push, pull, config | IP or hostname of the Core |
| `qUsername` | push, pull, config | A Q-SYS Administrator user with **External Control Protocol** permission. Leave empty if the Core has no access control |
| `qPassword` | push, pull, config | That user's PIN |
| `qComponent` | push, pull, config | The Text Controller's **Code Name** in Designer |
| `QSYS_TOOLS_IMAGE` | build, `image:publish` | Optional. The tools image to pull, e.g. `<dockerhub-user>/qsys-plugin-tools:1.0.0`. When empty, the build makes its own image from `docker/` ([section 14](#14-the-docker-image-in-detail)) |
| `PLUGIN_TOOLS_DIR` | `build --native` | Windows only: folder with the three tool repos ([4.2](#42-windows-native-no-docker)). Not used by Docker builds. `~` is expanded |
| `QSYS_PLUGIN_DIR` | `build --install` | Designer's Plugins folder. Optional on Windows (defaults to `Documents\QSC\Q-Sys Designer\Plugins`), **required** elsewhere. `~` is expanded |

Examples:

```ini
# Windows (Docker Desktop)
QSYS_TOOLS_IMAGE=<dockerhub-user>/qsys-plugin-tools:1.0.0
QSYS_PLUGIN_DIR=

# Windows (--native)
PLUGIN_TOOLS_DIR=C:\Bitbucket\Qsys Plugin Development
QSYS_PLUGIN_DIR=

# WSL 2
QSYS_PLUGIN_DIR=/mnt/c/Users/<you>/Documents/QSC/Q-Sys Designer/Plugins

# macOS
QSYS_PLUGIN_DIR=/Volumes/<share>/QSC/Q-Sys Designer/Plugins
```

---

## 7. Prepare the Core and the Text Controller

The fast loop pushes code into a Text Controller in a design running on a Core. Set this up once per plugin in Designer:

1. **Add a Text Controller** to the design (Schematic Library → Scripting Components → Text Controller).
2. In its Properties:
   - set **Script Access** to anything except **None** (e.g. **All**). With **None**, QRC can't see it and push fails.
   - note the **Code Name**. That goes in `qComponent`.
3. **Give it the same controls as `controls.lua`**: the same names, types and counts. For the template that's:

   | Name | Type | Count |
   |---|---|---|
   | Status | Status Indicator | 1 |

   Each time you add a control to `controls.lua`, add it here too, or the pushed code fails when it reads
   `Controls.<Name>`.
4. **Credentials:** in Q-SYS Administrator, use (or create) a user with **External Control Protocol** permission and
   put its name and PIN in `.env`. If the Core has no users configured, leave both empty.
5. **Save to Core & Run.**
6. **Test the connection**:

   ```bash
   npm run config:get
   ```

   It prints the Text Controller's controls as JSON. If they match the table, you're ready.

---

## 8. The fast loop: push runtime code live

```bash
npm run push
```

nodemon watches `plugin/runtime.lua`, `plugin/info.lua` and `dev/shim.lua`. Each time you save one of them, it pushes
this to the Text Controller:

```lua
-- >>> DEV PREAMBLE (info.lua + dev/shim.lua) - not part of the plugin build
<plugin/info.lua>
<dev/shim.lua>
-- <<< DEV PREAMBLE END
<plugin/runtime.lua>
```

It then prints the error count, any compile errors, and the script's log (your `print()` output):

```
./plugin/runtime.lua pushed to MyTextController on 192.168.1.50 with 0 errors

Manufacturer~My Plugin v0.1 starting
```

Stop it with Ctrl+C. In VS Code, **Terminal → Run Task → Push Runtime (watch)** does the same thing.

Other commands:

| Command | What it does |
|---|---|
| `npm run push:once` | Push one time, no watching |
| `npm run pull` | Replace `plugin/runtime.lua` with the Text Controller's code, with the preamble removed. **Overwrites local edits you haven't pushed.** Use it after editing in Designer's script editor |
| `npm run config:get` | Print the Text Controller's controls as JSON |

Don't edit or remove the `DEV PREAMBLE` marker lines in the Text Controller. `pull` needs them to strip the preamble.

---

## 9. Writing runtime code

`runtime.lua` follows the usual Q-SYS script style: everything is global, in this order.

1. Variables, constants, timers
2. Functions
3. Event handlers (`EventHandler` assignments)
4. `Initialization()` at the end

Conventions already in the template:

- **`SetStatus(code, msg)`** sets the `Status` indicator using a `StatusCodes` value
  (`OK`, `Compromised`, `Fault`, `NotPresent`, `Missing`, `Initializing`).
- **`DebugPrint(direction, msg)`** prints only when the **Debug Print** property is `All` or matches the direction
  (`"Tx"` or `"Rx"`). `rectify_properties.lua` hides that property unless **Show Plugin Debug** is on in Designer.
- **Generic helpers** at the bottom (`funcInterlock`, `hex2str`, `str2hex`, ...) are a standard boilerplate block.

Things that commonly go wrong:

- **Only use `Properties` keys the shim fakes.** The Text Controller has no `Properties`. `dev/shim.lua` supplies one,
  and it must have every key `runtime.lua` reads. Add the key there whenever you add a property.
- **A control with `Count = 1` isn't an array.** `Controls.Status` is the control itself. `Controls.Input[1]` only works
  when `Count > 1`. Code that loops over a control should handle both cases.
- **Stale async callbacks.** Timers, `HttpClient` callbacks and socket events can fire after you've reconnected or
  re-initialized. Keep a generation counter, capture it when you start the work, and return early if it changed:

  ```lua
  Generation = 0

  function Connect()
    Generation = Generation + 1
    local gen = Generation
    HttpClient.Download({
      Url = "http://" .. Host .. "/status",
      EventHandler = function(_, code, data)
        if gen ~= Generation then return end  -- a newer Connect() has started
        -- handle the response
      end
    })
  end
  ```

- **No `print()` outside runtime code.** A `print` in `properties.lua`, `controls.lua`, `layout.lua` etc. breaks the
  build's design-time evaluation.

For Q-SYS Lua and plugin API details, see the Q-SYS Help (<https://q-syshelp.qsc.com/>). If you use Claude Code, the
`qsys-developer` skill answers API questions.

---

## 10. Changing properties, controls, layout or pages

A Text Controller can't show these changes, so check them by building and loading the plugin in Designer
([section 12](#12-the-slow-loop-testing-in-designer)). Keep the related files in step:

| Change | Files to update |
|---|---|
| Add or rename a **property** | `properties.lua`, `dev/shim.lua` (same key, a sensible `Value`), `rectify_properties.lua` if it should hide or show |
| Add or rename a **control** | `controls.lua` (give it a `PinStyle`), `layout.lua` (a `layout["Name"]` entry), the Text Controller in your test design |
| Add a **page** | `PageNames` in `plugin.lua`, a `CurrentPage == "..."` block in `layout.lua` |
| Group **pins** | `PrettyName = "Group~Label"` in `layout.lua` |

The build's evaluation step reports a control with no `PinStyle` or no layout entry as an error.

---

## 11. Building the plugin

```bash
npm run build                          # bump dev, compile, evaluate, encrypt; no install
npm run build -- fix --install         # bump fix and install into Designer's Plugins folder
npm run build -- none --no-encrypt --install   # rebuild the same version as a plain .qplug and install it
npm run build -- --native              # Windows only: run the .exe files from PLUGIN_TOOLS_DIR instead of Docker
```

In VS Code, **Ctrl+Shift+B** (Cmd+Shift+B on macOS) runs **Compile Plugin**. It asks for the bump and whether to
install. The install choice defaults to **Install**, which fails early on macOS/Linux/WSL if `QSYS_PLUGIN_DIR` isn't set.

### What happens

1. **Version bump.** `BuildVersion` in `info.lua` is `a.b.c.d`. The chosen field goes up by one, the fields after it
   reset to 0, and `Version` becomes `a.b`:

   | Bump | From `0.1.2.3` | `Version` |
   |---|---|---|
   | `dev` (default) | `0.1.2.4` | `0.1` |
   | `fix` | `0.1.3.0` | `0.1` |
   | `min` | `0.2.0.0` | `0.2` |
   | `maj` | `1.0.0.0` | `1.0` |
   | `none` | `0.1.2.3` | unchanged |

2. **Compile.** PLUGCC expands the `#include`s in `plugin/plugin.lua` into `dist/<name>.qplug`. A missing or recursive
   include fails the build.
3. **Evaluate.** `evaluateDesignTime.lua` runs every design-time function. A Lua error (syntax, a crash, or a `print()`)
   fails the build. Reported SDK errors and warnings are printed but don't fail it. With `--native`, skipped if
   `PLUGIN_TOOLS_DIR` has no `Plugin-Evaluation-Script`.
4. **Encrypt** to `dist/<name>.qplugx`, unless `--no-encrypt`.
5. **Install** (only with `--install`): copies the file to `<plugins>/<name>/<name>.qplug(x)`, where `<plugins>` is
   `QSYS_PLUGIN_DIR` or, on Windows, `Documents\QSC\Q-Sys Designer\Plugins`. It deletes the other variant in that
   folder so Designer never loads two plugins with the same Id.

`<name>` is the `package.json` name. **If any step fails, `info.lua` is restored**, so a failed build doesn't use up a
version number.

---

## 12. The slow loop: testing in Designer

1. `npm run build -- dev --install` (or `--no-encrypt` while you're iterating. It's the same plugin, unencrypted).
2. In Designer, find the plugin under **Plugins** in the Schematic Library. It's listed as `Manufacturer~Name`, so it
   sits in a folder named after the manufacturer. If the new build doesn't show up, restart Designer.
3. Drag it into a design, then check the properties, pages, layout and pins. **Emulate** or **Save to Core & Run**
   runs `runtime.lua` inside the real plugin, with the real `Properties`.

---

## 13. Releasing

- Ship the encrypted **`.qplugx`** from `dist/`. The `.qplug` is readable Lua source.
- Choose the bump to match the change: `fix` for bug fixes, `min` for new features, `maj` for breaking changes. `dev`
  is for internal builds.
- **Never change `PluginInfo.Id` after the first release.** Designer uses the Id to match a plugin in an existing
  design to an upgraded build. A new Id makes it a different plugin.
- `dist/` is git-ignored, so build artifacts never get committed.

---

## 14. The Docker image in detail

You don't need to run Docker commands yourself. `build.js` manages the image.

- **What's in it** (`docker/Dockerfile`): Debian bookworm-slim, Mono (runs PLUGCC), Wine (runs the encryptor),
  Lua 5.3 (runs the evaluation), and the QSC tools downloaded from
  [qsys-plugins/PluginCompile](https://github.com/qsys-plugins/PluginCompile),
  [qsys-plugins/PluginEncryptionTool](https://github.com/qsys-plugins/PluginEncryptionTool) and
  [Plugin-Evaluation-Script](https://github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script) at
  **pinned commits** (`PLUGIN_COMPILE_SHA`, `ENCRYPTION_TOOL_SHA`, `EVALUATION_SCRIPT_SHA`). It's self-contained:
  only the repo is mounted. The Wine setup follows
  [M3NickP/qplug-encrypt-container](https://github.com/M3NickP/qplug-encrypt-container).
- **Where it comes from:**
  - With `QSYS_TOOLS_IMAGE` set, the first build pulls that image (e.g. from Docker Hub). Later builds use the local
    copy and never re-pull the same tag, so publish each change under a new tag and update `QSYS_TOOLS_IMAGE`.
  - Without it, the first build makes `qsys-plugin-tools:<hash>` from `docker/`, where the hash covers every file in
    `docker/`. Editing anything there (e.g. bumping a pinned SHA) makes the next build create a new image. Installing
    Mono and Wine takes a few minutes and several hundred MB. Old images aren't deleted. List and remove them with:

    ```bash
    docker image ls qsys-plugin-tools
    docker image rm qsys-plugin-tools:<old-hash>
    ```

- **Publishing to Docker Hub:** set `QSYS_TOOLS_IMAGE` to `<dockerhub-user>/qsys-plugin-tools:<version>`, run
  `docker login`, then `npm run image:publish`. It builds `docker/` for `linux/amd64` and pushes it. Teammates set the
  same `QSYS_TOOLS_IMAGE` and skip the local image build.
- **How each step runs:** `docker run --rm --platform linux/amd64 [--user <uid>:<gid>] -v <repo>:/work <image> <step>`.
  The entrypoint's steps are `compile <name> <plugin.lua>` (PLUGCC), `evaluate <qplug>` (Lua 5.3 in the baked-in
  evaluation script folder) and `encrypt <in> <out>` (the encryptor under Wine). `--user` is passed on macOS and
  Linux so outputs aren't root-owned. Windows has no uid, and Docker Desktop's mounts don't need one.
- **Line endings:** `docker/*` must keep LF endings, because CRLF breaks `/bin/sh`. `.gitattributes` enforces this for git
  checkouts. If you copy the repo some other way on Windows, check that `entrypoint.sh` still has LF endings.
- **Encryptor check:** the encryptor exits 0 even when it can't read its input, so `build.js` fails the build if the
  `.qplugx` isn't bigger than the `.qplug`.

To debug the image by hand:

```bash
docker image ls qsys-plugin-tools                       # find the tag
docker run --rm -it --platform linux/amd64 -v "$PWD":/work qsys-plugin-tools:<hash> bash
```

From PowerShell, use `${PWD}` in place of `"$PWD"`.

---

## 15. Troubleshooting

### Push, pull, config

| Message or symptom | Cause and fix |
|---|---|
| `Set qCoreIp and qComponent in .env to connect to the Core` | `.env` is missing or those values are empty. See [section 6](#6-configure-env) |
| Timeout / `ECONNREFUSED` / `EHOSTUNREACH` | The Core isn't reachable on TCP 1710. Check the IP, the network/VPN, and any firewall between you and the Core |
| Logon or permission error | The user needs **External Control Protocol** permission in Q-SYS Administrator, or the PIN is wrong |
| Component not found | `qComponent` doesn't match the Text Controller's **Code Name**, its **Script Access** is **None**, or the design isn't running |
| `attempt to index a nil value (field '<Property>')` | `runtime.lua` reads a property that `dev/shim.lua` doesn't define. Add it to the shim |
| `attempt to index a nil value (field '<Control>')` | The Text Controller lacks a control from `controls.lua`. Add it in Designer and redeploy |
| `Warning: plugin/info.lua still has the template Id` | Run `npm run init` |
| Saving doesn't trigger a push (WSL) | The repo is under `/mnt/c`. Move it into the WSL file system ([4.3](#43-windows-with-wsl-2-and-docker-desktop), step 6) |
| `pull` lost my edits | `pull` overwrites `runtime.lua`. Use git to get them back, and push before you pull |

### Build

| Message | Cause and fix |
|---|---|
| `--native needs PLUGIN_TOOLS_DIR (with basicpluginframework) in .env` | Set `PLUGIN_TOOLS_DIR` and check that `basicpluginframework\plugincompile\PLUGCC.exe` exists ([4.2](#42-windows-native-no-docker)) |
| `--native runs the QSC .exe files directly, so it only works on Windows` | Drop `--native` to use Docker |
| `Docker is needed to build, and the docker command was not found` | Install Docker ([section 4](#4-platform-setup)), or on Windows build with `--native`. On WSL, turn on WSL integration in Docker Desktop |
| `Cannot connect to the Docker daemon` / `error during connect` (Windows) | Start Docker Desktop (or `colima start`, or `sudo systemctl start docker` on Linux) |
| `Docker image build failed` | Usually network (no access to Debian mirrors or github.com). Retry with network access, or behind a proxy configure Docker's proxy settings |
| `Could not pull <image>` | `QSYS_TOOLS_IMAGE` is misspelled or that tag was never pushed. For a private Docker Hub repo, run `docker login` |
| `no matching manifest for windows/amd64` (Windows) | Docker Desktop is set to Windows containers. Right-click its tray icon → **Switch to Linux containers** |
| `Mounts denied` (macOS) | Add the repo's folder in Docker Desktop → Settings → Resources → File sharing |
| `exec format error` (Linux ARM) | amd64 emulation isn't installed. See [4.5](#45-linux-with-docker-engine), step 3 |
| `set: Illegal option -` or `\r: not found` | `docker/entrypoint.sh` has CRLF line endings. Convert it to LF ([section 14](#14-the-docker-image-in-detail)) |
| `PLUGCC include errors: ERROR - NOT FOUND::...` | An `#include` names a file that doesn't exist in `plugin/` |
| `Evaluation failed (print() at design time breaks it)` | A Lua error in a design-time function, or a `print()` outside `runtime.lua`. The message below it shows the Lua error |
| `Control without PinStyle: X` / `Control without layout definition: X` | Add a `PinStyle` in `controls.lua` / a `layout["X"]` entry in `layout.lua` |
| `Encryption failed (the tool could not read the .qplug)` | The encryptor couldn't read the file. Check the path has no unusual characters and that the repo is shared with Docker. On Apple Silicon, also try switching Rosetta off |
| `--install needs QSYS_PLUGIN_DIR in .env on macOS/Linux` | Set `QSYS_PLUGIN_DIR` ([section 6](#6-configure-env)), or build without `--install` |
| `Unknown version bump "X"` | Use `maj`, `min`, `fix`, `dev` or `none` |
| `... no longer has the template Id ... already initialized` (init) | Init already ran. Only use `--force` if you really want a new Id |

---

## 16. Reference links

**Docker**

- Docker Desktop for Windows: <https://docs.docker.com/desktop/setup/install/windows-install/>
- Rancher Desktop (free Docker Desktop alternative): <https://rancherdesktop.io/>
- Docker Hub (publishing images): <https://docs.docker.com/docker-hub/repos/>
- Docker Desktop WSL 2 backend: <https://docs.docker.com/desktop/features/wsl/>
- Docker Desktop for Mac: <https://docs.docker.com/desktop/setup/install/mac-install/>
- Docker Desktop settings (Rosetta, file sharing): <https://docs.docker.com/desktop/settings-and-maintenance/settings/>
- Docker Desktop troubleshooting: <https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/>
- Docker Desktop license terms: <https://docs.docker.com/subscription/desktop-license/>
- Docker Engine on Linux: <https://docs.docker.com/engine/install/>
- Linux post-install (run without sudo): <https://docs.docker.com/engine/install/linux-postinstall/>
- Running amd64 images on ARM (QEMU/binfmt): <https://docs.docker.com/build/building/multi-platform/>
- OrbStack: <https://orbstack.dev/>, Colima: <https://github.com/abiosoft/colima>

**Windows / WSL**

- Install WSL: <https://learn.microsoft.com/en-us/windows/wsl/install>
- VS Code in WSL: <https://code.visualstudio.com/docs/remote/wsl>

**macOS**

- Install Rosetta 2: <https://support.apple.com/en-us/102527>

**Q-SYS**

- Q-SYS Designer download: <https://www.qsys.com/resources/software-and-firmware/q-sys-designer-software/>
- Q-SYS Help (Lua, plugin and QRC reference): <https://q-syshelp.qsc.com/>
- basicpluginframework (PLUGCC, used by `--native`): <https://bitbucket.org/qsc-communities/basicpluginframework/src/main/>
- PluginCompile (PLUGCC, used by the Docker image): <https://github.com/qsys-plugins/PluginCompile>
- PluginEncryptionTool: <https://github.com/qsys-plugins/PluginEncryptionTool>
- Plugin-Evaluation-Script: <https://github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script>
- BasePlugin (QSC's reference plugin layout): <https://github.com/qsys-plugins/BasePlugin>

**Tooling**

- Node.js: <https://nodejs.org/en/download>
- Git: <https://git-scm.com/downloads>
- `ide_qsys` (the QRC library `index.js` uses): <https://www.npmjs.com/package/ide_qsys>
