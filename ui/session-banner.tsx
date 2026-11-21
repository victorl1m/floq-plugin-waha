// Account menu (chat-list header) and the reconnect bar (top of the chat list) of the connection state.
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  Tooltip, TooltipContent, TooltipTrigger, toast,
} from "@/plugins/kit";
import { errorCode, errorText, useWa } from "./context";
import { IconRefresh, Spinner } from "./icons";
import { IconAlertCircle, IconCamera, IconLogout, IconPlugOff, IconPower, IconServerOff, IconSliders, IconStop } from "./icons-session";
import { useSessionInfo, type SessionStatus } from "./session-screen";
import { SESSION_CSS } from "./styles-session";

const STATUS_TEXT: Record<SessionStatus, string> = {
  WORKING: "Connected", STARTING: "Connecting", SCAN_QR_CODE: "Waiting for a scan", STOPPED: "Stopped", FAILED: "Connection failed", MISSING: "Not set up",
  UNREACHABLE: "WAHA not reachable", UNAUTHORIZED: "API key refused", PASSKEY_REQUIRED: "Passkey needed", PASSKEY_CONFIRMATION_REQUIRED: "Passkey needed",
};
const hueOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initialsOf = (name: string) => { const w = name.trim().split(/\s+/).filter(Boolean); return w.length ? (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase() : ""; };
const explain = (e: unknown) => (errorCode(e) === "unsupported" ? "This WAHA engine does not support that." : errorText(e));

type Dialog = "logout" | "webhook" | "events" | "shot" | null;
const mono = { fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", fontSize: 12, padding: "2px 6px", borderRadius: 6, background: "color-mix(in srgb, currentColor 10%, transparent)" } as const;

/** Avatar button with the connection dot and a menu: restart, stop, log out, fix webhook events, screenshot. */
export function AccountMenu() {
  const { api, features } = useWa();
  const { info, refresh } = useSessionInfo();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState("");
  const status: SessionStatus = info?.status ?? "STARTING";
  const me = info?.me;
  const name = me?.name || (me?.phone ? "+" + me.phone : "WhatsApp");
  const missing = info?.webhook?.missingEvents ?? [];
  const envHooks = !!info && info.webhook === null && status === "WORKING";

  async function act(path: string, title: string, done?: string) {
    setBusy(true);
    try { await api(path, { method: "POST" }); if (done) toast.success(done); await refresh(); }
    catch (e) { toast.error(title, { description: explain(e) }); }
    finally { setBusy(false); setDialog(null); }
  }
  async function fixEvents() {
    setBusy(true);
    try { const r = await api<{ added: string[] }>("/session/webhook-events", { method: "POST" }); toast.success(r.added.length ? `Added ${r.added.length} webhook events` : "Webhook events are already complete"); await refresh(); }
    catch (e) { toast.error("Could not fix the webhook events", { description: errorCode(e) === "no_webhook" ? "The webhook of this session is set in WAHA itself. Enable the events there." : explain(e) }); }
    finally { setBusy(false); setDialog(null); }
  }
  async function screenshot() {
    setShot(""); setDialog("shot");
    try { setShot((await api<{ image: string }>("/session/screenshot")).image); }
    catch (e) { setDialog(null); toast.error("Could not take a screenshot", { description: explain(e) }); }
  }

  return (
    <>
      <style>{SESSION_CSS}</style>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="wa-acct" aria-label={`WhatsApp account: ${name}, ${STATUS_TEXT[status]}`}>
                <span className="wa-acct-av" style={{ "--wa-h": hueOf(me?.phone ?? name) } as React.CSSProperties}>{initialsOf(me?.name ?? "") || <IconPlugOff width={18} height={18} />}</span>
                <span className="wa-dot" data-s={status} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{name} · {STATUS_TEXT[status]}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-60">
          <DropdownMenuLabel style={{ display: "flex", flexDirection: "column", gap: 2, fontWeight: 400 }}>
            <span style={{ fontWeight: 600 }}>{name}</span>
            {me?.phone && me.name && <span style={{ opacity: 0.7, fontSize: 12 }}>+{me.phone}</span>}
            <span style={{ opacity: 0.7, fontSize: 12 }}>{STATUS_TEXT[status]}{info?.engine ? ` · ${info.engine}` : ""}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={busy} onSelect={() => void act("/session/restart", "Could not restart", "Restarting WhatsApp")}><IconRefresh />Restart</DropdownMenuItem>
          {status !== "STOPPED" && status !== "MISSING" && <DropdownMenuItem disabled={busy} onSelect={() => void act("/session/stop", "Could not stop")}><IconStop />Stop</DropdownMenuItem>}
          {features.screenshot && status === "WORKING" && <DropdownMenuItem onSelect={() => void screenshot()}><IconCamera />Screenshot</DropdownMenuItem>}
          {missing.length > 0 && <DropdownMenuItem onSelect={() => setDialog("webhook")}><IconSliders />Fix webhook events</DropdownMenuItem>}
          {envHooks && <DropdownMenuItem onSelect={() => setDialog("events")}><IconSliders />Webhook events</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("logout")}><IconLogout />Log out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={dialog === "logout"} onOpenChange={(o) => !o && !busy && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>This unlinks the phone from Floq. Your stored chats stay here, but you need to scan a new QR code to receive and send messages again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); void act("/session/logout", "Could not log out"); }}>Log out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "webhook"} onOpenChange={(o) => !o && !busy && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fix webhook events</AlertDialogTitle>
            <AlertDialogDescription>
              The WAHA webhook of this session does not send {missing.length} events Floq uses (for example {missing.slice(0, 3).join(", ")}). Floq adds them and keeps everything else as it is.
              WAHA restarts the session to apply this, so WhatsApp reconnects for a few seconds. Messages are not lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void fixEvents(); }}>Add events and reconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "events"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Webhook events</AlertDialogTitle>
            <AlertDialogDescription>
              The webhook of this WAHA is set in its environment, so Floq cannot read or change it. Make sure it sends these events (or use *):
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 220, overflowY: "auto" }}>{info?.wantedEvents?.map((e) => <code key={e} style={mono}>{e}</code>)}</div>
          <AlertDialogFooter><AlertDialogAction>Close</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "shot"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Screenshot</AlertDialogTitle>
            <AlertDialogDescription>What the WhatsApp Web browser in WAHA shows right now.</AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ minHeight: 120, display: "grid", placeItems: "center" }}>{shot ? <img src={shot} alt="Screenshot of the WAHA browser" style={{ maxWidth: "100%", maxHeight: "50vh", borderRadius: 8 }} /> : <Spinner />}</div>
          <AlertDialogFooter><AlertDialogAction>Close</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Thin bar for the top of the chat list while the session is not working. Nothing is drawn while it is. */
export function SessionBanner({ onOpenConnect }: { onOpenConnect?: () => void }) {
  const { api } = useWa();
  const { info, refresh } = useSessionInfo();
  const [busy, setBusy] = useState(false);
  if (!info || info.status === "WORKING") return null;
  const status = info.status;
  async function reconnect(path: string) {
    setBusy(true);
    try { await api(path, { method: "POST" }); await refresh(); }
    catch (e) { toast.error("Could not reconnect", { description: explain(e) }); }
    finally { setBusy(false); }
  }
  let title = "Phone not connected", hint = "Reconnect to receive new messages.", action: React.ReactNode = null, error = false, icon: React.ReactNode = <IconPlugOff />;
  const btn = (label: string, run: () => void) => <Button type="button" variant="ghost" className="wa-sbar-btn" disabled={busy} onClick={run} aria-label={label}>{label}</Button>;
  if (status === "STARTING") { title = "Reconnecting"; hint = "WhatsApp is starting again."; icon = <Spinner />; }
  else if (status === "STOPPED" || status === "MISSING") action = btn("Reconnect", () => void reconnect("/session/start"));
  else if (status === "FAILED") { error = true; icon = <IconAlertCircle />; action = btn("Reconnect", () => void reconnect("/session/restart")); }
  else if (status === "UNREACHABLE") { title = "Cannot reach WAHA"; hint = "Check that your WAHA instance is running."; error = true; icon = <IconServerOff />; action = btn("Retry", () => void refresh()); }
  else if (status === "UNAUTHORIZED") { title = "WAHA refused the API key"; hint = "Update WAHA_API_KEY in the plugin Settings."; error = true; icon = <IconServerOff />; }
  else { hint = "The phone was unlinked. Link it again to keep receiving messages."; action = onOpenConnect ? btn("Link again", onOpenConnect) : null; }
  return (
    <div className={`wa-sbar${error ? " wa-sbar-error" : ""}`} role="status">
      <style>{SESSION_CSS}</style>
      {icon}
      <span className="wa-sbar-text"><b>{title}</b><span>{hint}</span></span>
      {action}
    </div>
  );
}
