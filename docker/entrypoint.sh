#!/bin/sh
# Usage: compile <name> <plugin.lua> | evaluate <plugin.qplug> | encrypt <in.qplug> <out.qplugx> | <any command>
set -e
case "$1" in
  compile)
    shift
    exec mono /opt/qsys/PluginCompile/PLUGCC.exe "$@"
    ;;
  evaluate)
    # The script loads json.lua and PluginEvalConfig.json from the cwd, so the .qplug path must be absolute
    shift
    qplug=$(realpath "$1")
    cd /opt/qsys/Plugin-Evaluation-Script
    exec lua5.3 evaluateDesignTime.lua "$qplug"
    ;;
  encrypt)
    shift
    export WINEPREFIX=/tmp/wineprefix
    [ -d "$WINEPREFIX" ] || cp -r /opt/wineprefix "$WINEPREFIX"
    exec wine /opt/qsys/PluginEncryptionTool/release/plugin_tool_release.exe encrypt "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
