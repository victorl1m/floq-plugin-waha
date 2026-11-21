import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Switch, cn, toast } from "@/plugins/kit";
import { chatTitle, dayLabel, displayName, fullDate, matchesQuery, timeOf, type Chat, type Message } from "../shared/chat";
import { ACK_LABEL, ackState, cleanPhone, mapsUrl, parseCoords, splitHighlight } from "../shared/format";
import { formatPhoneDisplay } from "../shared/phone";
import { Avatar } from "./avatar";
import { errorCode, errorStatus, errorText, useWa } from "./context";
import { IconAlertCircle, IconClose, IconMapPin, IconPlus, IconSearch, IconTick1, IconTrash } from "./icons-bubbles";
import { Spinner } from "./icons";

const unsupported = (e: unknown, what: string) => {
  if (errorCode(e) === "unsupported" || errorStatus(e) === 501) toast.error(what, { description: "This WhatsApp engine does not support it." });
  else toast.error(what, { description: errorText(e) });
};
type Open = { open: boolean; onOpenChange: (v: boolean) => void };
/** Dialog content lives in a portal outside the inbox root: wa-dlg carries the palette variables there. */
const Shell = ({ title, description, children, footer, className }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; className?: string }) => (
  <DialogContent className={cn("wa-dlg", className)} showCloseButton>
    <DialogHeader><DialogTitle>{title}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}</DialogHeader>
    {children}
    {footer && <DialogFooter>{footer}</DialogFooter>}
  </DialogContent>
);

// ---- delete ----
/** "Delete for me" / "Delete for everyone" (own messages only, when the engine can). onDelete resolves when the route answered. */
export function DeleteDialog({ message, open, onOpenChange, onDelete }: Open & { message: Message | null; onDelete: (forEveryone: boolean) => void | Promise<void> }) {
  const { features } = useWa();
  const [busy, setBusy] = useState("");
  const everyone = Boolean(message?.fromMe) && features.deleteForEveryone && !message?.deleted;
  const go = async (forEveryone: boolean) => {
    setBusy(forEveryone ? "all" : "me");
    try { await onDelete(forEveryone); onOpenChange(false); }
    catch (e) { unsupported(e, "Message not deleted"); }
    finally { setBusy(""); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <Shell title="Delete message?" description={everyone ? "You can delete it for everyone in this chat, or only remove it from this inbox." : "It is removed from this inbox only. Other people still see it."}
        footer={<>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={Boolean(busy)}>Cancel</Button>
          <Button type="button" variant={everyone ? "outline" : "destructive"} onClick={() => void go(false)} disabled={Boolean(busy)}>{busy === "me" ? <Spinner /> : null}Delete for me</Button>
          {everyone && <Button type="button" variant="destructive" onClick={() => void go(true)} disabled={Boolean(busy)}>{busy === "all" ? <Spinner /> : null}Delete for everyone</Button>}
        </>}>
        {message?.body ? <p className="wa-dlg-quote">{message.body.slice(0, 160)}</p> : null}
      </Shell>
    </Dialog>
  );
}

// ---- forward ----
export const FORWARD_MAX = 5;
export function ForwardDialog({ message, open, onOpenChange, onForward }: Open & { message: Message | null; onForward: (chatIds: string[]) => void | Promise<void> }) {
  const { chats } = useWa();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQ(""); setSel([]); setBusy(false); } }, [open]);
  const list = useMemo(() => chats.filter((c) => matchesQuery(c, q)), [chats, q]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= FORWARD_MAX ? s : [...s, id]));
  const send = async () => {
    setBusy(true);
    try { await onForward(sel); onOpenChange(false); }
    catch (e) { unsupported(e, "Message not forwarded"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Shell title="Forward message" description={message?.body ? message.body.slice(0, 80) : "Pick up to " + FORWARD_MAX + " chats."}
        footer={<>
          <span className="wa-dlg-count" aria-live="polite">{sel.length} of {FORWARD_MAX} selected</span>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!sel.length || busy} onClick={() => void send()}>{busy ? <Spinner /> : null}Forward</Button>
        </>}>
        <div className="wa-dlg-search"><IconSearch /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" autoComplete="off" /></div>
        <ul className="wa-pick" role="listbox" aria-multiselectable="true" aria-label="Chats">
          {list.map((c) => {
            const on = sel.includes(c.chatId), full = !on && sel.length >= FORWARD_MAX;
            return (
              <li key={c.chatId} role="option" aria-selected={on}>
                <button type="button" className={cn("wa-pick-row", on && "wa-pick-on")} disabled={full} onClick={() => toggle(c.chatId)}>
                  <span className="wa-check" aria-hidden="true">{on && <IconTick1 />}</span>
                  <Avatar chat={c} small />
                  <span className="wa-pick-t"><b>{chatTitle(c)}</b></span>
                </button>
              </li>
            );
          })}
          {!list.length && <li className="wa-dlg-none">No chats found</li>}
        </ul>
      </Shell>
    </Dialog>
  );
}

// ---- poll ----
export interface PollInput { name: string; options: string[]; multiple: boolean }
export const POLL_MIN = 2, POLL_MAX = 12;
export function pollProblem(name: string, options: string[]): string {
  const opts = options.map((o) => o.trim()).filter(Boolean);
  if (!name.trim()) return "Type a question.";
  if (opts.length < POLL_MIN) return "Add at least two options.";
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return "Options must be different.";
  return "";
}
export function PollDialog({ open, onOpenChange, onCreate }: Open & { onCreate: (p: PollInput) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const rows = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { if (open) { setName(""); setOptions(["", ""]); setMultiple(false); setTried(false); setBusy(false); } }, [open]);
  const problem = pollProblem(name, options);
  const set = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const add = () => { if (options.length < POLL_MAX) { setOptions((o) => [...o, ""]); setTimeout(() => rows.current[options.length]?.focus(), 0); } };
  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true);
    try { await onCreate({ name: name.trim(), options: options.map((o) => o.trim()).filter(Boolean), multiple }); onOpenChange(false); }
    catch (e) { unsupported(e, "Poll not sent"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Shell title="Create poll" description="Ask a question and let people vote."
        footer={<><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void submit()}>{busy ? <Spinner /> : null}Send poll</Button></>}>
        <form className="wa-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="wa-lbl" htmlFor="wa-poll-q">Question</label>
          <Input id="wa-poll-q" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} placeholder="Ask a question" autoComplete="off" autoFocus />
          <span className="wa-lbl">Options</span>
          {options.map((o, i) => (
            <div key={i} className="wa-optrow">
              <Input ref={(el) => { rows.current[i] = el; }} value={o} maxLength={100} onChange={(e) => set(i, e.target.value)} aria-label={"Option " + (i + 1)} placeholder={"Option " + (i + 1)} autoComplete="off"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (i === options.length - 1) add(); else rows.current[i + 1]?.focus(); } }} />
              <Button type="button" variant="ghost" size="icon" aria-label={"Remove option " + (i + 1)} disabled={options.length <= POLL_MIN} onClick={() => setOptions((x) => x.filter((_, j) => j !== i))}><IconTrash /></Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="wa-addopt" disabled={options.length >= POLL_MAX} onClick={add}><IconPlus />Add option</Button>
          <label className="wa-switchrow"><span>Allow multiple answers</span><Switch checked={multiple} onCheckedChange={setMultiple} aria-label="Allow multiple answers" /></label>
          {tried && problem && <p className="wa-err" role="alert"><IconAlertCircle />{problem}</p>}
        </form>
      </Shell>
    </Dialog>
  );
}

// ---- location ----
export interface LocationInput { latitude: number; longitude: number; title: string }
export function LocationDialog({ open, onOpenChange, onSend }: Open & { onSend: (l: LocationInput) => void | Promise<void> }) {
  const [paste, setPaste] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setPaste(""); setLat(""); setLng(""); setTitle(""); setErr(""); setBusy(false); } }, [open]);
  const point = parseCoords(lat + "," + lng);
  const canGeo = typeof navigator !== "undefined" && Boolean(navigator.geolocation);
  const onPaste = (v: string) => {
    setPaste(v);
    const p = parseCoords(v);
    if (p) { setLat(String(p.lat)); setLng(String(p.lng)); setErr(""); }
  };
  const locate = () => {
    setLocating(true); setErr("");
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLng(p.coords.longitude.toFixed(6)); setLocating(false); },
      () => { setErr("Could not get your location. Type coordinates or paste a maps link instead."); setLocating(false); },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };
  const send = async () => {
    if (!point) { setErr("Enter a latitude between -90 and 90 and a longitude between -180 and 180."); return; }
    setBusy(true);
    try { await onSend({ latitude: point.lat, longitude: point.lng, title: title.trim() }); onOpenChange(false); }
    catch (e) { unsupported(e, "Location not sent"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Shell title="Send location" description="Share a place on the map."
        footer={<><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={busy || !point} onClick={() => void send()}>{busy ? <Spinner /> : null}Send location</Button></>}>
        <form className="wa-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {canGeo && <Button type="button" variant="outline" size="sm" className="wa-addopt" onClick={locate} disabled={locating}>{locating ? <Spinner /> : <IconMapPin />}Use my current location</Button>}
          <label className="wa-lbl" htmlFor="wa-loc-paste">Paste a maps link or coordinates</label>
          <Input id="wa-loc-paste" value={paste} onChange={(e) => onPaste(e.target.value)} placeholder="https://www.google.com/maps/@-23.55,-46.63,15z" autoComplete="off" />
          <div className="wa-two">
            <div><label className="wa-lbl" htmlFor="wa-loc-lat">Latitude</label><Input id="wa-loc-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.5505" autoComplete="off" /></div>
            <div><label className="wa-lbl" htmlFor="wa-loc-lng">Longitude</label><Input id="wa-loc-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.6333" autoComplete="off" /></div>
          </div>
          <label className="wa-lbl" htmlFor="wa-loc-title">Name (optional)</label>
          <Input id="wa-loc-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Office, restaurant, meeting point" autoComplete="off" />
          {point && <a className="wa-loc-open" href={mapsUrl(point.lat, point.lng)} target="_blank" rel="noreferrer noopener">Check on the map</a>}
          {err && <p className="wa-err" role="alert"><IconAlertCircle />{err}</p>}
        </form>
      </Shell>
    </Dialog>
  );
}

// ---- contacts ----
export interface ContactInput { name: string; phone: string }
interface Found { name: string; phone: string }
/** The /contacts route may answer { contacts: [...] } or a bare array; keep entries that have a real phone number. */
export function normalizeContacts(res: unknown): Found[] {
  const raw = Array.isArray(res) ? res : Array.isArray((res as { contacts?: unknown } | null)?.contacts) ? (res as { contacts: unknown[] }).contacts : [];
  const out: Found[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const idDigits = /^(\d{7,15})@(c\.us|s\.whatsapp\.net)$/.exec(String(r?.chatId ?? r?.id ?? ""))?.[1] ?? "";
    const phone = cleanPhone(String(r?.phone ?? r?.number ?? "")) || idDigits;
    if (!phone) continue;
    out.push({ name: String(r?.name ?? r?.pushName ?? r?.pushname ?? "").trim() || formatPhoneDisplay(phone), phone });
  }
  return out;
}
export function ContactDialog({ open, onOpenChange, onSend }: Open & { onSend: (contacts: ContactInput[]) => void | Promise<void> }) {
  const { api } = useWa();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [manual, setManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Found[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQ(""); setFound([]); setManual(false); setSel([]); setName(""); setPhone(""); setErr(""); setBusy(false); } }, [open]);
  useEffect(() => {
    if (!open || manual) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      api<unknown>("/contacts?q=" + encodeURIComponent(q.trim()) + "&limit=30").then(
        (r) => { if (live) { setFound(normalizeContacts(r)); setLoading(false); } },
        (e) => { if (!live) return; setLoading(false); if (errorStatus(e) === 404 || errorStatus(e) === 501) setManual(true); else setErr(errorText(e)); },
      );
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [open, manual, q, api]);
  const has = (p: string) => sel.some((s) => s.phone === p);
  const toggle = (c: Found) => setSel((s) => (has(c.phone) ? s.filter((x) => x.phone !== c.phone) : s.length >= 5 ? s : [...s, c]));
  const addManual = () => {
    const p = cleanPhone(phone);
    if (!name.trim()) { setErr("Type the contact's name."); return; }
    if (!p) { setErr("Type the number in international format, for example +55 11 98765-4321."); return; }
    if (!has(p)) setSel((s) => [...s, { name: name.trim(), phone: p }].slice(0, 5));
    setName(""); setPhone(""); setErr("");
  };
  const send = async () => {
    setBusy(true);
    try { await onSend(sel.map((s) => ({ name: s.name, phone: s.phone }))); onOpenChange(false); }
    catch (e) { unsupported(e, "Contact not sent"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Shell title="Send contact" description="Pick up to 5 contacts."
        footer={<><span className="wa-dlg-count">{sel.length} selected</span><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" disabled={!sel.length || busy} onClick={() => void send()}>{busy ? <Spinner /> : null}Send</Button></>}>
        {sel.length > 0 && (
          <div className="wa-bchosen" aria-label="Selected contacts">
            {sel.map((s) => <span key={s.phone} className="wa-btag">{s.name}<button type="button" aria-label={"Remove " + s.name} onClick={() => setSel((x) => x.filter((y) => y.phone !== s.phone))}><IconClose /></button></span>)}
          </div>
        )}
        {manual ? (
          <form className="wa-form" onSubmit={(e) => { e.preventDefault(); addManual(); }}>
            <label className="wa-lbl" htmlFor="wa-ct-name">Name</label>
            <Input id="wa-ct-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
            <label className="wa-lbl" htmlFor="wa-ct-phone">Phone number</label>
            <Input id="wa-ct-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 98765-4321" autoComplete="off" />
            <Button type="submit" variant="outline" size="sm" className="wa-addopt" disabled={sel.length >= 5}><IconPlus />Add contact</Button>
            {err && <p className="wa-err" role="alert"><IconAlertCircle />{err}</p>}
            {!err && <button type="button" className="wa-linkbtn wa-self" onClick={() => { setManual(false); setErr(""); }}>Search my contacts instead</button>}
          </form>
        ) : (
          <>
            <div className="wa-dlg-search"><IconSearch /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" aria-label="Search contacts" autoComplete="off" autoFocus /></div>
            <ul className="wa-pick" role="listbox" aria-multiselectable="true" aria-label="Contacts" aria-busy={loading}>
              {found.map((c) => (
                <li key={c.phone} role="option" aria-selected={has(c.phone)}>
                  <button type="button" className={cn("wa-pick-row", has(c.phone) && "wa-pick-on")} onClick={() => toggle(c)}>
                    <span className="wa-check" aria-hidden="true">{has(c.phone) && <IconTick1 />}</span>
                    <Avatar chat={{ chatId: c.phone + "@c.us", name: c.name }} small />
                    <span className="wa-pick-t"><b>{c.name}</b><span>{formatPhoneDisplay(c.phone)}</span></span>
                  </button>
                </li>
              ))}
              {!found.length && <li className="wa-dlg-none">{loading ? "Searching…" : "No contacts found"}</li>}
            </ul>
            {err && <p className="wa-err" role="alert"><IconAlertCircle />{err}</p>}
            <button type="button" className="wa-linkbtn wa-self" onClick={() => { setManual(true); setErr(""); }}>Enter a name and number instead</button>
          </>
        )}
      </Shell>
    </Dialog>
  );
}

// ---- message info ----
interface Info { sentAt: string; ack: number; edited?: boolean; starred?: boolean; pinned?: boolean; reactions?: { emoji: string; fromMe: boolean; name: string; phone: string; at: string }[] }
export function MessageInfoDialog({ message, open, onOpenChange }: Open & { message: Message | null }) {
  const { api } = useWa();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const id = message?.id;
  useEffect(() => {
    if (!open || !id) return;
    let live = true;
    setInfo(null); setErr("");
    api<Info>("/message-info?id=" + encodeURIComponent(id)).then((r) => { if (live) setInfo(r); }, (e) => { if (live) setErr(errorText(e)); });
    return () => { live = false; };
  }, [open, id, api]);
  const state = info ? ackState({ ack: info.ack }) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Shell title="Message info" description={message?.body ? message.body.slice(0, 100) : undefined}>
        {err ? <p className="wa-err" role="alert"><IconAlertCircle />{err}</p> : !info ? <div className="wa-dlg-none"><Spinner /></div> : (
          <dl className="wa-minfo">
            <dt>Sent</dt><dd>{fullDate(info.sentAt)}</dd>
            {message?.fromMe && state && <><dt>Delivery</dt><dd>{state === "read" ? (info.ack === 4 ? "Read and played" : "Read") : ACK_LABEL[state]}</dd></>}
            {info.edited && <><dt>Edited</dt><dd>Yes</dd></>}
            {info.starred && <><dt>Starred</dt><dd>Yes</dd></>}
            {info.pinned && <><dt>Pinned</dt><dd>Yes</dd></>}
            {Boolean(info.reactions?.length) && (
              <>
                <dt>Reactions</dt>
                <dd><ul className="wa-who-react">{info.reactions!.map((r, i) => <li key={i}><span>{r.emoji}</span>{r.fromMe ? "You" : r.name || (r.phone ? formatPhoneDisplay(r.phone) : "Someone")}<i>{timeOf(r.at)}</i></li>)}</ul></dd>
              </>
            )}
          </dl>
        )}
      </Shell>
    </Dialog>
  );
}

// ---- search in chat ----
const snippet = (body: string, term: string) => {
  const t = body.replace(/\s+/g, " ").trim(), i = t.toLowerCase().indexOf(term.trim().toLowerCase());
  return i > 40 ? "…" + t.slice(i - 30, i + 90) : t.slice(0, 120);
};
/** Search bar under the header: GET /messages?chatId=&q=&limit=50. A click on a result asks the parent to jump to it. */
export function ChatSearch({ chat, now, onJump, onClose }: { chat: Chat; now?: Date; onJump: (messageId: string) => void; onClose: () => void }) {
  const { api } = useWa();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Message[] | null>(null);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes(null); setErr(""); return; }
    let live = true;
    const t = setTimeout(() => {
      api<{ messages: Message[] }>("/messages?chatId=" + encodeURIComponent(chat.chatId) + "&q=" + encodeURIComponent(term) + "&limit=50").then(
        (r) => { if (live) { setRes((r.messages ?? []).slice().reverse()); setErr(""); } },
        (e) => { if (live) setErr(errorText(e)); },
      );
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [q, chat.chatId, api]);
  const ref = now ?? new Date();
  return (
    <div className="wa-search-bar" role="search" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="wa-sb-in">
        <IconSearch />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={"Search in " + displayName(chat)} aria-label="Search in this chat" autoComplete="off" />
        <button type="button" className="wa-sb-x" aria-label="Close search" onClick={onClose}><IconClose /></button>
      </div>
      {(res !== null || err) && (
        <ul className="wa-sb-res" aria-label="Search results">
          {err ? <li className="wa-dlg-none">{err}</li> : res!.length === 0 ? <li className="wa-dlg-none">No messages found</li> : res!.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onJump(m.id)}>
                <span className="wa-sb-d">{dayLabel(m.sentAt, ref)} · {timeOf(m.sentAt)}</span>
                <span className="wa-sb-t">{splitHighlight(snippet(m.body ?? "", q), q).map((p, i) => (p.hit ? <mark key={i} className="wa-mark">{p.v}</mark> : p.v))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
