import { createContext, memo, useContext, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/plugins/kit";
import { fullDate, hueOf, quoteAuthor, quoteText, timeOf, chatKind, type Chat, type Message } from "../shared/chat";
import { ACK_LABEL, ackState, callLabel, emojiOnly, mapsUrl, menuPlan, messageKind, parseFormat, safeHref, splitHighlight, type Block, type Inline, type MenuKey } from "../shared/format";
import { formatPhoneDisplay } from "../shared/phone";
import { Avatar } from "./avatar";
import { useWa } from "./context";
import { IconBan, IconCallMissed, IconCheckCircle, IconExternal, IconForward, IconMapPin, IconPhone, IconPin, IconSmile, IconStarFilled, IconTick1, IconTick2, IconTickClock, IconTickFail, IconVideo } from "./icons-bubbles";
import { IconFile, IconReply } from "./icons";
import { AudioPlayer, DocumentMedia, ImageMedia, VideoMedia } from "./media";
import { MessageMenu } from "./message-menu";

export type LogAction = "react" | "star" | "pin" | "delete" | "forward" | "info" | "vote";
/** What every bubble of a log shares; the functions are stable so memoised rows do not re-render. */
export interface LogApi {
  chat: Chat;
  onReply?: (m: Message) => void;
  onEdit?: (m: Message) => void;
  act: (action: LogAction, m: Message, arg?: unknown) => void | Promise<void>;
  jump: (id: string) => void;
  openImage: (id: string) => void;
  /** Opens the full emoji picker for a message, anchored to its bubble. */
  openPicker: (m: Message, anchor: HTMLElement) => void;
  askDelete: (m: Message) => void;
  download: (m: Message) => void;
  mentionName: (id: string) => string;
  highlight: string;
}
export const LogCtx = createContext<LogApi | null>(null);
const useLog = () => { const v = useContext(LogCtx); if (!v) throw new Error("bubble outside the log"); return v; };

/** Bar and name colour of a quote: the accent for your own message, the sender's hue otherwise. */
export const quoteStyle = (q: { fromMe: boolean; sender: string }, chat: Chat) => (q.fromMe ? undefined : ({ "--wa-qh": hueOf(q.sender || chat.chatId) } as CSSProperties));

export const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const LONG_PRESS_MS = 480;

// ---- text ----
function Hl({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  return <>{splitHighlight(text, term).map((p, i) => (p.hit ? <mark key={i} className="wa-mark">{p.v}</mark> : p.v))}</>;
}
function Inlines({ nodes, term, name }: { nodes: Inline[]; term: string; name: (id: string) => string }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text": return <Hl key={i} text={n.v} term={term} />;
          case "b": return <strong key={i}><Inlines nodes={n.c} term={term} name={name} /></strong>;
          case "i": return <em key={i}><Inlines nodes={n.c} term={term} name={name} /></em>;
          case "s": return <s key={i}><Inlines nodes={n.c} term={term} name={name} /></s>;
          case "code": return <code key={i} className="wa-code"><Hl text={n.v} term={term} /></code>;
          case "link": return <a key={i} className="wa-link" href={n.href} target="_blank" rel="noreferrer noopener"><Hl text={n.v} term={term} /></a>;
          case "mention": return <span key={i} className="wa-at">{name(n.id)}</span>;
        }
      })}
    </>
  );
}
function Blocks({ blocks, term, name, pad }: { blocks: Block[]; term: string; name: (id: string) => string; pad: number }) {
  return (
    <>
      {blocks.map((b, i) => {
        const last = i === blocks.length - 1;
        const spacer = last && pad > 0 && b.t === "p" ? <span className="wa-pad" style={{ width: pad }} aria-hidden="true" /> : null;
        switch (b.t) {
          case "p": return <div key={i} className="wa-p"><Inlines nodes={b.c} term={term} name={name} />{spacer}</div>;
          case "pre": return <pre key={i} className="wa-pre"><code><Hl text={b.v} term={term} /></code></pre>;
          case "quote": return <div key={i} className="wa-bq">{b.c.map((l, j) => <div key={j}><Inlines nodes={l} term={term} name={name} /></div>)}</div>;
          case "list": {
            const items = b.items.map((l, j) => <li key={j}><Inlines nodes={l} term={term} name={name} /></li>);
            return b.ordered ? <ol key={i} className="wa-ol" start={b.start}>{items}</ol> : <ul key={i} className="wa-ul">{items}</ul>;
          }
        }
      })}
    </>
  );
}

// ---- time row ----
export function Ticks({ m }: { m: Pick<Message, "ack" | "pending" | "failed"> }) {
  const s = ackState(m), label = ACK_LABEL[s];
  const common = { role: "img", "aria-label": label } as const;
  if (s === "failed") return <IconTickFail className="wa-tick wa-tick-failed" {...common} aria-label="Not sent" />;
  if (s === "pending") return <IconTickClock className="wa-tick" {...common} />;
  if (s === "sent") return <IconTick1 className="wa-tick" {...common} />;
  return <IconTick2 className={cn("wa-tick", s === "read" && "wa-tick-read")} {...common} />;
}
function Stamp({ m, mode }: { m: Message; mode: "inline" | "flow" | "over" }) {
  const failed = ackState(m) === "failed";
  return (
    <span className={cn("wa-stamp", "wa-stamp-" + mode)} title={failed ? "Not sent. Check your connection and try again." : undefined}>
      {m.pinned && <IconPin className="wa-st-ico" aria-label="Pinned" role="img" />}
      {m.starred && <IconStarFilled className="wa-st-ico" aria-label="Starred" role="img" />}
      {m.edited && !m.deleted && <span className="wa-edited">Edited</span>}
      <time dateTime={m.pending ? undefined : m.sentAt} title={m.pending || failed ? undefined : fullDate(m.sentAt)}>{timeOf(m.sentAt)}</time>
      {m.fromMe && <Ticks m={m} />}
    </span>
  );
}
/** Width the inline time row needs next to the last text line. */
const stampWidth = (m: Message) => 62 + (m.fromMe ? 22 : 0) + (m.edited ? 46 : 0) + (m.starred ? 16 : 0) + (m.pinned ? 16 : 0);

// ---- cards ----
function Preview({ m }: { m: Message }) {
  const p = m.preview;
  if (!p) return null;
  let host = "";
  try { host = new URL(p.url).host.replace(/^www\./, ""); } catch { host = ""; }
  const href = safeHref(p.url);
  const inner = (
    <>
      <b>{p.title || host}</b>
      {p.description && <span className="wa-lp-d">{p.description}</span>}
      {host && <span className="wa-lp-h">{host}</span>}
    </>
  );
  return href ? <a className="wa-lp" href={href} target="_blank" rel="noreferrer noopener">{inner}</a> : <div className="wa-lp">{inner}</div>;
}

function LocationCard({ m }: { m: Message }) {
  const l = m.location;
  if (!l) return null;
  return (
    <div className="wa-loc">
      <div className="wa-map" aria-hidden="true">
        <span className="wa-roads" />
        <span className="wa-pin"><IconMapPin /></span>
      </div>
      <div className="wa-loc-t">
        <b>{l.live ? "Live location" : l.name || "Location"}</b>
        {l.address && <span>{l.address}</span>}
        <span className="wa-coords">{l.lat.toFixed(5)}, {l.lng.toFixed(5)}</span>
      </div>
      <a className="wa-loc-open" href={mapsUrl(l.lat, l.lng)} target="_blank" rel="noreferrer noopener"><IconExternal />Open in maps</a>
    </div>
  );
}

function ContactCards({ m }: { m: Message }) {
  const { openChat } = useWa();
  return (
    <div className="wa-cards">
      {(m.vcards ?? []).map((c, i) => {
        const phone = (c.phones[0] ?? "").replace(/\D/g, "");
        const pretty = c.formatted?.[0] || (phone ? formatPhoneDisplay(phone) : "");
        return (
          <div key={i} className="wa-bcard">
            <div className="wa-card-h">
              <Avatar chat={{ chatId: phone ? phone + "@c.us" : "card" + i, name: c.name }} small />
              <span className="wa-card-t"><b>{c.name || pretty || "Contact"}</b>{pretty && c.name && <span>{pretty}</span>}{c.phones.length > 1 && <span>+{c.phones.length - 1} more</span>}</span>
            </div>
            {phone && <button type="button" className="wa-card-b" onClick={() => openChat(phone + "@c.us", { name: c.name })}>Message</button>}
          </div>
        );
      })}
    </div>
  );
}

function PollCard({ m }: { m: Message }) {
  const { features } = useWa();
  const log = useLog();
  const poll = m.poll;
  const key = JSON.stringify(poll);
  const [local, setLocal] = useState<{ key: string; sel: string[] } | null>(null);
  if (!poll) return null;
  const sel = local && local.key === key ? local.sel : null;
  const voted = poll.options.filter((o) => o.voted).map((o) => o.name);
  const mine = sel ?? voted;
  const can = features.pollVote && !m.pending;
  const count = (o: Poll["options"][number]) => o.votes + (mine.includes(o.name) ? 1 : 0) - (o.voted ? 1 : 0);
  const voters = Math.max(0, poll.voters + (sel ? (mine.length ? 1 : 0) - (voted.length ? 1 : 0) : 0));
  const pick = (name: string) => {
    if (!can) return;
    const next = poll.multiple ? (mine.includes(name) ? mine.filter((x) => x !== name) : [...mine, name]) : mine.includes(name) ? [] : [name];
    setLocal({ key, sel: next });
    void Promise.resolve(log.act("vote", m, next)).catch(() => setLocal(null));
  };
  return (
    <div className="wa-poll">
      <b className="wa-poll-q">{poll.name}</b>
      <span className="wa-poll-h"><IconCheckCircle />{poll.multiple ? "Select one or more" : "Select one"}</span>
      {poll.options.map((o) => {
        const n = count(o), on = mine.includes(o.name);
        return (
          <button key={o.name} type="button" className={cn("wa-opt", on && "wa-opt-on")} role={poll.multiple ? "checkbox" : "radio"} aria-checked={on} disabled={!can} onClick={() => pick(o.name)}>
            <span className="wa-opt-box" aria-hidden="true">{on && <IconTick1 />}</span>
            <span className="wa-opt-t"><span>{o.name}</span><i className="wa-opt-n">{n}</i></span>
            <span className="wa-opt-bar" aria-hidden="true"><i style={{ width: (voters ? Math.min(100, (n / voters) * 100) : 0) + "%" }} /></span>
          </button>
        );
      })}
      {!features.pollVote && <span className="wa-poll-hint">Voting is not available on this WhatsApp engine.</span>}
      <span className="wa-poll-v">{voters} {voters === 1 ? "vote" : "votes"}</span>
    </div>
  );
}
type Poll = NonNullable<Message["poll"]>;

// ---- the row ----
const REACT_CHIP_MAX = 6;
function Reactions({ m }: { m: Message }) {
  const log = useLog();
  const list = m.reactions ?? [];
  if (!list.length) return null;
  return (
    <div className="wa-reacts" role="group" aria-label="Reactions">
      {list.slice(0, REACT_CHIP_MAX).map((r) => (
        <button key={r.emoji} type="button" className={cn("wa-react", r.mine && "wa-react-me")} aria-pressed={r.mine} aria-label={r.emoji + (r.count > 1 ? " " + r.count : "") + (r.mine ? ", your reaction, click to remove" : ", click to react")}
          title={r.mine ? "Click to remove your reaction" : undefined} onClick={() => void log.act("react", m, r.mine ? "" : r.emoji)}>
          <span>{r.emoji}</span>{r.count > 1 && <i>{r.count}</i>}
        </button>
      ))}
    </div>
  );
}

function QuickBar({ m, onClose }: { m: Message; onClose: () => void }) {
  const log = useLog();
  const mine = m.reactions?.find((r) => r.mine)?.emoji ?? "";
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className="wa-qbar" role="toolbar" aria-label="Quick reactions"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
        const b = [...(root.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])], i = b.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "ArrowRight") { e.preventDefault(); b[(i + 1) % b.length]?.focus(); }
        if (e.key === "ArrowLeft") { e.preventDefault(); b[(i - 1 + b.length) % b.length]?.focus(); }
      }}>
      {QUICK.map((e) => (
        <button key={e} type="button" className={cn("wa-qe", mine === e && "wa-qe-on")} aria-label={"React " + e} aria-pressed={mine === e} autoFocus={e === QUICK[0]}
          onClick={() => { void log.act("react", m, mine === e ? "" : e); onClose(); }}>{e}</button>
      ))}
      <button type="button" className="wa-qe wa-qe-more" aria-label="More emoji" onClick={(ev) => { log.openPicker(m, ev.currentTarget.closest(".wa-bubble") as HTMLElement); onClose(); }}>+</button>
    </div>
  );
}

interface RowProps { m: Message; chat: Chat; first: boolean; last: boolean; sender: string }

function Row({ m, chat, first, last, sender }: RowProps) {
  const log = useLog();
  const { features } = useWa();
  const kind = messageKind(m);
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => { if (press.current) { clearTimeout(press.current); press.current = null; } };
  const real = !m.pending && !m.failed && !m.id.startsWith("out-") && !m.id.startsWith("pending-");
  const canReply = Boolean(log.onReply) && real && kind !== "deleted";
  const plan: MenuKey[] = menuPlan(m, features, Date.now(), canReply);
  const mine = m.fromMe;

  if (kind === "system") return <div className="wa-msg wa-sys" data-mid={m.id}><span className="wa-sys-chip">{m.body}</span></div>;
  if (kind === "call") {
    const label = m.call ? callLabel(m.call) : m.body || "Call";
    const missed = label.startsWith("Missed");
    return (
      <div className="wa-msg wa-sys" data-mid={m.id}>
        <span className={cn("wa-sys-chip wa-callrow", missed && "wa-callrow-missed")}>{missed ? <IconCallMissed /> : m.call?.video ? <IconVideo /> : <IconPhone />}{label}<time dateTime={m.sentAt}>{timeOf(m.sentAt)}</time></span>
      </div>
    );
  }

  const text = m.body ?? "";
  const emoji = kind === "text" ? emojiOnly(text) : 0;
  const blocks = kind === "deleted" || emoji ? [] : parseFormat(text, { mentions: m.mentions });
  const hasCaption = blocks.length > 0 && kind !== "text";
  const mediaOnly = (kind === "image" || kind === "video" || kind === "sticker") && !text;
  const endsInPara = blocks.length > 0 && blocks[blocks.length - 1].t === "p";
  const q = m.replyTo;
  const noBg = kind === "sticker";
  const stamp: "inline" | "flow" | "over" = mediaOnly ? "over" : endsInPara ? "inline" : "flow";
  const media = kind === "image" ? <ImageMedia m={m} onOpen={log.openImage} /> : kind === "sticker" ? <ImageMedia m={m} sticker /> : kind === "video" ? <VideoMedia m={m} />
    : kind === "ptt" ? <AudioPlayer m={m} ptt /> : kind === "audio" ? <AudioPlayer m={m} /> : kind === "document" ? <DocumentMedia m={m} />
    : kind === "media" ? <div className="wa-media"><span className="wa-media-ico"><IconFile /></span><span><b>Photo or file</b><span>Open WhatsApp to view it</span></span></div> : null;

  const run = (k: MenuKey) => {
    switch (k) {
      case "reply": log.onReply?.(m); break;
      case "react": setQuick(true); break;
      case "forward": void log.act("forward", m); break;
      case "star": case "unstar": void log.act("star", m, k === "star"); break;
      case "pin": case "unpin": void log.act("pin", m, k === "pin"); break;
      case "copy": void navigator.clipboard?.writeText(text).catch(() => undefined); break;
      case "edit": log.onEdit?.(m); break;
      case "info": void log.act("info", m); break;
      case "delete": log.askDelete(m); break;
      case "download": log.download(m); break;
    }
  };

  return (
    <div className={cn("wa-msg", mine ? "wa-mine" : "wa-theirs", first && "wa-first", last && "wa-last", m.pending && "wa-pending", "wa-k-" + kind)} data-mid={m.id} data-kind={kind}>
      <div className="wa-bw">
      <div className={cn("wa-bubble", noBg && "wa-nobg", mediaOnly && "wa-b-media", (kind === "image" || kind === "video") && "wa-has-media", emoji > 0 && "wa-b-emoji", kind === "deleted" && "wa-b-deleted")}
        onDoubleClick={canReply && kind !== "poll" ? (e) => { if (!(e.target as HTMLElement).closest("a,button,video,audio,[role=slider]")) log.onReply!(m); } : undefined}
        onContextMenu={plan.length ? (e) => { if (window.getSelection()?.toString()) return; e.preventDefault(); setMenu(true); } : undefined}
        // Touch: press and hold a bubble for its menu.
        onPointerDown={plan.length ? (e) => { if (e.pointerType === "mouse") return; cancel(); press.current = setTimeout(() => { press.current = null; setMenu(true); }, LONG_PRESS_MS); } : undefined}
        onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onPointerMove={(e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancel(); }}>
        {sender && <span className="wa-sender" style={{ "--wa-h": hueOf(m.sender) } as CSSProperties}>{sender}</span>}
        {m.forwarded && kind !== "deleted" && <span className="wa-fwd"><IconForward />Forwarded</span>}
        {q && kind !== "deleted" && (
          <button type="button" className={cn("wa-quote", q.fromMe && "wa-quote-me")} style={quoteStyle(q, chat)} disabled={!q.id} aria-label={"Quoted message from " + quoteAuthor(q, chat) + ": " + quoteText(q)} onClick={() => log.jump(q.id)}>
            <b>{quoteAuthor(q, chat)}</b>
            <span>{q.hasMedia && <IconFile />}{quoteText(q)}</span>
          </button>
        )}
        {kind === "deleted" ? (
          <div className="wa-p wa-del"><IconBan />{mine ? "You deleted this message" : "This message was deleted"}{<span className="wa-pad" style={{ width: stampWidth(m) }} aria-hidden="true" />}</div>
        ) : (
          <>
            {kind === "text" && <Preview m={m} />}
            {media}
            {kind === "location" && <LocationCard m={m} />}
            {kind === "vcard" && <ContactCards m={m} />}
            {kind === "poll" && <PollCard m={m} />}
            {emoji > 0 && <div className="wa-emoji-big" data-n={emoji}>{text.trim()}<span className="wa-pad" style={{ width: stampWidth(m) }} aria-hidden="true" /></div>}
            {blocks.length > 0 && <div className={cn("wa-text", hasCaption && "wa-caption")}><Blocks blocks={blocks} term={log.highlight} name={log.mentionName} pad={stamp === "inline" ? stampWidth(m) : 0} /></div>}
            {!text && kind === "text" && !m.preview && <span className="wa-unsupported">Unsupported message</span>}
          </>
        )}
        <Stamp m={m} mode={kind === "deleted" ? "inline" : stamp} />
        {plan.length > 0 && (
          <MessageMenu m={m} plan={plan} open={menu} onOpenChange={setMenu} onRun={run} mine={mine} />
        )}
        {real && kind !== "deleted" && (
          <div className="wa-acts">
            {features.react && <button type="button" className="wa-act" aria-label="React" title="React" aria-expanded={quick} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={() => setQuick((v) => !v)}><IconSmile /></button>}
            {canReply && <button type="button" className="wa-act" aria-label="Reply" title="Reply" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onClick={() => log.onReply!(m)}><IconReply /></button>}
          </div>
        )}
        {quick && <QuickBar m={m} onClose={() => setQuick(false)} />}
      </div>
      <Reactions m={m} />
      </div>
    </div>
  );
}

const cacheKey = new WeakMap<Message, string>();
const keyOf = (m: Message) => { let k = cacheKey.get(m); if (k === undefined) { k = JSON.stringify(m); cacheKey.set(m, k); } return k; };
/** One message of the log. Re-renders only when the message itself or its position in a run changes. */
export const MessageRow = memo(Row, (a, b) => a.first === b.first && a.last === b.last && a.sender === b.sender && a.chat.chatId === b.chat.chatId && (a.m === b.m || keyOf(a.m) === keyOf(b.m)));

export function groupSender(m: Message, chat: Chat): string {
  if ((chat.kind ?? chatKind(chat.chatId)) !== "group" || m.fromMe) return "";
  if (m.senderName) return m.senderName;
  const d = /^(\d{8,15})@/.exec(m.sender)?.[1];
  return d ? formatPhoneDisplay(d) : "";
}
