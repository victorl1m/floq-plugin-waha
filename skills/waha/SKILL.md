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
```

## Message the user (free)

Use this for updates, results, and questions you want them to see on their phone. Write normal, clear sentences: the text goes to their number exactly as you write it. No approval, no codes.

```bash
floq plugin call waha message-me --json '{"text":"The build finished and all tests pass."}'
```

Returns `{"status":"sent"}`. Max 4096 characters. It only ever goes to the user's own saved number. A 409 means no number is saved or the user turned it off: do not retry, tell them in Floq. `floq plugin call waha me` shows `canMessageMe`.

## Message other people (needs approval)

```bash
floq plugin call waha send --json '{"chatId":"5511999999999@c.us","text":"Hello! The report is ready."}'
```

To answer one specific message, add `"replyTo":"<id of that message from the messages call>"`: WhatsApp then shows it as a quoted reply. Messages that are replies carry `replyTo` (who and what they quote).

A contact WhatsApp addresses both by phone (`...@c.us`) and by `...@lid` is one chat here: use the `chatId` that `chats` returns.

Floq asks the user first and waits. You get `{"status":"sent"}`, or `denied` / `expired` (nothing was sent: do not retry unless asked). If the user enabled "Always allow AI to send messages", it goes out at once (`sendNeedsApproval` is false in `me`); still never message someone on your own initiative.

Never ask for the WAHA key or webhook secret.
