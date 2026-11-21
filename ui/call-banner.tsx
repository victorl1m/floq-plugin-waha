import { useCallback, useEffect, useRef, useState } from "react";
import { Button, toast, usePluginEvent } from "@/plugins/kit";
import { displayName } from "../shared/chat";
import { Avatar } from "./avatar";
import { errorCode, useWa } from "./context";
import { IconPhone, IconPhoneDown, IconVideoCall } from "./icons-more";

interface CallEvent { id?: string; chatId?: string; name?: string; video?: boolean; status?: "ringing" | "accepted" | "declined" | "missed" | "rejected" }
interface Ringing { id: string; chatId: string; name: string; video: boolean }
/** An incoming-call bar goes away by itself after this long. */
export const CALL_BANNER_MS = 45_000;

/** The incoming-call bar at the top of the inbox. WhatsApp calls can only be answered on the phone; here you can decline. */
export function CallBanner() {
  const { api, pluginId, features } = useWa();
  const [call, setCall] = useState<Ringing | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; setCall(null); setBusy(false); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  usePluginEvent<CallEvent>(pluginId, "call", (e) => {
    if (!e?.id || !e.chatId) return;
    if (e.status === "ringing") {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(clear, CALL_BANNER_MS);
      setCall({ id: e.id, chatId: e.chatId, name: e.name ?? "", video: e.video === true });
    } else setCall((c) => (c && c.id === e.id ? null : c));
  });
  if (!features.calls || !call) return null;
  const who = displayName({ chatId: call.chatId, name: call.name });
  const decline = async () => {
    setBusy(true);
    try { await api("/call/reject", { method: "POST", body: { id: call.id, chatId: call.chatId } }); clear(); }
    catch (e) { setBusy(false); toast.error("Could not decline the call", { description: errorCode(e) === "unsupported" ? "This WAHA engine cannot decline calls." : e instanceof Error ? e.message : "Something went wrong." }); }
  };
  return (
    <div className="wa-call" role="alert" aria-label={`Incoming ${call.video ? "video" : "voice"} call from ${who}`}>
      <span className="wa-call-avatar"><Avatar chat={{ chatId: call.chatId, name: call.name }} small /><span className="wa-call-badge" aria-hidden="true">{call.video ? <IconVideoCall /> : <IconPhone />}</span></span>
      <span className="wa-call-text">
        <b>{who}</b>
        <span>Incoming {call.video ? "video" : "voice"} call</span>
        <small>Calls can only be answered on your phone.</small>
      </span>
      <Button type="button" className="wa-call-decline" disabled={busy} aria-label={`Decline call from ${who}`} onClick={() => void decline()}><IconPhoneDown />Decline</Button>
    </div>
  );
}
