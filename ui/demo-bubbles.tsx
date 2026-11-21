// bubbles-wiring: demo of the conversation log with fake routes, opened with ?demo=bubbles (e2e/waha-bubbles.spec.ts). Remove once the inbox view uses MessageLog.
//   &chat=group   group chat     &engine=NOWEB|GOWS|WEBJS     &contacts=0   no /contacts route     &hasmore=1   older messages can be loaded
import { useMemo, useRef, useState } from "react";
import { toast } from "@/plugins/kit";
import type { Chat, Message } from "../shared/chat";
import { featuresOf, type Engine } from "../shared/features";
import { Avatar } from "./avatar";
import { ChatSearch, ContactDialog, ForwardDialog, LocationDialog, MessageInfoDialog, PollDialog } from "./dialogs";
import { WaContext, type Api, type Wa } from "./context";
import { MessageLog, type MessageLogHandle } from "./message-log";
import { CSS } from "./styles";

const q = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
const MIN = 60_000, now0 = Date.now();
const ago = (min: number) => new Date(now0 - min * MIN).toISOString();
const GROUP = q.get("chat") === "group";
const engine = (q.get("engine") ?? "WEBJS") as Engine;
const ME = "Zoe Personalizações";

const canvasPng = (w: number, h: number, hue: number, label: string): string => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, "hsl(" + hue + " 70% 62%)"); gr.addColorStop(1, "hsl(" + (hue + 50) + " 70% 38%)");
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(w * 0.72, h * 0.32, h * 0.14, 0, 7); g.fill();
  g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.moveTo(0, h); g.lineTo(w * 0.35, h * 0.5); g.lineTo(w * 0.62, h * 0.8); g.lineTo(w * 0.82, h * 0.6); g.lineTo(w, h); g.fill();
  g.fillStyle = "#fff"; g.font = "bold " + Math.round(h / 9) + "px sans-serif"; g.fillText(label, 16, h - 18);
  return c.toDataURL("image/png").split(",")[1];
};
const wavB64 = (sec: number): string => {
  const rate = 8000, n = rate * sec, buf = new Uint8Array(44 + n * 2), v = new DataView(buf.buffer);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) buf[o + i] = t.charCodeAt(i); };
  s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 18) * Math.sin(i / 2500) * 6000, true);
  let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
};
const media = (mime: string, filename: string, o: Partial<NonNullable<Message["media"]>> = {}) => ({ mime, filename, size: 120_000, duration: null, width: null, height: null, available: true, ...o });
const P = (jid: string) => jid + "@c.us";
const RAF = P("5511911112222"), BIA = P("5511933334444");
let n = 0;
const msg = (o: Partial<Message> & { min: number }): Message => { const { min, ...rest } = o; return { id: "m" + ++n, fromMe: false, sender: GROUP ? RAF : P("5511987654321"), senderName: GROUP ? "Rafael Souza" : "Marina Costa", body: "", hasMedia: false, sentAt: ago(min), type: "chat", ...rest }; };
const mine = (o: Partial<Message> & { min: number }) => msg({ fromMe: true, sender: "", senderName: "", ack: 3, ...o });
const img = (min: number, body = "", mineMsg = false, w = 800, h = 600) => (mineMsg ? mine : msg)({ min, body, hasMedia: true, type: "image", media: media("image/png", "photo.png", { width: w, height: h }) });

const build = (): Message[] => {
  const first = msg({ min: 600, type: "system", body: "Marina Costa joined using this chat's invite link" });
  const text = msg({ min: 300, body: "Oi! *Chegaram* as _canecas_ ~antigas~? Veja `código 42` e https://example.com/pedido/a_b_c_2231 (obrigada)", sender: GROUP ? BIA : undefined, senderName: GROUP ? "Bia Nogueira" : undefined } as Partial<Message> & { min: number });
  const long = mine({ min: 290, ack: 3, body: "Chegaram sim, ficaram lindas.\n\n- 40 canecas com gravação\n- caixa kraft individual\n- entrega na quinta\n\n> Prazo confirmado com a gráfica\n\n```\npedido = 2231\nstatus = ok\n```" });
  const fwd = msg({ min: 280, body: "Encaminhada: promoção válida até sexta", forwarded: true });
  const quote = mine({ min: 270, body: "Perfeito, obrigada!", replyTo: { id: text.id, body: text.body, fromMe: false, sender: text.sender, senderName: text.senderName } });
  const emoji = msg({ min: 262, body: "🎉🙌" });
  const mention = msg({ min: 260, body: "@5511933334444 você viu o pedido? Falei com @5511944443333 também", mentions: [BIA, P("5511944443333")] });
  const preview = msg({ min: 255, body: "Olha esse catálogo https://exemplo.com.br/catalogo", preview: { title: "Catálogo de brindes personalizados 2026", description: "Canecas, ecobags e cadernos com a sua marca, entrega em todo o Brasil.", url: "https://www.exemplo.com.br/catalogo" } });
  const photo = img(240, "Esse é o modelo que a cliente pediu");
  const photoMine = img(235, "", true, 600, 800);
  const wide = img(233, "", false, 1200, 500);
  const sticker = msg({ min: 230, type: "sticker", hasMedia: true, media: media("image/webp", "sticker.webp", { width: 256, height: 256 }) });
  const video = msg({ min: 225, body: "Vídeo do teste de impressão", type: "video", hasMedia: true, media: media("video/mp4", "teste.mp4", { duration: 42, width: 640, height: 360 }) });
  const ptt = msg({ min: 220, type: "ptt", hasMedia: true, media: media("audio/ogg", "voice.ogg", { duration: 6 }) });
  const pttMine = mine({ min: 218, type: "ptt", hasMedia: true, media: media("audio/ogg", "voice.ogg", { duration: 6 }) });
  const audio = msg({ min: 215, type: "audio", hasMedia: true, media: media("audio/mpeg", "briefing-cliente.mp3", { duration: 6 }) });
  const doc = msg({ min: 210, type: "document", hasMedia: true, body: "Orçamento", media: media("application/pdf", "Orcamento-2231-mugs-personalizadas.pdf", { size: 482_000 }) });
  const docGone = mine({ min: 205, type: "document", hasMedia: true, media: media("application/vnd.ms-excel", "planilha.xlsx", { size: 83_000, available: false }) });
  const imgGone = msg({ min: 202, type: "image", hasMedia: true, media: media("image/jpeg", "old.jpg", { width: 640, height: 480, available: false }) });
  const loc = msg({ min: 200, type: "location", location: { lat: -23.55052, lng: -46.633308, name: "Ateliê Zoe", address: "R. Augusta, 1200 - Consolação, São Paulo" } });
  const contact = msg({ min: 195, type: "vcard", vcards: [{ name: "Rafael Souza", phones: ["5511911112222"], formatted: ["+55 11 91111-2222"] }, { name: "Bia Nogueira", phones: ["5511933334444"], formatted: ["+55 11 93333-4444"] }] });
  const poll = msg({ min: 190, type: "poll", poll: { name: "Qual cor da caneca?", multiple: false, voters: 5, options: [{ name: "Azul", votes: 3, voted: true }, { name: "Verde", votes: 1, voted: false }, { name: "Preta", votes: 1, voted: false }] } });
  const poll2 = mine({ min: 188, type: "poll", poll: { name: "Dias para entrega", multiple: true, voters: 3, options: [{ name: "Terça", votes: 2, voted: false }, { name: "Quarta", votes: 1, voted: true }, { name: "Quinta", votes: 3, voted: true }] } });
  const call = msg({ min: 180, type: "call", call: { video: false, status: "missed" } });
  const vcall = msg({ min: 178, type: "call", call: { video: true, status: "ended" } });
  const del = msg({ min: 170, type: "deleted", deleted: true });
  const delMine = mine({ min: 168, type: "deleted", deleted: true });
  const state = (min: number, ack: number, extra: Partial<Message> = {}) => mine({ min, ack, body: "Estado do envio: " + (ack < 0 ? "falhou" : ["relógio", "enviada", "entregue", "lida", "reproduzida"][ack]), ...extra });
  const star = msg({ min: 20, body: "Mensagem fixada e favorita", starred: true, pinned: true, edited: true });
  const react = mine({ min: 15, body: "Obrigado pelo apoio de vocês! Reações abaixo", reactions: [{ emoji: "👍", count: 3, mine: true, senders: [] }, { emoji: "❤️", count: 1, mine: false, senders: [] }, { emoji: "😂", count: 1, mine: false, senders: [] }] });
  const last = mine({ min: 1, ack: 3, body: "Pode confirmar o endereço de entrega?" });
  return [first, text, long, fwd, quote, emoji, mention, preview, photo, photoMine, wide, sticker, video, ptt, pttMine, audio, doc, docGone, imgGone, loc, contact, poll, poll2, call, vcall, del, delMine,
    state(60, 0, { pending: true }), state(59, 1), state(58, 2), state(57, 3), state(56, 4), state(55, -1, { failed: true }), star, react, last];
};

const chats: Chat[] = [
  { chatId: P("5511987654321"), kind: "user", name: "Marina Costa", phone: "5511987654321", lastBody: "", lastAt: ago(1), total: 3 },
  { chatId: "120363041234567890@g.us", kind: "group", name: "Equipe Zoe · Produção", lastBody: "", lastAt: ago(2), total: 3 },
  { chatId: P("5511944443333"), kind: "user", name: "Lucas Andrade", phone: "5511944443333", lastBody: "", lastAt: ago(3), total: 3 },
  { chatId: P("447911123456"), kind: "user", name: "James Whitfield", phone: "447911123456", lastBody: "", lastAt: ago(4), total: 3 },
  { chatId: BIA, kind: "user", name: "Bia Nogueira", phone: "5511933334444", lastBody: "", lastAt: ago(5), total: 3 },
];
const chat: Chat = GROUP ? chats[1] : chats[0];

export default function BubblesDemo() {
  const [messages, setMessages] = useState<Message[]>(build);
  const [dlg, setDlg] = useState<"" | "forward" | "poll" | "location" | "contact" | "info">("");
  const [search, setSearch] = useState(false);
  const [term, setTerm] = useState("");
  const log = useRef<MessageLogHandle>(null);
  const sent = useRef<unknown[]>((window as unknown as { __calls?: unknown[] }).__calls ?? []);
  (window as unknown as { __calls: unknown[] }).__calls = sent.current;
  const last = messages[messages.length - 1];
  const patch = (id: string, f: (m: Message) => Message) => setMessages((ms) => ms.map((m) => (m.id === id ? f(m) : m)));

  const api = useMemo<Api>(() => (async (path: string, init?: { method?: string; body?: unknown }) => {
    const url = new URL(path, "http://x");
    await new Promise((r) => setTimeout(r, 40));
    sent.current.push({ path, method: init?.method ?? "GET", body: init?.body });
    if (url.pathname === "/media") {
      const m = messages.find((x) => x.id === url.searchParams.get("id"));
      if (!m || m.media?.available === false || m.type === "video") throw Object.assign(new Error("This file is no longer available."), { status: 404, code: "media_unavailable" });
      const kind = m.media?.mime ?? "";
      if (kind.startsWith("audio/")) return { mime: "audio/wav", filename: m.media!.filename, size: 96000, data: wavB64(6) };
      if (kind.startsWith("image/")) return { mime: "image/png", filename: m.media!.filename, size: 5000, data: canvasPng(m.media?.width ?? 400, m.media?.height ?? 300, (m.id.length * 47 + Number(m.id.slice(1)) * 29) % 360, m.type === "sticker" ? "😀" : "Ateliê Zoe") };
      return { mime: kind, filename: m.media?.filename ?? "file", size: 4, data: btoa("demo") };
    }
    if (url.pathname === "/message-info") return { id: "x", fromMe: true, sentAt: ago(15), ack: 3, edited: false, starred: false, pinned: false, type: "chat", reactions: [{ emoji: "👍", fromMe: true, name: "", phone: "", at: ago(14) }, { emoji: "❤️", fromMe: false, name: "Marina Costa", phone: "5511987654321", at: ago(13) }, { emoji: "😂", fromMe: false, name: "", phone: "5511933334444", at: ago(12) }] };
    if (url.pathname === "/contacts") {
      if (q.get("contacts") === "0") throw Object.assign(new Error("Not found"), { status: 404 });
      const term = (url.searchParams.get("q") ?? "").toLowerCase();
      return { contacts: chats.filter((c) => c.kind === "user" && (c.name ?? "").toLowerCase().includes(term)).map((c) => ({ chatId: c.chatId, name: c.name, phone: c.phone })) };
    }
    if (url.pathname === "/messages") {
      const t = (url.searchParams.get("q") ?? "").toLowerCase();
      return { messages: messages.filter((m) => m.body.toLowerCase().includes(t)).slice(-50) };
    }
    return { ok: true };
  }) as Api, [messages]);

  const wa: Wa = useMemo(() => ({
    pluginId: "waha", api, engine, features: featuresOf(engine), me: { name: ME, phone: "5511900000000" }, chats, refreshChats: () => undefined,
    openChat: (id, hint) => toast.info("Open chat " + id + (hint?.name ? " (" + hint.name + ")" : "")), useAvatar: () => null,
  }), [api]);

  const onAction = async (a: string, m: Message, arg?: unknown) => {
    await api("/" + a, { method: "POST", body: { id: m.id, arg } });
    if (a === "star") patch(m.id, (x) => ({ ...x, starred: Boolean(arg) }));
    else if (a === "pin") patch(m.id, (x) => ({ ...x, pinned: Boolean(arg) }));
    else if (a === "react") patch(m.id, (x) => ({ ...x, reactions: (() => { const rs = (x.reactions ?? []).map((r) => ({ ...r })); const mine = rs.find((r) => r.mine); if (mine) mine.count--, (mine.mine = false); if (arg) { const h = rs.find((r) => r.emoji === arg); if (h) h.count++, (h.mine = true); else rs.push({ emoji: String(arg), count: 1, mine: true, senders: [] }); } return rs.filter((r) => r.count > 0); })() }));
    else if (a === "delete") { if ((arg as { forEveryone?: boolean })?.forEveryone) patch(m.id, (x) => ({ ...x, deleted: true, type: "deleted" })); else setMessages((ms) => ms.filter((x) => x.id !== m.id)); }
    else if (a === "forward") setDlg("forward");
    else if (a === "info") setDlg("info");
    else if (a === "vote") patch(m.id, (x) => (x.poll ? { ...x, poll: { ...x.poll, options: x.poll.options.map((o) => ({ ...o, voted: (arg as string[]).includes(o.name) })) } } : x));
  };

  return (
    <WaContext.Provider value={wa}>
      <div className="wa-root" data-pane="chat" data-demo="bubbles">
        <style>{CSS}</style>
        <div className="wa-panel" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
          <section className="wa-pane wa-chat-pane" aria-label="Conversation">
            <div className="wa-head wa-chat-head">
              <Avatar chat={chat} small />
              <div className="wa-who"><b>{chat.name}</b><span>{GROUP ? "Rafael, Bia, Lucas, You" : "online"}</span></div>
            </div>
            <div className="wa-chips" aria-label="Demo controls">
              {(["forward", "poll", "location", "contact", "info"] as const).map((k) => <button key={k} type="button" className="wa-chip" aria-label={"Open " + k + " dialog"} onClick={() => setDlg(k)}>{k}</button>)}
              <button type="button" className="wa-chip" aria-label="Search in chat" onClick={() => setSearch((v) => !v)}>search</button>
            </div>
            {search && <ChatSearch chat={chat} onJump={(id) => { log.current?.jumpTo(id); }} onClose={() => { setSearch(false); setTerm(""); }} />}
            <MessageLog ref={log} key={chat.chatId} chat={chat} messages={messages} now={new Date()} highlight={term} hasMore={q.get("hasmore") === "1"} onLoadMore={() => toast.info("Load more")}
              onReply={(m) => toast.info("Reply to " + m.id)} onEdit={(m) => toast.info("Edit " + m.id)} onAction={onAction} />
          </section>
        </div>
        <ForwardDialog message={last} open={dlg === "forward"} onOpenChange={(v) => setDlg(v ? "forward" : "")} onForward={async (ids) => { await api("/forward", { method: "POST", body: { to: ids } }); }} />
        <PollDialog open={dlg === "poll"} onOpenChange={(v) => setDlg(v ? "poll" : "")} onCreate={async (p) => { await api("/send-poll", { method: "POST", body: p }); }} />
        <LocationDialog open={dlg === "location"} onOpenChange={(v) => setDlg(v ? "location" : "")} onSend={async (l) => { await api("/send-location", { method: "POST", body: l }); }} />
        <ContactDialog open={dlg === "contact"} onOpenChange={(v) => setDlg(v ? "contact" : "")} onSend={async (c) => { await api("/send-contact", { method: "POST", body: { contacts: c } }); }} />
        <MessageInfoDialog message={last} open={dlg === "info"} onOpenChange={(v) => setDlg(v ? "info" : "")} />
      </div>
    </WaContext.Provider>
  );
}
