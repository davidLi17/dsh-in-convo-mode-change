#!/usr/bin/env bash
# Run the plugin's unit/smoke tests. The host test imports
# @deepseek-ai/dsh-agent-presets, which resolves only against the installed
# harness scope — a temporary symlink supplies it for the test run.
set -euo pipefail
cd "$(dirname "$0")/.."

SCOPE=/home/jiangrui/.nvm/versions/node/v24.16.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai
if [ ! -d "$SCOPE" ]; then
  echo "harness scope not found at $SCOPE — point SCOPE in test/run-tests.sh at your dsh install" >&2
  exit 1
fi

mkdir -p node_modules
ln -sfn "$SCOPE" node_modules/@deepseek-ai
trap 'rm -rf node_modules' EXIT

node test/host.test.mjs
node test/slots.test.mjs
node test/client.test.mjs
