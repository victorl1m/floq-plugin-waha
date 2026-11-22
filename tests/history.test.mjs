// The history import and the contacts sync: WAHA's store is turned on before the scan, then chats, messages and contacts are paged into the inbox,
// idempotent, resumable and per account. The SQL runs on PGlite (or a real Postgres with WAHA_TEST_PG); WAHA is a fake with a store.
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { bundle, cleanup, closeAll, harness } from "./helpers.mjs";

let plugin, migrations;
before(async () => { plugin = (await bundle("../runtime/index.ts")).default; ({ migrations } = await bundle("../runtime/migrations.ts")); });
afterEach(closeAll);
after(cleanup);

const ANA = "5511911112222@c.us", BIA = "5521933334444@c.us", CAIO = "5511955556666@c.us", GROUP = "120363000000000001@g.us";
const ANA_LID = "111111111111111@lid", DAN_LID = "222222222222222@lid", DAN = "5511977778888@c.us";
const ME = { id: "5511900000001@c.us", pushName: "Shop" };
const HOOK = { url: "https://floq.example.com/v1/plugins/waha/hooks/events/tok123", events: ["message.any", "session.status"], hmac: null, retries: null, customHeaders: null };
const STORE = { enabled: true, fullSync: true };
const acct = (session) => ({ session, label: "", name: "", phone: "", addedAt: "2026-01-01T00:00:00.000Z" });
const fail = async (p) => { try { await p; } catch (e) { return e; } assert.fail("expected an error"); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** n messages of a chat, newest first (as WAHA lists them): odd ones are mine. Ids are H<n>..H1. */
const thread = (chat, n, tag = "H", t0 = 1690000000) => Array.from({ length: n }, (_, k) => {
  const i = n - k, mine = i % 2 === 1;
  return { id: `${mine}_${chat}_${tag}${i}`, timestamp: t0 + i * 60, fromMe: mine, ...(mine ? { to: chat } : { from: chat }), body: `${tag} ${i}`, hasMedia: false };
});
/**
 * A fake WAHA. w.sessions[name] = { status, engine, me, config }; w.store[name] = { chats: [{ id, name }], messages: { chatId: [...] }, contacts, lids, groups }.
 * w.gate = async (kind, req) => ... runs before a chats / messages / contacts answer (to pause the import at a known point). w.refuse = status for PUT / POST config.
 */
function fake(w) {
  w.sessions ??= {}; w.store ??= {};
  const info = (name) => { const s = w.sessions[name]; return { name, status: s.status, engine: s.engine === null ? {} : { engine: s.engine ?? "NOWEB" }, me: s.me ?? null, config: s.config ?? { webhooks: [] } }; };
  const page = (list, q) => list.slice(Number(q.offset ?? 0), Number(q.offset ?? 0) + Number(q.limit ?? 10));
  return async (method, path, req) => {
    if (path === "/api/version") return { json: { version: "2026.10.1", engine: w.defaultEngine ?? "NOWEB", tier: "CORE" } };
    if (method === "GET" && path === "/api/sessions") return { json: Object.keys(w.sessions).map(info) };
    const one = /^\/api\/sessions\/([^\/]+)$/.exec(path);
    if (one && method === "GET") return w.sessions[one[1]] ? { json: info(one[1]) } : { status: 404, json: {} };
    if (one && method === "PUT") {
      if (w.refuse) return { status: w.refuse, json: { message: "config.noweb is not supported" } };
      const s = w.sessions[one[1]];
      s.config = w.dropStore ? { ...req.body.config, noweb: undefined } : req.body.config;
      if (s.status !== "STOPPED" && w.stopsOnPut) s.status = "STOPPED";
      return { json: {} };
    }
    if (method === "POST" && path === "/api/sessions") {
      if (w.refuse && req.body.config?.noweb) return { status: w.refuse, json: { message: "config.noweb is not supported" } };
      w.sessions[req.body.name] = { status: "SCAN_QR_CODE", config: req.body.config ?? { webhooks: [] } };
      return { json: { name: req.body.name } };
    }
    const act = /^\/api\/sessions\/([^\/]+)\/start$/.exec(path);
    if (act && method === "POST") { w.sessions[act[1]].status = "SCAN_QR_CODE"; return { json: {} }; }
    const sess = req.query.session ?? req.body?.session ?? /^\/api\/([^/]+)\//.exec(path)?.[1] ?? "default", st = w.store[sess] ?? {};
    const off = w.sessions[sess] && (w.sessions[sess].engine ?? "NOWEB") === "NOWEB" && w.sessions[sess].config?.noweb?.store?.enabled !== true;
    if (/\/auth\/qr$/.test(path)) return w.sessions[sess]?.status === "SCAN_QR_CODE" ? { json: { value: "QR-" + sess } } : { status: 422, json: {} };
    if (path === "/api/contacts/all") { if (off) return { status: 400, json: { message: "Enable NOWEB store" } }; await w.gate?.("contacts", req); return { json: w.ignoreOffset ? (st.contacts ?? []) : page(st.contacts ?? [], req.query) }; }
    if (/^\/api\/[^\/]+\/lids$/.test(path)) return { json: page(st.lids ?? [], req.query) };
    if (/^\/api\/[^\/]+\/groups$/.test(path)) return { json: page(st.groups ?? [], req.query) };
    if (/^\/api\/[^\/]+\/chats\/overview$/.test(path)) {
      if (off) return { status: 400, json: { message: "Enable NOWEB store" } };
      if (w.noOverview) return { status: 404, json: {} };
      await w.gate?.("chats", req);
      return { json: page(st.chats ?? [], req.query).map((c) => ({ id: c.id, name: c.name ?? null, picture: null, lastMessage: (st.messages?.[c.id] ?? [])[0] ?? null, _chat: c._chat ?? {} })) };
    }
    if (/^\/api\/[^\/]+\/chats$/.test(path)) { if (off) return { status: 400, json: { message: "Enable NOWEB store" } }; return { json: page(st.chats ?? [], req.query).map((c) => ({ id: c.id, name: c.name ?? null })) }; }
    const msgs = /^\/api\/[^\/]+\/chats\/([^\/]+)\/messages$/.exec(path);
    if (msgs && method === "GET") {
      await w.gate?.("messages", req, msgs[1]);
      if (w.broken?.includes(msgs[1])) return { status: 500, json: { message: "boom" } };
      const list = st.messages?.[msgs[1]] ?? [];
      return { json: w.ignoreOffset ? list.slice(0, Number(req.query.limit)) : page(list, req.query) };
    }
    return undefined;
  };
}
const linked = (extra = {}) => ({ status: "WORKING", engine: "NOWEB", me: ME, config: { webhooks: [HOOK], noweb: { store: STORE } }, ...extra });
const start = (w, opts = {}) => harness(plugin, migrations, { waha: fake(w), ...opts });
/** Waits until the import of an account is no longer running. */
async function settled(h, session) {
  for (let i = 0; i < 4000; i++) { const s = await h.get("/history", session ? { session } : {}); if (s.state !== "running") return s; await sleep(5); }
  assert.fail("the import did not finish");
}
const count = async (h, where = "TRUE") => (await h.sql(`SELECT COUNT(*)::int AS n FROM messages WHERE ${where}`))[0].n;
const reqs = (h, re, method = "GET") => h.requests.filter((r) => r.method === method && re.test(r.path));

// ---------------------------------------------------------------- the store, before the scan

test("a session that waits for the scan without the store gets it before the QR: one PUT, webhooks and the rest of the config kept, then it restarts", async () => {
  const w = { sessions: { default: { status: "SCAN_QR_CODE", engine: "NOWEB", config: { proxy: null, debug: false, webhooks: [HOOK], metadata: { a: "b" }, noweb: { markOnline: true } } } }, stopsOnPut: true };
  const h = await start(w);
  const r = await h.get("/session");
  assert.equal(r.status, "STARTING", "no QR is shown for the session as it was");
  assert.deepEqual(r.history, { willImport: true, error: null });
  const put = reqs(h, /^\/api\/sessions\/default$/, "PUT");
  assert.equal(put.length, 1);
  assert.deepEqual(put[0].body, { config: { proxy: null, debug: false, webhooks: [HOOK], metadata: { a: "b" }, noweb: { markOnline: true, store: { enabled: true, fullSync: true } } } });
  assert.equal(reqs(h, /^\/api\/sessions\/default\/start$/, "POST").length, 1, "WAHA left it stopped: started again");
  assert.deepEqual(h.events.filter((e) => e.name === "session"), [{ name: "session", status: "STARTING", session: "default" }]);
  // Back at the QR with the store on: nothing more to change, and the QR is served.
  const again = await h.get("/session");
  assert.equal(again.status, "SCAN_QR_CODE"); assert.deepEqual(again.history, { willImport: true, error: null });
  assert.deepEqual(await h.get("/session/qr"), { value: "QR-default" });
  assert.equal(reqs(h, /^\/api\/sessions\/default$/, "PUT").length, 1);
});

test("the QR and the pairing code are never given for a session whose store is still off; fullSync alone is upgraded too", async () => {
  const w = { sessions: { default: { status: "SCAN_QR_CODE", engine: "NOWEB", config: { webhooks: [HOOK], noweb: { store: { enabled: true, fullSync: false } } } } } };
  const h = await start(w);
  const e = await fail(h.get("/session/qr"));
  assert.equal(e.code, "not_scanning");
  assert.deepEqual(w.sessions.default.config.noweb.store, { enabled: true, fullSync: true });
  assert.deepEqual(w.sessions.default.config.webhooks, [HOOK]);
  assert.deepEqual(await h.get("/session/qr"), { value: "QR-default" });
  w.sessions.b = { status: "SCAN_QR_CODE", engine: "NOWEB", config: { webhooks: [] } };
  h.kv.set("accounts", [acct("default"), acct("b")]);
  const h2 = await start(w, { kv: { accounts: [acct("default"), acct("b")] } });
  assert.equal((await fail(h2.post("/session/pair-code", { session: "b", phone: "+5511987654321" }))).code, "not_scanning");
  assert.deepEqual(w.sessions.b.config.noweb.store, STORE);
});

test("a linked session is never touched: WORKING without the store stays as it is and says there will be no history", async () => {
  const w = { sessions: { default: { status: "WORKING", engine: "NOWEB", me: ME, config: { webhooks: [HOOK] } } } };
  const h = await start(w);
  const r = await h.get("/session");
  assert.equal(r.status, "WORKING"); assert.deepEqual(r.history, { willImport: false, error: null });
  for (const s of ["STOPPED", "STARTING", "FAILED"]) { w.sessions.default.status = s; assert.equal((await h.get("/session")).status, s); }
  assert.equal(h.requests.filter((x) => x.method !== "GET").length, 0);
});

test("WAHA refuses the store: its error is shown, linking goes on without history, and it is not asked again and again", async () => {
  const w = { sessions: { default: { status: "SCAN_QR_CODE", engine: "NOWEB", config: { webhooks: [HOOK] } } }, refuse: 422 };
  const h = await start(w);
  const r = await h.get("/session");
  assert.equal(r.status, "SCAN_QR_CODE");
  assert.deepEqual(r.history, { willImport: false, error: "WAHA answered 422: config.noweb is not supported" });
  assert.deepEqual(await h.get("/session/qr"), { value: "QR-default" });
  await h.get("/session"); await h.get("/session/qr");
  assert.equal(reqs(h, /^\/api\/sessions\/default$/, "PUT").length, 1);
  assert.deepEqual(w.sessions.default.config, { webhooks: [HOOK] });
  // A WAHA that takes the PUT but drops the setting is not restarted in a loop either.
  const w2 = { sessions: { default: { status: "SCAN_QR_CODE", engine: "NOWEB", config: { webhooks: [] } } }, dropStore: true };
  const h2 = await start(w2);
  assert.equal((await h2.get("/session")).status, "STARTING");
  const after = await h2.get("/session");
  assert.equal(after.status, "SCAN_QR_CODE"); assert.equal(after.history.willImport, false); assert.match(after.history.error, /did not keep/);
  assert.equal(reqs(h2, /^\/api\/sessions\/default$/, "PUT").length, 1);
});

test("a new session is created with the store on (connection screen and Add account); a WAHA that refuses that config gets it without", async () => {
  const w = { sessions: { main: linked() } };
  const h = await start(w, { kv: { accounts: [acct("main")] } });
  const r = await h.post("/accounts/create", { name: "second" });
  assert.deepEqual(r.history, { willImport: true, error: null });
  const body = reqs(h, /^\/api\/sessions$/, "POST")[0].body;
  assert.deepEqual(body.config.noweb, { store: STORE }); assert.equal(body.config.webhooks[0].url, HOOK.url);
  assert.deepEqual((await h.get("/session", { session: "second" })).history, { willImport: true, error: null });
  // Refused: created without, and the screen says why there will be no history.
  w.refuse = 400;
  const r2 = await h.post("/accounts/create", { name: "third" });
  assert.deepEqual(r2.history, { willImport: false, error: "WAHA answered 400: config.noweb is not supported" });
  const posts = reqs(h, /^\/api\/sessions$/, "POST").filter((x) => x.body.name === "third");
  assert.equal(posts.length, 2); assert.equal(posts[1].body.config.noweb, undefined); assert.equal(posts[1].body.config.webhooks[0].url, HOOK.url);
  assert.deepEqual((await h.get("/session", { session: "third" })).history, { willImport: false, error: "WAHA answered 400: config.noweb is not supported" });
  // The connection screen's "create and connect" of a missing session.
  const w3 = { sessions: {}, refuse: 422 };
  const h3 = await start(w3);
  assert.deepEqual(await h3.post("/session/start"), { ok: true });
  assert.deepEqual(w3.sessions.default.config, { webhooks: [] });
});

test("GOWS and WEBJS are left alone (they keep or read history themselves); GOWS with its storage switched off gets it back before the scan", async () => {
  for (const engine of ["GOWS", "WEBJS"]) {
    const w = { sessions: { default: { status: "SCAN_QR_CODE", engine, config: { webhooks: [HOOK] } } } };
    const h = await start(w);
    const r = await h.get("/session");
    assert.equal(r.status, "SCAN_QR_CODE", engine); assert.deepEqual(r.history, { willImport: true, error: null }, engine);
    assert.equal(h.requests.filter((x) => x.method !== "GET").length, 0, engine);
  }
  const w = { sessions: { default: { status: "SCAN_QR_CODE", engine: "GOWS", config: { webhooks: [HOOK], gows: { storage: { messages: false, labels: false } } } } } };
  const h = await start(w);
  assert.equal((await h.get("/session")).status, "STARTING");
  assert.deepEqual(w.sessions.default.config, { webhooks: [HOOK], gows: { storage: { messages: true, labels: false, chats: true, contacts: true, groups: true } } });
  // A session that does not say its engine yet is the server's default one.
  const w2 = { sessions: { default: { status: "SCAN_QR_CODE", engine: null, config: { webhooks: [] } } }, defaultEngine: "NOWEB" };
  const h2 = await start(w2);
  assert.equal((await h2.get("/session")).status, "STARTING");
  assert.deepEqual(w2.sessions.default.config.noweb, { store: STORE });
});

// ---------------------------------------------------------------- the import

/** An account with 105 chats: Ana has 230 messages, Bia 3, the group 2, the rest one each. */
function bigStore() {
  const chats = [{ id: ANA, name: "Ana Lima" }, { id: BIA, name: "5521933334444" }, { id: GROUP, name: "Team" }];
  const messages = { [ANA]: thread(ANA, 230), [BIA]: thread(BIA, 3, "B"), [GROUP]: [
    { id: `false_${GROUP}_G2_${CAIO}`, timestamp: 1690009000, from: GROUP, participant: CAIO, fromMe: false, body: "group two", hasMedia: false, _data: { pushName: "Caio" } },
    { id: `true_${GROUP}_G1`, timestamp: 1690008000, to: GROUP, fromMe: true, body: "group one", hasMedia: false }] };
  for (let i = 0; i < 102; i++) { const id = `55119${String(10000000 + i)}@c.us`; chats.push({ id }); messages[id] = thread(id, 1, "X" + i + "-", 1680000000 + i); }
  return { chats, messages, contacts: [{ id: ANA, number: "5511911112222", name: "Ana Lima", pushname: "Aninha", isMyContact: true }, { id: BIA, number: "5521933334444", name: "", pushname: "Bia", isMyContact: false }], groups: [{ id: GROUP, subject: "Team" }], lids: [] };
}

test("after the scan the import starts by itself: every chat and every message is paged in, named, read, and progress is announced", async () => {
  const w = { sessions: { default: { status: "SCAN_QR_CODE", engine: "NOWEB", config: { webhooks: [HOOK], noweb: { store: STORE } } } }, store: { default: bigStore() } };
  const h = await start(w);
  assert.deepEqual(await h.get("/history"), { state: "idle", phase: null, chatsTotal: 0, chatsDone: 0, messages: 0, contacts: 0, startedAt: null, finishedAt: null, error: null, everRan: false, contactsSyncedAt: null, contactsSyncing: false, limits: { perChat: 1000, total: 50000 } });
  await h.event("session.status", { status: "SCAN_QR_CODE" });
  Object.assign(w.sessions.default, { status: "WORKING", me: ME });
  await h.event("session.status", { status: "WORKING" }, { me: ME });
  assert.equal((await h.get("/history")).state, "running");
  const s = await settled(h);
  assert.equal(s.state, "done"); assert.equal(s.error, null); assert.equal(s.everRan, true);
  assert.deepEqual([s.chatsTotal, s.chatsDone, s.messages, s.contacts], [105, 105, 230 + 3 + 2 + 102, 2]);
  assert.ok(s.startedAt && s.finishedAt && s.contactsSyncedAt);
  assert.equal(await count(h), 337);
  // Paging: chats by 100 until an empty page, Ana's messages by 100 until an empty page, never with media bytes.
  assert.deepEqual(reqs(h, /\/chats\/overview$/).map((r) => r.query.offset), ["0", "100", "200"]);
  const ana = reqs(h, new RegExp("/chats/" + ANA + "/messages$"));
  assert.deepEqual(ana.map((r) => [r.query.limit, r.query.offset, r.query.downloadMedia]), [["100", "0", "false"], ["100", "100", "false"], ["100", "200", "false"], ["100", "300", "false"]]);
  // The inbox: names from the chat list, the contacts and the group list; newest message last; history is not unread.
  const chats = await h.chats();
  assert.equal(chats.length, 105);
  const by = Object.fromEntries(chats.map((c) => [c.chatId, c]));
  assert.deepEqual([by[ANA].name, by[ANA].total, by[ANA].lastBody, by[ANA].unread], ["Ana Lima", 230, "H 230", 0]);
  assert.deepEqual([by[BIA].name, by[BIA].total], ["Bia", 3]);
  assert.deepEqual([by[GROUP].name, by[GROUP].kind, by[GROUP].total], ["Team", "group", 2]);
  assert.equal(chats.reduce((n, c) => n + c.unread, 0), 0);
  const page = await h.messages(ANA, { limit: "5" });
  assert.deepEqual(page.map((m) => [m.body, m.fromMe]), [["H 226", false], ["H 227", true], ["H 228", false], ["H 229", true], ["H 230", false]]);
  assert.equal((await h.messages(GROUP)).find((m) => m.body === "group two").senderName, "Caio");
  // Progress went to the UI, counting up, and ended with done; a toast says what came in.
  const ev = h.events.filter((e) => e.name === "history");
  assert.deepEqual([...new Set(ev.map((e) => e.phase))], ["contacts", "chats", "messages", null]);
  assert.ok(ev.some((e) => e.state === "running" && e.chatsTotal === 105 && e.chatsDone === 34));
  assert.deepEqual([ev.at(-1).state, ev.at(-1).session], ["done", "default"]);
  assert.ok(ev.every((e, i) => i === 0 || e.chatsDone >= ev[i - 1].chatsDone));
  assert.deepEqual(h.toasts.at(-1), { title: "WhatsApp: history imported", description: "105 chats, 337 messages" });
  // A message that arrives now is news.
  await h.message({ from: ANA, body: "brand new" });
  assert.equal((await h.chats()).find((c) => c.chatId === ANA).unread, 1);
  // /accounts and the agents' diagnostics show where the import stands.
  assert.deepEqual((await h.get("/accounts")).accounts[0].history, { state: "done", chatsDone: 105, chatsTotal: 105 });
  const d = await h.call("/diagnostics");
  assert.deepEqual(d.historyStore, { engine: "NOWEB", enabled: true, fullSync: true, error: null });
  assert.deepEqual([d.history[0].session, d.history[0].state, d.history[0].chatsDone, d.history[0].messages], ["default", "done", 105, 338 - 1]);
});

test("running it again changes nothing: same rows, no duplicates, and 'Import history again' walks everything once more", async () => {
  const w = { sessions: { default: linked() }, store: { default: { chats: [{ id: ANA, name: "Ana" }, { id: BIA }], messages: { [ANA]: thread(ANA, 130), [BIA]: thread(BIA, 4, "B") } } } };
  const h = await start(w);
  const first = await h.post("/history/start");
  assert.equal(first.state, "running");
  const a = await settled(h);
  assert.deepEqual([a.state, a.chatsTotal, a.messages], ["done", 2, 134]);
  const rows = await h.sql("SELECT msg_id, chat_id, body, created_at, sent_at FROM messages ORDER BY msg_id");
  assert.equal(rows.length, 134);
  assert.ok(rows.every((r) => new Date(r.created_at).getTime() === new Date(r.sent_at).getTime()), "history counts as received when it was sent");
  h.requests.length = 0;
  await h.post("/history/start");
  const b = await settled(h);
  assert.deepEqual([b.state, b.chatsTotal, b.chatsDone, b.messages], ["done", 2, 2, 0]);
  assert.deepEqual(await h.sql("SELECT msg_id, chat_id, body, created_at, sent_at FROM messages ORDER BY msg_id"), rows);
  assert.deepEqual(reqs(h, new RegExp("/chats/" + ANA + "/messages$")).map((r) => r.query.offset), ["0", "100", "200"]);
  assert.equal((await h.sql("SELECT COUNT(*)::int AS n FROM history_chats WHERE state = 'done'"))[0].n, 2);
});

test("caps: the newest messages per chat and an overall limit; the chats past the limit still show with their last message", async () => {
  const chats = [ANA, BIA, CAIO].map((id) => ({ id }));
  const w = { sessions: { default: linked() }, store: { default: { chats, messages: { [ANA]: thread(ANA, 250), [BIA]: thread(BIA, 180, "B"), [CAIO]: thread(CAIO, 40, "C") } } } };
  const h = await start(w, { settings: { historyPerChat: 150, historyTotal: 220 } });
  assert.deepEqual((await h.get("/history")).limits, { perChat: 150, total: 220 });
  await h.post("/history/start");
  const s = await settled(h);
  assert.equal(s.state, "done");
  assert.equal(await count(h, `chat_id = '${ANA}'`), 150);
  assert.deepEqual((await h.messages(ANA, { limit: "200" })).map((m) => m.body).slice(0, 2), ["H 101", "H 102"], "the newest 150");
  assert.equal(await count(h, `chat_id = '${BIA}'`), 70, "what was left of the overall limit");
  assert.equal(await count(h, `chat_id = '${CAIO}'`), 1, "only the last message from the chat list");
  assert.deepEqual((await h.sql("SELECT chat_id, state, seen FROM history_chats ORDER BY position")).map((r) => [r.chat_id, r.state, r.seen]), [[ANA, "done", 150], [BIA, "done", 70], [CAIO, "capped", 0]]);
  assert.equal((await h.chats()).length, 3);
  // Nonsense settings fall back to the defaults.
  const h2 = await start({ sessions: { default: linked() } }, { settings: { historyPerChat: "abc", historyTotal: -5 } });
  assert.deepEqual((await h2.get("/history")).limits, { perChat: 1000, total: 50000 });
});

test("a runtime restart in the middle: the import resumes from its cursor and ends with the same rows", async () => {
  const chats = [ANA, BIA, CAIO].map((id) => ({ id }));
  let release, stopAt = 2;
  const reached = new Promise((r) => { release = r; });
  const w = { sessions: { default: linked() }, store: { default: { chats, messages: { [ANA]: thread(ANA, 150), [BIA]: thread(BIA, 320, "B"), [CAIO]: thread(CAIO, 5, "C") } } } };
  // The third page request of Bia never answers before the "restart".
  w.gate = async (kind, req, chat) => { if (kind === "messages" && chat === BIA && req.query.offset === "200" && stopAt) { stopAt = 0; release(); await sleep(30); } };
  const h = await start(w);
  await h.post("/history/start");
  await reached;
  await plugin.stop();
  const mid = (await h.sql("SELECT chat_id, state, next_offset, seen FROM history_chats ORDER BY position")).map((r) => [r.chat_id, r.state]);
  assert.deepEqual(mid.slice(0, 2), [[ANA, "done"], [BIA, "pending"]]);
  assert.equal(h.kv.get("s:default:history").state, "running", "interrupted, not finished");
  const before = await count(h);
  assert.ok(before >= 350 && before < 475, String(before));
  // The runtime comes back: nothing asks for it, the import goes on by itself.
  h.requests.length = 0;
  plugin.start(h.ctx);
  const s = await settled(h);
  assert.deepEqual([s.state, s.chatsTotal, s.chatsDone, s.messages], ["done", 3, 3, 475]);
  assert.equal(await count(h), 475);
  assert.equal((await h.sql("SELECT COUNT(DISTINCT stanza)::int AS n FROM messages"))[0].n, 475);
  assert.equal(reqs(h, /\/chats\/overview$/).length, 0, "the chat list is not read again");
  assert.equal(reqs(h, new RegExp("/chats/" + ANA + "/messages$")).length, 0, "a finished chat is not read again");
  assert.ok(reqs(h, new RegExp("/chats/" + BIA + "/messages$")).every((r) => Number(r.query.offset) >= 200), "Bia goes on where she stood");
});

test("a webhook message that arrives during the import is the same row as its copy in the history, whichever address it came by", async () => {
  let release, hold;
  const reached = new Promise((r) => { release = r; }), go = new Promise((r) => { hold = r; });
  const hist = thread(ANA, 6);
  // The newest history message is one the webhook also delivers, under the contact's lid; the group's is delivered with a lid participant.
  const w = { sessions: { default: linked() }, store: { default: { chats: [{ id: ANA }, { id: GROUP }], lids: [{ lid: ANA_LID, pn: ANA }], messages: {
    [ANA]: [{ id: `false_${ANA}_LIVE1`, timestamp: 1700000100, from: ANA, fromMe: false, body: "live one", hasMedia: false }, ...hist],
    [GROUP]: [{ id: `false_${GROUP}_GLIVE_${CAIO}`, timestamp: 1700000200, from: GROUP, participant: CAIO, fromMe: false, body: "live group", hasMedia: false }] } } } };
  w.gate = async (kind, _req, chat) => { if (kind === "messages" && chat === ANA) { release(); await go; } };
  const h = await start(w);
  await h.post("/history/start");
  await reached;
  await h.event("message.any", { id: `false_${ANA_LID}_LIVE1`, timestamp: 1700000100, from: ANA_LID, fromMe: false, body: "live one", hasMedia: false });
  await h.event("message.any", { id: `false_${GROUP}_GLIVE_333333333333333@lid`, timestamp: 1700000200, from: GROUP, participant: "333333333333333@lid", fromMe: false, body: "live group", hasMedia: false });
  await h.event("message.any", { id: `false_${ANA}_LIVE2`, timestamp: 1700000300, from: ANA, fromMe: false, body: "live two", hasMedia: false });
  hold();
  const s = await settled(h);
  assert.equal(s.state, "done");
  assert.deepEqual((await h.sql("SELECT stanza, COUNT(*)::int AS n FROM messages GROUP BY stanza HAVING COUNT(*) > 1")), []);
  assert.equal(await count(h), 6 + 3);
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.total]).sort(), [[GROUP, 1], [ANA, 8]], "the lid copy and the phone copy are one chat");
  assert.deepEqual((await h.messages(ANA)).slice(-2).map((m) => m.body), ["live one", "live two"]);
  assert.equal(chats.find((c) => c.chatId === ANA).unread, 1, "what only arrived live is unread; what the history also has is not");
});

test("who is who applies to imported rows: lid chats fold into the phone chat (lids list, merged answers), and a Brazilian number into its real spelling", async () => {
  const OLD = "553188887777@c.us", NEW = "5531988887777@c.us";
  const w = { sessions: { default: linked() }, store: { default: {
    chats: [{ id: ANA_LID, name: "Ana Lima" }, { id: ANA }, { id: DAN }, { id: OLD, name: "Olga" }],
    lids: [{ lid: ANA_LID, pn: ANA }],
    messages: {
      [ANA_LID]: thread(ANA_LID, 3, "L", 1690000000), [ANA]: thread(ANA, 2, "P", 1695000000),
      // WAHA answers Dan's phone chat with the messages of his lid chat merged in.
      [DAN]: [{ id: `false_${DAN_LID}_D2`, timestamp: 1690000500, from: DAN_LID, fromMe: false, body: "from the lid", hasMedia: false }, { id: `false_${DAN}_D1`, timestamp: 1690000400, from: DAN, fromMe: false, body: "from the phone", hasMedia: false }],
      [OLD]: thread(OLD, 2, "O") },
    contacts: [{ id: OLD, number: "553188887777", name: "Olga", isMyContact: true }] } } };
  const h = await start(w);
  // Olga wrote once from the other spelling of her number: still one chat after the import.
  await h.message({ from: NEW, body: "other spelling" });
  await h.post("/history/start");
  assert.equal((await settled(h)).state, "done");
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.name, c.total]).sort(), [[ANA, "Ana Lima", 5], [DAN, null, 2], [NEW, "Olga", 3]].sort());
  assert.deepEqual((await h.messages(ANA)).map((m) => m.body), ["L 1", "L 2", "L 3", "P 1", "P 2"]);
  assert.deepEqual((await h.messages(DAN_LID)).map((m) => m.body), ["from the phone", "from the lid"]);
  assert.deepEqual((await h.sql("SELECT lid, pn FROM lid_map ORDER BY lid")).map((r) => [r.lid, r.pn]), [[ANA_LID, ANA], [DAN_LID, DAN], ["551177778888@c.us", DAN], [OLD, NEW]], "lids, and the other spelling of each Brazilian mobile");
  await h.post("/send", { chatId: NEW, text: "oi" });
  assert.equal(h.requests.find((r) => r.path === "/api/sendText").body.chatId, NEW, "a reply goes where the contact last wrote from");
});

test("each account imports its own history: sessions, rows, cursors and progress never mix", async () => {
  const w = { sessions: { a: linked(), b: linked({ me: { id: "5511900000002@c.us", pushName: "Lucy" } }) }, store: {
    a: { chats: [{ id: ANA, name: "Ana at the shop" }], messages: { [ANA]: thread(ANA, 4, "A") }, contacts: [{ id: ANA, number: "5511911112222", name: "Ana at the shop", isMyContact: true }] },
    b: { chats: [{ id: ANA, name: "Ana, friend" }, { id: BIA }], messages: { [ANA]: thread(ANA, 4, "A"), [BIA]: thread(BIA, 2, "B") }, contacts: [] } } };
  const h = await start(w, { kv: { accounts: [acct("a"), acct("b")] } });
  await h.post("/history/start", { session: "b" });
  const sb = await settled(h, "b");
  assert.deepEqual([sb.state, sb.chatsTotal, sb.messages], ["done", 2, 6]);
  assert.equal((await h.get("/history", { session: "a" })).state, "idle");
  assert.deepEqual(await h.sql("SELECT DISTINCT session FROM messages"), [{ session: "b" }]);
  assert.ok(h.requests.filter((r) => /\/chats/.test(r.path)).every((r) => r.path.startsWith("/api/b/")));
  await h.post("/history/start", { session: "a" });
  assert.equal((await settled(h, "a")).messages, 4, "the same message ids exist once per account");
  assert.deepEqual(await h.sql("SELECT session, COUNT(*)::int AS n FROM messages GROUP BY session ORDER BY session"), [{ session: "a", n: 4 }, { session: "b", n: 6 }]);
  assert.deepEqual((await h.get("/chats", { session: "a" })).chats.map((c) => c.name), ["Ana at the shop"]);
  assert.deepEqual((await h.get("/chats", { session: "b" })).chats.map((c) => c.name).sort(), ["Ana, friend", null].sort());
  assert.deepEqual((await h.get("/accounts")).accounts.map((x) => [x.session, x.history.state, x.history.chatsTotal]), [["a", "done", 1], ["b", "done", 2]]);
  assert.ok(h.events.filter((e) => e.name === "history").every((e) => e.session === "a" || e.session === "b"));
  // Removing an account with its data takes its cursors and its import state along.
  await h.post("/accounts/remove", { session: "b", deleteData: true });
  assert.deepEqual(await h.sql("SELECT DISTINCT session FROM history_chats"), [{ session: "a" }]);
  assert.equal(h.kv.get("s:b:history"), null);
});

test("cancel stops at the next page and keeps what came in; starting again finishes the job", async () => {
  let release, hold;
  const reached = new Promise((r) => { release = r; }), go = new Promise((r) => { hold = r; });
  const w = { sessions: { default: linked() }, store: { default: { chats: [{ id: ANA }, { id: BIA }], messages: { [ANA]: thread(ANA, 250), [BIA]: thread(BIA, 3, "B") } } } };
  w.gate = async (kind, req, chat) => { if (kind === "messages" && chat === ANA && req.query.offset === "100" && release) { const r = release; release = null; r(); await go; } };
  const h = await start(w);
  await h.post("/history/start");
  await reached;
  const c = await h.post("/history/cancel");
  assert.equal(c.state, "cancelled"); assert.equal(c.phase, null);
  hold();
  await sleep(50);
  const s = await h.get("/history");
  assert.equal(s.state, "cancelled");
  const kept = await count(h);
  assert.ok(kept >= 100 && kept <= 202, String(kept));
  assert.equal(reqs(h, new RegExp("/chats/" + BIA + "/messages$")).length, 0);
  await h.post("/history/start");
  const again = await settled(h);
  assert.equal(again.state, "done"); assert.equal(await count(h), 253);
});

test("what can go wrong: not linked, a session linked without the store, a chat WAHA cannot read, an engine that ignores the offset", async () => {
  // Not connected: nothing starts.
  const h0 = await start({ sessions: { default: { status: "SCAN_QR_CODE", engine: "NOWEB", config: { webhooks: [], noweb: { store: STORE } } } } });
  const e = await fail(h0.post("/history/start"));
  assert.equal(e.status, 409); assert.equal(e.code, "session_not_ready");
  assert.equal((await fail(h0.post("/history/start", {}, "u2"))).status, 403);
  // Linked while the store was off: WAHA has nothing; the user is told what to do.
  const h1 = await start({ sessions: { default: { status: "WORKING", engine: "NOWEB", me: ME, config: { webhooks: [] } } } });
  await h1.post("/history/start");
  const s1 = await settled(h1);
  assert.equal(s1.state, "failed"); assert.match(s1.error, /history store was off/); assert.match(s1.error, /link the phone again/);
  // One chat fails: the others still come in.
  const w2 = { sessions: { default: linked() }, broken: [BIA], store: { default: { chats: [{ id: ANA }, { id: BIA }, { id: CAIO }], messages: { [ANA]: thread(ANA, 2), [BIA]: thread(BIA, 2, "B"), [CAIO]: thread(CAIO, 2, "C") } } } };
  const h2 = await start(w2);
  await h2.post("/history/start");
  const s2 = await settled(h2);
  assert.deepEqual([s2.state, s2.chatsDone], ["done", 3]);
  assert.deepEqual((await h2.sql("SELECT chat_id, state FROM history_chats ORDER BY position")).map((r) => r.state), ["done", "failed", "done"]);
  assert.equal(await count(h2), 2 + 1 + 2);
  // WEBJS-like: the same page comes back whatever the offset; the import notices and ends. No overview either: the plain chat list is used.
  const w3 = { sessions: { default: linked({ engine: "WEBJS", config: { webhooks: [] } }) }, ignoreOffset: true, noOverview: true, store: { default: { chats: [{ id: ANA, name: "Ana" }], messages: { [ANA]: thread(ANA, 100) }, contacts: [{ id: ANA, name: "Ana", isMyContact: true }] } } };
  const h3 = await start(w3);
  await h3.post("/history/start");
  const s3 = await settled(h3);
  assert.deepEqual([s3.state, s3.messages, s3.chatsTotal], ["done", 100, 1]);
  assert.equal(reqs(h3, new RegExp("/chats/" + ANA + "/messages$")).length, 2);
  assert.equal(reqs(h3, /^\/api\/contacts\/all$/).length, 2);
});

test("after a fresh link quiet passes pick up what the phone handed to WAHA later, without showing an import again", async () => {
  const st = { chats: [{ id: ANA }], messages: { [ANA]: thread(ANA, 2) } };
  const w = { sessions: { default: { status: "SCAN_QR_CODE", engine: "NOWEB", config: { webhooks: [], noweb: { store: STORE } } } }, store: { default: st } };
  const h = await start(w);
  await h.get("/session");
  Object.assign(w.sessions.default, { status: "WORKING", me: ME });
  await h.get("/session"); // no webhook needed: the status poll notices the link too
  const s = await settled(h);
  assert.deepEqual([s.state, s.chatsTotal, s.messages], ["done", 1, 2]);
  // A minute later WAHA has more.
  st.chats.push({ id: BIA }); st.messages[BIA] = thread(BIA, 3, "B"); st.messages[ANA] = thread(ANA, 5);
  h.events.length = 0;
  const now = Date.now;
  try {
    Date.now = () => now() + 61_000;
    await h.tick();
    for (let i = 0; i < 400 && (await count(h)) < 8; i++) await sleep(5);
  } finally { Date.now = now; }
  assert.equal(await count(h), 8);
  await sleep(30);
  const after = await h.get("/history");
  assert.deepEqual([after.state, after.chatsTotal, after.chatsDone, after.messages], ["done", 2, 2, 8]);
  assert.ok(h.events.filter((e) => e.name === "history").every((e) => e.state === "done"), "never 'running' again");
  assert.ok(h.events.some((e) => e.name === "chats"));
  assert.equal((await h.chats()).reduce((n, c) => n + c.unread, 0), 0);
});

// ---------------------------------------------------------------- contacts

/** 620 contacts: Ana is saved, Bia is known by push name only, a business, a lid contact, the account itself and a group (both skipped). */
function people() {
  const list = [
    { id: ANA, number: "5511911112222", name: "Ana Lima", pushname: "Aninha", isMyContact: true, isBlocked: false },
    { id: BIA, number: "5521933334444", name: "", pushname: "Bia", isMyContact: false },
    { id: CAIO, number: "5511955556666", name: "", pushname: "", verifiedName: "Padaria Caio", isBusiness: true, isMyContact: false },
    { id: DAN_LID, number: "222222222222222", name: "Dan Reis", isMyContact: true },
    { id: ME.id, number: "5511900000001", name: "Me", isMe: true }, { id: GROUP, name: "Team", isGroup: true }, { id: "status@broadcast", name: "x" },
  ];
  for (let i = 0; i < 614; i++) list.push({ id: `55119${String(20000000 + i)}@c.us`, number: `55119${String(20000000 + i)}`, name: i < 300 ? `Person ${String(i).padStart(3, "0")}` : "", pushname: "", isMyContact: i < 300 });
  return list;
}

test("contacts sync: every contact WAHA has is paged in with saved name, push name, business and address-book flag; lids link; the picker reads the stored list", async () => {
  const w = { sessions: { default: linked() }, store: { default: { contacts: people(), lids: [{ lid: DAN_LID, pn: DAN }], groups: [{ id: GROUP, subject: "Team" }] } } };
  const h = await start(w);
  assert.deepEqual(await h.post("/contacts/sync"), { ok: true });
  for (let i = 0; i < 4000 && !h.events.some((e) => e.name === "contacts"); i++) await sleep(5);
  assert.deepEqual(reqs(h, /^\/api\/contacts\/all$/).map((r) => [r.query.limit, r.query.offset, r.query.session]), [["500", "0", "default"], ["500", "500", "default"], ["500", "1000", "default"]]);
  const r = await h.get("/contacts", { limit: "500" });
  assert.equal(r.total, 618); assert.equal(r.syncing, false); assert.ok(r.syncedAt);
  const by = Object.fromEntries((await h.get("/contacts", { q: "a" })).contacts.concat((await h.get("/contacts", { q: "Bia" })).contacts, (await h.get("/contacts", { q: "Dan" })).contacts).map((c) => [c.chatId, c]));
  assert.deepEqual(by[ANA], { chatId: ANA, name: "Ana Lima", pushName: "Aninha", businessName: "", phone: "5511911112222", isMyContact: true, isBusiness: false, avatar: null });
  assert.deepEqual([by[BIA].name, by[BIA].isMyContact], ["Bia", false]);
  assert.deepEqual([by[CAIO].name, by[CAIO].businessName, by[CAIO].isBusiness], ["Padaria Caio", "Padaria Caio", true]);
  assert.deepEqual([by[DAN].name, by[DAN].phone, by[DAN].isMyContact], ["Dan Reis", "5511977778888", true], "a contact listed by lid shows under its phone number");
  // Saved names first, then people known by their own name, then bare numbers.
  const names = r.contacts.map((c) => c.name);
  assert.deepEqual(names.slice(0, 2), ["Ana Lima", "Bia"]); assert.equal(names.filter(Boolean).length, 304); assert.equal(names.indexOf(null), 304);
  assert.deepEqual((await h.get("/contacts", { limit: "2", offset: "1" })).contacts.map((c) => c.name), ["Bia", "Dan Reis"]);
  assert.equal(h.events.filter((e) => e.name === "contacts").length, 1);
  // From now on the picker needs no WAHA call, and a chat title uses the saved name.
  h.requests.length = 0;
  await h.get("/contacts"); await h.get("/contacts", { q: "ana" });
  assert.equal(reqs(h, /^\/api\/contacts\/all$/).length, 0);
  await h.message({ from: DAN_LID, body: "oi", _data: { pushName: "D." } });
  await h.message({ from: `${GROUP}`, participant: BIA, body: "in the group" });
  const chats = await h.chats();
  assert.deepEqual(chats.map((c) => [c.chatId, c.name]).sort(), [[GROUP, "Team"], [DAN, "Dan Reis"]]);
  assert.equal((await h.messages(GROUP))[0].senderName, "Bia", "group senders are named from the synced contacts");
});

test("contacts stay fresh: a sync is idempotent, a contact removed from the address book is no longer saved, a renamed one follows", async () => {
  const st = { contacts: [{ id: ANA, number: "5511911112222", name: "Ana Lima", isMyContact: true }, { id: BIA, number: "5521933334444", name: "Bia Souza", isMyContact: true }] };
  const w = { sessions: { default: linked() }, store: { default: st } };
  const h = await start(w);
  const sync = async () => { const n = h.events.filter((e) => e.name === "contacts").length; await h.post("/contacts/sync"); for (let i = 0; i < 2000 && h.events.filter((e) => e.name === "contacts").length === n; i++) await sleep(5); };
  await sync(); await sync();
  assert.equal((await h.sql("SELECT COUNT(*)::int AS n FROM contacts"))[0].n, 2);
  st.contacts = [{ id: ANA, number: "5511911112222", name: "Ana L. Lima", isMyContact: true }, { id: BIA, number: "5521933334444", name: "", pushname: "Bia", isMyContact: false }];
  await sync();
  assert.deepEqual((await h.get("/contacts")).contacts.map((c) => [c.name, c.isMyContact]), [["Ana L. Lima", true], ["Bia Souza", false]]);
  st.contacts = [{ id: ANA, number: "5511911112222", name: "Ana L. Lima", isMyContact: true }];
  await sync();
  assert.deepEqual((await h.sql("SELECT chat_id, saved FROM contacts ORDER BY chat_id")).map((r) => [r.chat_id, r.saved]), [[ANA, true], [BIA, false]]);
  // When the account comes back (WORKING on the webhook) the contacts are read again, but not more than once in a while.
  const before = reqs(h, /^\/api\/contacts\/all$/).length;
  await h.event("session.status", { status: "WORKING" }, { me: ME });
  await sleep(40);
  assert.equal(reqs(h, /^\/api\/contacts\/all$/).length, before, "synced a moment ago");
  // WAHA cannot list contacts: nothing is lost and nothing claims to be synced.
  const h2 = await start({ sessions: { default: { status: "WORKING", engine: "NOWEB", me: ME, config: { webhooks: [] } } } });
  await h2.post("/contacts/sync"); await sleep(40);
  assert.equal((await h2.get("/contacts")).syncedAt, null);
});

test("the scheduled refresh reads the contacts of every working account when they are older than six hours, and each account keeps its own", async () => {
  const w = { sessions: { a: linked(), b: linked({ me: { id: "5511900000002@c.us", pushName: "Lucy" } }), c: { status: "STOPPED", engine: "NOWEB", config: { webhooks: [], noweb: { store: STORE } } } }, store: {
    a: { contacts: [{ id: ANA, number: "5511911112222", name: "Ana (shop)", isMyContact: true }] }, b: { contacts: [{ id: ANA, number: "5511911112222", name: "Ana (friend)", isMyContact: true }, { id: BIA, number: "5521933334444", name: "Bia", isMyContact: true }] } } };
  const h = await start(w, { kv: { accounts: [acct("a"), acct("b"), acct("c")] } });
  await h.tick();
  for (let i = 0; i < 2000 && h.events.filter((e) => e.name === "contacts").length < 2; i++) await sleep(5);
  assert.deepEqual((await h.get("/contacts", { session: "a" })).contacts.map((c) => c.name), ["Ana (shop)"]);
  assert.deepEqual((await h.get("/contacts", { session: "b" })).contacts.map((c) => c.name), ["Ana (friend)", "Bia"]);
  assert.equal((await h.get("/contacts", { session: "c" })).syncedAt, null);
  assert.deepEqual(await h.sql("SELECT session, COUNT(*)::int AS n FROM contacts GROUP BY session ORDER BY session"), [{ session: "a", n: 1 }, { session: "b", n: 2 }]);
  const n = reqs(h, /^\/api\/contacts\/all$/).length;
  await h.tick(); await sleep(30);
  assert.equal(reqs(h, /^\/api\/contacts\/all$/).length, n, "fresh: not read again");
  const now = Date.now;
  try { Date.now = () => now() + 6 * 3600_000 + 1000; await h.tick(); for (let i = 0; i < 2000 && reqs(h, /^\/api\/contacts\/all$/).length < n + 4; i++) await sleep(5); } finally { Date.now = now; }
  assert.equal(reqs(h, /^\/api\/contacts\/all$/).length, n + 4, "two accounts, two pages each");
});
