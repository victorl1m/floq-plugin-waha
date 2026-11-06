#!/usr/bin/env bash
# Usage: scripts/sync-vendor.sh /path/to/Floq
# Copies the runtime's package/manifest/catalog parsers and the SDK types into vendor/floq/ so tests validate packages with the real code.
set -euo pipefail
FLOQ="${1:?path to your Floq checkout}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
for f in package manifest catalog sdk; do cp "$FLOQ/runtime/src/plugins/$f.ts" "$HERE/vendor/floq/$f.ts"; done
# manifest.ts imports VAULT_NAME from ../mcpConfig.js; vendor/floq/mcpConfig.ts is a one-line shim (not copied).
sed -i 's#"\.\./mcpConfig\.js"#"./mcpConfig.js"#' "$HERE/vendor/floq/manifest.ts"
{ git -C "$FLOQ" rev-parse HEAD 2>/dev/null || echo unknown; echo "(vendored from a working tree that may have uncommitted changes)"; } > "$HERE/vendor/floq/FLOQ_COMMIT"
echo "vendored from $FLOQ"
