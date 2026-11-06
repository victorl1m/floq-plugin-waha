# floq-plugin-waha

A WhatsApp inbox in Floq backed by your own WAHA instance; agents can read it, sending asks you first.

- **Secrets:** WAHA_API_KEY (plus the WAHA address in plugin settings). Add them in Floq under Secrets; they never go in plugin settings.
- **Install:** Floq admins: Settings > Plugins > **Browse plugins** (catalog: `victorl1m/floq-plugins`), then enable the plugin.
- **Trust:** installed plugins run inside the Floq runtime with its full privileges. Floq checks the package sha256 against the catalog, but its plugin API is a guard rail, not a sandbox. Install only code you trust.
- **Status:** tested with mocked network calls only; not verified against the real service.

## Develop
```
npm install
npm test          # builds, validates with Floq's own parser (vendor/floq), runs the bundle against a fake context
npm run build     # dist/waha-<version>.floqpkg.json + dist/catalog-entry.json, rewrites ./catalog-entry.json
```
Release: bump `version` in plugin.json, `npm run build`, commit catalog-entry.json, tag `v<version>`, push the tag. Then copy the entry into the catalog repo.
Refresh the vendored parsers with `scripts/sync-vendor.sh /path/to/Floq`.
