// What every screen of the inbox shares: the route caller, the engine's features and navigation. Panels and dialogs read it with useWa().
import { createContext, useContext } from "react";
import { usePluginEvent } from "@/plugins/kit";
import type { Chat } from "../shared/chat";
import type { Features, Engine } from "../shared/features";

export type Api = <T = unknown>(path: string, init?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown }) => Promise<T>;
/** One attached WhatsApp account (GET /accounts). `session` is its WAHA session and what every route takes as `session`. */
export interface Account { session: string; label: string; name: string; phone: string | null; primary: boolean; status: string; engine: string; unread: number }
/** What the account is called in the UI: the label the user gave it, else the WhatsApp name, else the number, else the session. */
export const accountName = (a: Pick<Account, "session" | "label" | "name" | "phone">) => a.label || a.name || (a.phone ? "+" + a.phone : a.session);
/** The route caller of one account: every request names its session, so a chat is always read and answered from its own account. */
export function scopedApi(api: Api, session: string): Api {
  if (!session) return api;
  const q = "session=" + encodeURIComponent(session);
  return ((path, init) => api(path + (path.includes("?") ? "&" : "?") + q, init)) as Api;
}
export interface Wa {
  pluginId: string;
  api: Api;
  /** The account this inbox shows ("" in the demos and before any account exists). */
  session?: string;
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
/** A plugin event of this inbox's account. Events name their session; one about another account is not for this screen. */
export function useWaEvent<T = unknown>(name: string, fn: (data: T) => void): void {
  const { pluginId, session } = useWa();
  usePluginEvent<T>(pluginId, name, (data) => {
    const s = (data as { session?: unknown } | null | undefined)?.session;
    if (session && typeof s === "string" && s !== session) return;
    fn(data);
  });
}
export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
export const errorCode = (e: unknown) => (e as { code?: string } | null)?.code ?? "";
export const errorStatus = (e: unknown) => (e as { status?: number } | null)?.status;
