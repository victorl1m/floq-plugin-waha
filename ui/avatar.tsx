import type { CSSProperties } from "react";
import { cn } from "@/plugins/kit";
import { initials, hueOf, chatKind, type Chat } from "../shared/chat";
import { IconUsers } from "./icons";

/** Round avatar: initials, last digits, a users icon for groups. Hue is a stable hash of the id. */
export function Avatar({ chat, small }: { chat: Pick<Chat, "chatId"> & Partial<Chat>; small?: boolean }) {
  const group = (chat.kind ?? chatKind(chat.chatId)) === "group";
  return (
    <span className={cn("wa-avatar", small && "wa-avatar-sm")} style={{ "--wa-h": hueOf(chat.chatId) } as CSSProperties} aria-hidden="true">
      {group ? <IconUsers /> : initials(chat)}
    </span>
  );
}
