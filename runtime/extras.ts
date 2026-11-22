// Session, accounts, chats, contacts, groups, labels, status, channels, calls and presence modules register here.
import type { Core } from "./core.js";
import type { Identity } from "./identity.js";
import type { Store } from "./messages.js";
import type { Inbox } from "./inbox.js";
import { registerChats } from "./chats.js";
import { registerContacts } from "./contacts.js";
import { registerGroups } from "./groups.js";
import { registerLabels } from "./labels.js";
import { registerStatus } from "./status.js";
import { registerChannels } from "./channels.js";
import { registerCalls } from "./calls.js";
import { registerPresence } from "./presence.js";
import { registerSession } from "./session.js";
import { registerAccounts } from "./accounts.js";

export interface Deps { core: Core; identity: Identity; store: Store; inbox: Inbox }

export function registerExtras(deps: Deps): void {
  registerChats(deps);
  registerContacts(deps);
  registerGroups(deps);
  registerLabels(deps); registerStatus(deps); registerChannels(deps); registerCalls(deps); registerPresence(deps);
  registerSession(deps);
  registerAccounts(deps);
}
