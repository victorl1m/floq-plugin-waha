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

## WhatsApp fallback
Opt-in (`waFallback`, off by default). A question (`floq decision request`) or approval (`floq approval request`) still unanswered after `fallbackAfterMin` minutes (default 3, 0 = off) is sent once to your own number (`assistantPhone`). Plugin-originated approvals are never sent (no loops). Needs Floq with `ctx.attention` (manifest `contributes.attention`).
- **Replies:** `Q7K2 1` / `Q7K2 1,3` (multi-select) / `Q7K2 free text` (only if the question allows text). Only single-question decisions are asked on WhatsApp; with several questions the message says to open Floq. Approvals: `A9F3 no` always; `A9F3 yes 0042` (one-time 4-digit code in the message, single use, 10 min, 3 wrong tries kill the code; deny stays possible) only when `waAllowApprovals` is on.
- **`waAllowApprovals` (off by default):** off means WhatsApp can only deny approvals. On means a coded reply can allow an approval that Floq does not classify as irreversible. Residual risk: that classification is a keyword regex (`RISKY`) over the action and detail text an agent wrote, so actions such as "send the invoice email", "transfer funds" or "upload build to the store" are not recognised and could be allowed from WhatsApp. Keep it off unless you accept that.
- **Limits:** at most 20 prompts per hour and 10 open at once. Texts are sanitized (links, brackets and WhatsApp formatting characters removed), approvals include a truncated detail.
- **Assistants cannot read the fallback:** prompts and replies are sent without being stored, and hidden from `floq plugin call waha chats/messages`. Every message the plugin sends is remembered and never counts as a reply. A message you type in a self-chat counts only when the WAHA session is logged in as your own number and WAHA marks it `source: "app"`; anything sent through the API (including by an assistant with `message-me`) is rejected.
- **Irreversible approvals** (push, deploy, delete, ...): WhatsApp can only deny; allowing needs the Floq app. There is no setting to change that.
- **Trust:** replies count only when the `WAHA_WEBHOOK_HMAC` secret is set (webhooks are then signed), the message comes from your own number's chat, and it matches the strict format and an open prompt. Anything else stays a normal inbox message. Floq (not the plugin) binds the answer to your account and records it as resolved via `plugin:waha`.
- **Answered in Floq first:** the WhatsApp message is edited to "Answered in Floq" (WAHA `PUT /api/{session}/chats/{chatId}/messages/{messageId}`); if WAHA refuses the edit, a short follow-up is sent. An answer that loses the race gets "Already answered in Floq".
