---
name: waha
description: Read the user's WhatsApp inbox and, after the user approves, send a message, through Floq's WAHA plugin (`floq plugin call waha ...`).
---

# WhatsApp through WAHA

The user connected their own WAHA instance to Floq. You never see the API key. Everything goes through `floq plugin call`, which runs as this session and is limited to the user who set the plugin up.

Check that the plugin is on:

```bash
floq plugin list
```

## Read

```bash
# Recent chats, newest first: chatId, lastBody, lastAt, total
floq plugin call waha chats

# Messages of one chat, oldest first (limit 1-200, default 50)
floq plugin call waha messages --json '{"chatId":"5511999999999@c.us","limit":20}'
```

Chat ids look like `5511999999999@c.us` (a person) or `1203630...@g.us` (a group). Only messages WAHA delivered to Floq after the plugin was turned on are stored.

## Send (needs the user's approval)

```bash
floq plugin call waha send --json '{"chatId":"5511999999999@c.us","text":"Hello! The report is ready."}'
```

Floq asks the user first ("Plugin: WhatsApp (WAHA)" in the approval prompt) and waits. The call returns one of:

- `{"status":"sent"}`: the user approved and the message went out.
- `{"status":"denied"}` or `{"status":"expired"}`: nothing was sent. Do not retry without being asked; tell the user instead.

The call waits for the user for up to about 4½ minutes, then withdraws the request and returns `expired`. If your command is interrupted or times out, the request is withdrawn too: a message is never sent after you saw a failure. Wait for the user before asking again.

Rules: write the message exactly as it should be sent (max 4096 characters), never send on your own initiative, and never ask the user for their WAHA key or webhook secret.
