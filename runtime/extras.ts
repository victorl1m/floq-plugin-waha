// Session, chats, contacts, groups, labels, status, channels, calls and presence modules register here.
import type { Core } from "./core.js";
import type { Identity } from "./identity.js";
import type { Store } from "./messages.js";
import type { Inbox } from "./inbox.js";
import { registerChats } from "./chats.js";
import { registerContacts } from "./contacts.js";
import { registerGroups } from "./groups.js";

export interface Deps { core: Core; identity: Identity; store: Store; inbox: Inbox }

export function registerExtras(deps: Deps): void {
  registerChats(deps);
  registerContacts(deps);
  registerGroups(deps);
}
