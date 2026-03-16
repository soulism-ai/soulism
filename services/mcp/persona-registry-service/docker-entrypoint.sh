#!/bin/sh
set -eu

bootstrap_dir="/app/bootstrap/packs"
target_dir="${PERSONA_PACKS_DIR:-/app/packs}"

mkdir -p "$target_dir"

if [ -d "$bootstrap_dir" ]; then
  find "$bootstrap_dir" -maxdepth 1 -type f -name '*.json' -exec cp -f {} "$target_dir"/ \;
fi

exec node dist/main.js
