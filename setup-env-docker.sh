#!/usr/bin/env sh
set -eu

docker run --rm -it -v "$(pwd):/work" -w /work node:24-alpine node scripts/setup-env.js

echo
echo ".env setup completed."
