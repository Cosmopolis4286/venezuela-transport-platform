#!/usr/bin/env sh
# Abre el menú local de VTP. Sin Node.js, lo instala con Homebrew (macOS) o fnm (Linux); cualquier
# versión sirve: el menú descarga Node 24 solo para el proyecto en .tools/.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "No encuentro Node.js; lo instalo..."
  if command -v brew >/dev/null 2>&1; then
    brew install node
  else
    curl -fsSL https://fnm.vercel.app/install | sh -s -- --skip-shell
    export PATH="$HOME/.local/share/fnm:$HOME/.fnm:$PATH"
    eval "$(fnm env)"
    fnm install 24 && fnm use 24
  fi
fi
exec node infrastructure/scripts/menu.mjs "$@"
