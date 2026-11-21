// The "⋯" menu of a chat (row and header): archive, pin, mute, read state, info, clear, delete, block, exit group.
import { useState } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, toast } from "@/plugins/kit";
import { displayName, type Chat } from "../shared/chat";
import { useWa } from "./context";
import { ConfirmDialog, isGroupChat } from "./group-dialogs";
import { IconArchive, IconBell, IconBellOff, IconBin, IconBlock, IconClearChat, IconDots, IconExit, IconInfo, IconMarkRead, IconMarkUnread, IconPinChat, IconPinOff, IconUnarchive } from "./icons-people";
import { fail } from "./people-utils";

type Ask = "clear" | "delete" | "leave";
interface Result { ok: boolean; localOnly?: boolean }
const HOUR = 3600_000;
/** "Always" is a date so far away that it never ends. */
const FOREVER = "2999-12-31T00:00:00.000Z";
const MUTES: Array<[string, () => string]> = [["8 hours", () => new Date(Date.now() + 8 * HOUR).toISOString()], ["1 week", () => new Date(Date.now() + 168 * HOUR).toISOString()], ["Always", () => FOREVER]];

/** onInfo: shows "Contact info" / "Group info" when given. onGone: the chat is no longer in the list (deleted, left): close it. */
export function ChatMenu({ chat, onInfo, onGone }: { chat: Chat; onInfo?: () => void; onGone?: () => void }) {
  const { api, features, refreshChats } = useWa();
  const [ask, setAsk] = useState<Ask | null>(null);
  const group = isGroupChat(chat), name = displayName(chat);
  const unread = (chat.unread ?? 0) > 0 || chat.markedUnread === true;

  async function run<T = Result>(title: string, path: string, body: Record<string, unknown>, ok?: (r: T) => void): Promise<boolean> {
    try { const r = await api<T>(path, { method: "POST", body: { chatId: chat.chatId, ...body } }); ok?.(r); refreshChats(); return true; }
    catch (e) { fail(title, e); return false; }
  }
  /** Says so when only the inbox changed: the engine could not do it on WhatsApp. */
  const localNote = (r: Result, done: string, what: string) => (r.localOnly ? toast.success(done, { description: `Only in Floq: this WhatsApp engine cannot ${what}.` }) : toast.success(done));

  const archive = () => run("Could not change the archive", "/chat/archive", { archived: !chat.archived }, (r: Result) => localNote(r, chat.archived ? "Chat unarchived" : "Chat archived", "archive chats"));
  const pin = () => run("Could not change the pin", "/chat/pin", { pinned: !chat.pinned });
  const mute = (until: string | null) => run("Could not change the notifications", "/chat/mute", { until }, () => toast.success(until ? "Notifications muted" : "Notifications on"));
  const toggleRead = () => (unread ? run("Could not mark as read", "/read", {}) : run("Could not mark as unread", "/chat/unread", {}));
  const block = () => run("Could not change the block", "/contact/block", { blocked: !chat.blocked }, () => toast.success(chat.blocked ? "Contact unblocked" : "Contact blocked"));
  const confirm = async () => {
    const kind = ask;
    if (kind === "clear" && await run<Result>("Could not clear the chat", "/chat/clear", {}, (r) => localNote(r, "Chat cleared", "clear chats"))) return;
    if (kind === "delete" && await run<Result>("Could not delete the chat", "/chat/delete", {}, (r) => localNote(r, "Chat deleted", "delete chats"))) { onGone?.(); return; }
    if (kind === "leave" && await run("Could not exit the group", "/group/leave", {}, () => toast.success("You left the group"))) onGone?.();
  };
  const copy: Record<Ask, { title: string; description: string; confirm: string }> = {
    clear: { title: "Clear this chat?", description: `All messages are removed from this chat in Floq${features.clearChat ? " and on WhatsApp" : ". WhatsApp on your phone keeps them"}.`, confirm: "Clear chat" },
    delete: { title: "Delete this chat?", description: features.deleteChat ? "The chat is removed from WhatsApp and from Floq. It comes back if a new message arrives." : "The chat is removed from Floq only. It stays on your phone, and comes back here if a new message arrives.", confirm: "Delete chat" },
    leave: { title: "Exit this group?", description: `You will stop receiving messages from “${name}”.`, confirm: "Exit group" },
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label={`Menu of ${name}`} title="Menu"><IconDots /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="wa-menu">
          {onInfo && <DropdownMenuItem onSelect={onInfo}><IconInfo />{group ? "Group info" : "Contact info"}</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => void archive()}>{chat.archived ? <IconUnarchive /> : <IconArchive />}{chat.archived ? "Unarchive chat" : "Archive chat"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void pin()}>{chat.pinned ? <IconPinOff /> : <IconPinChat />}{chat.pinned ? "Unpin chat" : "Pin chat"}</DropdownMenuItem>
          {chat.muted
            ? <DropdownMenuItem onSelect={() => void mute(null)}><IconBell />Unmute notifications</DropdownMenuItem>
            : (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><IconBellOff />Mute notifications</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="wa-menu-sub">
                  {MUTES.map(([label, until]) => <DropdownMenuItem key={label} onSelect={() => void mute(until())}>{label}</DropdownMenuItem>)}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
          {(unread || features.markUnread) && <DropdownMenuItem onSelect={() => void toggleRead()}>{unread ? <IconMarkRead /> : <IconMarkUnread />}{unread ? "Mark as read" : "Mark as unread"}</DropdownMenuItem>}
          <DropdownMenuSeparator />
          {!group && !chat.isSelf && features.block && <DropdownMenuItem onSelect={() => void block()}><IconBlock />{chat.blocked ? "Unblock" : "Block"}</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setAsk("clear")}><IconClearChat />Clear chat</DropdownMenuItem>
          {group && <DropdownMenuItem variant="destructive" onSelect={() => setAsk("leave")}><IconExit />Exit group</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onSelect={() => setAsk("delete")}><IconBin />Delete chat</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={ask !== null} onOpenChange={(o) => { if (!o) setAsk(null); }} {...copy[ask ?? "delete"]} onConfirm={confirm} />
    </>
  );
}
