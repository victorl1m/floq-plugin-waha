import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Tooltip, TooltipContent, TooltipTrigger, cn, toast } from "@/plugins/kit";
import { displayName, fullDate, relativeTime, timeOf } from "../shared/chat";
import { Avatar } from "./avatar";
import { errorCode, errorStatus, useWa, useWaEvent } from "./context";
import { IconArrowLeft, IconRefresh, IconX, Spinner, IconAlert } from "./icons";
import { IconChevronLeft, IconChevronRight, IconImageSmall, IconPlusSmall, IconStatus, IconTextT, IconTrashSmall } from "./icons-more";

export interface StatusItem { id: string; type: "text" | "image" | "video" | "voice"; body: string; background?: string; media: { mime: string; available: boolean } | null; sentAt: string }
export interface StatusPoster { chatId: string; name: string; phone: string | null; avatar: number | null; isMe: boolean }
export interface StatusGroup { poster: StatusPoster; items: StatusItem[] }

/** How long a text or photo status stays on screen. */
export const STORY_MS = 5000;
const UPLOAD_MAX = 5 * 1024 * 1024;
const TEXT_MAX = 700;
export const STATUS_COLORS = ["#38b42f", "#0d8b78", "#1f7aec", "#8e24aa", "#d4337a", "#e8661a", "#54656f", "#202c33"];
const asText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const fail = (title: string, e: unknown) => toast.error(title, { description: errorCode(e) === "unsupported" ? "This WAHA engine does not support status updates." : asText(e) });
const bgOf = (i: StatusItem) => i.background || STATUS_COLORS[[...i.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % STATUS_COLORS.length];

// Which updates were looked at (kept in this browser only).
const SEEN_KEY = "waha-status-seen";
const loadSeen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); } catch { return new Set(); } };
const saveSeen = (s: Set<string>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-400))); } catch { /* private mode */ } };

/** A status file as an object URL (the runtime serves it as base64). */
function useStatusFile(item: StatusItem | undefined) {
  const { api } = useWa();
  const [state, setState] = useState<{ id: string; url: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!item?.media) { setState(null); return; }
    if (!item.media.available) { setState({ id: item.id, url: "", error: true }); return; }
    let live = true, made = "";
    setState(null);
    api<{ mime: string; data: string }>(`/status/media?id=${encodeURIComponent(item.id)}`).then((r) => {
      const bin = atob(r.data), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      made = URL.createObjectURL(new Blob([bytes], { type: r.mime }));
      if (live) setState({ id: item.id, url: made, error: false }); else URL.revokeObjectURL(made);
    }).catch(() => { if (live) setState({ id: item.id, url: "", error: true }); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [api, item?.id, item?.media?.available]);
  return state && state.id === item?.id ? state : null;
}

function PosterAvatar({ poster, items, seen, size }: { poster: StatusPoster; items: number; seen: number; size?: "lg" }) {
  const { useAvatar } = useWa();
  const src = useAvatar({ chatId: poster.chatId || "me", avatar: poster.avatar });
  const n = Math.min(items, 24), gap = n > 1 ? 6 : 0, seg = 360 / Math.max(n, 1);
  const stops = Array.from({ length: n }, (_, i) => {
    const c = i < seen ? "var(--wa-ring-seen)" : "var(--wa-accent)", a = i * seg + gap / 2, b = (i + 1) * seg - gap / 2;
    return `transparent ${a - gap / 2}deg ${a}deg, ${c} ${a}deg ${b}deg, transparent ${b}deg ${b + gap / 2}deg`;
  }).join(",");
  return (
    <span className={cn("wa-ring", size === "lg" && "wa-ring-lg")} style={n ? ({ background: `conic-gradient(from 0deg,${stops})` } as CSSProperties) : undefined} data-empty={n ? undefined : "true"}>
      <span className="wa-ring-in">{src ? <img src={src} alt="" /> : <Avatar chat={{ chatId: poster.chatId || "me", name: poster.name }} />}</span>
    </span>
  );
}

// ---- viewer ----
function Story({ groups, start, seen, onSeen, onClose, onDelete }: { groups: StatusGroup[]; start: number; seen: Set<string>; onSeen: (id: string) => void; onClose: () => void; onDelete: (id: string) => Promise<void> }) {
  const [g, setG] = useState(start);
  const first = Math.max(0, groups[start].items.findIndex((i) => !seen.has(i.id)));
  const [i, setI] = useState(first);
  const [ratio, setRatio] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const group = groups[g], item = group?.items[i];
  const file = useStatusFile(item);
  const timed = item?.type === "text" || item?.type === "image";
  const ready = item?.type === "text" || !!file;

  const next = useCallback(() => {
    if (i + 1 < group.items.length) { setI(i + 1); return; }
    if (g + 1 < groups.length) { setG(g + 1); setI(0); return; }
    onClose();
  }, [i, g, group, groups.length, onClose]);
  const prev = useCallback(() => {
    if (i > 0) { setI(i - 1); return; }
    if (g > 0) { setG(g - 1); setI(groups[g - 1].items.length - 1); }
  }, [i, g, groups]);
  useEffect(() => { setRatio(0); setConfirm(false); if (item) onSeen(item.id); }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { root.current?.focus(); }, []);
  // Photo and text advance by a timer that only runs once the file is on screen.
  useEffect(() => {
    if (!timed || !ready || confirm) return;
    const t0 = performance.now();
    const id = setInterval(() => { const r = (performance.now() - t0) / STORY_MS; if (r >= 1) { clearInterval(id); next(); } else setRatio(r); }, 50);
    return () => clearInterval(id);
  }, [item?.id, timed, ready, confirm, next]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [next, prev, onClose]);
  if (!item) return null;

  const who = group.poster.isMe ? "My status" : group.poster.name || (group.poster.phone ? "+" + group.poster.phone : "Unknown contact");
  const bar = (n: number) => (n < i ? 1 : n === i ? Math.min(1, ratio) : 0);
  return (
    <div className="wa-story" ref={root} role="dialog" aria-modal="true" aria-label={`Status of ${who}`} tabIndex={-1}>
      <div className="wa-story-col">
        <div className="wa-story-bars" aria-hidden="true">{group.items.map((x, n) => <span key={x.id}><i style={{ width: `${bar(n) * 100}%` }} /></span>)}</div>
        <div className="wa-story-head">
          <PosterAvatar poster={group.poster} items={0} seen={0} />
          <span className="wa-story-who"><b>{who}</b><time dateTime={item.sentAt} title={fullDate(item.sentAt)}>{relativeTime(item.sentAt, new Date())}</time></span>
          {group.poster.isMe && (confirm ? (
            <span className="wa-story-confirm">Delete this status?
              <Button type="button" size="sm" variant="ghost" className="wa-dbtn wa-ddanger" disabled={busy} onClick={() => { setBusy(true); void onDelete(item.id).then(() => { setConfirm(false); next(); }).catch(() => undefined).finally(() => setBusy(false)); }}>Delete</Button>
              <Button type="button" size="sm" variant="ghost" className="wa-dbtn" onClick={() => setConfirm(false)}>Keep</Button>
            </span>
          ) : <button type="button" className="wa-story-btn" aria-label="Delete this status" onClick={() => setConfirm(true)}><IconTrashSmall /></button>)}
          <button type="button" className="wa-story-btn" aria-label="Close status" onClick={onClose}><IconX /></button>
        </div>
        <div className="wa-story-body" style={item.type === "text" || item.type === "voice" ? { background: bgOf(item) } : undefined} data-type={item.type}>
          {item.type === "text" && <p className="wa-story-text">{item.body}</p>}
          {item.type === "image" && (file?.url ? <img src={file.url} alt={item.body || "Status photo"} /> : <Missing loading={!file} />)}
          {item.type === "video" && (file?.url ? <video key={item.id} src={file.url} controls autoPlay playsInline onTimeUpdate={(e) => setRatio(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} onEnded={next} /> : <Missing loading={!file} />)}
          {item.type === "voice" && (file?.url ? <audio key={item.id} src={file.url} controls autoPlay onTimeUpdate={(e) => setRatio(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} onEnded={next} /> : <Missing loading={!file} />)}
          {item.type !== "text" && item.body && <p className="wa-story-caption">{item.body}</p>}
          <button type="button" className="wa-story-nav wa-story-prev" aria-label="Previous status" onClick={prev} disabled={g === 0 && i === 0}><IconChevronLeft /></button>
          <button type="button" className="wa-story-nav wa-story-next" aria-label="Next status" onClick={next}><IconChevronRight /></button>
        </div>
      </div>
    </div>
  );
}
const Missing = ({ loading }: { loading: boolean }) => <div className="wa-story-missing">{loading ? <Spinner /> : <><IconAlert width={26} height={26} /><span>This file is no longer available</span></>}</div>;

// ---- composer ----
function StatusComposer({ open, onOpenChange, onPosted }: { open: boolean; onOpenChange: (o: boolean) => void; onPosted: () => void }) {
  const { api } = useWa();
  const [mode, setMode] = useState<"text" | "media">("text");
  const [text, setText] = useState("");
  const [color, setColor] = useState(STATUS_COLORS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!open) { setText(""); setFile(null); setCaption(""); setMode("text"); } }, [open]);
  useEffect(() => { if (!file) { setPreview(""); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (!/^(image|video)\//.test(f.type)) { toast.error("Pick a photo or a video"); return; }
    if (f.size > UPLOAD_MAX) { toast.error("That file is too large", { description: "Status files up to 5 MB can be posted from Floq." }); return; }
    setFile(f);
  };
  const post = async () => {
    setBusy(true);
    try {
      if (mode === "text") await api("/status/text", { method: "POST", body: { text: text.trim(), backgroundColor: color } });
      else if (file) {
        const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Could not read the file")); r.readAsDataURL(file); });
        await api(file.type.startsWith("video/") ? "/status/video" : "/status/image", { method: "POST", body: { mime: file.type, filename: file.name, data, caption: caption.trim() } });
      }
      toast.success("Status posted");
      onOpenChange(false);
      onPosted();
    } catch (e) { fail("Status not posted", e); }
    finally { setBusy(false); }
  };
  const ok = mode === "text" ? !!text.trim() : !!file;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wa-portal wa-mdlg wa-sc">
        <DialogHeader><DialogTitle>New status</DialogTitle><DialogDescription>Visible to your contacts for 24 hours.</DialogDescription></DialogHeader>
        <div className="wa-sc-tabs" role="tablist" aria-label="Status type">
          <button type="button" role="tab" aria-selected={mode === "text"} className="wa-chip" onClick={() => setMode("text")}><IconTextT />Text</button>
          <button type="button" role="tab" aria-selected={mode === "media"} className="wa-chip" onClick={() => setMode("media")}><IconImageSmall />Photo or video</button>
        </div>
        {mode === "text" ? (
          <>
            <div className="wa-sc-preview" style={{ background: color }}>
              <textarea value={text} maxLength={TEXT_MAX} placeholder="Type a status" aria-label="Status text" autoFocus onChange={(e) => setText(e.target.value)} />
            </div>
            <div className="wa-swatches wa-swatches-bg" role="radiogroup" aria-label="Background colour">
              {STATUS_COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Background ${c}`} className="wa-swatch" style={{ background: c }} onClick={() => setColor(c)} />)}
            </div>
          </>
        ) : (
          <>
            <input ref={pick} type="file" accept="image/*,video/*" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
            {file ? (
              <div className="wa-sc-media">{file.type.startsWith("video/") ? <video src={preview} controls muted /> : <img src={preview} alt="Selected photo" />}</div>
            ) : (
              <button type="button" className="wa-sc-drop" onClick={() => pick.current?.click()}><IconImageSmall /><b>Choose a photo or video</b><span>Up to 5 MB</span></button>
            )}
            {file && <div className="wa-sc-cap"><input type="text" value={caption} maxLength={700} placeholder="Add a caption" aria-label="Caption" onChange={(e) => setCaption(e.target.value)} /><Button type="button" variant="ghost" size="sm" className="wa-dbtn" onClick={() => pick.current?.click()}>Change</Button></div>}
          </>
        )}
        <DialogFooter className="wa-dfoot">
          <Button type="button" variant="ghost" className="wa-dbtn" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="wa-dbtn wa-dprimary" disabled={!ok || busy} onClick={() => void post()}>{busy ? "Posting" : "Post status"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- list ----
/** The Status pane: my status, then every contact who posted in the last 24 hours with a ring around the avatar. Opening one plays it full screen. */
export function StatusView({ onClose }: { onClose?: () => void }) {
  const { api, pluginId, features } = useWa();
  const [groups, setGroups] = useState<StatusGroup[] | null>(null);
  const [error, setError] = useState("");
  const [seen, setSeen] = useState<Set<string>>(loadSeen);
  const [playing, setPlaying] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try { setGroups(await api<StatusGroup[]>("/status/list")); setError(""); }
    catch (e) { setError(errorCode(e) === "unsupported" || errorStatus(e) === 501 ? "This WAHA engine does not support status updates." : asText(e)); }
  }, [api]);
  useEffect(() => { if (features.status) void load(); }, [load, features.status]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  useWaEvent("status", () => void load());
  const markSeen = useCallback((id: string) => setSeen((s) => { if (s.has(id)) return s; const n = new Set(s); n.add(id); saveSeen(n); return n; }), []);
  const del = async (id: string) => {
    try { await api("/status/delete", { method: "POST", body: { id } }); await load(); toast.success("Status deleted"); }
    catch (e) { fail("Status not deleted", e); throw e; }
  };

  const mine = groups?.find((g) => g.poster.isMe), others = groups?.filter((g) => !g.poster.isMe) ?? [];
  const order = [...(mine ? [mine] : []), ...others];
  const countSeen = (g: StatusGroup) => g.items.filter((x) => seen.has(x.id)).length;
  const row = (g: StatusGroup, label: string, sub: string) => (
    <li key={g.poster.chatId + g.poster.isMe}>
      <button type="button" className="wa-row wa-srow" onClick={() => setPlaying(order.indexOf(g))} aria-label={`${label}, ${sub}`}>
        <PosterAvatar poster={g.poster} items={g.items.length} seen={g.poster.isMe ? g.items.length : countSeen(g)} />
        <span className="wa-body"><span className="wa-line"><span className="wa-name">{label}</span></span><span className="wa-line"><span className="wa-preview"><span>{sub}</span></span></span></span>
      </button>
    </li>
  );
  const last = (g: StatusGroup) => g.items[g.items.length - 1].sentAt;

  return (
    <section className="wa-pane wa-sv" aria-label="Status">
      <div className="wa-head">
        {onClose && <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Back to chats" onClick={onClose}><IconArrowLeft /></Button>}
        <h2 className="wa-title">Status</h2>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Refresh status" onClick={() => void load()}><IconRefresh /></Button></TooltipTrigger><TooltipContent>Refresh</TooltipContent></Tooltip>
      </div>
      <div className="wa-scroll">
        {!features.status ? <div className="wa-center"><IconStatus width={28} height={28} /><strong>Status is not available</strong><p>This WAHA engine does not support status updates.</p></div>
          : error && !groups ? <div className="wa-center"><IconAlert width={28} height={28} /><strong>Could not load status</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={() => void load()}>Try again</Button></div>
          : !groups ? <div className="wa-center"><Spinner />Loading status</div>
          : (
            <ul className="wa-list">
              {mine ? row(mine, "My status", `${mine.items.length} ${mine.items.length === 1 ? "update" : "updates"} · ${timeOf(last(mine))}`) : (
                <li><button type="button" className="wa-row wa-srow" onClick={() => setComposing(true)}><span className="wa-ring" data-empty="true"><span className="wa-ring-in"><Avatar chat={{ chatId: "me", name: "Me" }} /><span className="wa-ring-plus" aria-hidden="true"><IconPlusSmall /></span></span></span><span className="wa-body"><span className="wa-line"><span className="wa-name">My status</span></span><span className="wa-line"><span className="wa-preview"><span>Add to my status</span></span></span></span></button></li>
              )}
              {others.length > 0 && <li className="wa-ssec" aria-hidden="true">Recent updates</li>}
              {others.map((g) => row(g, displayName({ chatId: g.poster.chatId, name: g.poster.name, phone: g.poster.phone }), relativeTime(last(g), now)))}
              {others.length === 0 && <li className="wa-quiet">No status updates from your contacts yet. New ones show up here for 24 hours.</li>}
            </ul>
          )}
      </div>
      {features.status && groups && (
        <Tooltip><TooltipTrigger asChild><button type="button" className="wa-fab" aria-label="Add status" onClick={() => setComposing(true)}><IconPlusSmall /></button></TooltipTrigger><TooltipContent side="left">Add status</TooltipContent></Tooltip>
      )}
      {playing !== null && order[playing] && <Story groups={order} start={playing} seen={seen} onSeen={markSeen} onClose={() => setPlaying(null)} onDelete={del} />}
      <StatusComposer open={composing} onOpenChange={setComposing} onPosted={() => void load()} />
    </section>
  );
}
