import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from "react";
import { cn } from "@/plugins/kit";
import type { Message } from "../shared/chat";
import { docKind, fakePeaks, fitBox, Lru, peaksOf } from "../shared/format";
import { formatBytes, formatDuration } from "./composer-utils";
import { useWa, errorStatus, errorCode, type Api } from "./context";
import { Avatar } from "./avatar";
import { IconBan, IconDownload, IconFileText, IconImage, IconPause, IconPlay, IconRefresh, IconVideo } from "./icons-bubbles";
import { Spinner } from "./icons";

/** A loaded file: bytes as a Blob plus an object URL. Entries in use (refs > 0) are never evicted. */
export interface MediaEntry { url: string; blob: Blob; mime: string; filename: string; size: number; refs: number }
const MAX_ENTRIES = 60;
const cache = new Lru<MediaEntry>(MAX_ENTRIES, (_k, e) => URL.revokeObjectURL(e.url), (e) => e.refs <= 0);
const inflight = new Map<string, Promise<MediaEntry>>();
const peaksCache = new Lru<number[]>(200);

export const mediaCacheSize = () => cache.size;
export const peekMedia = (id: string) => cache.get(id);

function b64Blob(data: string, mime: string): Blob {
  const bin = atob(data), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "application/octet-stream" });
}

/** GET /media?id= once per message id, shared by every bubble, the lightbox and the menu. */
export function fetchMedia(api: Api, id: string): Promise<MediaEntry> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(id);
  if (!p) {
    p = api<{ mime: string; filename: string; size: number; data: string }>("/media?id=" + encodeURIComponent(id))
      .then((r) => {
        if (!r || typeof r.data !== "string") throw Object.assign(new Error("No file"), { status: 404, code: "media_unavailable" });
        const blob = b64Blob(r.data, r.mime);
        const e: MediaEntry = { url: URL.createObjectURL(blob), blob, mime: r.mime || blob.type, filename: r.filename || "file", size: r.size ?? blob.size, refs: 0 };
        cache.set(id, e);
        return e;
      })
      .finally(() => { inflight.delete(id); });
    inflight.set(id, p);
  }
  return p;
}

export type MediaStatus = "idle" | "loading" | "ready" | "error" | "unavailable";
/** Loads a message's file. With auto it starts as soon as the element is on screen, else on load(). */
export function useMedia(m: Message, auto = false, visible = true) {
  const { api } = useWa();
  const id = m.id;
  const [entry, setEntry] = useState<MediaEntry | undefined>(() => cache.get(id));
  const [status, setStatus] = useState<MediaStatus>(() => (cache.get(id) ? "ready" : m.media?.available === false ? "unavailable" : "idle"));
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!entry) return; entry.refs++; return () => { entry.refs--; cache.trim(); }; }, [entry]);
  const load = useCallback(() => {
    setStatus("loading");
    fetchMedia(api, id).then(
      (e) => { if (alive.current) { setEntry(e); setStatus("ready"); } },
      (e) => { if (alive.current) setStatus(errorStatus(e) === 404 || errorCode(e) === "media_unavailable" ? "unavailable" : "error"); },
    );
  }, [api, id]);
  useEffect(() => { if (auto && visible && status === "idle" && !m.localUrl) load(); }, [auto, visible, status, load, m.localUrl]);
  return { status, entry, url: m.localUrl ?? entry?.url, load, retry: load };
}

/** True once the element has been near the viewport. */
export function useInView<T extends Element>(rootMargin = "320px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return [ref, seen] as const;
}

/** Saves a message's file through a temporary <a download>. */
export async function downloadMedia(api: Api, m: Message): Promise<void> {
  const e = m.localUrl && !cache.has(m.id) ? undefined : await fetchMedia(api, m.id);
  const a = document.createElement("a");
  a.href = e?.url ?? m.localUrl ?? "";
  a.download = m.media?.filename || e?.filename || "file";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** "Not available here" with a retry. */
export function MediaGone({ onRetry, busy, compact }: { onRetry: () => void; busy?: boolean; compact?: boolean }) {
  return (
    <div className={cn("wa-gone", compact && "wa-gone-c")} role="status">
      <IconBan />
      <span>Not available here. Open WhatsApp on your phone to view it.</span>
      <button type="button" className="wa-linkbtn" onClick={onRetry} disabled={busy}><IconRefresh />Retry</button>
    </div>
  );
}

const box = (m: Message, sticker?: boolean): CSSProperties => {
  const b = sticker ? fitBox(m.media?.width, m.media?.height, 170, 170) : fitBox(m.media?.width, m.media?.height);
  return { width: b.width, aspectRatio: b.width + " / " + b.height, maxWidth: "100%" };
};

/** Image or sticker: reserves its box from the file's size, loads when scrolled into view, click opens the lightbox. */
export function ImageMedia({ m, sticker, onOpen }: { m: Message; sticker?: boolean; onOpen?: (id: string) => void }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const { status, url, retry } = useMedia(m, true, seen);
  const [decoded, setDecoded] = useState(false);
  const alt = sticker ? "Sticker" : m.body ? "Photo: " + m.body : "Photo";
  return (
    <div ref={ref} className={cn("wa-img", sticker && "wa-sticker")} style={box(m, sticker)}>
      {url ? (
        <button type="button" className="wa-img-btn" aria-label={"Open " + alt.toLowerCase()} onClick={() => onOpen?.(m.id)} disabled={sticker}>
          <img src={url} alt={alt} decoding="async" draggable={false} className={cn(decoded && "wa-in")} onLoad={() => setDecoded(true)} />
        </button>
      ) : status === "unavailable" || status === "error" ? (
        <MediaGone onRetry={retry} compact />
      ) : (
        <div className="wa-skel" aria-busy="true" aria-label="Loading photo">{status === "loading" ? <Spinner /> : <IconImage />}</div>
      )}
    </div>
  );
}

/** Video: a poster with a play button; a click loads it and plays inline. A gif plays muted in a loop as soon as it is in view. */
export function VideoMedia({ m }: { m: Message }) {
  const gif = Boolean(m.media?.gif);
  const [ref, seen] = useInView<HTMLDivElement>();
  const [armed, setArmed] = useState(false);
  const { status, url, load, retry } = useMedia(m, gif, seen);
  const dur = m.media?.duration;
  useEffect(() => { if (armed && status === "idle") load(); }, [armed, status, load]);
  return (
    <div ref={ref} className="wa-img wa-video" style={box(m)}>
      {url && (armed || gif) ? (
        <video src={url} className="wa-in" controls={!gif} autoPlay muted={gif} loop={gif} playsInline preload="metadata" aria-label={gif ? "GIF" : "Video"} />
      ) : status === "unavailable" || status === "error" ? (
        <MediaGone onRetry={retry} compact />
      ) : (
        <button type="button" className="wa-vposter" aria-label={"Play video" + (dur ? ", " + formatDuration(dur * 1000) : "")} onClick={() => { setArmed(true); if (status === "idle") load(); }}>
          <span className="wa-vplay">{armed && status === "loading" ? <Spinner /> : <IconPlay />}</span>
          <span className="wa-vmeta"><IconVideo />{dur ? formatDuration(dur * 1000) : gif ? "GIF" : "Video"}</span>
        </button>
      )}
    </div>
  );
}

/** Document card: icon by extension, file name, size and a download button. */
export function DocumentMedia({ m }: { m: Message }) {
  const { api } = useWa();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(m.media?.available === false);
  const name = m.media?.filename || m.body || "Document";
  const k = docKind(name, m.media?.mime);
  const go = async () => {
    setBusy(true);
    try { await downloadMedia(api, m); setGone(false); }
    catch (e) { if (errorStatus(e) === 404 || errorCode(e) === "media_unavailable") setGone(true); }
    finally { setBusy(false); }
  };
  return (
    <div className="wa-doc-w">
      <div className="wa-doc">
        <span className={cn("wa-doc-ico", "wa-k-" + k.kind)} aria-hidden="true">{k.ext ? <b>{k.ext.slice(0, 4)}</b> : <IconFileText />}</span>
        <span className="wa-doc-t"><b title={name}>{name}</b><span>{[k.ext.toUpperCase(), m.media?.size ? formatBytes(m.media.size) : ""].filter(Boolean).join(" · ") || "Document"}</span></span>
        <button type="button" className="wa-doc-dl" aria-label={"Download " + name} title="Download" disabled={busy || gone} onClick={() => void go()}>{busy ? <Spinner /> : <IconDownload />}</button>
      </div>
      {gone && <MediaGone onRetry={() => void go()} busy={busy} compact />}
    </div>
  );
}

// ---- voice notes and audio ----

let current: HTMLAudioElement | null = null;
const SPEEDS = [1, 1.5, 2];
const BARS = 40;

async function decodePeaks(blob: Blob): Promise<number[] | null> {
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC || blob.size > 6 * 1024 * 1024) return null;
  let ctx: AudioContext | null = null;
  try {
    ctx = new AC();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return peaksOf(buf.getChannelData(0), BARS);
  } catch { return null; }
  finally { void ctx?.close().catch(() => undefined); }
}

/** WhatsApp-style player: play/pause, a seekable waveform, elapsed / total time, speed 1x / 1.5x / 2x; only one plays at a time. */
export function AudioPlayer({ m, ptt }: { m: Message; ptt?: boolean }) {
  const { me, chats } = useWa();
  const { status, entry, url, load, retry } = useMedia(m);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(m.media?.duration ?? 0);
  const [speed, setSpeed] = useState(1);
  const [want, setWant] = useState(false);
  const seekTo = useRef<number | null>(null);
  const [peaks, setPeaks] = useState<number[]>(() => peaksCache.get(m.id) ?? fakePeaks(m.id, BARS));

  useEffect(() => {
    if (!entry || !ptt || peaksCache.has(m.id)) return;
    let live = true;
    void decodePeaks(entry.blob).then((p) => { if (p && live) { peaksCache.set(m.id, p); setPeaks(p); } });
    return () => { live = false; };
  }, [entry, ptt, m.id]);

  useEffect(() => {
    const a = audio.current;
    if (!a || !url || !want) return;
    setWant(false);
    if (seekTo.current !== null) { a.currentTime = seekTo.current; seekTo.current = null; }
    void a.play().catch(() => undefined);
  }, [url, want]);
  useEffect(() => () => { if (current === audio.current) current = null; }, []);

  const toggle = () => {
    const a = audio.current;
    if (!url || !a) { setWant(true); if (status === "idle" || status === "error") load(); return; }
    if (a.paused) void a.play().catch(() => undefined); else a.pause();
  };
  const seek = (f: number) => {
    const a = audio.current, d = dur || a?.duration || 0;
    if (!d) return;
    const to = Math.min(d, Math.max(0, f * d));
    if (a && url) { a.currentTime = to; setT(to); }
    else { seekTo.current = to; setT(to); setWant(true); if (status === "idle" || status === "error") load(); }
  };
  const onBars = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const at = (x: number) => seek((x - r.left) / Math.max(1, r.width));
    at(e.clientX);
    const move = (ev: PointerEvent) => at(ev.clientX), up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onKey = (e: RKeyboardEvent) => {
    const d = dur || audio.current?.duration || 0;
    if (!d) return;
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -5 : 0;
    if (step) { e.preventDefault(); seek((t + step) / d); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
  };
  const cycle = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const frac = dur ? Math.min(1, t / dur) : 0;
  const who = m.fromMe ? { chatId: "me", name: me?.name ?? "" } : (chats.find((c) => c.chatId === m.sender) ?? { chatId: m.sender || "?", name: m.senderName ?? "" });
  const label = ptt ? "Voice message" : m.media?.filename || "Audio";
  if (status === "unavailable") return <MediaGone onRetry={retry} compact />;
  return (
    <div className={cn("wa-audio", ptt && "wa-ptt", m.fromMe && "wa-audio-me")}>
      {ptt && !m.fromMe && <Avatar chat={who} small />}
      <button type="button" className="wa-aplay" aria-label={(playing ? "Pause " : "Play ") + label.toLowerCase()} onClick={toggle}>
        {status === "loading" || (want && status !== "error") ? <Spinner /> : playing ? <IconPause /> : <IconPlay />}
      </button>
      <div className="wa-abody">
        <div className="wa-bars" role="slider" tabIndex={0} aria-label={label + " position"} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} aria-valuetext={formatDuration(t * 1000) + " of " + formatDuration(dur * 1000)}
          onPointerDown={onBars} onKeyDown={onKey}>
          {peaks.map((p, i) => <i key={i} data-on={(i + 0.5) / peaks.length <= frac ? "1" : undefined} style={{ height: Math.round(p * 100) + "%" }} />)}
          <span className="wa-knob" style={{ left: frac * 100 + "%" }} />
        </div>
        <div className="wa-ameta">
          <span className="wa-atime">{formatDuration((playing || t > 0 ? t : dur) * 1000)}</span>
          {!ptt && m.media?.filename && <span className="wa-aname" title={m.media.filename}>{m.media.filename}</span>}
        </div>
      </div>
      {(playing || speed !== 1) && <button type="button" className="wa-speed" aria-label={"Playback speed " + speed + "x"} onClick={cycle}>{speed}x</button>}
      {ptt && m.fromMe && <Avatar chat={who} small />}
      {url && (
        <audio ref={audio} src={url} preload="metadata"
          onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onPlay={(e) => { if (current && current !== e.currentTarget) current.pause(); current = e.currentTarget; e.currentTarget.playbackRate = speed; setPlaying(true); }}
          onPause={() => setPlaying(false)}
          onEnded={(e) => { setPlaying(false); setT(0); e.currentTarget.currentTime = 0; }}
          onError={() => setPlaying(false)} />
      )}
    </div>
  );
}
