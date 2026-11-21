import { useState, type ReactNode } from "react";
import { Button, Input, Tooltip, TooltipContent, TooltipTrigger, cn } from "@/plugins/kit";
import { chatKind, chatTitle, matchesQuery, previewText, relativeTime, type Chat, type MessageType } from "../shared/chat";
import { Avatar } from "./avatar";
import { IconAlert, IconArchive, IconArrowLeft, IconBan, IconCheck, IconChecks, IconClock, IconFile, IconMuted, IconPinned, IconRefresh, IconSearch, Spinner } from "./icons";
import { IconAudio, IconCamera, IconContact, IconImage, IconMic, IconPin, IconPoll } from "./icons-composer";

interface Props {
  chats: Chat[] | null; error: string; selected: string; query: string; now: Date; refreshing: boolean; archivedCount: number; showArchived: boolean;
  onQuery: (q: string) => void; onSelect: (id: string) => void; onRefresh: () => void; onArchived: (show: boolean) => void;
  /** Buttons for the header (new chat, status, channels, account menu) and extras for the filter row and each row (labels, row menu). */
  actions?: ReactNode; banner?: ReactNode; filterExtra?: ReactNode; rowMenu?: (chat: Chat) => ReactNode; rowExtra?: (chat: Chat) => ReactNode; passes?: (chat: Chat) => boolean;
}

type Filter = "all" | "unread" | "groups";
const FILTERS: Array<[Filter, string]> = [["all", "All"], ["unread", "Unread"], ["groups", "Groups"]];
const passes = (c: Chat, f: Filter) => f === "all" || (f === "unread" ? (c.unread ?? 0) > 0 : (c.kind ?? chatKind(c.chatId)) === "group");
const KIND_ICON: Partial<Record<MessageType, (p: { className?: string }) => ReactNode>> = {
  image: IconImage, video: IconCamera, audio: IconAudio, ptt: IconMic, document: IconFile, sticker: IconImage, location: IconPin, vcard: IconContact, poll: IconPoll, deleted: IconBan,
};

/** Delivery state of your last message, as on the phone: clock, one check, two checks, two blue checks. */
function PreviewTick({ ack }: { ack: number }) {
  if (ack < 0) return <IconAlert className="wa-ptick wa-tick-failed" aria-label="Not sent" />;
  if (ack === 0) return <IconClock className="wa-ptick" aria-label="Sending" />;
  if (ack === 1) return <IconCheck className="wa-ptick" aria-label="Sent" />;
  return <IconChecks className={cn("wa-ptick", ack >= 3 && "wa-tick-read")} aria-label={ack >= 3 ? "Read" : "Delivered"} />;
}

function Row({ chat, selected, now, onSelect, menu, extra }: { chat: Chat; selected: boolean; now: Date; onSelect: () => void; menu?: ReactNode; extra?: ReactNode }) {
  const p = previewText(chat);
  const unread = chat.unread ?? 0;
  const KindIcon = p.media || p.kind === "deleted" ? KIND_ICON[p.kind] ?? IconFile : null;
  return (
    <li className="wa-rowwrap">
      <button type="button" className={cn("wa-row", unread > 0 && "wa-unread")} aria-current={selected ? "true" : undefined} onClick={onSelect}>
        <Avatar chat={chat} />
        <span className="wa-body">
          <span className="wa-line"><span className="wa-name">{chatTitle(chat)}</span><span className="wa-time">{relativeTime(chat.lastAt, now)}</span></span>
          <span className="wa-line">
            <span className={cn("wa-preview", p.kind === "deleted" && "wa-preview-quiet")}>
              {chat.lastFromMe && !chat.lastDeleted && <PreviewTick ack={chat.lastAck ?? 1} />}
              {!chat.lastFromMe && p.prefix && <span className="wa-prefix">{p.prefix}</span>}
              {KindIcon && <KindIcon />}<span>{p.text}</span>
            </span>
            {extra}
            {chat.muted && <IconMuted className="wa-rowico" aria-label="Muted" />}
            {chat.pinned && <IconPinned className="wa-rowico" aria-label="Pinned" />}
            {unread > 0 && <span className={cn("wa-pill", chat.muted && "wa-pill-muted")} role="img" aria-label={chat.markedUnread && unread === 1 ? "Marked as unread" : `${unread} unread`}>{chat.markedUnread && unread === 1 ? "" : unread > 99 ? "99+" : unread}</span>}
          </span>
        </span>
      </button>
      {menu && <span className="wa-rowmenu">{menu}</span>}
    </li>
  );
}

/** Left pane: header with actions, search pill, filter chips, the archived entry and the chat rows (or a loading / error / empty state). */
export function ChatList({ chats, error, selected, query, now, refreshing, archivedCount, showArchived, onQuery, onSelect, onRefresh, onArchived, actions, banner, filterExtra, rowMenu, rowExtra, passes: extraPass }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = chats?.filter((c) => passes(c, filter) && matchesQuery(c, query) && (extraPass ? extraPass(c) : true)) ?? [];
  return (
    <section className="wa-pane wa-list-pane" aria-label="Chats">
      <div className="wa-head">
        {showArchived && <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Back to chats" onClick={() => onArchived(false)}><IconArrowLeft /></Button>}
        <h2 className="wa-title">{showArchived ? "Archived" : "Chats"}</h2>
        {!showArchived && actions}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className={cn("wa-iconbtn", refreshing && "wa-spin-on")} aria-label="Refresh chats" onClick={onRefresh}><IconRefresh /></Button>
          </TooltipTrigger>
          <TooltipContent>Refresh chats</TooltipContent>
        </Tooltip>
      </div>
      {banner}
      <div className="wa-search">
        <IconSearch />
        <Input type="text" role="searchbox" value={query} placeholder="Search" aria-label="Search chats" autoComplete="off" spellCheck={false}
          onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); onQuery(""); } }} />
      </div>
      <div className="wa-chips" role="group" aria-label="Filter chats">
        {FILTERS.map(([id, label]) => <button key={id} type="button" className="wa-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
        {filterExtra}
      </div>
      {!showArchived && archivedCount > 0 && !query.trim() && filter === "all" && (
        <button type="button" className="wa-archived" onClick={() => onArchived(true)}><IconArchive /><span>Archived</span><b>{archivedCount}</b></button>
      )}
      {error && chats === null ? (
        <div className="wa-center"><IconAlert width={28} height={28} /><strong>Could not load chats</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={onRefresh}>Try again</Button></div>
      ) : chats === null ? (
        <div className="wa-center"><Spinner />Loading chats…</div>
      ) : chats.length === 0 ? (
        <div className="wa-center"><strong>{showArchived ? "No archived chats" : "No messages yet"}</strong><p>{showArchived ? "Chats you archive are kept here." : "New WhatsApp messages show up here as they arrive."}</p></div>
      ) : shown.length === 0 ? (
        <p className="wa-quiet">{query.trim() ? `No chats match “${query.trim()}”.` : filter === "unread" ? "No unread chats." : filter === "groups" ? "No group chats." : "No chats here."}</p>
      ) : (
        <div className="wa-scroll"><ul className="wa-list" role="list">{shown.map((c) => <Row key={c.chatId} chat={c} selected={selected === c.chatId} now={now} onSelect={() => onSelect(c.chatId)} menu={rowMenu?.(c)} extra={rowExtra?.(c)} />)}</ul></div>
      )}
    </section>
  );
}
