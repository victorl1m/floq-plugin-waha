// Session, chats, contacts, groups, labels, status, channels, calls and presence modules register here.
import type { Core } from "./core.js";
import type { Identity } from "./identity.js";
import type { Store } from "./messages.js";
import type { Inbox } from "./inbox.js";
import { registerSession } from "./session.js"; // session-wiring

export interface Deps { core: Core; identity: Identity; store: Store; inbox: Inbox }

export function registerExtras(deps: Deps): void {
  registerSession(deps); // session-wiring
  // filled in by runtime/session.ts, chats.ts, contacts.ts, groups.ts, more.ts
}
