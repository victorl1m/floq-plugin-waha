// Session, chats, contacts, groups, labels, status, channels, calls and presence modules register here.
import type { Core } from "./core.js";
import type { Identity } from "./identity.js";
import type { Store } from "./messages.js";
import type { Inbox } from "./inbox.js";
import { registerLabels } from "./labels.js"; // more-wiring
import { registerStatus } from "./status.js"; // more-wiring
import { registerChannels } from "./channels.js"; // more-wiring
import { registerCalls } from "./calls.js"; // more-wiring
import { registerPresence } from "./presence.js"; // more-wiring

export interface Deps { core: Core; identity: Identity; store: Store; inbox: Inbox }

export function registerExtras(deps: Deps): void {
  // filled in by runtime/session.ts, chats.ts, contacts.ts, groups.ts, more.ts
  registerLabels(deps); registerStatus(deps); registerChannels(deps); registerCalls(deps); registerPresence(deps); // more-wiring
}
