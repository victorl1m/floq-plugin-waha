import { defineUiPlugin } from "@/plugins/sdk";
import InboxView from "./inbox-view";
import MoreDemo from "./more-demo";
import PeopleDemo from "./people-demo";
import SettingsPanel from "./settings-panel";

/** WhatsApp inbox: one main-navigation view plus a settings panel (test message). Chats and messages come from the plugin's own routes; new messages arrive as plugin events. */
// ?demo=<area> mounts a stand-in screen of one area's components: the browser harness of Floq's e2e specs uses it, the app never sets it.
const DEMOS: Record<string, typeof InboxView> = { people: PeopleDemo, more: MoreDemo };
const View: typeof InboxView = (p) => { const Demo = DEMOS[new URLSearchParams(location.search).get("demo") ?? ""] ?? InboxView; return <Demo {...p} />; };
export default defineUiPlugin({ views: { inbox: View }, settingsPanel: SettingsPanel });
