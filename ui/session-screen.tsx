// The connection screen: shown instead of the inbox while WhatsApp is not linked. QR or pairing-code login, start/restart, and the shared live session state.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Button, toast, usePluginEvent } from "@/plugins/kit";
import { errorCode, errorText, useWa, type Api } from "./context";
import { IconLock, IconRefresh, Spinner } from "./icons";
import { IconAlertCircle, IconCheckCircle, IconKey, IconQr, IconServerOff, IconSmartphone } from "./icons-session";
import { qrMatrix, qrPath } from "./qr";
import { SESSION_CSS } from "./styles-session";

export type SessionStatus = "STOPPED" | "STARTING" | "SCAN_QR_CODE" | "WORKING" | "FAILED" | "PASSKEY_REQUIRED" | "PASSKEY_CONFIRMATION_REQUIRED" | "MISSING" | "UNREACHABLE" | "UNAUTHORIZED";
export interface SessionInfo {
  status: SessionStatus;
  engine: string;
  me: { name: string; phone: string | null } | null;
  webhook: { configured: boolean; events: string[]; missingEvents: string[] } | null;
  wantedEvents?: string[];
}

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
/** Poll period of the session state: quick while the user is waiting for a connection, slow while it just works. */
const POLL_WAITING_MS = 3000, POLL_WORKING_MS = 20_000, QR_REFRESH_MS = 15_000;

// One poller per plugin, shared by the screen, the reconnect bar and the account menu.
interface Store { api: Api; info: SessionInfo | null; error: string; subs: Set<() => void>; timer: ReturnType<typeof setTimeout> | null; inflight: Promise<void> | null }
const stores = new Map<string, Store>();
const emit = (s: Store) => s.subs.forEach((f) => f());
function refresh(s: Store): Promise<void> {
  s.inflight ??= (async () => {
    try { s.info = await s.api<SessionInfo>("/session"); s.error = ""; }
    catch (e) { s.error = errorText(e); }
    finally { s.inflight = null; emit(s); }
  })();
  return s.inflight;
}
function schedule(s: Store) {
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  if (!s.subs.size) return;
  s.timer = setTimeout(async () => { if (visible()) await refresh(s); schedule(s); }, s.info?.status === "WORKING" ? POLL_WORKING_MS : POLL_WAITING_MS);
}

/** The live session state (GET /session), refreshed on every "session" event, on tab focus and by polling. */
export function useSessionInfo(): { info: SessionInfo | null; error: string; refresh: () => Promise<void> } {
  const { pluginId, api } = useWa();
  let s = stores.get(pluginId);
  if (!s) stores.set(pluginId, (s = { api, info: null, error: "", subs: new Set(), timer: null, inflight: null }));
  s.api = api;
  const store = s;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    store.subs.add(bump);
    void refresh(store).then(() => schedule(store));
    const onVisible = () => { if (visible()) void refresh(store).then(() => schedule(store)); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); store.subs.delete(bump); if (!store.subs.size && store.timer) { clearTimeout(store.timer); store.timer = null; } };
  }, [store]);
  usePluginEvent<{ status?: string }>(pluginId, "session", (d) => {
    if (typeof d?.status === "string" && store.info) { store.info = { ...store.info, status: d.status as SessionStatus }; emit(store); }
    void refresh(store).then(() => schedule(store));
  });
  return { info: store.info, error: store.error, refresh: useCallback(() => refresh(store), [store]) };
}

/** The QR as an inline SVG: dark on white with the 4 module quiet zone, in both themes. */
export function QrCode({ value }: { value: string }) {
  const svg = useMemo(() => {
    try { const m = qrMatrix(value); return { size: m.length + 8, d: qrPath(m, 4) }; } catch { return null; }
  }, [value]);
  if (!svg) return <p className="wa-qr-err">This code is too long to show. Use the phone number option instead.</p>;
  return (
    <svg viewBox={`0 0 ${svg.size} ${svg.size}`} role="img" aria-label="QR code to link WhatsApp" shapeRendering="crispEdges">
      <rect width={svg.size} height={svg.size} fill="#fff" />
      <path d={svg.d} fill="#111b21" />
    </svg>
  );
}

/** Fetches the QR on mount, on every SCAN_QR_CODE event and every 15 s while the tab is visible. */
function QrPanel() {
  const { api, pluginId } = useWa();
  const [qr, setQr] = useState<{ value?: string; image?: string } | null>(null);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = await api<{ value?: string; image?: string }>("/session/qr");
      if (n === seq.current) { setQr(r); setError(""); }
    } catch (e) {
      // not_scanning: the status poll moves the screen on; any other error keeps the last code and says so.
      if (n === seq.current && errorCode(e) !== "not_scanning") setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (visible()) void load(); }, QR_REFRESH_MS);
    return () => { clearInterval(t); seq.current++; };
  }, [load]);
  usePluginEvent<{ status?: string }>(pluginId, "session", (d) => { if (d?.status === "SCAN_QR_CODE") void load(); });
  return (
    <>
      <div className="wa-qr-box" aria-busy={!qr}>
        {qr?.value ? <QrCode value={qr.value} /> : qr?.image ? <img src={qr.image} alt="QR code to link WhatsApp" /> : null}
        {!qr && <div className="wa-qr-busy" role="status"><Spinner /></div>}
      </div>
      {error && <p className="wa-qr-err" role="alert">{error}</p>}
    </>
  );
}

function PairForm({ onBack }: { onBack: () => void }) {
  const { api } = useWa();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<{ phone: string | null }>("/phone").then((r) => { if (live && r?.phone) setPhone((p) => p || r.phone!); }).catch(() => undefined);
    return () => { live = false; };
  }, [api]);
  async function request() {
    setBusy(true); setError("");
    try { setCode((await api<{ code: string }>("/session/pair-code", { method: "POST", body: { phone } })).code); }
    catch (e) { setCode(""); setError(errorCode(e) === "not_scanning" || errorCode(e) === "session_not_ready" ? "WhatsApp is not ready for a code yet. Try again in a few seconds." : errorText(e)); }
    finally { setBusy(false); }
  }
  const [a, b] = code.split("-");
  return (
    <div className="wa-pair">
      <h2 className="wa-sess-h">Link with phone number</h2>
      <p className="wa-sess-sub">Enter the number of the WhatsApp account you want to link, with the country code.</p>
      <label htmlFor="wa-pair-phone">Phone number</label>
      <form className="wa-pair-row" onSubmit={(e) => { e.preventDefault(); if (phone.trim() && !busy) void request(); }}>
        <input id="wa-pair-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+55 11 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={error ? true : undefined} />
        <Button type="submit" variant="ghost" className="wa-pbtn" disabled={busy || !phone.trim()}>{busy && <Spinner />}{code ? "New code" : "Get code"}</Button>
      </form>
      {error && <p className="wa-pair-err" role="alert">{error}</p>}
      {code && (
        <>
          <div className="wa-code" role="group" aria-label={`Pairing code ${code.replace("-", " ")}`}>
            {[...(a ?? "")].map((c, i) => <span key={i} className="wa-code-box" aria-hidden="true">{c}</span>)}
            <span className="wa-code-dash" aria-hidden="true" />
            {[...(b ?? "")].map((c, i) => <span key={i + 4} className="wa-code-box" aria-hidden="true">{c}</span>)}
          </div>
          <ol className="wa-sess-steps">
            <li><span>Open WhatsApp on your phone</span></li>
            <li><span>Tap <b>Linked devices</b>, then <b>Link a device</b></span></li>
            <li><span>Tap <b>Link with phone number instead</b></span></li>
            <li><span>Enter the code above</span></li>
          </ol>
          <p className="wa-pair-note">The code works for a few minutes. Keep this screen open.</p>
        </>
      )}
      <button type="button" className="wa-slink" onClick={onBack}><IconQr width={18} height={18} />Link with QR code instead</button>
    </div>
  );
}

function State({ icon, tone, title, children, actions }: { icon: React.ReactNode; tone?: "ok" | "warn"; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="wa-sess-state" role="status">
      <span className={`wa-sess-ico ${tone ? "wa-" + tone : ""}`}>{icon}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {actions && <div className="wa-sess-actions">{actions}</div>}
    </div>
  );
}

export function SessionScreen({ onConnected }: { onConnected: () => void }) {
  const { api } = useWa();
  const { info, error, refresh: reload } = useSessionInfo();
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState(false);
  const status = info?.status;
  const announced = useRef(false);
  const latest = useRef(onConnected);
  latest.current = onConnected;
  useEffect(() => {
    if (status === "WORKING" && !announced.current) { announced.current = true; latest.current(); }
    if (status && status !== "WORKING") announced.current = false;
    if (status !== "SCAN_QR_CODE") setPair(false);
  }, [status]);

  async function post(path: string, title: string) {
    setBusy(true);
    try { await api(path, { method: "POST" }); await reload(); }
    catch (e) { toast.error(title, { description: errorCode(e) === "unsupported" ? "This WAHA engine does not support that." : errorText(e) }); }
    finally { setBusy(false); }
  }
  const primary = (label: string, run: () => void, icon?: React.ReactNode) => <Button type="button" variant="ghost" className="wa-pbtn" disabled={busy} onClick={run}>{busy ? <Spinner /> : icon}{label}</Button>;

  let body: React.ReactNode;
  if (!info) {
    body = error
      ? <State icon={<IconServerOff />} tone="warn" title="Could not check WhatsApp" actions={<Button type="button" variant="ghost" className="wa-obtn" onClick={() => void reload()}><IconRefresh width={16} height={16} />Try again</Button>}>{error}</State>
      : <State icon={<Spinner />} title="Checking WhatsApp" />;
  } else if (status === "UNREACHABLE") {
    body = <State icon={<IconServerOff />} tone="warn" title="Cannot reach WAHA" actions={<Button type="button" variant="ghost" className="wa-obtn" onClick={() => void reload()}><IconRefresh width={16} height={16} />Try again</Button>}>Check that your WAHA instance is running and that the address in the plugin Settings is right.</State>;
  } else if (status === "UNAUTHORIZED") {
    body = <State icon={<IconKey />} tone="warn" title="WAHA refused the API key" actions={<Button type="button" variant="ghost" className="wa-obtn" onClick={() => void reload()}><IconRefresh width={16} height={16} />Check again</Button>}>Update the WAHA_API_KEY secret in the plugin Settings so it matches your WAHA instance.</State>;
  } else if (status === "MISSING" || status === "STOPPED") {
    body = <State icon={<IconSmartphone />} title="Connect WhatsApp" actions={primary("Connect WhatsApp", () => void post("/session/start", "Could not connect"))}>{status === "MISSING" ? "Link your WhatsApp account to read and send messages here. Floq creates the WAHA session for you." : "WhatsApp is stopped. Connect to start receiving messages again."}</State>;
  } else if (status === "STARTING") {
    body = <State icon={<Spinner />} title="Starting WhatsApp">This takes a few seconds. The QR code appears here when it is ready.</State>;
  } else if (status === "FAILED") {
    body = <State icon={<IconAlertCircle />} tone="warn" title="The connection failed" actions={primary("Try again", () => void post("/session/restart", "Could not restart"), <IconRefresh width={16} height={16} />)}>WhatsApp stopped before it was linked, for example because the QR code expired. Start again to get a new one.</State>;
  } else if (status === "PASSKEY_REQUIRED" || status === "PASSKEY_CONFIRMATION_REQUIRED") {
    body = <State icon={<IconKey />} tone="warn" title="Passkey needed" actions={<Button type="button" variant="ghost" className="wa-obtn" onClick={() => void reload()}><IconRefresh width={16} height={16} />Check again</Button>}>WhatsApp is asking for a passkey on your phone. Confirm it there, or finish the login in the WAHA dashboard.</State>;
  } else if (status === "WORKING") {
    body = <State icon={<IconCheckCircle />} tone="ok" title="WhatsApp is connected">Loading your chats.</State>;
  } else if (pair) {
    body = <PairForm onBack={() => setPair(false)} />;
  } else {
    body = (
      <div className="wa-sess-card">
        <div className="wa-sess-steps-col">
          <h2 className="wa-sess-h">Link WhatsApp to Floq</h2>
          <p className="wa-sess-sub">Use your phone to link this inbox.</p>
          <ol className="wa-sess-steps">
            <li><span>Open <b>WhatsApp</b> on your phone</span></li>
            <li><span>Tap <b>Menu</b> or <b>Settings</b> and select <b>Linked devices</b></span></li>
            <li><span>Tap <b>Link a device</b></span></li>
            <li><span>Point your phone at this screen to scan the QR code</span></li>
          </ol>
          <button type="button" className="wa-slink" onClick={() => setPair(true)}><IconSmartphone width={18} height={18} />Link with phone number instead</button>
        </div>
        <div className="wa-sess-qr"><QrPanel /></div>
      </div>
    );
  }
  return (
    <section className="wa-sess" aria-label="Connect WhatsApp">
      <style>{SESSION_CSS}</style>
      <div className="wa-sess-in">
        {body}
        {(status === "SCAN_QR_CODE" || status === "MISSING" || status === "STOPPED") && <p className="wa-sess-foot"><IconLock />Your chats stay on your own WAHA server.</p>}
      </div>
    </section>
  );
}
