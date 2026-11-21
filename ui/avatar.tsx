import type { CSSProperties } from "react";
import { cn } from "@/plugins/kit";
import { initials, hueOf, chatKind, type Chat } from "../shared/chat";
import { useAvatarUrl } from "./avatars";
import { IconUsers } from "./icons";

/** Round avatar: the profile picture when WAHA has one, else initials, last digits, or a users icon for groups. Hue is a stable hash of the id. */
export function Avatar({ chat, small, size }: { chat: Pick<Chat, "chatId"> & Partial<Chat>; small?: boolean; size?: number }) {
  const group = (chat.kind ?? chatKind(chat.chatId)) === "group";
  const url = useAvatarUrl({ chatId: chat.chatId, avatar: chat.avatar ?? null });
  const style = { "--wa-h": hueOf(chat.chatId), ...(size ? { width: size, height: size, fontSize: Math.round(size * 0.36) } : {}) } as CSSProperties;
  return (
    <span className={cn("wa-avatar", small && "wa-avatar-sm", url && "wa-avatar-img")} style={style} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : group ? <IconUsers /> : initials(chat)}
    </span>
  );
}
