#!/bin/sh
# Stamp a new build version so browsers pick up changes right away.
# Run from the repo root before each commit: sh scripts/stamp-version.sh
set -e
V=$(date -u +%Y%m%d%H%M%S)
printf '{ "v": "%s" }\n' "$V" > version.json
sed -i.bak -E "s#(assets/(app|styles|config)\.(js|css))(\?v=[0-9A-Za-z]+)?#\1?v=$V#g" index.html && rm -f index.html.bak
sed -i.bak -E "s#var BUILD = \"[^\"]*\";#var BUILD = \"$V\";#" assets/app.js && rm -f assets/app.js.bak
echo "Stamped version $V"
