// Test entry: the pieces of runtime/index.ts that the people routes need (core, identity, store, inbox, webhook bus), with the three people modules registered.
import type { PluginContext } from "../shared/sdk";
import { createCore } from "../runtime/core.js";
import { createIdentity } from "../runtime/identity.js";
import { createStore } from "../runtime/messages.js";
import { createInbox } from "../runtime/inbox.js";
import { parseEnvelope } from "../runtime/parse.js";
import { registerChats } from "../runtime/chats.js";
import { registerContacts } from "../runtime/contacts.js";
import { registerGroups } from "../runtime/groups.js";

let running: ReturnType<typeof createCore> | null = null;
export default {
  async stop() { await running?.idle(); },
  start(ctx: PluginContext) {
    const core = createCore(ctx);
    running = core;
    const identity = createIdentity(core, async () => ctx.kv.get("u1", "phone"));
    const store = createStore(core, identity);
    const inbox = createInbox(core, identity, store);
    const deps = { core, identity, store, inbox };
    registerChats(deps); registerContacts(deps); registerGroups(deps);
    ctx.webhooks.on("events", async (req: { json(): unknown }) => {
      const e = parseEnvelope(req.json());
      const owner = await ctx.installOwner(), o = owner && e ? await core.scope(owner, e.session) : null;
      if (e && o) { if (Object.keys(e.me).length) await identity.saveMe(o, e.me); await core.emit(o, e); }
      return { ok: true };
    });
  },
};
