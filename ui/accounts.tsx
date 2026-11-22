// Several WhatsApp accounts in one inbox: the accounts list shared by the header menu and the inbox, and the dialogs that add, rename and remove one.
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, toast, usePluginEvent } from "@/plugins/kit";
import { formatPhoneDisplay } from "../shared/phone";
import { WaContext, accountName, errorText, scopedApi, useWa, type Account, type Api } from "./context";
import { IconArrowLeft, IconCheck, Spinner } from "./icons";
import { IconChevronRight, IconLink } from "./icons-people";
import { IconAlertCircle, IconPlugOff, IconQr, IconSmartphone } from "./icons-session";
import { PairForm, QrPanel, useSessionInfo } from "./session-screen";
import { SESSION_CSS } from "./styles-session";
import { THEME_CSS } from "./theme";

export { AccountsContext, useAccounts, type Accounts } from "./accounts-context";

const STATUS: Record<string, string> = {
  WORKING: "Connected", STARTING: "Connecting", SCAN_QR_CODE: "Waiting for a scan", STOPPED: "Stopped", FAILED: "Connection failed", MISSING: "Not in WAHA",
  UNREACHABLE: "WAHA not reachable", UNAUTHORIZED: "API key refused", PASSKEY_REQUIRED: "Passkey needed", PASSKEY_CONFIRMATION_REQUIRED: "Passkey needed",
};
export const statusText = (s: string) => STATUS[s] ?? "Not connected";
export const hueOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initialsOf = (name: string) => { const w = name.replace(/^\+/, "").trim().split(/\s+/).filter(Boolean); return w.length ? (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase() : ""; };
/** The account's colour comes from its number (the session name before a phone is linked), so it stays the same wherever the account shows. */
export const accountHue = (a: Pick<Account, "session" | "phone">) => hueOf(a.phone || a.session);
export const phoneLine = (a: Pick<Account, "phone">) => (a.phone ? formatPhoneDisplay(a.phone) : "");

export function AccountAvatar({ account, dot, className = "wa-arow-av" }: { account: Pick<Account, "session" | "label" | "name" | "phone" | "status">; dot?: boolean; className?: string }) {
  const letters = initialsOf(account.label || account.name);
  return (
    <span className={className} style={{ "--wa-h": accountHue(account) } as CSSProperties} aria-hidden="true">
      {letters || (account.phone ? account.phone.slice(-2) : <IconPlugOff width={18} height={18} />)}
      {dot && <span className="wa-dot" data-s={account.status} />}
    </span>
  );
}

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
const STORE_KEY = "floq.waha.account";
const remembered = () => { try { return localStorage.getItem(STORE_KEY) ?? ""; } catch { return ""; } };

/** Loads GET /accounts and keeps it fresh: on account, session and message events (unread counts), on tab focus and every half minute. */
export function useAccountList(pluginId: string, api: Api, enabled: boolean): { list: Account[] | null; error: string; active: string; switchTo(session: string): void; refresh(): Promise<void> } {
  const [list, setList] = useState<Account[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(remembered);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    try { const r = await api<{ accounts: Account[] }>("/accounts"); setList(Array.isArray(r?.accounts) ? r.accounts : []); setError(""); }
    catch (e) { setError(errorText(e)); }
  }, [api]);
  const soon = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { timer.current = null; void refresh(); }, 600); }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const t = setInterval(() => { if (visible()) void refresh(); }, 30_000);
    const onVisible = () => { if (visible()) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); if (timer.current) clearTimeout(timer.current); };
  }, [enabled, refresh]);
  usePluginEvent(pluginId, "accounts", () => { void refresh(); });
  usePluginEvent(pluginId, "session", soon);
  usePluginEvent(pluginId, "message", soon);
  usePluginEvent(pluginId, "chats", soon);
  const active = useMemo(() => (list?.some((a) => a.session === picked) ? picked : list?.[0]?.session ?? ""), [list, picked]);
  const switchTo = useCallback((session: string) => { setPicked(session); try { localStorage.setItem(STORE_KEY, session); } catch { /* storage blocked: the choice lasts for this visit */ } }, []);
  return { list, error, active, switchTo, refresh };
}

type Step = "choose" | "attach" | "name" | "link";
interface Available { name: string; status: string; engine: string; account: { name: string; phone: string | null } | null }
const webhookNote = (r: { webhook?: string }) => (r.webhook === "manual" ? "Point this session's webhook at Floq's hook URL (Settings > Plugins > WhatsApp) to receive its messages." : undefined);

/** The QR (or pairing code) of a session that was just created, until its phone is linked. Rendered inside a context scoped to that session. */
function LinkPhone({ onLinked }: { onLinked: () => void }) {
  const { api } = useWa();
  const { info, error, refresh } = useSessionInfo();
  const [pair, setPair] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = info?.status;
  const done = useRef(false);
  useEffect(() => { if (status === "WORKING" && !done.current) { done.current = true; onLinked(); } }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (status === "WORKING") {
    const who = [info?.me?.name, info?.me?.phone ? formatPhoneDisplay(info.me.phone) : ""].filter(Boolean).join(" · ");
    return <div className="wa-adlg-note" role="status"><span className="wa-adlg-done"><IconCheck /></span><b>WhatsApp is linked</b><span>{who || "The account is ready."}</span></div>;
  }
  if (status === "FAILED" || status === "STOPPED") {
    const again = async () => { setBusy(true); try { await api(status === "FAILED" ? "/session/restart" : "/session/start", { method: "POST" }); await refresh(); } catch (e) { toast.error("Could not start WhatsApp", { description: errorText(e) }); } finally { setBusy(false); } };
    return <div className="wa-adlg-note" role="status"><IconAlertCircle width={32} height={32} /><b>{status === "FAILED" ? "The connection failed" : "WhatsApp is stopped"}</b><span>The QR code may have expired. Start again to get a new one.</span><Button type="button" variant="outline" disabled={busy} onClick={() => void again()}>{busy && <Spinner />}Try again</Button></div>;
  }
  if (status !== "SCAN_QR_CODE") return <div className="wa-adlg-note" role="status"><Spinner /><b>Starting WhatsApp</b><span>{error || "The QR code appears here in a few seconds."}</span></div>;
  if (pair) return <div className="wa-adlg-link"><PairForm onBack={() => setPair(false)} /></div>;
  return (
    <div className="wa-adlg-link">
      <QrPanel />
      <ol className="wa-sess-steps">
        <li><span>Open <b>WhatsApp</b> on the phone you want to add</span></li>
        <li><span>Tap <b>Linked devices</b>, then <b>Link a device</b></span></li>
        <li><span>Scan this code</span></li>
      </ol>
      <button type="button" className="wa-slink" onClick={() => setPair(true)}><IconSmartphone width={18} height={18} />Link with phone number instead</button>
    </div>
  );
}

/** "Add account": link a new WhatsApp (a new WAHA session and its QR code) or attach a session that already runs in WAHA. */
export function AddAccountDialog({ open, onOpenChange, api, pluginId, onAdded }: { open: boolean; onOpenChange: (v: boolean) => void; api: Api; pluginId: string; onAdded: (session: string) => void | Promise<void> }) {
  const [step, setStep] = useState<Step>("choose");
  const [avail, setAvail] = useState<Available[] | null>(null);
  const [availError, setAvailError] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");
  const [linked, setLinked] = useState(false);
  const wa = useContext(WaContext);
  const load = useCallback(async () => {
    setAvailError("");
    try { setAvail((await api<{ sessions: Available[] }>("/accounts/available")).sessions ?? []); }
    catch (e) { setAvail([]); setAvailError(errorText(e)); }
  }, [api]);
  useEffect(() => { if (open) { setStep("choose"); setAvail(null); setLabel(""); setBusy(""); setError(""); setCreated(""); setLinked(false); void load(); } }, [open, load]);

  const linkWa = useMemo(() => (created ? { ...(wa ?? { engine: "" as const, features: {} as never, me: null, chats: [], refreshChats() {}, openChat() {}, useAvatar: () => null }), pluginId, api: scopedApi(api, created), session: created } : null), [wa, pluginId, api, created]);

  async function attach(s: Available) {
    setBusy(s.name); setError("");
    try {
      const r = await api<{ session: string; webhook?: string }>("/accounts/attach", { method: "POST", body: { name: s.name } });
      toast.success(`${s.account?.name || s.name} added`, { description: webhookNote(r) });
      await onAdded(r.session);
      onOpenChange(false);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(""); }
  }
  async function create() {
    setBusy("create"); setError("");
    try {
      const r = await api<{ session: string; webhook?: string }>("/accounts/create", { method: "POST", body: { label: label.trim() } });
      setCreated(r.session); setStep("link");
      const note = webhookNote(r);
      if (note) toast.message("One more step in WAHA", { description: note });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(""); }
  }
  /** Closing before the phone is linked takes the half-made account back out, in Floq and in WAHA. */
  async function close() {
    if (busy) return;
    if (created && !linked) {
      setBusy("cancel");
      try { await api("/accounts/remove", { method: "POST", body: { session: created, discard: true } }); } catch { /* it stays in the menu, where it can be removed */ }
      setBusy("");
    }
    onOpenChange(false);
  }
  const back = (to: Step) => <Button type="button" variant="ghost" onClick={() => { setError(""); setStep(to); }} disabled={!!busy}><IconArrowLeft />Back</Button>;
  const title = step === "attach" ? "Attach an existing session" : step === "name" ? "Link a new WhatsApp" : step === "link" ? (linked ? "Account added" : "Scan with your phone") : "Add a WhatsApp account";
  const description = step === "attach" ? "Sessions that already run in your WAHA and are not in Floq yet. Nobody is logged out."
    : step === "name" ? "Floq creates a new session in your WAHA. You then scan a QR code with the phone you want to add."
    : step === "link" ? (linked ? "Its chats load in the inbox now." : "Keep this window open until the phone is linked.")
    : "Use several numbers side by side. Each one keeps its own chats, and every reply goes out from the account the chat belongs to.";
  let body: ReactNode;
  if (step === "choose") {
    body = (
      <div className="wa-adlg-opts">
        <button type="button" className="wa-adlg-opt" onClick={() => setStep("name")}>
          <span className="wa-adlg-ico"><IconQr /></span>
          <span><b>Link a new WhatsApp</b><small>Scan a QR code with another phone. Floq creates the session in WAHA for you.</small></span>
          <IconChevronRight />
        </button>
        <button type="button" className="wa-adlg-opt" onClick={() => setStep("attach")}>
          <span className="wa-adlg-ico"><IconLink /></span>
          <span><b>Attach an existing session</b><small>{avail === null ? "Use a session that already runs in your WAHA." : avail.length === 0 ? "Every session of your WAHA is already here." : avail.length === 1 ? "1 session in your WAHA is not in Floq yet." : `${avail.length} sessions in your WAHA are not in Floq yet.`}</small></span>
          <IconChevronRight />
        </button>
      </div>
    );
  } else if (step === "attach") {
    body = (
      <>
        {avail === null ? <div className="wa-adlg-note" role="status"><Spinner /></div>
          : availError ? <div className="wa-adlg-note" role="alert"><IconAlertCircle width={28} height={28} /><b>Could not read the sessions of WAHA</b><span>{availError}</span><Button type="button" variant="outline" onClick={() => { setAvail(null); void load(); }}>Try again</Button></div>
          : avail.length === 0 ? <div className="wa-adlg-note"><b>Nothing to attach</b><span>Every session of your WAHA is already one of your accounts. Link a new WhatsApp instead.</span></div>
          : (
            <ul className="wa-adlg-list" aria-label="Sessions in WAHA">
              {avail.map((s) => (
                <li key={s.name} className="wa-adlg-row">
                  <AccountAvatar account={{ session: s.name, label: "", name: s.account?.name ?? "", phone: s.account?.phone ?? null, status: s.status }} />
                  <span className="wa-arow-main"><b>{s.account?.name || s.name}</b><span><i className="wa-nb">{s.account?.phone ? formatPhoneDisplay(s.account.phone) : "No phone linked yet"}</i>{s.account?.name ? ` · ${s.name}` : ""}</span></span>
                  <span className="wa-adlg-st" data-s={s.status}>{statusText(s.status)}</span>
                  <Button type="button" size="sm" disabled={!!busy} aria-label={`Attach ${s.account?.name || s.name}`} onClick={() => void attach(s)}>{busy === s.name ? <Spinner /> : null}Attach</Button>
                </li>
              ))}
            </ul>
          )}
        {error && <p className="wa-adlg-err" role="alert">{error}</p>}
        <div className="wa-adlg-foot">{back("choose")}</div>
      </>
    );
  } else if (step === "name") {
    body = (
      <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); if (!busy) void create(); }}>
        <div className="wa-adlg-field">
          <label htmlFor="wa-adlg-label">Name in Floq (optional)</label>
          <Input id="wa-adlg-label" value={label} maxLength={40} autoComplete="off" placeholder="For example Support or Personal" onChange={(e) => setLabel(e.target.value)} autoFocus />
          <small>Shown in the account menu. Without one, Floq uses the name of the WhatsApp account.</small>
        </div>
        {error && <p className="wa-adlg-err" role="alert">{error}</p>}
        <div className="wa-adlg-foot">{back("choose")}<span><Button type="submit" disabled={!!busy}>{busy === "create" ? <Spinner /> : <IconQr />}Show QR code</Button></span></div>
      </form>
    );
  } else {
    body = (
      <>
        {linkWa && <WaContext.Provider value={linkWa}><LinkPhone onLinked={() => { setLinked(true); void onAdded(created); }} /></WaContext.Provider>}
        <div className="wa-adlg-foot"><span>{linked ? <Button type="button" onClick={() => onOpenChange(false)}>Open the account</Button> : <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void close()}>{busy === "cancel" && <Spinner />}Cancel</Button>}</span></div>
      </>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) onOpenChange(true); else void close(); }}>
      <DialogContent className="wa-adlg sm:max-w-md" showCloseButton>
        <style>{THEME_CSS + SESSION_CSS}</style>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/** "Remove from Floq": detaches the account. The phone stays linked and the session keeps running in WAHA. */
export function RemoveAccountDialog({ account, onOpenChange, api, onRemoved }: { account: Account | null; onOpenChange: (v: boolean) => void; api: Api; onRemoved: () => void | Promise<void> }) {
  const [wipe, setWipe] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (account) { setWipe(false); setBusy(false); } }, [account]);
  const name = account ? accountName(account) : "";
  async function remove() {
    if (!account) return;
    setBusy(true);
    try {
      await api("/accounts/remove", { method: "POST", body: { session: account.session, deleteData: wipe } });
      toast.success(`${name} removed from Floq`);
      await onRemoved();
      onOpenChange(false);
    } catch (e) { toast.error("Could not remove the account", { description: errorText(e) }); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={!!account} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="wa-adlg sm:max-w-md" showCloseButton>
        <style>{THEME_CSS + SESSION_CSS}</style>
        <DialogHeader>
          <DialogTitle>Remove {name} from Floq?</DialogTitle>
          <DialogDescription>The account leaves this inbox and Floq stops storing its messages. Your phone stays linked and the session keeps running in WAHA, so you can attach it again later.</DialogDescription>
        </DialogHeader>
        <label className="wa-adlg-check"><input type="checkbox" checked={wipe} disabled={busy} onChange={(e) => setWipe(e.target.checked)} /><span>Also delete its chats stored in Floq. Nothing is deleted on your phone.</span></label>
        <div className="wa-adlg-foot"><span>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>{busy && <Spinner />}Remove from Floq</Button>
        </span></div>
      </DialogContent>
    </Dialog>
  );
}

/** The name the account has in Floq. Empty goes back to the WhatsApp name. */
export function RenameAccountDialog({ account, onOpenChange, api, onDone }: { account: Account | null; onOpenChange: (v: boolean) => void; api: Api; onDone: () => void | Promise<void> }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (account) { setLabel(account.label); setBusy(false); } }, [account]);
  async function save() {
    if (!account) return;
    setBusy(true);
    try { await api("/accounts/update", { method: "POST", body: { session: account.session, label: label.trim() } }); await onDone(); onOpenChange(false); }
    catch (e) { toast.error("Could not rename the account", { description: errorText(e) }); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={!!account} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="wa-adlg sm:max-w-md" showCloseButton>
        <style>{THEME_CSS + SESSION_CSS}</style>
        <DialogHeader><DialogTitle>Rename account</DialogTitle><DialogDescription>How this account is called in Floq. WhatsApp itself is not changed.</DialogDescription></DialogHeader>
        <form style={{ display: "contents" }} onSubmit={(e) => { e.preventDefault(); if (!busy) void save(); }}>
          <div className="wa-adlg-field">
            <label htmlFor="wa-adlg-rename">Name in Floq</label>
            <Input id="wa-adlg-rename" value={label} maxLength={40} autoComplete="off" placeholder={account?.name || account?.session || ""} onChange={(e) => setLabel(e.target.value)} autoFocus />
          </div>
          <div className="wa-adlg-foot"><span>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Spinner />}Save</Button>
          </span></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
