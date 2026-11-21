---
name: waha
description: Read the user's WhatsApp inbox and message the user on their own WhatsApp number through Floq's WAHA plugin (`floq plugin call waha ...`). Sending to other people needs the user's approval.
---

# WhatsApp through WAHA

The user connected their own WAHA instance to Floq. You never see the API key. Everything goes through `floq plugin call`.

## Read the inbox

```bash
floq plugin call waha chats
floq plugin call waha messages --json '{"chatId":"5511999999999@c.us","limit":20}'
floq plugin call waha messages --json '{"chatId":"5511999999999@c.us","search":"invoice"}'
floq plugin call waha media-info --json '{"messageId":"<id from messages>"}'
```

One person is one chat, even when WhatsApp addresses them by phone (`...@c.us`), by `...@lid`, or by both spellings of a Brazilian mobile: use the `chatId` that `chats` returns. The chat with `isSelf: true` is the user.

Messages carry `type` (chat, image, video, audio, ptt = voice note, document, sticker, location, vcard, poll, call), `ack` (1 sent, 2 delivered, 3 read), `reactions`, `replyTo`, and for files `media` (mime, filename, size, duration). `media-info` describes a file; you cannot download it.

## Message the user (free)

Use this for updates, results, and questions you want them to see on their phone. Write normal, clear sentences: the text goes to their number exactly as you write it. No approval, no codes.

```bash
floq plugin call waha message-me --json '{"text":"The build finished and all tests pass."}'
floq plugin call waha send-media-me --json '{"kind":"document","mime":"application/pdf","filename":"report.pdf","data":"<base64>","caption":"The report"}'
```

Returns `{"status":"sent"}`. Text up to 4096 characters; files up to 5 MB (`kind`: image, video, audio, voice, document). It only ever goes to the user's own saved number. A 409 means no number is saved or the user turned it off: do not retry, tell them in Floq. `floq plugin call waha me` shows `canMessageMe`.

## Message other people (needs approval)

```bash
floq plugin call waha send --json '{"chatId":"5511999999999@c.us","text":"Hello! The report is ready."}'
floq plugin call waha send-media --json '{"chatId":"5511999999999@c.us","kind":"image","mime":"image/png","filename":"chart.png","data":"<base64>"}'
floq plugin call waha react --json '{"messageId":"<id>","emoji":"👍"}'
```

To answer one specific message, add `"replyTo":"<id of that message from the messages call>"`: WhatsApp then shows it as a quoted reply.

Floq asks the user first and waits. You get `{"status":"sent"}`, or `denied` / `expired` (nothing was sent: do not retry unless asked). If the user enabled "Always allow AI to send messages", it goes out at once (`sendNeedsApproval` is false in `me`); still never message someone on your own initiative. Files and reactions in the user's own chat need no approval.

Never ask for the WAHA key or webhook secret.
