// What every screen of the inbox shares: the route caller, the engine's features and navigation. Panels and dialogs read it with useWa().
import { createContext, useContext } from "react";
import type { Chat } from "../shared/chat";
import type { Features, Engine } from "../shared/features";

export type Api = <T = unknown>(path: string, init?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown }) => Promise<T>;
export interface Wa {
  pluginId: string;
  api: Api;
  engine: Engine;
  features: Features;
  /** The WhatsApp account of the session, when known. */
  me: { name: string; phone: string | null } | null;
  chats: Chat[];
  /** Re-reads the chat list. */
  refreshChats(): void;
  /** Opens a chat in the conversation pane (creates the row when it has no messages yet). */
  openChat(chatId: string, hint?: Partial<Chat>): void;
  /** data: URL of a chat's profile picture, cached per version; null while loading or when there is none. */
  useAvatar(chat: Pick<Chat, "chatId" | "avatar">): string | null;
}
export const WaContext = createContext<Wa | null>(null);
export function useWa(): Wa {
  const v = useContext(WaContext);
  if (!v) throw new Error("useWa outside the inbox");
  return v;
}
export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
export const errorCode = (e: unknown) => (e as { code?: string } | null)?.code ?? "";
export const errorStatus = (e: unknown) => (e as { status?: number } | null)?.status;
