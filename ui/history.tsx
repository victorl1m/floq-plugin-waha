// History import: the shared state of GET /history (one per account), the progress bar at the top of the chat list, the note on the QR screens.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Button, toast } from "@/plugins/kit";
import { errorText, useWa, useWaEvent, type Api } from "./context";
import { IconAlert, IconCheck, IconInfo, Spinner } from "./icons";
import { SESSION_CSS } from "./styles-session";

export interface HistoryStatus {
  state: "idle" | "running" | "done" | "cancelled" | "failed"; phase: "contacts" | "chats" | "messages" | null; chatsTotal: number; chatsDone: number; messages: number; contacts: number;
  startedAt: string | null; finishedAt: string | null; error: string | null; everRan: boolean; contactsSyncedAt: string | null; contactsSyncing: boolean; limits: { perChat: number; total: number };
}
/** What GET /session says about history for a session that is not linked yet. */
export interface SessionHistory { willImport: boolean; error: string | null }

/** "Importing history… 34 of 120 chats", or the name of the step that has no count yet. */
export function progressText(s: Pick<HistoryStatus, "phase" | "chatsDone" | "chatsTotal">): string {
  if (s.phase === "contacts") return "Importing contacts…";
  if (s.phase === "chats" || (s.phase === "messages" && !s.chatsTotal)) return "Reading your chats…";
  return s.chatsTotal ? `Importing history… ${s.chatsDone} of ${s.chatsTotal} chats` : "Importing history…";
}

const stores = new Map<string, { s: HistoryStatus | null; subs: Set<() => void> }>();

/** The import state of the account on screen. Loaded when the screen mounts (an account switch mounts it again), kept fresh by "history" events. */
export function useHistory(): { status: HistoryStatus | null; refresh: () => Promise<void>; start: () => Promise<void>; cancel: () => Promise<void>; busy: boolean } {
  const { pluginId, api, session } = useWa();
  const key = pluginId + "\n" + (session ?? "");
  let st = stores.get(key);
  if (!st) stores.set(key, (st = { s: null, subs: new Set() }));
  const store = st;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [busy, setBusy] = useState(false);
  const set = useCallback((s: HistoryStatus) => { store.s = s; store.subs.forEach((f) => f()); }, [store]);
  const refresh = useCallback(async () => { try { set(await api<HistoryStatus>("/history")); } catch { /* keeps what it had */ } }, [api, set]);
  useEffect(() => { store.subs.add(bump); void refresh(); return () => { store.subs.delete(bump); }; }, [store, refresh]);
  useWaEvent<HistoryStatus>("history", (d) => { if (d && typeof d.state === "string") set(d); });
  const run = useCallback(async (path: string, title: string) => {
    setBusy(true);
    try { set(await api<HistoryStatus>(path, { method: "POST" })); }
    catch (e) { toast.error(title, { description: errorText(e) }); }
    finally { setBusy(false); }
  }, [api, set]);
  return { status: store.s, refresh, busy, start: () => run("/history/start", "Could not start the import"), cancel: () => run("/history/cancel", "Could not cancel the import") };
}

/** Progress of a running import, "History imported" for a moment after it, the error and Retry when it failed. Nothing otherwise. */
export function HistoryBar() {
  const { refreshChats } = useWa();
  const { status, refresh, start, cancel, busy } = useHistory();
  const [flash, setFlash] = useState(false);
  const prev = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = status?.state ?? null;
  useEffect(() => {
    if (prev.current === "running" && state && state !== "running") {
      refreshChats();
      if (state === "done") { setFlash(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setFlash(false), 4000); }
    }
    prev.current = state;
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Events carry the progress; this only covers one that never arrives.
  useEffect(() => { if (state !== "running") return; const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [state, refresh]);
  if (!status) return null;
  if (status.state === "running") {
    const pct = status.chatsTotal ? Math.min(100, Math.round((status.chatsDone / status.chatsTotal) * 100)) : null;
    return (
      <div className="wa-hbar" role="status">
        <style>{SESSION_CSS}</style>
        <div className="wa-hbar-row">
          <Spinner />
          <span className="wa-hbar-text">{progressText(status)}</span>
          <Button type="button" variant="ghost" className="wa-sbar-btn" disabled={busy} onClick={() => void cancel()}>Cancel</Button>
        </div>
        <div className="wa-hbar-track" role="progressbar" aria-label="History import" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} data-indeterminate={pct === null ? "" : undefined}><i style={pct === null ? undefined : { width: pct + "%" }} /></div>
      </div>
    );
  }
  if (status.state === "failed") {
    return (
      <div className="wa-hbar wa-hbar-error" role="alert">
        <style>{SESSION_CSS}</style>
        <div className="wa-hbar-row">
          <IconAlert />
          <span className="wa-hbar-text"><b>Import failed</b><span>{status.error || "WAHA stopped the import."}</span></span>
          <Button type="button" variant="ghost" className="wa-sbar-btn" disabled={busy} onClick={() => void start()}>Retry</Button>
        </div>
      </div>
    );
  }
  if (flash) return <div className="wa-hbar wa-hbar-done" role="status"><style>{SESSION_CSS}</style><div className="wa-hbar-row"><IconCheck /><span className="wa-hbar-text">History imported</span></div></div>;
  return null;
}

/** On the QR screens: whether Floq imports the chats once the phone is linked, or why it cannot. */
export function HistoryNote({ history }: { history?: SessionHistory | null }) {
  if (!history || (!history.willImport && !history.error)) return null;
  const warn = !!history.error;
  return (
    <p className={"wa-hnote" + (warn ? " wa-hnote-warn" : "")} role="note">
      <style>{SESSION_CSS}</style>
      {warn ? <IconAlert /> : <IconInfo />}
      <span>{warn ? `WAHA could not turn on history for this session: ${history.error}. You can still link it; only new messages will show.` : "Floq will import your chats and history after you scan."}</span>
    </p>
  );
}

export type { Api };
