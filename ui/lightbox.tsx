import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { Message } from "../shared/chat";
import { downloadMedia, useMedia } from "./media";
import { useWa } from "./context";
import { IconArrowLeft, IconArrowRight, IconClose, IconDownload, IconZoomIn, IconZoomOut } from "./icons-bubbles";
import { Spinner } from "./icons";

const MIN = 1, MAX = 5;

function Slide({ m, scale, pan, onPan }: { m: Message; scale: number; pan: { x: number; y: number }; onPan: (p: { x: number; y: number }) => void }) {
  const { status, url, retry } = useMedia(m, true, true);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  if (!url) {
    return (
      <div className="wa-lb-state">
        {status === "unavailable" || status === "error"
          ? <><span>Not available here. Open WhatsApp on your phone to view it.</span><button type="button" className="wa-linkbtn" onClick={retry}>Retry</button></>
          : <Spinner />}
      </div>
    );
  }
  const down = (e: RPointerEvent) => { if (scale > 1) { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; e.currentTarget.setPointerCapture(e.pointerId); } };
  const move = (e: RPointerEvent) => { const d = drag.current; if (d) onPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }); };
  return (
    <img src={url} alt={m.body || "Photo"} draggable={false} decoding="async" data-zoom={scale > 1 ? "1" : undefined}
      style={{ transform: "translate(" + pan.x + "px," + pan.y + "px) scale(" + scale + ")" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={() => onPan({ x: 0, y: 0 })} />
  );
}

/** Full-view image with zoom (buttons, wheel, drag), download, Esc to close and arrows between the chat's images. */
export function Lightbox({ items, index, onIndex, onClose }: { items: Message[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { api } = useWa();
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const root = useRef<HTMLDivElement>(null);
  const m = items[index];
  const reset = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const go = (d: number) => { const n = index + d; if (n >= 0 && n < items.length) { reset(); onIndex(n); } };
  const zoom = (k: number) => { const s = Math.min(MAX, Math.max(MIN, +(scale * k).toFixed(2))); setScale(s); if (s === 1) setPan({ x: 0, y: 0 }); };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);
  // Neighbours load ahead so the arrows feel instant.
  const next = items[index + 1], before = items[index - 1];
  useMedia(next ?? m, Boolean(next), true);
  useMedia(before ?? m, Boolean(before), true);
  if (!m) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "+" || e.key === "=") zoom(1.25);
    else if (e.key === "-") zoom(0.8);
    else if (e.key === "0") reset();
    else if (e.key === "Tab") {
      const f = [...(root.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  return (
    <div ref={root} className="wa-lb" role="dialog" aria-modal="true" aria-label="Photo viewer" tabIndex={-1} onKeyDown={onKey}
      onWheel={(e) => { if (e.deltaY) zoom(e.deltaY < 0 ? 1.15 : 0.87); }}
      onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("wa-lb-stage")) onClose(); }}>
      <div className="wa-lb-top">
        <span className="wa-lb-count" aria-live="polite">{items.length > 1 ? (index + 1) + " of " + items.length : ""}</span>
        <button type="button" className="wa-lb-btn" aria-label="Zoom out" onClick={() => zoom(0.8)} disabled={scale <= MIN}><IconZoomOut /></button>
        <button type="button" className="wa-lb-btn" aria-label="Zoom in" onClick={() => zoom(1.25)} disabled={scale >= MAX}><IconZoomIn /></button>
        <button type="button" className="wa-lb-btn" aria-label="Download" onClick={() => void downloadMedia(api, m).catch(() => undefined)}><IconDownload /></button>
        <button type="button" className="wa-lb-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
      </div>
      <div className="wa-lb-stage"><Slide key={m.id} m={m} scale={scale} pan={pan} onPan={setPan} /></div>
      {index > 0 && <button type="button" className="wa-lb-btn wa-lb-prev" aria-label="Previous photo" onClick={() => go(-1)}><IconArrowLeft /></button>}
      {index < items.length - 1 && <button type="button" className="wa-lb-btn wa-lb-next" aria-label="Next photo" onClick={() => go(1)}><IconArrowRight /></button>}
      {m.body && <div className="wa-lb-cap">{m.body}</div>}
    </div>
  );
}
