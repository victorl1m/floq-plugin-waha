# WAHA HTTP API + webhook reference (for the Floq inbox plugin)

Sources: openapi.json (waha.devlike.pro/swagger/openapi.json, fetched 2026-11-21, 196 operations), docs pages under /docs/how-to/* and /docs/engines/*, and the public source github.com/devlikeapro/waha (src/structures/*.dto.ts, src/core/engines/{webjs,noweb,gows}/session.*.core.ts, src/core/utils/jids.ts). Newest docs = WAHA 2026.x.
Items not confirmed from a source are marked **UNCONFIRMED**. Per-engine "not implemented" lists below come from a static scan of the engine classes (a method that is inherited from the abstract session throws 501); verify on a live instance before relying on one.

## 0. Conventions

- **Core vs Plus**: since 2026.6.1 there is no Plus split (docs page "WAHA Plus": everything is in Core, image `devlikeapro/waha`). Webhook `environment.tier` = "CORE". Before 2026.6.1 some features (multimedia send/receive on WEBJS/NOWEB, per-session security, S3 media) were Plus; if the target server is older, a media send returns 422 "available only in Plus version" (`AvailableInPlusVersion`).
- **Auth**: header `X-Api-Key: <key>`; query fallback `?x-api-key=<key>` (lowercase). Applies to /api/*, /api/files/*, /ws. 401 `{"statusCode":401,"message":"Unauthorized"}` on missing/bad key. `WHATSAPP_API_KEY_EXCLUDE_PATH` (regex list, e.g. `api/files/(.*)`) turns auth off for paths. Dedicated keys: `POST /api/keys/media` (media-download-only key per session), `POST /api/keys/control`.
- **Session**: in the **path** for new-style endpoints (`/api/{session}/...`), in the **body** (`session`, default "default") for `/api/send*`, `/api/reaction`, `/api/star`, `/api/forwardMessage`, `/api/startTyping`, `/api/stopTyping`, `/api/sendSeen`; in the **query** (`session=`) for `/api/contacts*`, `/api/checkNumberStatus`, `/api/messages`, `/api/screenshot`.
- **Encode `@` as %40** in path segments (chatId, messageId, lid).
- **Chat id formats**: `<digits>@c.us` (phone user; no +), `<digits>@lid` (hidden id), `<id>@g.us` group, `<id>@newsletter` channel, `status@broadcast` status/stories, `<id>@broadcast` broadcast lists. `@s.whatsapp.net` appears only inside `_data` of NOWEB/GOWS; never send to it. WAHA normalizes `:device` suffixes away (`normalizeJid`, `toCusFormat`). `@lid` ids are kept as `@lid` in `from/to/participant`.
- **Timestamps**: message `timestamp` = unix seconds (reaction payload may carry fractional seconds, e.g. 1710481111.853). Envelope `timestamp` = ms. Poll vote `timestamp` = seconds today (docs say may change to ms).
- **Pagination**: `limit`, `offset`, `sortBy`, `sortOrder=asc|desc` on chats, contacts/all, groups, lids, messages.
- **`merge=true` (default)** on GET chats, chats/overview, chats/{id}/messages, /api/messages: merges the @lid chat and the @c.us chat of the same contact into one. Pass `merge=false` to see both.

## 1. Sessions

| Op | Method + path | Body / query | Response |
|---|---|---|---|
| List | GET /api/sessions?all=true&expand=apps | `all` includes STOPPED | `[SessionInfo]` |
| Create (+start) | POST /api/sessions | `{name?, start?=true, config?, apps?}` | SessionInfo, 201 |
| Upsert+start | POST /api/sessions/start | same as create | SessionDTO |
| Get | GET /api/sessions/{session}?expand=apps | | SessionInfo + `engine` |
| Update | PUT /api/sessions/{session} | `{config, apps?}` | SessionDTO |
| Delete | DELETE /api/sessions/{session} | stop + logout + delete | empty |
| Start / Stop / Restart | POST /api/sessions/{session}/start|stop|restart | none | SessionDTO (idempotent) |
| Logout | POST /api/sessions/{session}/logout | `{apps?:{purge?:bool}}` | SessionDTO; unpairs, restarts the session if it was running |
| Me | GET /api/sessions/{session}/me | | `MeInfo` or `null` when stopped/unauthenticated |
| Timelock / capping | GET /api/sessions/{session}/timelock , /capping | | see session.status data |
| QR | GET /api/{session}/auth/qr | `format=image` (default) or `raw` | see below |
| Pairing code | POST /api/{session}/auth/request-code | `{"phoneNumber":"12132132130","method"?:string}` | `{"code":"ABCD-ABCD"}` |
| Passkey (GOWS only) | GET /api/{session}/auth/passkey/challenge, POST /api/{session}/auth/passkey, GET .../passkey/confirmation, POST .../passkey/confirm | | 422 when nothing pending |
| Screenshot | GET /api/screenshot?session= | WEBJS/WPP only (501/not available on NOWEB/GOWS) | PNG, or with `Accept: application/json` `{"mimetype":"image/png","data":"<b64>"}` |
| Deprecated | POST /api/sessions/start|stop|logout (name in body) | | |

**Status values** (`WAHASessionStatus`): `STOPPED, STARTING, SCAN_QR_CODE, PASSKEY_REQUIRED, PASSKEY_CONFIRMATION_REQUIRED, WORKING, FAILED`. There is no "CONNECTED". Refetch the QR on every `session.status` with SCAN_QR_CODE.

**GET /api/sessions (list) item** (note: `engine` is an object and is only reliably present on the single-get; in the docs list sample it is `{"engine":"NOWEB"}`):
```json
{"name":"default","status":"WORKING","config":{"proxy":null,"webhooks":[{"url":"https://hook","events":["message","session.status"],"hmac":null,"retries":null,"customHeaders":null}],"debug":false},
 "me":{"id":"79111111@c.us","pushName":"WAHA"},"engine":{"engine":"NOWEB"},"presence":"online","timestamps":{"activity":1700000000000},"assignedWorker":null}
```
- `GET /api/sessions/{session}` returns the same plus engine info: `engine: {engine: "GOWS"|"NOWEB"|"WEBJS"|"WPP", ...engine specifics}` (WEBJS adds `WWebVersion`, `state`). The openapi schema for SessionInfo does not declare `engine` but the manager adds it (`fetchEngineInfo`); engine info has a 3 s timeout, so `engine` may be just `{engine: "X"}` or `{}` when the session is not running.
- **MeInfo**: `{id: "<digits>@c.us", lid?: "<digits>@lid", jid?: "<digits>:<device>@s.whatsapp.net", pushName, reachoutTimelock?: {enforcementType, isActive, timeEnforcementEnds}|null, messageCapping?: {cappingStatus: NONE|FIRST_WARNING|SECOND_WARNING|CAPPED, totalQuota, usedQuota, cycleStart, cycleEnd, mvStatus, oteStatus}|null}`. `lid` is set by NOWEB (`jidNormalizedUser(me.lid)`) and GOWS (`data.LID`); **WEBJS has only `id` + `pushName`** (no lid). `jid` is GOWS (UNCONFIRMED for NOWEB).
- Not authenticated / stopped: `me` is `null`/absent.

**QR**
- `GET /api/{session}/auth/qr` -> binary image/png (default).
- same with `Accept: application/json` -> `{"mimetype":"image/png","data":"<base64>"}`.
- `?format=raw` -> `{"value":"<string to render as QR>"}` (use this to render the QR yourself).
- QR TTL: first 60 s, then 20 s each, max 6 QRs, then session -> FAILED (restart it). Only valid while status = SCAN_QR_CODE (else 422).
- Pairing code and custom `client.deviceName` do not mix (code pairing likely fails with a custom device name). Always keep QR as fallback.

**Webhooks per session** (set at create or with PUT; the body is the **full** config, PUT replaces config, it is not a merge):
```json
PUT /api/sessions/default
{"config":{"metadata":{"user.id":"123"},
  "ignore":{"status":false,"groups":false,"channels":false,"broadcast":false},
  "client":{"deviceName":"Floq","browserName":"Chrome"},
  "noweb":{"store":{"enabled":true,"fullSync":false}},
  "gows":{"storage":{"messages":true,"groups":true,"chats":true,"labels":true,"contacts":true,"messageSecrets":true}},
  "webjs":{"tagsEventsOn":false},
  "webhooks":[{"url":"https://host/hook","events":["message","message.any","message.ack","session.status"],
     "hmac":{"key":"secret"},"retries":{"policy":"constant|linear|exponential","delaySeconds":2,"attempts":15},
     "customHeaders":[{"name":"X-My","value":"v"}]}]}}
```
- `webhooks[].url` must be http/https; `events` accepts `"*"` (all except engine.event and state.change).
- **PUT /api/sessions/{s} stops and restarts the session if it was running** (`updateSession`: stop, upsert, start). No re-pair needed, but there is a reconnect gap.
- Webhooks from env (`WHATSAPP_HOOK_URL/EVENTS/HMAC_KEY/RETRIES_*`) are global and do NOT appear in `session.config.webhooks`.
- Headers on each delivery: `X-Webhook-Request-Id`, `X-Webhook-Timestamp` (ms); with hmac: `X-Webhook-Hmac` = hex HMAC-SHA512 of the **raw request body** with the key, `X-Webhook-Hmac-Algorithm: sha512`.
- Retry: constant 2,2,2; linear 2,4,6; exponential with 20% jitter.
- Also a websocket: `ws://host/ws?session=*&events=message&events=session.status&x-api-key=KEY`; `events=*` excludes `engine.event`.
- `config.ignore` filters events (and storage on GOWS/NOWEB) for status/groups/channels/broadcast; sending is not limited.
- NOWEB: `noweb.store.enabled=true` is required for GET chats / contacts / chat messages (see sections 6, 7). Do not change after the QR scan (loses history). GOWS stores by default (`gows.storage.*` can disable).

## 2. Webhook envelope and events

```json
{"id":"evt_01aaaaaaaaaaaaaaaaaaaaaaaa","timestamp":1741249702485,"event":"message","session":"default",
 "metadata":{"user.id":"123"},"me":{"id":"71111111111@c.us","pushName":"~"},
 "payload":{},"engine":"WEBJS","environment":{"tier":"CORE","version":"2026.6.1","engine":"WEBJS","browser":"/usr/bin/google-chrome-stable"}}
```
`id` = lowercase ULID prefixed "evt_"; `metadata` only when set; `me` only when authenticated; `engine` in {WEBJS, WPP, NOWEB, GOWS}; `environment.browser` only on browser engines. The `WAHAEvents` list: session.status, message, message.reaction, message.any, message.ack, message.ack.group, message.waiting, message.revoked, message.edited, state.change (deprecated), group.join/leave (deprecated), group.v2.join, group.v2.leave, group.v2.update, group.v2.participants, group.v2.participants.join-request, group.v2.participants.tag, presence.update, poll.vote, poll.vote.failed, chat.archive, call.received, call.accepted, call.rejected, label.upsert, label.deleted, label.chat.added, label.chat.deleted, event.response, event.response.failed, engine.event.

| Event | WEBJS | WPP | NOWEB | GOWS |
|---|---|---|---|---|
| session.status, engine.event, state.change | y | y | y | y |
| message, message.any, message.reaction, message.ack, message.edited, message.revoked | y | y | y | y |
| message.waiting | y | - | - | - |
| chat.archive | y | - | - | - |
| group.v2.join/leave/update/participants/participants.join-request | y | y | y | y |
| group.v2.participants.tag | y | - | y | y |
| group.join (deprecated) | y | - | y | - |
| group.leave (deprecated) | y | - | - | - |
| presence.update | y | y | y | y |
| poll.vote | y | y | y | y |
| poll.vote.failed | y | - | y | y |
| call.received | y | y | y | y |
| call.accepted | - | - | y | y |
| call.rejected | y (only when rejected via API) | - | y | y |
| label.upsert, label.deleted | - | - | y | y |
| label.chat.added/deleted | - | y | y | y |
| event.response(.failed) | - | - | - | y |

### session.status
```json
{"event":"session.status","session":"default","me":{"id":"7911111@c.us","pushName":"~"},
 "payload":{"name":"default","status":"WORKING","statuses":[{"status":"STOPPED","timestamp":1700000001000},{"status":"STARTING","timestamp":1700000002000},{"status":"WORKING","timestamp":1700000003000}],"data":null},"engine":"WEBJS"}
```
`statuses` = recent 3. `data` is null except: PASSKEY_REQUIRED (WebAuthn options), PASSKEY_CONFIRMATION_REQUIRED (`{code}`), WORKING (`{reachoutTimelock:{enforcementType,isActive,timeEnforcementEnds}}` and/or `{messageCapping:{...}}`; session stays WORKING, do not restart). GOWS FAILED may carry `data.reason` (see GOWS docs; UNCONFIRMED shape).

### message / message.any
Same payload shape (section 3). `message` = incoming only (fromMe=false) plus, on some engines, own messages sent from the phone (docs example shows fromMe:true with source "app"); `message.any` = all, including ones sent via API (`source:"api"`). On GOWS/NOWEB: `message` = from others, `message.any` = merge(from me, from others). **Reactions are NOT sent in message/message.any on NOWEB** (only message.reaction); GOWS also skips reactionMessage and protocolMessage in message events.
```json
{"event":"message","session":"default","engine":"NOWEB","payload":{"id":"false_5511999999999@c.us_3EB0AAAA","timestamp":1667561485,"from":"5511999999999@c.us","fromMe":false,"source":"app","to":null,"participant":null,"body":"Hi","hasMedia":false,"media":null,"ack":1,"ackName":"SERVER","vCards":null,"location":null,"replyTo":null,"_data":{}}}
```

### message.ack
```json
{"event":"message.ack","session":"default","engine":"WEBJS","payload":{"id":"true_11111111111@c.us_4CC5EDD64BC22EBA6D639F2AF571346C","from":"11111111111@c.us","to":"me","participant":null,"fromMe":true,"ack":3,"ackName":"READ"}}
```
`ack`: -1 ERROR, 0 PENDING, 1 SERVER (sent to server), 2 DEVICE (delivered), 3 READ, 4 PLAYED. `ackName` is the string. Unknown -> `"UNKNOWN"`. Min fields on all engines: id, from, participant, fromMe, ack, ackName; `to` and `_data` engine dependent. NOWEB maps Baileys `status-1`; GOWS maps MessageStatus (DeliveryAck->DEVICE); receipts: server receipt -> SERVER, played -> PLAYED, read -> READ. **message.ack.group** (separate event, same shape) fires for per-participant receipts in groups; the id is `true_<group>@g.us_<msgid>_<participantLidOrPn>` and `participant` is the reader. GOWS maps a null/error ack to `ack:null, ackName:"UNKNOWN"`. On WEBJS group acks fire via the receipt node and `fromMe` is inverted ("reverted, it's right" in source).

### message.reaction
```json
{"event":"message.reaction","session":"default","me":{"id":"79222222222@c.us","pushName":"WAHA"},
 "payload":{"id":"false_79111111@c.us_1111111111111111111111111111111","from":"79111111@c.us","fromMe":false,"participant":"79111111@c.us","to":"79111111@c.us","timestamp":1710481111.853,
   "reaction":{"text":"🙏","messageId":"true_79111111@c.us_11111111111111111111111111111111"}},"engine":"WEBJS"}
```
`reaction.text === ""` means reaction removed. `reaction.messageId` is the full WAHA id of the reacted message (GOWS builds it as `<fromMe>_<chat>_<ID>[_<sender>]` using me.id when fromMe). `payload.id` is the id of the reaction carrier message, not the target.

### message.edited
```json
{"event":"message.edited","payload":{"id":"false_1231243123@c.us_BBBBBBBBBBBBBBBBBBBBB[_participant]","timestamp":1700000000,"from":"1231243123@c.us","fromMe":false,"body":"New body","editedMessageId":"AAAAAAAAAAAAAAAA","hasMedia":false,"ack":1,"ackName":"SERVER","_data":{}}}
```
Payload = full WAMessage of the carrier + `editedMessageId` (the **bare** id of the original, without chat/fromMe) + new `body`. NOWEB also handles `secretEncryptedMessage` edits (needs the store to decrypt; body may be ""). Edits are protocolMessage type MESSAGE_EDIT (14) with `protocolMessage.key.id/ID` + `protocolMessage.editedMessage`.

### message.revoked
```json
{"event":"message.revoked","payload":{"after":{"id":"false_1231243123@c.us_BBBBBBBBBB[_participant]","_data":{}},"revokedMessageId":"AAAAAAAAAAAAAAAA","before":null,"_data":{}}}
```
`revokedMessageId` is the bare id of the deleted message (NOWEB: `protocolMessage.key.id`; GOWS: `protocolMessage.key.ID` with `protocolMessage.type===0`). `after.id` is the revoke action's own id (on WEBJS it can be the same as the revoked message). `before` is null in most cases (WEBJS may fill `before` with old body; docs example shows `{id,timestamp,body}`).

### message.waiting (WEBJS only)
Same shape as message; fires on "Waiting for this message. This may take a while."

### presence.update
```json
{"event":"presence.update","payload":{"id":"111111111111111111@g.us","presences":[{"participant":"11111111111@c.us","lastKnownPresence":"typing","lastSeen":null}]},"engine":"NOWEB"}
```
`lastKnownPresence`: online|offline|typing|recording|paused. Only arrives for chats you subscribed to (or the chat is open); see section 9.

### poll.vote / poll.vote.failed
```json
{"event":"poll.vote","payload":{"vote":{"id":"false_1111111111@c.us_83ACBE602A05C79B234B54415E95EE8A","to":"me","from":"1111111@c.us","fromMe":false,"selectedOptions":["Awesome!"],"timestamp":1692861427},
  "poll":{"id":"true_1111111111@c.us_BAE5F2EF5C69001E","to":"1111111111@c.us","from":"me","fromMe":true}},"engine":"NOWEB"}
```
You receive **all** votes (also for polls you did not create): check `poll.fromMe`. `selectedOptions` is the full current selection each time; empty array = vote removed (or undecryptable in `poll.vote.failed`, which has `selectedOptions:[]`). Votes can arrive out of order: compare `vote.timestamp`. `to:"me"` / `from:"me"` literal strings are used. In groups ids carry the participant suffix. GOWS adds `_data` and requires `gows.storage.messageSecrets`; NOWEB needs the poll creation message in its store/cache to decrypt.

### chat.archive (WEBJS only)
`{"event":"chat.archive","payload":{"id":"123123123@c.us","timestamp":1667561485,"archived":true}}`

### call.received / call.accepted / call.rejected
```json
{"event":"call.received","payload":{"id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","from":"22222222222@c.us","timestamp":1721374000,"isVideo":false,"isGroup":false,"_data":{}}}
```
`from` may be @lid on NOWEB/GOWS. GOWS: for the real caller use `_data.CallCreator` (the Chatwoot app does so); for group calls `from`=group jid. Reject with POST /api/{session}/calls/reject `{from, id}`.

### labels
- `label.upsert` / `label.deleted`: `{"id":"10","name":"Label Name","color":14,"colorHex":"#00a0f2"}` (deleted has `name:""`).
- `label.chat.added` / `label.chat.deleted`: `{"labelId":"6","chatId":"11111111111@c.us","label":null}` (`label` can be null right after QR scan).

### groups (v2)
- `group.v2.join`: `{"group":{"id":"1231231232@g.us","subject":"Work Group","description":"","invite":"https://chat.whatsapp.com/code","membersCanAddNewMember":true,"membersCanSendMessages":true,"newMembersApprovalRequired":true,"participants":[{"id":"99999@c.us","role":"participant"}]},"timestamp":789456123,"_data":{}}`
- `group.v2.leave`: `{"group":{"id":"..@g.us"},"timestamp":..,"_data":{}}`
- `group.v2.update`: `{"group":{"id":"..@g.us","subject":"New name"},"timestamp":..,"_data":{}}` (only changed fields on most engines).
- `group.v2.participants`: `{"type":"join|leave|promote|demote","timestamp":..,"group":{"id":".."},"participants":[{"id":"123@c.us","role":"participant|admin|superadmin|left"}],"_data":{}}` (can duplicate join/leave for your own id).
- `group.v2.participants.join-request`: `{"group":{"id":".."},"action":"created|rejected|revoked","requesterId":"123@lid","requesterPn":"123@c.us|null","requestMethod":"invite_link|linked_group_join|non_admin_add|null","timestamp":..}`. WEBJS/WPP emit only `created`.
- `group.v2.participants.tag`: `{"group":{"id":".."},"participant":{"id":"123@lid","pn":"123@c.us|null"},"tag":"Manager|null","timestamp":..}`.

### engine.event
`{"event":"engine.event","engine":"NOWEB","payload":{"event":"messages.upsert","data":{}}}` - raw low-level stream; not in `*`, must be requested explicitly; not filtered by `ignore`.

### event.response (GOWS): event-message RSVP
`payload` = WAMessage fields + `eventCreationKey:{id,to,from,fromMe}` + `eventResponse:{response:"GOING|NOT_GOING|MAYBE",timestampMs,extraGuestCount}` (null in `.failed`).

## 3. Message payload (WAMessage) per engine

Common WAMessage (`message`, `message.any`, GET messages, forward response, message.edited/revoked sub-objects):
| Field | Meaning |
|---|---|
| `id` | **string** `<fromMe>_<chatId>_<msgId>[_<participant>]`, e.g. `false_5511999999999@c.us_3EB0A0B1`; groups append the sender: `true_120363@g.us_3EB0A0B1_5511999999999@c.us` (participant can be `@lid`). Same format on all three engines (NOWEB: `buildMessageId(key)`, GOWS: `buildMessageId(Info)`, WEBJS: wwebjs `_serialized`). `fromMe` is the literal `true`/`false`. GOWS and NOWEB also accept the bare id (`3EB0...`) in path/`reply_to`; WEBJS needs the full id. |
| `timestamp` | unix seconds |
| `from` | **chat id** for DM (even when fromMe=true, on NOWEB/GOWS `from`=remoteJid/Info.Chat). For groups `from`= the group id; real sender is `participant`. WEBJS: wwebjs `message.from` (sender for incoming DM, own id for fromMe). |
| `to` | NOWEB: set only for groups (=group jid); **omitted/undefined for DM** (source: `getFromToParticipant`; UNCONFIRMED at runtime). GOWS: `null` for DM, `Info.Sender` for groups (!). WEBJS: wwebjs `message.to`. Webhook docs examples show `to` filled for DM; do not depend on it, derive the chat from `from` (NOWEB/GOWS) or `_data.id.remote` (WEBJS, used by WAHA's own Chatwoot app: `ChatID = _data.id.remote \|\| from`). |
| `participant` | group sender (`@lid` or `@c.us`); null/undefined in DM |
| `fromMe` | bool |
| `source` | `"api"` (sent through WAHA API) \| `"app"` (sent from the phone/other device or received) |
| `body` | text, or caption for media, new text for edits, list/button selected text; null if none |
| `hasMedia` | true if the message has a media part (even when not downloaded) |
| `media` | `{url, mimetype, filename, error}` or null. `url` null when not downloaded (config) but `mimetype`/`filename` stay. `error` = object when download failed. May also have `s3` when S3 storage is on. |
| `mediaUrl` | legacy, usually undefined |
| `ack`/`ackName` | see message.ack; WEBJS `ack` straight from wwebjs |
| `replyTo` | `{id?, participant?, body, hasMedia, media, _data}` or null/undefined. `id` is the **bare** quoted id (stanzaId) on NOWEB/GOWS/WEBJS, not the full serialized id; `participant` is cus/lid formatted. `media` downloaded for quoted media too. |
| `vCards` | `string[]` of raw vCard text (contactMessage / contactsArrayMessage; WEBJS `message.vCards`) else null/[] |
| `location` | `{latitude:"38.8937255",longitude:"-77.0969763",live:false,name,address,url,description,thumbnail(b64)}` (lat/long are **strings**); live location: `live:true`, `description`=caption, no name/address. WEBJS: `thumbnail`=message.body (the b64 thumb), `description` from `rawData.comment`. |
| `_data` | raw engine object (below) |

### Where is the message type?
| Engine | Raw object | Type location | Media sub-objects |
|---|---|---|---|
| WEBJS | whatsapp-web.js raw (`rawData`): `{id:{fromMe,remote,id,_serialized,participant?},body,type,t,notifyName,from:{server,user,_serialized}|string,to,author,ack,isNewMsg,star,broadcast,mentionedJidList,groupMentions,isForwarded,quotedStanzaID,quotedParticipant,quotedMsg,links,mimetype,filename,size,caption,mediaKey,directPath,deprecatedMms3Url,width,height,duration,waveform,lat,lng,loc,isLive,comment,...}` | `_data.type`: `chat`, `image`, `video`, `ptt` (voice), `audio`, `document`, `sticker`, `location`, `vcard`, `multi_vcard`, `poll_creation`, `revoked`, `reaction`, `gif`... (wwebjs types; UNCONFIRMED against WAHA output, but WAHA code reads `rawData.isLive/comment/quotedMsg/quotedStanzaID/directPath/viewCount`) | flat on `_data` |
| NOWEB | Baileys `proto.IWebMessageInfo` (Long -> number): `{key:{remoteJid,fromMe,id,participant?,remoteJidAlt?,participantAlt?,addressingMode?,server_id?},message:{...},messageTimestamp,pushName,status,broadcast,messageContextInfo...}` | `Object.keys(_data.message)[0]` = proto field, i.e. `conversation`, `extendedTextMessage`, `imageMessage`, `videoMessage`, `audioMessage` (`ptt:true` = voice note), `documentMessage`, `stickerMessage`, `locationMessage`, `liveLocationMessage`, `contactMessage`, `contactsArrayMessage`, `pollCreationMessage(V2/V3)`, `reactionMessage`, `protocolMessage` (revoke type 0, edit type 14), `ptvMessage` (video note), wrappers `ephemeralMessage`/`viewOnceMessage(V2)`/`documentWithCaptionMessage`/`editedMessage` (WAHA unwraps via `extractMessageContent`). Helper: baileys `getContentType(message)`. | `_data.message.<x>Message` |
| GOWS | whatsmeow `events.Message` JSON: `{Info:{Chat,Sender,SenderAlt,RecipientAlt,IsFromMe,IsGroup,AddressingMode,ID,ServerID,Type,PushName,Timestamp(ISO),Category,Multicast,MediaType,Edit,Status},Message:{...},IsEphemeral,IsViewOnce,...}` | `_data.Info.Type` (`text`, `media`, `reaction`, `poll`, `event`, ...) and `_data.Info.MediaType` (`image`, `video`, `audio`, `ptt`, `document`, `sticker`, `gif`, `url`, `location`, `livelocation`, `vcard`, `contacts_array`...) per whatsmeow (UNCONFIRMED against WAHA output); the proto field names under `_data.Message` are camelCase (`imageMessage`, `protocolMessage`, `reactionMessage`; WAHA's `GoToJSWAProto` just camelCases keys, e.g. `URL`->`url`) | `_data.Message.<x>Message` |

`Info.Timestamp` is an ISO string (WAHA converts to seconds; "0001-..." -> null). `Info.Status` -> ack (GOWS MessageStatus enum).

### Per message kind (what to read)
| Kind | WEBJS | NOWEB | GOWS |
|---|---|---|---|
| text | `type:"chat"`, body | `message.conversation` or `message.extendedTextMessage.text` | same under `Message.` |
| link preview | `_data.links[]`, `_data.thumbnail`, `title/description` (UNCONFIRMED) | `extendedTextMessage:{text,matchedText,canonicalUrl,title,description,jpegThumbnail,previewType}` | same camelCase |
| mentions | `_data.mentionedJidList[]`, `groupMentions` | `extendedTextMessage.contextInfo.mentionedJid[]` | `...contextInfo.mentionedJID[]` (casing UNCONFIRMED) |
| image | `type:"image"`, body=base64 thumbnail, `caption`, `mimetype` | `imageMessage:{mimetype,caption,url,directPath,mediaKey,fileLength,height,width,jpegThumbnail}` | same; `Info.MediaType:"image"` |
| video / gif | `type:"video"` (+`isGif`) | `videoMessage{seconds,gifPlayback}` | same |
| voice note | `type:"ptt"`, `duration` | `audioMessage:{ptt:true,seconds,mimetype:"audio/ogg; codecs=opus",waveform}` | same; `MediaType:"ptt"` |
| audio file | `type:"audio"` | `audioMessage` with `ptt:false` | same |
| document | `type:"document"`, `filename` | `documentMessage:{fileName,mimetype,title,pageCount}` (`documentWithCaptionMessage.message.documentMessage` when captioned) | same |
| sticker | `type:"sticker"` | `stickerMessage{isAnimated}` | same (WAHA has a Lottie wrapper for animated stickers) |
| location | `type:"location"`, `lat`,`lng`,`loc`(name) | `locationMessage:{degreesLatitude,degreesLongitude,name,address,url,comment,jpegThumbnail}` | same |
| live location | `isLive:true` | `liveLocationMessage{degreesLatitude,degreesLongitude,caption,sequenceNumber}` | same |
| contact card | `type:"vcard"` / `"multi_vcard"`, `vCards[]` | `contactMessage{displayName,vcard}` / `contactsArrayMessage{contacts[]}` | same |
| poll creation | `type:"poll_creation"`, `pollName`, `pollOptions`, `allowMultipleAnswers` | `pollCreationMessage(V3){name,options:[{optionName}],selectableOptionsCount}` | same |
| reaction | rawData.type "reaction" (WAHA emits message.reaction) | `reactionMessage:{key:{remoteJid,fromMe,id},text,senderTimestampMs}` | `reactionMessage:{key:{remoteJID,fromMe,ID,participant},text}` |
| edited | `message.edited`; `_data.latestEditMsgKey` | `protocolMessage{type:14,key,editedMessage}` | `protocolMessage{type:14,key{ID},editedMessage}` |
| revoked | `type:"revoked"` | `protocolMessage{type:0,key}` | `protocolMessage{type:0,key{ID}}` |

For all three, quoted content is `<x>Message.contextInfo.quotedMessage` with `stanzaId`/`stanzaID`, `participant`, `remoteJid` (=`status@broadcast` when replying to a status); WEBJS uses `quotedMsg`, `quotedStanzaID`, `quotedParticipant`, `quotedRemoteJid`.

### Where lid / phone alternates live (identity linking)
| Engine | Fields |
|---|---|
| NOWEB | `_data.key.remoteJid` (+`remoteJidAlt`) for DMs; `_data.key.participant` (+`participantAlt`) for groups. If `remoteJid` is `@lid`, `remoteJidAlt` is the `@s.whatsapp.net` PN, and vice versa. `addressingMode` ("lid"/"pn"). Helper in WAHA: `jidsFromKey(key)` -> `{lid, pn}`. Convert `@s.whatsapp.net` -> `@c.us`. Alt fields can be absent. |
| GOWS | `_data.Info.Sender`, `_data.Info.Chat`, `_data.Info.SenderAlt`, `_data.Info.RecipientAlt`, `Info.AddressingMode`. WAHA's own rule for the DM peer phone: `IsFromMe ? RecipientAlt : SenderAlt` (only valid when the chat is `@lid`). |
| WEBJS | none in payload. `_data.from`/`to` may be `@lid`; use GET /api/{session}/lids/{lid} (or contacts) to map. WAHA's Chatwoot app returns null PN for WEBJS. |
| All | `GET /api/{session}/lids`, `/lids/{lid}`, `/lids/pn/{phone}`, `GET /api/contacts/check-exists` (now also returns `pn`), `merge=true` on chats/messages, group participants v2 (`id`=lid in most groups, `pn` when known), `group.v2.participants.tag`/`join-request` events (`participant.pn`, `requesterPn`). Mapping may be missing: you need the contact in your address book, or be group admin (try POST /groups/refresh); the endpoint then returns `pn:null`. |

## 4. Media download

- `media.url` = `{WAHA_BASE_URL}/api/files/<fileName>`. `WAHA_BASE_URL` (only affects media.url) else `{WHATSAPP_API_SCHEMA}://{WHATSAPP_API_HOSTNAME}:{PORT}`, **default `http://localhost:3000`**. Behind Docker/another host that URL is usually unreachable: rewrite it by keeping only the path (`/api/files/...`) and prefixing the plugin's configured WAHA base URL.
- File name = `<messageId>.<ext>` (e.g. `true_11111111111@c.us_AAAA.jpg`; for status: `false_status@broadcast_<ID>_<participant>@c.us.jpg`). GOWS/NOWEB may use the bare id (UNCONFIRMED); do not parse it, store the URL.
- Auth: **needs `X-Api-Key`** (or `?x-api-key=`) unless `WHATSAPP_API_KEY_EXCLUDE_PATH=api/files/(.*)`. Prefer a media-only key (`POST /api/keys/media {session}`).
- **Lifetime**: local storage default `WHATSAPP_FILES_LIFETIME=180` **seconds** (code default; 0 = keep forever; folder `WHATSAPP_FILES_FOLDER`, default `/tmp/whatsapp-files`). Download immediately on webhook receipt. Other storages: `WAHA_MEDIA_STORAGE=LOCAL|S3|POSTGRESQL` (`media.s3` populated for S3).
- Download policy: `WAHA_EVENTS_DOWNLOAD_MEDIA` (webhooks, default true) and `WAHA_API_DOWNLOAD_MEDIA` (API) plus `..._MIMETYPES` (prefix match, comma list). API calls accept `downloadMedia=true|false` and `downloadMediaMimetypes=image/jpeg,image/png`. With download off: `hasMedia:true, media:{url:null, mimetype, filename}`.
- WEBJS needs the `:chrome` image to receive/send video; GOWS/NOWEB need no browser.
- To re-fetch media later: GET /api/{session}/chats/{chatId}/messages/{messageId}?downloadMedia=true (the file is re-downloaded and a fresh url is returned). Only works while WhatsApp still serves the media (NOWEB needs the store).
- Core vs Plus: no difference since 2026.6.1.

## 5. Sending

All sends: session in body (default "default"), `chatId` required. `reply_to` = full message id (GOWS/NOWEB accept bare id). `mentions` = array of `<digits>@c.us` (text must also contain `@<digits>`); `["all"]` mentions everyone in a group. Optional client-chosen `id` on text/location/vcard/poll/forward (message id, `GET /api/{session}/new-message-id`).
- Check the destination first for new numbers (section 7). `chatId` may be a `@lid`.
- The session must be WORKING (waits up to ~5 s for running) else 422.

| Op | Method + path | Body | Engines |
|---|---|---|---|
| text | POST /api/sendText | `{chatId,text,reply_to?,mentions?,linkPreview?=true,linkPreviewHighQuality?=false,session}` (deprecated GET /api/sendText?phone=&text=) | all |
| custom link preview | POST /api/send/link-custom-preview | `{chatId,text,preview:{url,title,description,image?:{url}\|{data,mimetype}},linkPreviewHighQuality?,reply_to?}`; `text` must contain `preview.url` | GOWS, NOWEB |
| image | POST /api/sendImage | `{chatId,file,caption?,mentions?,reply_to?}` | all |
| file (document) | POST /api/sendFile | same | all |
| voice | POST /api/sendVoice | `{chatId,file:{mimetype:"audio/ogg; codecs=opus",url\|data},convert:false,reply_to?}` | all |
| video | POST /api/sendVideo | `{chatId,file:{mimetype,filename,url\|data},caption?,asNote?=false,convert:false,mentions?,reply_to?}` | all |
| sticker | POST /api/sendSticker | `{chatId,file:{mimetype:"image/webp",url\|data},reply_to?}` (must already be WebP) | all |
| location | POST /api/sendLocation | `{chatId,latitude:number,longitude:number,title,reply_to?}` | all |
| contact vcard | POST /api/sendContactVcard | `{chatId,contacts:[{vcard}\|{fullName,organization?,phoneNumber,whatsappId?}],reply_to?}` | all |
| poll | POST /api/sendPoll | `{chatId,poll:{name,options:[..],multipleAnswers:false},reply_to?}` | all |
| poll vote | POST /api/sendPollVote | `{chatId,pollMessageId,pollServerId?(channels only),votes:["Awesome!"]}` | WEBJS, GOWS only (NOWEB, WPP: 501) |
| seen | POST /api/sendSeen | `{chatId,messageId?|messageIds?:[],participant?}`; without ids = read all unread (<=7 days; max 30 DM / 100 group) | all; id control on NOWEB/GOWS only |
| typing | POST /api/startTyping, /api/stopTyping | `{chatId,session}` (same as POST /api/{session}/presence typing/paused) | all |
| reaction | **PUT** /api/reaction | `{messageId (full id),reaction:"👍",session}`; `""` removes | all |
| star | **PUT** /api/star | `{messageId,chatId,star:true,session}` | WEBJS, WPP, NOWEB (GOWS: 501) |
| forward | POST /api/forwardMessage | `{chatId,messageId,id?,session}` (target must be an existing chat or it may fail) | WEBJS, WPP, NOWEB (GOWS: 501) |
| edit | PUT /api/{session}/chats/{chatId}/messages/{messageId} | `{text,mentions?,linkPreview?=true,linkPreviewHighQuality?=false}`; text or media caption; WhatsApp limits edits to ~15 min | all |
| delete (revoke for everyone) | DELETE /api/{session}/chats/{chatId}/messages/{messageId} | none | all |
| pin / unpin | POST .../messages/{messageId}/pin `{"duration":86400\|604800\|2592000}` , /unpin | resp `{"success":true}` | WEBJS, NOWEB (GOWS, WPP: 501) |
| buttons / list | POST /api/sendButtons, /api/sendList, /api/send/buttons/reply | | sendList: GOWS, NOWEB; sendButtons (reply/url/call/copy): UNCONFIRMED engines (inherited-501 on WEBJS, GOWS, WPP; NOWEB has `noweb.buttons.ts`); buttons/reply: WEBJS only. Treat interactive messages as not portable. |
| event message | POST /api/{session}/events | | GOWS only |
| convert | POST /api/{session}/media/convert/voice\|video | `{url}` or `{data}`; `Accept: application/json` -> `{mimetype,data}`, or the binary mime | all |

**file object**: `{"mimetype":"image/jpeg","filename":"a.jpg","url":"https://..."}` or `{"mimetype":"...","filename":"...","data":"<base64 without data: prefix>"}`. Image: no convert flag; send JPEG. Voice must be OGG/Opus (`convert:true` converts with ffmpeg). Video must be mp4/libx264 (`convert:true`); `asNote:true` sends a round video note (ptv).

**Send response (where is the new message id?)**: the declared type is WAMessage, but the actual shape is engine dependent:
| Engine | Shape | Message id |
|---|---|---|
| GOWS | `{"id":"true_5511999999999@c.us_3EB0AAAA","_data":{...message json...}}` (only id + _data; no from/to/ack/timestamp) | `id` (full WAHA id; groups: `true_<g>@g.us_<ID>_<me.id>`) |
| NOWEB | sendText/sendImage/sendFile/sendVoice/sendVideo/sendLocation/sendContactVcard/edit/reaction return the **raw Baileys object** `{key:{remoteJid,fromMe:true,id:"3EB0..."},message:{...},messageTimestamp,status}` (`this.sock.sendMessage` result; the docs' status-delete sample confirms "save key.id"); sendPoll (and others that call `toWAMessage`) return a full WAMessage `{id:"true_..",timestamp,from,fromMe,...,_data}` | raw: `key.id` (bare) - build `true_<chatId>_<key.id>`; WAMessage: `id` |
| WEBJS | the wwebjs Message returned by `client.sendMessage` serialized to JSON (WAHA fork exposes `rawData`); `id` is probably the wwebjs object `{fromMe,remote,id,_serialized}` and `_data.id` the same (UNCONFIRMED: forwardMessage is typed WAMessage so `id` is a string there) | `id._serialized` or `id` |
Normalizer for robust clients (then dedupe against `message.any` with `source:"api"` and `message.ack` for the same id):
```js
const id = typeof r.id === 'string' ? r.id
  : r.id?._serialized
  ?? (r.key?.id ? 'true_' + chatId + '_' + r.key.id : (r._data?.id?._serialized ?? r._data?.key?.id));
```

```json
POST /api/sendText  {"session":"default","chatId":"5511999999999@c.us","text":"Hi @5511888888888","mentions":["5511888888888@c.us"],"reply_to":"false_5511999999999@c.us_3EB0AAAA","linkPreview":true}
```

## 6. Chats

| Op | Method + path | Notes |
|---|---|---|
| list | GET /api/{session}/chats?limit=20&offset=0&sortBy=conversationTimestamp\|id\|name&sortOrder=desc&merge=true | engine raw chat objects. NOWEB needs store. |
| overview | GET /api/{session}/chats/overview?limit=20&offset=0&ids=..&ids=..&merge=true ; POST same path with `{"pagination":{"limit":20,"offset":0},"filter":{"ids":["111@c.us"]}}` (use POST for >~400 ids) | UI-ready, sorted by last message ts |
| messages | GET /api/{session}/chats/{chatId}/messages | `limit=10` default, `offset`, `sortBy=timestamp\|messageTimestamp`, `downloadMedia`, `downloadMediaMimetypes`, `merge`, `filter.timestamp.gte\|lte` (unix s), `filter.fromMe=true\|false`, `filter.ack=DEVICE`; `chatId=all` on NOWEB/GOWS = all chats. Increase `offset` by `limit` even if fewer returned. Deprecated: GET /api/messages?chatId= . WEBJS: no engine-side filtering helpers (inherits generic, UNCONFIRMED); NOWEB: store required (+ `_data.reactions`, `pollUpdates`, `userReceipt`); GOWS: from its db. |
| message by id | GET /api/{session}/chats/{chatId}/messages/{messageId}?downloadMedia=true | gets latest ack; `chats/all/messages/<bareId>` on NOWEB/GOWS |
| mark read | POST /api/{session}/chats/{chatId}/messages/read | body `{messages?:30,days?:7}` -> `{"ids":["false_...","..."]}` |
| archive / unarchive | POST /api/{session}/chats/{chatId}/archive\|unarchive | WEBJS, WPP, NOWEB (GOWS: 501) |
| unread | POST /api/{session}/chats/{chatId}/unread | all |
| delete chat | DELETE /api/{session}/chats/{chatId} | WEBJS, WPP only |
| clear messages | DELETE /api/{session}/chats/{chatId}/messages | WEBJS only |
| picture | GET /api/{session}/chats/{chatId}/picture?refresh=false -> `{"url":"https://pps.whatsapp.net/..."|null}` | cached 24 h; do not refresh often (rate limits) |
| pin chat / mute chat | **do not exist** as endpoints (only message pin, channel mute) | |

Overview item:
```json
{"id":"12312l123@c.us","name":"John Doe","picture":"https://example.com/picture.jpg|null","lastMessage":{"id":"true_11111111111@c.us_AAAA","timestamp":1667561485,"from":"11111111111@c.us","fromMe":true,"to":"11111111111@c.us","body":"Hi there!"},"_chat":{}}
```
`lastMessage` has no media attachment; fetch by id for media. `name` may be null.

## 7. Contacts and LIDs

| Op | Method + path | Response |
|---|---|---|
| all | GET /api/contacts/all?session=&limit&offset&sortBy=id\|name&sortOrder | `[{id,number,name,pushname,shortName,isMe,isGroup,isWAContact,isMyContact,isBlocked}]` (engine variations; NOWEB needs store; GOWS needs `storage.contacts`) |
| one | GET /api/contacts?contactId=<phone\|id@c.us\|id@lid>&session= (also GET /api/{session}/contacts/{id}) | same object |
| upsert (address book) | PUT /api/{session}/contacts/{chatId} body `{firstName,lastName}` | WEBJS, NOWEB, GOWS (WPP no) |
| check exists | GET /api/contacts/check-exists?phone=<digits>&session= | `{"numberExists":true,"chatId":"23423462304912@lid","pn":"123123123@c.us"}`; not found: `{"numberExists":false}` |
| about | GET /api/contacts/about?contactId=&session= | `{"about":"Hi, I use WhatsApp!"}`; WEBJS, WPP only |
| profile picture | GET /api/contacts/profile-picture?contactId=&session=&refresh=true | `{"profilePictureURL":"https://..."|null}` (cache 24 h) |
| block / unblock | POST /api/contacts/block\|unblock `{contactId,session}` | WEBJS, WPP only |
| lids | GET /api/{session}/lids?limit=100&offset=0 | `[{"lid":"123123123@lid","pn":"123456789@c.us"}]` |
| lid count | GET /api/{session}/lids/count | `{"count":123}` |
| pn by lid | GET /api/{session}/lids/{lid} (digits or `123%40lid`) | `{"lid":"..@lid","pn":"..@c.us"}` or `{"lid":"..@lid","pn":null}` |
| lid by pn | GET /api/{session}/lids/pn/{phone} (digits or `%40c.us`) | `{"lid":"..@lid","pn":"..@c.us"}` or `{"lid":null,"pn":"..@c.us"}` |
| legacy | GET /api/checkNumberStatus?phone=&session= | deprecated alias of check-exists |

**check-exists per engine**: GOWS returns `{numberExists, chatId: toCus(info.jid), pn: toCus(info.pn)}` (chatId can be the @lid, pn the phone); NOWEB (`sock.onWhatsApp`) and WEBJS (`getNumberId`) return `{numberExists, chatId: <jid as @c.us>}` without `pn`. Treat `chatId` as opaque: it can be `@c.us` or `@lid`; use it as the send target.

**Brazil ninth digit**: numbers registered before ~2012 (DDD >= 31) exist on WhatsApp **without** the extra 9 (`55 DD 8dddddddd`, 12 digits); newer ones and DDD < 31 have it (13 digits). Sending to the wrong form fails or creates a ghost chat. check-exists returns the real registered `chatId` (e.g. input `5531988887777` -> `553188887777@c.us`). Always call check-exists before the first send to a typed Brazilian number, or enable the `brazilian-phone-numbers` app (`POST /api/apps {app,session,id,config:{strict:false,lookup:true,cache:{...}}}`; needs `WAHA_APPS_ENABLED=True`) which resolves automatically. Incoming payloads already carry the right chatId; reply to that. 0800 numbers are stored as `558000464636`.

Lids FAQ: no phone found => you do not have the contact or are not group admin; try POST /api/{session}/groups/refresh (rate-limited) before giving up. NOWEB LID store: needs `noweb.store.enabled` (UNCONFIRMED but docs mark NOWEB lids as "*1 needs store").

## 8. Groups

All under /api/{session}/groups; `{id}` = `<id>@g.us` (encode @). All engines support everything below except as noted (DELETE /groups/{id} only WEBJS/WPP; WPP lacks member-share-history and member tags).
| Op | Method + path | Body / response |
|---|---|---|
| create | POST /groups | `{"name":"Group","participants":[{"id":"123@c.us"}]}` -> engine group object |
| list | GET /groups?limit&offset&sortBy=id\|subject&sortOrder&exclude=participants | engine raw (GOWS: whatsmeow GroupInfo `{JID,Name,Topic,OwnerJID,IsLocked,IsAnnounce,Participants:[{JID,PhoneNumber,IsAdmin,IsSuperAdmin}],MemberAddMode,IsJoinApprovalRequired,...}`; NOWEB: Baileys GroupMetadata `{id,subject,desc,owner,participants:[{id,lid?,admin}],...}`; WEBJS: wwebjs group metadata) - **shape differs per engine**, use /participants/v2 for portable data; NOWEB needs store else rate-overlimit |
| count | GET /groups/count | `{"count":10}` |
| get | GET /groups/{id} | engine raw |
| join info / join | GET /groups/join-info?code=<code\|url> ; POST /groups/join `{"code":"https://chat.whatsapp.com/xxx"}` -> `{"id":"123@g.us"}` | |
| refresh | POST /groups/refresh | repopulates lid->pn; do not spam |
| leave / delete | POST /groups/{id}/leave ; DELETE /groups/{id} | |
| participants v2 | GET /groups/{id}/participants/v2 | `[{"id":"1@lid|c.us","pn"?:"1@c.us","role":"participant|admin|superadmin|left"}]` (portable) |
| participants (raw) | GET /groups/{id}/participants | engine raw |
| add / remove | POST /groups/{id}/participants/add\|remove | `{"participants":[{"id":"123@c.us"}]}` |
| promote / demote | POST /groups/{id}/admin/promote\|demote | same body |
| subject | PUT /groups/{id}/subject | `{"subject":".."}` -> true/false |
| description | PUT /groups/{id}/description | `{"description":".."}` |
| picture | GET /groups/{id}/picture?refresh=false -> `{"url":..|null}`; PUT (`{"file":{"url"\|"data"}}` -> `{"success":true}`); DELETE | |
| invite code | GET /groups/{id}/invite-code ; POST /groups/{id}/invite-code/revoke | code to put after https://chat.whatsapp.com/ |
| settings (GET+PUT) | /groups/{id}/settings/security/info-admin-only `{adminsOnly}`, messages-admin-only `{adminsOnly}`, member-add-mode `{membersCanAddNewMember}`, membership-approval `{newMembersApprovalRequired}`, member-share-history-mode `{membersCanShareHistory}` | |
| join requests | GET /groups/{id}/participants/join-requests -> `[{requesterId,requesterPn,addedById,parentGroupId,requestMethod,timestamp}]`; POST .../approve\|reject `{participants:[{id}]}` -> `[{requesterId,success,error?}]` | |
| member tags | GET /groups/{id}/participants/v2/tags , .../tags/{participantId}, .../tags/my ; PUT .../tags/my `{"tag":"Manager"}` (2-30 chars) | WEBJS, NOWEB, GOWS |

## 9. Labels, Status, Channels, Presence, Calls, Profile

**Labels** (/api/{session}/labels): GET list `[{"id":"1","name":"New Client","color":1,"colorHex":"#64c4ff","type":5,"isActive":true}]` (type 5 CUSTOM, 4 PREDEFINED, 16 LEAD, 1 UNREAD, 2 GROUPS, 3 FAVORITES; WPP lacks type/isActive; WEBJS does not emit label.upsert/deleted events); POST `{name,color:0..19}` or `{name,colorHex}`; PUT /labels/{labelId}; DELETE /labels/{labelId}; GET /labels/{labelId}/chats (engine raw); GET /labels/chats/{chatId} (list as above); PUT /labels/chats/{chatId} `{"labels":[{"id":"1"}]}` (**full replacement**, `[]` clears). Built-in lists cannot be assigned via API. Prefer `color` over `colorHex`.

**Status / stories** (all engines send; delete + new-message-id GOWS/NOWEB only): POST /api/{session}/status/text `{text,backgroundColor:"#38b42f",font:1,contacts?:["55..@c.us"],id?,linkPreview?}`; /status/image `{file:{mimetype,url|data},caption?,contacts?}`; /status/voice `{file,convert,backgroundColor?,contacts?}`; /status/video `{file,convert,caption?,contacts?}`; POST /status/delete `{id,contacts?}`; GET /status/new-message-id -> `{"id":"AAAA"}`. Omitting `contacts` sends to all contacts (GOWS requires `storage.contacts`). Send response (NOWEB) = raw Baileys `{key:{remoteJid:"status@broadcast",fromMe:true,id},message}`, keep `key.id`. **Incoming statuses** arrive as normal `message` events with `from`/chat `status@broadcast`, `participant` = poster, id `false_status@broadcast_<ID>_<posterJid>` and media url `/api/files/false_status@broadcast_<ID>_<poster>.jpg`. Read old ones: GET /api/{session}/chats/status%40broadcast/messages. Drop them with `config.ignore.status=true` if you do not want story noise. Replying to a status has `contextInfo.remoteJid = "status@broadcast"`.

**Channels** (/api/{session}/channels): list GET ?role=OWNER|ADMIN|SUBSCRIBER -> `[{"id":"111@newsletter","name","description","invite":"https://whatsapp.com/channel/<code>","preview","picture","verified":false,"role":"OWNER"}]`; GET /channels/{id|inviteCode} (+`subscribersCount` for id); POST create `{name,description,picture:{url|data,mimetype}}` (not WEBJS); DELETE (WPP, NOWEB); POST /{id}/follow|unfollow|mute|unmute (WPP, GOWS only); GET /channels/{invite}/messages/preview?downloadMedia=false&limit=100 -> `[{"reactions":{"👍":10},"viewCount":0,"message":{WAMessage}}]`; search: POST /channels/search/by-text|by-view, GET /channels/search/views|countries|categories. Send text/image/video to `<id>@newsletter` with the normal send endpoints. Read channel messages via chats/{id}/messages (WEBJS, WPP, NOWEB; NOWEB #433). Votes on channel polls need `pollServerId` (`_data.Info.ServerID` GOWS, `_data.key.server_id` NOWEB).

**Presence**: POST /api/{session}/presence `{"chatId"?:"..","presence":"online|offline|typing|recording|paused"}` (online/offline: no chatId; typing/recording/paused need chatId; NOWEB `setPresence` throws 501 per source scan, but docs list it as supported: UNCONFIRMED); POST /presence/{chatId}/subscribe (no body); GET /presence/{chatId} (subscribes if needed) -> `{"id":"2132132130@c.us","presences":[{"participant":"2132132130@c.us","lastKnownPresence":"online","lastSeen":null}]}` (lastSeen unix s or null; for groups one entry per participant); GET /presence -> array of the above for all subscribed chats (not WEBJS). Set session `offline` if you want phone push notifications while a desktop client is "active". Config `WAHA_...` markOnline: NOWEB `noweb.markOnline` (default true).

**Calls**: POST /api/{session}/calls/reject `{"from":"2222@c.us","id":"<callId>"}` (all engines; emits call.rejected). WAHA has an app `calls` / "Reject Calls" that auto-rejects with a message.

**Profile**: GET /api/{session}/profile -> `{"id":"1111@c.us","name":"My Name","picture":"https://pps.whatsapp.net/..."}`; PUT /profile/name `{"name"}`, PUT /profile/status `{"status"}` -> `{"success":true}`; PUT /profile/picture `{"file":{"url"|"data","mimetype"}}`, DELETE /profile/picture (support per engine UNCONFIRMED; `refreshMyProfilePicture` not implemented anywhere).

## 10. Errors

| Code | When | Body |
|---|---|---|
| 400 | validation (class-validator) | `{"statusCode":400,"message":["chatId must be a string"],"error":"Bad Request"}` (unknown properties are stripped unless `WAHA_HTTP_STRICT_MODE`) |
| 401 | missing / wrong key | `{"statusCode":401,"message":"Unauthorized"}` |
| 403 | key lacks the action (read/send/control/setting/app/delete) | CASL policy |
| 404 | `GET/PUT/POST /api/sessions/{name}...` unknown session: `{"statusCode":404,"message":"Session not found"}`; unknown route | |
| 422 | session unknown for send-type endpoints: `{"error":"Session \"x\" does not exist","session":"x"}`; **session not WORKING**: `{"error":"Session status is not as expected. Try again later or restart the session","session":"default","status":"SCAN_QR_CODE","expected":["WORKING"]}` (the server waits ~5 s to see if it is running, then waits for status); QR when not in SCAN_QR_CODE; passkey nothing pending; Brazilian/phone-numbers app `strict`; pre-2026.6.1 "available only in Plus version" | |
| 501 | engine does not implement it: `{"statusCode":501,"message":"The method is not implemented by 'NOWEB' engine. Check the docs and try another engine: https://waha.devlike.pro/"}` | NestJS NotImplementedException |
| 500 | engine errors surface as 500 with the engine message, e.g. WhatsApp "server returned error 463" (reachout timelock) or 475 (message capping), `rate-overlimit` (NOWEB groups without store / too frequent refresh), "Evaluation failed" on WEBJS | |
| 429 | none from WAHA itself; the rate limits are WhatsApp's | |

## 11. Feature matrix (docs "Engines > Features", docs table; y = supported, blank = not)

| Feature | WEBJS | WPP | NOWEB | GOWS |
|---|---|---|---|---|
| sendText/Seen/Image/File/Voice/Video/Sticker/Location/ContactVcard, typing, presence, reaction, edit, delete message | y | y | y | y |
| sendList, link-custom-preview | | | y | y |
| forwardMessage | y (#588) | y | y | |
| star | y | y | y | |
| sendPoll | y | y | y | y |
| sendPollVote | y | | | y |
| buttons/reply (send/buttons/reply) | y | | | |
| chats list/overview/picture/unread/read | y | y | y (store) | y |
| archive/unarchive | y | y | y (store) | |
| delete chat | y | y | | |
| messages list/get | y | y | y (store) | y |
| pin/unpin message | y | | y | |
| delete all messages | y | | | |
| contacts all/one/check-exists/profile-picture | y | y | y (store for list) | y |
| update contact | y | | y | y |
| contact about, block/unblock | y | y | | |
| lids endpoints | y | y | y (store) | y |
| status send text/image/voice/video | y | y | y | y |
| status delete, new-message-id | | | y | y |
| channels: list/get/search/preview/send | y | y | y | y |
| channels: create | | y | y | y |
| channels: delete | | y | y | |
| channels: follow/mute | | y | | y |
| groups: all core ops incl. v2 participants, settings, join requests | y | y | y | y |
| groups: delete group | y | y | | |
| groups: member-share-history, member tags | y | | y | y |
| presence GET all | | y | y | y |
| labels API | y | y | y | y |
| calls reject | y | y | y | y |
| event message | | | | y |
| screenshot | y | y | | |
| storages: local session/media, PostgreSQL | y | | y | y |
| storage: S3 media | y | | y | y |

NOWEB store caveat: contacts/all, chats, chat messages, lids, read-messages need `noweb.store.enabled`. GOWS stores by default.

## 12. Top gotchas (for the plugin)

1. **Send responses are engine-shaped**: GOWS `{id,_data}`; NOWEB raw Baileys `{key:{id},message}` for most sends (WAMessage only for poll/some); WEBJS wwebjs Message (id may be an object). Normalize, then build the full id `true_<chat>_<id>`.
2. **Message id is a composite string** `<fromMe>_<chat>_<ID>[_<participant>]` (group suffix = sender lid/pn); webhook `editedMessageId`/`revokedMessageId`/`replyTo.id` carry the **bare** id; ack/reaction/edit lookups need you to match on the bare id or rebuild the composite.
3. **`from` is the chat, not the sender**, on NOWEB/GOWS; sender = `participant` (groups). `to` is null/absent for DMs on NOWEB/GOWS. Derive chat id from `from` (NOWEB/GOWS) / `_data.id.remote` (WEBJS).
4. **LID vs phone**: the same human can be `@lid` or `@c.us`; alternates live in `_data.key.remoteJidAlt/participantAlt` (NOWEB), `_data.Info.SenderAlt/RecipientAlt` (GOWS), nowhere on WEBJS. Use `/lids` endpoints, `check-exists.pn`, and `merge=true`. `me.lid` exists on NOWEB/GOWS only.
5. **media.url points at `localhost:3000` by default, needs X-Api-Key, and is deleted after 180 s** (default). Rewrite the host, add the key, download on receipt; `hasMedia:true` with `url:null` is normal when download is disabled.
6. **check-exists before first send**, especially Brazil (ninth digit): use the returned `chatId` (may be `@lid`).
7. **PUT /api/sessions/{s} replaces the config and restarts the session**; webhooks set through env are invisible in session config. Re-send the whole config.
8. **NOWEB without store** returns nothing for chats/contacts/history; enabling it later needs a re-pair to backfill. Reactions on NOWEB come only via `message.reaction`. GOWS/WEBJS poll votes need message secrets / the poll creation message.
9. **Own-sent messages appear in `message.any` (source "api" or "app") and `message` only for others**; dedupe API sends with `message.any`/`message.ack`. Ack `DEVICE` = 2 (delivered), `READ` = 3, `PLAYED` = 4; group acks arrive in `message.ack.group`.
10. **Status/session**: only `WORKING` accepts sends (422 otherwise; the server waits ~5 s first). `SCAN_QR_CODE` re-fires every QR rotation (refetch). `reachoutTimelock` / `messageCapping` in `session.status.data` or `me` mean "do not restart"; 463/475 errors are WhatsApp limits. Also: reaction and star are **PUT**; encode `@` as `%40` in paths; `status@broadcast` stories flood `message` events unless `ignore.status=true`.

## 13. UNCONFIRMED / not verified live

- No live WAHA instance was queried: all JSON is from docs, openapi, DTOs and engine source; WEBJS/GOWS/NOWEB `_data` field lists for specific media kinds come from the underlying libraries (whatsapp-web.js, Baileys, whatsmeow) and WAHA code paths that read them.
- Exact send-response shapes (section 5), WEBJS raw `id` object, NOWEB `to` for DMs, GOWS `Info.Type/MediaType` values, `mentionedJID` casing, per-engine 501 list (static scan), NOWEB `setPresence` support, profile picture endpoints per engine, sendButtons engine support.
- Fixtures to capture on a real instance before coding against these: one message of each kind per engine, a send response per engine, a group message (lid participant), an ack in a group.
