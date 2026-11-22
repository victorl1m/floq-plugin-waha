// Contacts: everyone the phone knows (GET /contacts, synced by the history import or "Sync now"), saved names first. Opens over the chat list like Status.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/plugins/kit";
import { displayName } from "../shared/chat";
import { errorText, useWa, useWaEvent } from "./context";
import { Pic, phoneText } from "./group-dialogs";
import { IconArrowLeft, IconInfo, IconRefresh, IconSearch, Spinner } from "./icons";
import { useDebounced } from "./people-utils";
import { SESSION_CSS } from "./styles-session";

export interface PhoneContact { chatId: string; name: string | null; pushName: string | null; businessName: string | null; phone: string | null; isMyContact: boolean; isBusiness: boolean; avatar: number | null }
interface Page { contacts: PhoneContact[]; total: number; syncedAt: string | null; syncing: boolean }
const PAGE = 60;
const label = (c: PhoneContact) => c.name || c.pushName || c.businessName || phoneText(c.phone) || "Unknown contact";
/** Saved names first, then the others, each group in alphabetical order. */
const order = (a: PhoneContact, b: PhoneContact) => Number(!!b.isMyContact && !!b.name) - Number(!!a.isMyContact && !!a.name) || label(a).localeCompare(label(b), undefined, { sensitivity: "base" });

export function syncedText(iso: string | null, now = Date.now()): string {
  if (!iso) return "Not synced yet";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "Not synced yet";
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return "Synced just now";
  if (min < 60) return `Synced ${min} min ago`;
  if (min < 24 * 60) return `Synced ${Math.round(min / 60)} h ago`;
  return "Synced " + new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

export function ContactsView({ onClose, onOpen }: { onClose: () => void; onOpen: (c: PhoneContact, info: boolean) => void }) {
  const { api } = useWa();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 200);
  const [page, setPage] = useState<Page | null>(null);
  const [rows, setRows] = useState<PhoneContact[]>([]);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const seq = useRef(0);
  const qRef = useRef(q);
  qRef.current = q;
  const load = useCallback(async (offset: number, term: string) => {
    const n = ++seq.current;
    try {
      const r = await api<Page>(`/contacts?q=${encodeURIComponent(term)}&limit=${PAGE}&offset=${offset}`);
      if (n !== seq.current) return;
      setError(""); setPage(r); setSyncing(r.syncing === true);
      setRows((old) => { const list = offset ? [...old, ...(r.contacts ?? []).filter((c) => !old.some((o) => o.chatId === c.chatId))] : r.contacts ?? []; return [...list].sort(order); });
    } catch (e) { if (n === seq.current) setError(errorText(e)); }
    finally { if (n === seq.current) setMore(false); }
  }, [api]);
  useEffect(() => { void load(0, q); }, [load, q]);
  // The runtime says when a sync finished: read the list again.
  useWaEvent("contacts", () => { setSyncing(false); void load(0, qRef.current); });
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target as Element | null)?.closest?.("[role=dialog],[role=menu]") && !query) onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose, query]);
  async function sync() {
    setSyncing(true); setError("");
    try { await api("/contacts/sync", { method: "POST" }); }
    catch (e) { setSyncing(false); setError(errorText(e)); }
  }
  const total = page?.total ?? 0;
  return (
    <section className="wa-contacts" aria-label="Contacts">
      <style>{SESSION_CSS}</style>
      <div className="wa-head">
        <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Back to chats" onClick={onClose}><IconArrowLeft /></Button>
        <h2 className="wa-title">Contacts{page ? <span className="wa-sr"> ({total})</span> : null}</h2>
      </div>
      <div className="wa-search">
        <IconSearch />
        <input type="text" role="searchbox" value={query} placeholder="Search name or number" aria-label="Search contacts" autoComplete="off" spellCheck={false}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); e.stopPropagation(); setQuery(""); } }} />
      </div>
      <div className="wa-csync" role="status">
        <span>{page ? `${total} ${total === 1 ? "contact" : "contacts"} · ${syncing ? "Syncing…" : syncedText(page.syncedAt)}` : "Loading…"}</span>
        <Button type="button" variant="ghost" className="wa-sbar-btn" disabled={syncing} onClick={() => void sync()}>{syncing ? <Spinner /> : <IconRefresh width={14} height={14} />}Sync now</Button>
      </div>
      <div className="wa-scroll">
        {error && !page ? <div className="wa-center"><strong>Could not load contacts</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={() => void load(0, q)}>Try again</Button></div>
          : !page ? <div className="wa-center"><Spinner />Loading contacts…</div>
          : !rows.length ? <p className="wa-quiet">{q ? `No contacts match “${q}”.` : "No contacts yet. Use Sync now to read them from your phone."}</p>
          : (
            <>
              <ul className="wa-clist" role="list">
                {rows.map((c) => {
                  const like = { chatId: c.chatId, kind: "user" as const, name: c.name || c.pushName || c.businessName, phone: c.phone, avatar: c.avatar };
                  const sub = [phoneText(c.phone), c.pushName && c.pushName !== c.name ? "~" + c.pushName : "", c.businessName && c.businessName !== c.name ? c.businessName : ""].filter(Boolean).join(" · ");
                  return (
                    <li key={c.chatId} className="wa-crow">
                      <button type="button" className="wa-crow-main" aria-label={`Open chat with ${label(c)}`} onClick={() => onOpen(c, false)}>
                        <Pic chat={like} />
                        <span className="wa-crow-t"><b><span>{c.name || displayName(like)}</span>{c.isBusiness && <i className="wa-cbadge">Business</i>}</b>{sub && <span>{sub}</span>}</span>
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label={`Contact info: ${label(c)}`} onClick={() => onOpen(c, true)}><IconInfo /></Button></TooltipTrigger>
                        <TooltipContent>Contact info</TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
              {rows.length < total && <div className="wa-cmore"><Button type="button" variant="outline" size="sm" className="wa-btn" disabled={more} onClick={() => { setMore(true); void load(rows.length, q); }}>{more && <Spinner />}Show more</Button></div>}
            </>
          )}
      </div>
    </section>
  );
}
