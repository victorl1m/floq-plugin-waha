import { useState } from "react";
import { Button, Input, Tooltip, TooltipContent, TooltipTrigger, cn } from "@/plugins/kit";
import { chatKind, displayName, matchesQuery, previewText, relativeTime, type Chat } from "../shared/chat";
import { Avatar } from "./avatar";
import { IconAlert, IconCheck, IconFile, IconRefresh, IconSearch, Spinner } from "./icons";

interface Props {
  chats: Chat[] | null; error: string; selected: string; query: string; now: Date; refreshing: boolean;
  onQuery: (q: string) => void; onSelect: (id: string) => void; onRefresh: () => void;
}

type Filter = "all" | "unread" | "groups";
const FILTERS: Array<[Filter, string]> = [["all", "All"], ["unread", "Unread"], ["groups", "Groups"]];
const passes = (c: Chat, f: Filter) => f === "all" || (f === "unread" ? (c.unread ?? 0) > 0 : (c.kind ?? chatKind(c.chatId)) === "group");

function Row({ chat, selected, now, onSelect }: { chat: Chat; selected: boolean; now: Date; onSelect: () => void }) {
  const p = previewText(chat);
  const unread = chat.unread ?? 0;
  return (
    <li>
      <button type="button" className={cn("wa-row", unread > 0 && "wa-unread")} aria-current={selected ? "true" : undefined} onClick={onSelect}>
        <Avatar chat={chat} />
        <span className="wa-body">
          <span className="wa-line"><span className="wa-name">{displayName(chat)}</span><span className="wa-time">{relativeTime(chat.lastAt, now)}</span></span>
          <span className="wa-line">
            <span className="wa-preview">{p.prefix && <IconCheck className="wa-ptick" aria-label="You:" />}{p.media && <IconFile />}<span>{p.text}</span></span>
            {unread > 0 && <span className="wa-pill" role="img" aria-label={`${unread} unread`}>{unread > 99 ? "99+" : unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Left pane: header with refresh, search pill, filter chips and the chat rows (or a loading / error / empty state). */
export function ChatList({ chats, error, selected, query, now, refreshing, onQuery, onSelect, onRefresh }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = chats?.filter((c) => passes(c, filter) && matchesQuery(c, query)) ?? [];
  return (
    <section className="wa-pane wa-list-pane" aria-label="Chats">
      <div className="wa-head">
        <h2 className="wa-title">Chats</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className={cn("wa-iconbtn", refreshing && "wa-spin-on")} aria-label="Refresh chats" onClick={onRefresh}><IconRefresh /></Button>
          </TooltipTrigger>
          <TooltipContent>Refresh chats</TooltipContent>
        </Tooltip>
      </div>
      <div className="wa-search">
        <IconSearch />
        <Input type="text" role="searchbox" value={query} placeholder="Search" aria-label="Search chats" autoComplete="off" spellCheck={false}
          onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); onQuery(""); } }} />
      </div>
      <div className="wa-chips" role="group" aria-label="Filter chats">
        {FILTERS.map(([id, label]) => <button key={id} type="button" className="wa-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      {error && chats === null ? (
        <div className="wa-center"><IconAlert width={28} height={28} /><strong>Could not load chats</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={onRefresh}>Try again</Button></div>
      ) : chats === null ? (
        <div className="wa-center"><Spinner />Loading chats…</div>
      ) : chats.length === 0 ? (
        <div className="wa-center"><strong>No messages yet</strong><p>New WhatsApp messages show up here as they arrive.</p></div>
      ) : shown.length === 0 ? (
        <p className="wa-quiet">{query.trim() ? `No chats match “${query.trim()}”.` : filter === "unread" ? "No unread chats." : "No group chats."}</p>
      ) : (
        <div className="wa-scroll"><ul className="wa-list" role="list">{shown.map((c) => <Row key={c.chatId} chat={c} selected={selected === c.chatId} now={now} onSelect={() => onSelect(c.chatId)} />)}</ul></div>
      )}
    </section>
  );
}
