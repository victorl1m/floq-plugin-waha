// Profile pictures: fetched once per chat and version through the plugin's own route (a data: URL), kept in memory for the session.
import { useContext, useEffect, useState } from "react";
import type { Chat } from "../shared/chat";
import { WaContext, type Api } from "./context";

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
const MAX = 400;

function load(api: Api, chatId: string, key: string): Promise<string | null> {
  let p = inflight.get(key);
  if (!p) {
    p = api<{ data: string | null }>(`/avatar?chatId=${encodeURIComponent(chatId)}`).then((r) => (typeof r?.data === "string" && r.data.startsWith("data:image/") ? r.data : null), () => null)
      .then((v) => { if (cache.size >= MAX) cache.delete(cache.keys().next().value as string); cache.set(key, v); inflight.delete(key); return v; });
    inflight.set(key, p);
  }
  return p;
}

/** data: URL of the chat's picture, or null (none, loading, or outside the inbox). */
export function useAvatarUrl(chat: Pick<Chat, "chatId" | "avatar">): string | null {
  const wa = useContext(WaContext);
  const key = chat.avatar ? `${chat.chatId}:${chat.avatar}` : "";
  const [url, setUrl] = useState<string | null>(key ? cache.get(key) ?? null : null);
  useEffect(() => {
    if (!key || !wa) { setUrl(null); return; }
    if (cache.has(key)) { setUrl(cache.get(key) ?? null); return; }
    let live = true;
    void load(wa.api, chat.chatId, key).then((v) => { if (live) setUrl(v); });
    return () => { live = false; };
  }, [key, wa, chat.chatId]);
  return url;
}
