#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Use existing test dependencies, or explicitly point to a matching DSH installation.
# Never remove a caller's node_modules directory.
if [ ! -e node_modules ]; then
  if [ -z "${DSH_NODE_MODULES:-}" ] || [ ! -d "$DSH_NODE_MODULES" ]; then
    echo 'Set DSH_NODE_MODULES to matching DSH node_modules (see README.md).' >&2
    exit 1
  fi
  ln -s "$DSH_NODE_MODULES" node_modules
  trap 'rm node_modules' EXIT
fi
node test/host.test.mjs
node test/queue.test.mjs
node test/slots.test.mjs
node test/client.test.mjs
if [ -f test/rc5.test.mjs ]; then node test/rc5.test.mjs; fi

