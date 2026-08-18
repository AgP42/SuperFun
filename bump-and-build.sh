#!/bin/bash
# Increment the version (patch + versionCode), build the .snplg, name it with
# the version, and keep only the newest versioned .snplg locally.
# Usage: ./bump-and-build.sh
set -euo pipefail
cd "$(dirname "$0")"

NEWVER="$(python3 - <<'PY'
import json, pathlib
cfg_p = pathlib.Path('PluginConfig.json')
pkg_p = pathlib.Path('package.json')
cfg = json.loads(cfg_p.read_text())
major, minor, patch = (cfg.get('versionName', '0.1.0').split('.') + ['0', '0', '0'])[:3]
patch = str(int(patch) + 1)
newver = f'{major}.{minor}.{patch}'
cfg['versionName'] = newver
cfg['versionCode'] = str(int(cfg.get('versionCode', '0')) + 1)
cfg_p.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + '\n')
pkg = json.loads(pkg_p.read_text())
pkg['version'] = newver
pkg_p.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + '\n')
print(newver)
PY
)"

echo ">> Building SuperFun v${NEWVER} (code bumped)"
# SuperFun ships native code (FileStore) → make sure the toolchain (JAVA_HOME /
# ANDROID_HOME) is on this shell so gradle can build app.npk. Source a local or
# parent env.sh if present; otherwise assume the caller already exported them.
if [ -f env.sh ]; then source env.sh; elif [ -f ../env.sh ]; then source ../env.sh; fi
# Clean generated artifacts so a previous name's bundle can never be packaged
# again (the .snplg zips the whole build/generated dir).
rm -rf build/generated
./buildPlugin.sh

OUT="build/outputs"
cp "${OUT}/superfun.snplg" "${OUT}/superfun-${NEWVER}.snplg"
# keep only the newest versioned snplg locally
find "${OUT}" -maxdepth 1 -name 'superfun-*.snplg' ! -name "superfun-${NEWVER}.snplg" -delete
echo ">> Packaged: ${OUT}/superfun-${NEWVER}.snplg"
echo "${NEWVER}" > "${OUT}/.lastversion"
