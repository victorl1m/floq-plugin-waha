import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Input, Tooltip, TooltipContent, TooltipTrigger, cn, toast } from "@/plugins/kit";
import { fullDate, hueOf, timeOf, type Message } from "../shared/chat";
import { errorCode, useWa } from "./context";
import { IconAlert, IconArrowLeft, IconFile, IconRefresh, IconSearch, Spinner } from "./icons";
import { IconMegaphone, IconPlay, IconVerified } from "./icons-more";

export interface Channel { id: string; name: string; description: string; picture: string; verified: boolean; role: string; subscribers?: number }
/** A channel post: the conversation's message plus how many people viewed it. */
export type ChannelMessage = Message & { views?: number };
const asText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const fail = (title: string, e: unknown) => toast.error(title, { description: errorCode(e) === "unsupported" ? "This WAHA engine does not support that for channels." : asText(e) });
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);

function ChannelAvatar({ channel, small }: { channel: Pick<Channel, "id" | "name" | "picture">; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  const letters = (channel.name.match(/[\p{L}\p{N}]/gu) ?? ["#"]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={cn("wa-avatar wa-cavatar", small && "wa-avatar-sm")} style={{ "--wa-h": hueOf(channel.id) } as CSSProperties} aria-hidden="true">
      {channel.picture && !broken ? <img src={channel.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : letters}
    </span>
  );
}

/** Default bubble of a channel post: text, "Photo" / "Video" placeholders, time and views. */
function PostBubble({ m }: { m: ChannelMessage }) {
  const kind = m.type === "image" ? "Photo" : m.type === "video" ? "Video" : m.type === "audio" || m.type === "ptt" ? "Audio" : m.type === "document" ? "Document" : m.hasMedia ? "Media" : "";
  return (
    <div className="wa-msg wa-theirs wa-first wa-last" data-mid={m.id}>
      <div className="wa-bubble">
        {kind && <div className="wa-media"><span className="wa-media-ico">{m.type === "video" ? <IconPlay /> : <IconFile />}</span><span><b>{kind}</b><span>Open WhatsApp to view it</span></span></div>}
        {m.body}
        {!m.body && !kind && <span className="wa-unsupported">Unsupported message</span>}
        {m.reactions && m.reactions.length > 0 && <span className="wa-creacts">{m.reactions.map((r) => <span key={r.emoji}>{r.emoji} {r.count}</span>)}</span>}
        <time className="wa-stamp" dateTime={m.sentAt} title={fullDate(m.sentAt)}>{m.views !== undefined && <span className="wa-views">{compact(m.views)} views</span>}{timeOf(m.sentAt)}</time>
      </div>
    </div>
  );
}

/** The posts of one channel, read-only. `renderMessage` replaces the default bubble (the inbox plugs in its real message bubble). */
export function ChannelMessages({ id, renderMessage }: { id: string; renderMessage?: (m: ChannelMessage) => ReactNode }) {
  const { api } = useWa();
  const [messages, setMessages] = useState<ChannelMessage[] | null>(null);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    try { setMessages((await api<{ messages: ChannelMessage[] }>(`/channel/messages?id=${encodeURIComponent(id)}&limit=50`)).messages ?? []); setError(""); }
    catch (e) { setError(errorCode(e) === "unsupported" ? "This WAHA engine cannot read channel posts." : asText(e)); }
  }, [api, id]);
  useEffect(() => { setMessages(null); setError(""); void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages?.length]);
  if (error && !messages) return <div className="wa-center wa-wall"><IconAlert width={28} height={28} /><strong>Could not load posts</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={() => void load()}>Try again</Button></div>;
  if (!messages) return <div className="wa-center wa-wall"><Spinner />Loading posts</div>;
  if (!messages.length) return <div className="wa-center wa-wall"><span className="wa-note">No posts in this channel yet</span></div>;
  let day = "";
  return (
    <div className="wa-logwrap">
      <div className="wa-log" role="log" aria-label="Channel posts">
        <div className="wa-col">
          {messages.map((m) => {
            const d = new Date(m.sentAt).toDateString(), label = d !== day ? new Date(m.sentAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
            day = d;
            return <div key={m.id} style={{ display: "contents" }}>{label && <span className="wa-day">{label}</span>}{renderMessage ? renderMessage(m) : <PostBubble m={m} />}</div>;
          })}
          <div ref={end} />
        </div>
      </div>
    </div>
  );
}

function ChannelRow({ c, onOpen, action }: { c: Channel; onOpen: () => void; action?: ReactNode }) {
  return (
    <li className="wa-chrow">
      <button type="button" className="wa-row" onClick={onOpen} aria-label={`Open ${c.name || "channel"}`}>
        <ChannelAvatar channel={c} />
        <span className="wa-body">
          <span className="wa-line"><span className="wa-name">{c.name || "Channel"}</span>{c.verified && <IconVerified className="wa-verified" aria-label="Verified" />}</span>
          <span className="wa-line"><span className="wa-preview"><span>{c.subscribers !== undefined ? `${compact(c.subscribers)} followers` : c.description || "Channel"}</span></span></span>
        </span>
      </button>
      {action}
    </li>
  );
}

/** Channels: the ones you follow, a search for more, and a channel's posts. */
export function ChannelsView({ onClose }: { onClose?: () => void }) {
  const { api, features } = useWa();
  const [followed, setFollowed] = useState<Channel[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Channel[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState<Channel | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try { setFollowed((await api<{ channels: Channel[] }>("/channels")).channels ?? []); setError(""); }
    catch (e) { setError(errorCode(e) === "unsupported" ? "This WAHA engine does not support channels." : asText(e)); }
  }, [api]);
  useEffect(() => { if (features.channels) void load(); }, [load, features.channels]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setFound(null); setSearching(false); return; }
    setSearching(true);
    let live = true;
    const t = setTimeout(() => {
      api<{ channels: Channel[] }>(`/channels/search?q=${encodeURIComponent(q)}`).then((r) => { if (live) setFound(r.channels ?? []); }).catch((e) => { if (live) { setFound([]); fail("Search failed", e); } }).finally(() => { if (live) setSearching(false); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [api, query]);

  const isFollowed = (id: string) => !!followed?.some((c) => c.id === id);
  const follow = async (c: Channel, on: boolean) => {
    setBusy(c.id);
    try {
      await api("/channel/follow", { method: "POST", body: { id: c.id, follow: on } });
      await load();
      toast.success(on ? `Following ${c.name || "channel"}` : `Unfollowed ${c.name || "channel"}`);
    } catch (e) { fail(on ? "Could not follow" : "Could not unfollow", e); }
    finally { setBusy(""); }
  };
  const followBtn = (c: Channel) => features.channelFollow && (
    <Button type="button" variant="outline" size="sm" className="wa-btn wa-follow" disabled={busy === c.id} aria-label={isFollowed(c.id) ? `Unfollow ${c.name}` : `Follow ${c.name}`} onClick={() => void follow(c, !isFollowed(c.id))}>{isFollowed(c.id) ? "Following" : "Follow"}</Button>
  );

  if (open) {
    return (
      <section className="wa-pane wa-cv wa-cv-open" aria-label={open.name || "Channel"}>
        <div className="wa-head wa-chat-head">
          <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Back to channels" onClick={() => setOpen(null)}><IconArrowLeft /></Button>
          <ChannelAvatar channel={open} small />
          <div className="wa-who" title={open.name}><b>{open.name || "Channel"}{open.verified && <IconVerified className="wa-verified" aria-label="Verified" />}</b><span>{open.subscribers !== undefined ? `${compact(open.subscribers)} followers` : "Channel"}</span></div>
          {followBtn(open)}
        </div>
        <ChannelMessages id={open.id} />
        <div className="wa-readonly">You can read this channel here. Posting and replying happen in WhatsApp.</div>
      </section>
    );
  }
  const searchingNow = query.trim().length >= 2;
  return (
    <section className="wa-pane wa-cv" aria-label="Channels">
      <div className="wa-head">
        {onClose && <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Back to chats" onClick={onClose}><IconArrowLeft /></Button>}
        <h2 className="wa-title">Channels</h2>
        <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Refresh channels" onClick={() => void load()}><IconRefresh /></Button></TooltipTrigger><TooltipContent>Refresh</TooltipContent></Tooltip>
      </div>
      <div className="wa-search">
        <IconSearch />
        <Input type="text" role="searchbox" value={query} placeholder="Search channels" aria-label="Search channels" autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); setQuery(""); } }} />
      </div>
      <div className="wa-scroll">
        {!features.channels ? <div className="wa-center"><IconMegaphone width={28} height={28} /><strong>Channels are not available</strong><p>This WAHA engine does not support channels.</p></div>
          : searchingNow ? (
            searching && !found ? <div className="wa-center"><Spinner />Searching</div>
              : <ul className="wa-list">{(found ?? []).map((c) => <ChannelRow key={c.id} c={c} onOpen={() => setOpen(c)} action={followBtn(c)} />)}{found?.length === 0 && <li className="wa-quiet">No channels found for “{query.trim()}”.</li>}</ul>
          ) : error && !followed ? <div className="wa-center"><IconAlert width={28} height={28} /><strong>Could not load channels</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={() => void load()}>Try again</Button></div>
          : !followed ? <div className="wa-center"><Spinner />Loading channels</div>
          : followed.length === 0 ? <div className="wa-center"><IconMegaphone width={28} height={28} /><strong>No channels yet</strong><p>Search above to find channels to follow.</p></div>
          : <ul className="wa-list">{followed.map((c) => <ChannelRow key={c.id} c={c} onOpen={() => setOpen(c)} action={followBtn(c)} />)}</ul>}
      </div>
    </section>
  );
}
