# Runs the Windows-only QSC plugin tools on any OS with Docker (Windows, macOS, Linux).
# scripts/build.js builds or pulls this image itself; scripts/publish-image.js pushes it to a registry.
# Self-contained: nothing from the host is needed except the files being built.
#   PLUGCC.exe (.NET)                 -> Mono
#   plugin_tool_release.exe (x64 C++) -> Wine (as in github.com/M3NickP/qplug-encrypt-container)
#   evaluateDesignTime.lua            -> native Lua 5.3
#
# Usage (repo mounted at /work):
#   docker run --rm --platform linux/amd64 -v "$PWD":/work <image> compile <name> plugin/plugin.lua
#   docker run --rm --platform linux/amd64 -v "$PWD":/work <image> evaluate /work/dist/<name>.qplug
#   docker run --rm --platform linux/amd64 -v "$PWD":/work <image> encrypt dist/<name>.qplug dist/<name>.qplugx
FROM debian:bookworm-slim

LABEL org.opencontainers.image.title="qsys-plugin-tools" \
      org.opencontainers.image.description="QSC Q-SYS plugin tools (PLUGCC, design-time evaluation, encryptor) for any OS"

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip lua5.3 \
      mono-runtime libmono-system4.0-cil libmono-system-core4.0-cil \
      wine wine64 \
 && rm -rf /var/lib/apt/lists/*

# QSC's public tool repos, pinned so the image is reproducible
ARG PLUGIN_COMPILE_SHA=1b4061396826d53dc7f763907620d1db363b2ca2
ARG ENCRYPTION_TOOL_SHA=a3e0917ce61afb8d122bd17765027f712d514df7
ARG EVALUATION_SCRIPT_SHA=938ae24b0c30bf9300dcf0db2b0b6bb16a073ce9
WORKDIR /opt/qsys
RUN curl -fsSL -o pc.zip https://github.com/qsys-plugins/PluginCompile/archive/$PLUGIN_COMPILE_SHA.zip \
 && curl -fsSL -o pe.zip https://github.com/qsys-plugins/PluginEncryptionTool/archive/$ENCRYPTION_TOOL_SHA.zip \
 && curl -fsSL -o ev.zip https://github.com/Q-SYS-Communities-for-Developers/Plugin-Evaluation-Script/archive/$EVALUATION_SCRIPT_SHA.zip \
 && unzip -q pc.zip && unzip -q pe.zip && unzip -q ev.zip && rm pc.zip pe.zip ev.zip \
 && mv PluginCompile-* PluginCompile && mv PluginEncryptionTool-* PluginEncryptionTool \
 && mv Plugin-Evaluation-Script-* Plugin-Evaluation-Script

# Template Wine prefix. The entrypoint copies it per run, because Wine refuses a prefix owned by
# another user and build.js runs the container as the host user (--user) so outputs aren't root-owned.
# Mono/Gecko are disabled so wineboot doesn't try to download them.
ENV HOME=/tmp USER=wine WINEDEBUG=-all
RUN WINEPREFIX=/opt/wineprefix WINEDLLOVERRIDES="mscoree,mshtml=" wineboot --init \
 && wineserver -w \
 && chmod -R a+rX /opt/wineprefix

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
WORKDIR /work
ENTRYPOINT ["/bin/sh", "/usr/local/bin/entrypoint.sh"]
