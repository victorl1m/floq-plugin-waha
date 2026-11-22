# floq-plugin-waha (deprecated)

> **Deprecated.** WhatsApp is now built into Floq: **Settings > Integrations**. Update Floq to use it. A Floq that has WhatsApp built in adopts this plugin's data in place (chats, messages, accounts, settings, API key, webhook address) and removes the installed package by itself, so nothing has to be migrated by hand. Version 3.2.1 is the last release of this plugin; it only adds this notice (a banner above the inbox). Development continues in the Floq repository (`runtime/src/plugins/whatsapp`, `src/plugins/whatsapp`). The repository and its releases stay available for Floq versions without the built-in integration.

A WhatsApp inbox in Floq backed by your own WAHA instance; the AI can read it and message you freely; sending to others asks you first.

- **Secrets:** WAHA_API_KEY (plus the WAHA address in plugin settings). Add them in Floq under Secrets; they never go in plugin settings.
- **Install:** Floq admins: Settings > Plugins > **Browse plugins** (catalog: `victorl1m/floq-plugins`), then enable the plugin.
- **Trust:** installed plugins run inside the Floq runtime with its full privileges. Floq checks the package sha256 against the catalog, but its plugin API is a guard rail, not a sandbox. Install only code you trust.
- **Status:** tested with a fake WAHA and a fixture from a real inbox; payload shapes follow WAHA's docs, OpenAPI and source (docs/waha-api.md), not a live instance.

## Develop
```
npm install
npm test          # builds, validates with Floq's own parser (vendor/floq), runs the bundle against a fake context
npm run build     # dist/waha-<version>.floqpkg.json + dist/catalog-entry.json, rewrites ./catalog-entry.json
```
Release: bump `version` in plugin.json, `npm run build`, commit catalog-entry.json, tag `v<version>`, push the tag. Then copy the entry into the catalog repo.
Refresh the vendored parsers with `scripts/sync-vendor.sh /path/to/Floq`.

## Inbox (3.0)
A full WhatsApp client inside Floq, with its own light and dark palette (scoped `wa-*` stylesheet: installed plugins get no Tailwind utilities from the host).

- **Connect in Floq:** session status, QR code and pairing-code login, restart, stop, log out. No trip to the WAHA dashboard.
- **One chat per person:** a contact WhatsApp addresses by phone, by `@lid`, or by both spellings of a Brazilian mobile (with and without the ninth digit) is one chat. Links come from webhooks, WAHA's lids API, check-exists, the account's own id and lid, and from the same message showing up under two addresses. Your own chat reads "Name (You)". A link WAHA cannot make can be made by hand in the contact panel.
- **Names and pictures** from WAHA's contacts and chat overview; pictures are stored and served by the plugin.
- **Every message kind:** text with WhatsApp formatting, images, video, voice notes and audio (player), documents, stickers, locations, contact cards, polls (create, vote where the engine allows), link previews, replies, forwards, edits, deletes. Files are downloaded when they arrive (WAHA drops them after a few minutes), kept in the plugin's database (16 MB per file, 400 MB in total, oldest first out) and served through the plugin's own authenticated route: the WAHA key and URLs never reach the browser.
- **Composer:** one rounded field, emoji picker, attach menu (photos, videos, documents, camera, poll, location, contact), paste and drag and drop, voice notes, mentions in groups.
- **Ticks and reactions:** sent, delivered and read from `message.ack`; reactions both ways.
- **Chats:** archive, pin, mute, mark unread, delete, clear, search inside a chat; contacts, new chat by number (checked against WhatsApp first), groups (info, participants, admins, invite link, create, leave); labels, status, channels, incoming calls and presence where the engine has them.
- **History:** WAHA's own chat list and message history fill the inbox, so chats do not have to wait for a webhook.
- **Engines:** WEBJS, NOWEB and GOWS differ; what an engine cannot do is hidden (see `shared/features.ts`, `docs/waha-api.md`).

### History and contacts (3.2)
- **Your history comes along when you link.** WAHA's NOWEB engine keeps chats, contacts and messages only when the session's store is on *before* the phone is linked (`config.noweb.store = { enabled: true, fullSync: true }`). Floq creates sessions that way, and a session that is still waiting for the scan without it gets its config updated (webhooks and everything else are sent back unchanged) and restarted before the QR code is shown. A linked session is never touched. GOWS keeps history by itself (within WAHA's `WAHA_GOWS_DEVICE_HISTORY_SYNC_*` limits) and WEBJS reads it from the phone, so those are left alone. If WAHA refuses, its error is shown and linking goes on without history.
- **Import.** When the account first works after linking (or from the account menu: *Import history* / *Import history again*), Floq pages in every contact, lid pair, group name, chat and each chat's messages, newest first, in the background, with a progress bar and Cancel. Limits (plugin settings): 1000 messages per chat and 50 000 per import by default; media is not downloaded, only on demand as before. Rows are keyed by message id and stanza, so running it twice or receiving the same message on the webhook meanwhile never duplicates; a runtime restart resumes from the cursor (`history_chats`). Imported messages are not unread. After a fresh link a few quiet passes (1, 4, 12 and 30 minutes later) pick up what the phone handed to WAHA later.
- **Contacts.** All of WAHA's contacts (saved name, push name, business name, number, address-book and business flags) are stored per account and refreshed every six hours, when the account comes back, and on *Sync now* in the new Contacts list. WAHA sends no contact events: push names also follow from incoming messages. About text and pictures stay lazy.
- **Not verified against a live WAHA:** the paging of `/chats/overview`, `/chats/{id}/messages`, `/contacts/all`, `/lids` and `/groups`, and whether WAHA restarts a scanning session by itself after the config PUT (Floq starts it when it comes back stopped), follow WAHA's docs and are tested against a fake.

### Several accounts (3.1)
One inbox, many WhatsApp accounts: each account is a WAHA session attached to Floq.

- **Account menu** (the avatar in the chat-list header): every account with its name, number, connection state and unread chats; click one to switch. The avatar carries the unread count of the other accounts.
- **Add account:** "Link a new WhatsApp" creates a WAHA session and shows its QR code (or a pairing code); "Attach an existing session" lists the sessions of your WAHA that are not in Floq yet and attaches one in a click. Several sessions need a WAHA that runs more than one (WAHA Core runs a single session); WAHA's own error is shown when it refuses.
- **Per account:** restart, stop, webhook events, screenshot, rename, "Make default for the AI", log out, and "Remove from Floq" (detaches the account; the phone stays linked and the session keeps running; its stored chats are kept unless you tick the box).
- **Data:** every row carries its session (migration `006_accounts`) and every key is per session, so the same contact, message id or lid can exist in two accounts. Rows stored by 3.0.x move to the session that install was using the first time 3.1 runs.
- **Routes:** every route takes `session` (query or body); without it the first account (the primary one) answers. `GET /accounts`, `GET /accounts/available`, `POST /accounts/attach | create | update | remove`. Events carry `session`.
- **Webhook:** one hook URL serves every session; the event's `session` picks the account, and events of sessions that are not attached are dropped. A session Floq creates or attaches gets the same webhook another attached session has (URL, events, and the `WAHA_WEBHOOK_HMAC` key when saved). With no session to copy it from (webhooks set in WAHA's environment apply to every session anyway) nothing is changed.
- The "First session" setting only names the first account on a fresh install or an update from 3.0.

### WAHA webhook events
Point one WAHA webhook at the plugin's hook URL (Settings > Plugins > WhatsApp) and enable: `message.any`, `message.ack`, `message.ack.group`, `message.reaction`, `message.edited`, `message.revoked`, `session.status`, `presence.update`, `poll.vote`, `chat.archive`, `call.received`, `call.accepted`, `call.rejected`, `label.upsert`, `label.deleted`, `label.chat.added`, `label.chat.deleted`, `group.v2.join`, `group.v2.leave`, `group.v2.update`, `group.v2.participants`. With only `message` enabled the inbox still works; ticks and edits then update when a chat is opened (history sync).

### Requirements
- Sending files needs Floq 1.0.46 or newer (plugin routes accept bodies up to 8 MiB there; older runtimes cap them at 64 KiB and the inbox says so). Everything else works on older runtimes.
- Voice notes recorded in the browser are WebM or MP4; WAHA converts them (`convert: true`), which needs ffmpeg in the WAHA image (the default images have it).

### Checks
- `npm test`: parsers, every route and the SQL on an in-memory Postgres (PGlite), including a fixture built from a real inbox (ids only).
- UI in a real browser: Floq's `e2e/waha-full.spec.ts`, `e2e/waha-accounts.spec.ts` and `e2e/waha-composer.spec.ts` mount the built package the way an installed plugin loads (`WAHA_PLUGIN_DIR=<this checkout> e2e/run-local.sh e2e/waha-full.spec.ts`).

## What the AI can do
- Read the inbox (chats, messages, search, what a media message is: never the file itself), of any attached account (`session`; `me` lists them).
- **message-me / send-media-me:** text or a file to your own saved number, no approval (setting "Let the AI message me freely", on once a number is saved; 30 per minute loop guard).
- **send / send-media / react:** to other chats; each one needs your approval in Floq unless "Always allow AI to send messages" is on. Your own chat never asks.
