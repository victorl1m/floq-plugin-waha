// WhatsApp fallback: format, strict parsing, trust rules, timers, dedupe. Runs the real module against fakes (no runtime build needed).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

let tmp, F, C, plugin;
const bundle = async (entry, name) => {
  const out = join(tmp, name);
  await build({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, format: "esm", platform: "node", outfile: out, external: ["node:*"], logLevel: "silent" });
  return import(pathToFileURL(out).href);
};
before(async () => { tmp = mkdtempSync(join(tmpdir(), "waha-fb-")); F = await bundle("../runtime/fallback.ts", "fb.mjs"); C = await bundle("../runtime/client.ts", "c.mjs"); plugin = (await bundle("../runtime/index.ts", "rt.mjs")).default; });
after(() => rmSync(tmp, { recursive: true, force: true }));

const OWNER = "u1", ME = "5511999999999@c.us";
function rig(over = {}) {
  let t = 1_000_000;
  const o = { sent: [], edits: [], decisions: [], approvals: [], cfg: { enabled: true, afterMin: 3, ownChat: ME, hmacConfigured: true, allowApprovals: true, selfSession: false }, kvData: new Map(), pending: null, resolved: null, tickFn: null, editFails: false, resolveError: null };
  const deps = {
    ownLid: over.ownLid,
    attention: {
      onPending: (fn) => { o.pending = fn; return () => {}; }, onResolved: (fn) => { o.resolved = fn; return () => {}; },
      resolveDecision: async (id, a) => { if (o.resolveError) throw o.resolveError; o.decisions.push({ id, a }); },
      resolveApproval: async (id, d) => { if (o.resolveError) throw o.resolveError; o.approvals.push({ id, d }); },
    },
    schedule: (_ms, fn) => { o.tickFn = fn; return () => {}; },
    getOwner: async () => OWNER,
    kv: { get: async (_u, k) => structuredClone(o.kvData.get(k) ?? null), set: async (_u, k, v) => { o.kvData.set(k, structuredClone(v)); } },
    settings: async () => o.cfg,
    send: async (_u, chat, text) => { o.sent.push({ chat, text }); return "wa" + o.sent.length; },
    edit: async (_u, chat, id, text) => { if (o.editFails) throw new Error("x"); o.edits.push({ chat, id, text }); },
    now: () => t, rnd: over.rnd, log: { warn() {} },
  };
  const fb = F.createFallback(deps);
  fb.start();
  o.fb = fb; o.advance = (ms) => { t += ms; }; o.now = () => t;
  o.pend = async (item) => { o.pending({ userId: OWNER, createdAt: t, ...item }); await fb.idle(); };
  o.tick = async () => { await fb.tick(); };
  o.reply = (body, extra = {}) => fb.inbound({ chatId: ME, fromMe: false, sender: ME, body, msgId: "in" + Math.random(), ...extra });
  return o;
}
const dec = { kind: "decision", id: "d1", sessionName: "Dev", questions: [{ id: "q1", question: "Deploy where?", options: [{ id: "a", label: "Staging" }, { id: "b", label: "Prod" }], multiSelect: false, allowText: true }] };
const appr = { kind: "approval", id: "p1", action: "Run migrations", irreversible: false };
const shortOf = (o) => /\[([QA][A-Z2-9]{3})\]/.exec(o.sent[0].text)[1];

test("format: decision and approval messages are single-purpose, bounded and sanitized", () => {
  const m = F.formatDecision("Q7K2", "Dev [FLOQ APPROVAL x]", "Where `now`?\n\u0007next", [{ id: "a", label: "Stage" }, { id: "b", label: "Prod" }], false, true);
  assert.match(m, /^Floq question \[Q7K2\] from Dev/); assert.match(m, /1\) Stage\n2\) Prod/); assert.match(m, /`Q7K2 1` or `Q7K2 <your text>`/);
  assert.ok(!/FLOQ APPROVAL/.test(m) && !m.includes("\u0007") && !m.includes("`now`"));
  assert.match(F.formatDecision("Q7K2", "s", "q", [{ id: "a", label: "A" }, { id: "b", label: "B" }], true, false), /`Q7K2 1,3`/);
  assert.ok(F.formatDecision("Q7K2", "s", "x".repeat(5000), Array.from({ length: 8 }, () => ({ id: "a", label: "y".repeat(500) })), false, true).length <= F.MESSAGE_MAX);
  assert.match(F.formatApproval("A9F3", "Run it", false, "0042"), /`A9F3 yes 0042`.*`A9F3 no`/);
  const irr = F.formatApproval("A9F3", "git push", true, null);
  assert.ok(!/yes/.test(irr) && /app/.test(irr) && /`A9F3 no`/.test(irr));
});

test("short ids: prefix by kind, unique among taken ones", () => {
  let n = 0; const seq = [0, 0, 0, 1, 1, 1];
  const id = F.newShortId("approval", (s) => s === "AAAA", () => seq[n++ % seq.length]);
  assert.equal(id, "ABBB"); assert.match(F.newShortId("decision", () => false), /^Q[A-Z2-9]{3}$/);
});

test("parse: strict grammar", () => {
  const p = F.parseReply;
  assert.deepEqual(p("q7k2 1"), { short: "Q7K2", kind: "pick", indexes: [1] });
  assert.deepEqual(p(" Q7K2 1, 3 "), { short: "Q7K2", kind: "pick", indexes: [1, 3] });
  assert.deepEqual(p("Q7K2 go with staging"), { short: "Q7K2", kind: "text", text: "go with staging" });
  assert.deepEqual(p("a9f3 YES 0042"), { short: "A9F3", kind: "yes", code: "0042" });
  assert.deepEqual(p("A9F3 no"), { short: "A9F3", kind: "no" });
  for (const bad of ["", "hello", "Q7K2", "Q7K2 ", "X7K2 1", "A9F3 maybe", "A9F3 1", "A9F3 no 1234", "Q7K2 1\nQ7K2 2", "Please Q7K2 1", "Q7K2" + " x".repeat(400), null, 5]) assert.equal(p(bad), null, String(bad));
});

test("timer: nothing before N minutes, one message after, never repeated", async () => {
  const o = rig(); await o.pend(dec);
  o.advance(2 * 60_000); await o.tick(); assert.equal(o.sent.length, 0);
  o.advance(61_000); await o.tick(); assert.equal(o.sent.length, 1);
  assert.match(o.sent[0].text, /Deploy where\?/); assert.equal(o.sent[0].chat, ME);
  o.advance(10 * 60_000); await o.tick(); await o.pend(dec); await o.tick(); assert.equal(o.sent.length, 1);
});

test("timer: off when waFallback is off, delay 0, no number or no HMAC secret; other users ignored", async () => {
  for (const cfg of [{ enabled: false }, { afterMin: 0 }, { ownChat: null }, { hmacConfigured: false }]) {
    const o = rig(); Object.assign(o.cfg, cfg); await o.pend(dec); o.advance(3600_000); await o.tick(); assert.equal(o.sent.length, 0, JSON.stringify(cfg));
  }
  const o = rig(); await o.pend({ ...dec, userId: "other" }); o.advance(3600_000); await o.tick(); assert.equal(o.sent.length, 0);
});

test("timer: after a restart only items the host replays are prompted (stale kv pending is never sent)", async () => {
  const o = rig(); assert.ok(o.tickFn); await o.pend(dec);
  const kv = o.kvData; const o2 = rig(); for (const [k, v] of kv) o2.kvData.set(k, v);
  o2.kvData.set("fallback.state", { pending: { d1: { item: { ...dec, userId: OWNER }, dueAt: 0 } }, prompts: {} }); // an old build's persisted pending
  o2.advance(4 * 60_000); await o2.tick(); assert.equal(o2.sent.length, 0); // host replayed nothing: the item is gone
  await o2.pend(dec); o2.advance(4 * 60_000); await o2.tick(); assert.equal(o2.sent.length, 1); // replayed: sent
  // a replay of an item that already has a prompt does not prompt again
  await o2.pend(dec); o2.advance(4 * 60_000); await o2.tick(); assert.equal(o2.sent.length, 1);
});

test("timer: items never closed by the host expire after the prompt TTL; resolved items are never sent", async () => {
  const o = rig(); await o.pend(dec); o.advance(F.PROMPT_TTL_MS + 1000); await o.tick(); assert.equal(o.sent.length, 0);
  const r = rig(); await r.pend(dec); r.resolved({ kind: "decision", id: "d1", status: "expired", by: "app" }); await r.fb.idle(); r.advance(3600_000); await r.tick(); assert.equal(r.sent.length, 0);
});

test("rate cap: at most 20 fallback prompts per hour", async () => {
  const o = rig(); o.cfg.afterMin = 1;
  for (let i = 0; i < 40; i++) {
    await o.pend({ ...dec, id: "d" + i }); o.advance(61_000); await o.tick();
    o.resolved({ kind: "decision", id: "d" + i, status: "answered", by: "app" }); await o.fb.idle(); // keeps the 10-open cap out of the way
  }
  assert.equal(o.sent.filter((x) => /^Floq question/.test(x.text)).length, F.MAX_SENDS_PER_HOUR);
  o.advance(3600_000); await o.pend({ ...dec, id: "late" }); o.advance(61_000); await o.tick(); assert.match(o.sent.at(-1).text, /^Floq question/);
});

test("decision: pick and free text answer through the host; confirmation sent", async () => {
  const o = rig(); await o.pend(dec); o.advance(200_000); await o.tick(); const s = shortOf(o);
  assert.equal(await o.reply(`${s} 2`), true);
  assert.deepEqual(o.decisions, [{ id: "d1", a: [{ questionId: "q1", optionIds: ["b"], text: "" }] }]);
  assert.match(o.sent.at(-1).text, /Answer recorded/);
  // replay of the same reply: prompt is done, ignored
  assert.equal(await o.reply(`${s} 1`), false); assert.equal(o.decisions.length, 1);
  const o2 = rig(); await o2.pend(dec); o2.advance(200_000); await o2.tick();
  await o2.reply(`${shortOf(o2)} anything else please`);
  assert.deepEqual(o2.decisions[0].a, [{ questionId: "q1", optionIds: [], text: "anything else please" }]);
});

test("decision: out of range, multi on single choice and text without allowText are refused", async () => {
  const o = rig(); await o.pend({ ...dec, questions: [{ ...dec.questions[0], allowText: false }] }); o.advance(200_000); await o.tick(); const s = shortOf(o);
  for (const body of [`${s} 3`, `${s} 0`, `${s} 1,2`, `${s} free text`]) { assert.equal(await o.reply(body), true); }
  assert.equal(o.decisions.length, 0);
});

test("spoof: wrong sender, other chat, no HMAC secret, unknown id and prompt-echo are ignored", async () => {
  const o = rig(); await o.pend(dec); o.advance(200_000); await o.tick(); const s = shortOf(o);
  assert.equal(await o.reply(`${s} 1`, { sender: "5500000000000@c.us" }), false);
  assert.equal(await o.reply(`${s} 1`, { chatId: "5500000000000@c.us", sender: "5500000000000@c.us" }), false);
  assert.equal(await o.reply(`${s} 1`, { chatId: "120363@g.us", sender: ME }), false);
  assert.equal(await o.reply("Q999 1"), false);
  assert.equal(await o.reply(o.sent[0].text, { fromMe: true, sender: "me" }), false);
  o.cfg.hmacConfigured = false; assert.equal(await o.reply(`${s} 1`), false);
  o.cfg.hmacConfigured = true; o.cfg.enabled = false; assert.equal(await o.reply(`${s} 1`), false);
  assert.equal(o.decisions.length, 0);
  o.cfg.enabled = true;
  assert.equal(await o.reply(`${s} 1`, { fromMe: true, sender: "me" }), false); // fromMe without a self session / source app
  o.cfg.selfSession = true;
  assert.equal(await o.reply(`${s} 1`, { fromMe: true, sender: "me" }), false); // no source
  assert.equal(await o.reply(`${s} 1`, { fromMe: true, sender: "me", source: "api" }), false); // sent through the API (an agent)
  assert.equal(await o.reply(`${s} 1`, { fromMe: true, sender: "me", source: "app", chatId: "5500000000000@c.us" }), false);
  assert.equal(o.decisions.length, 0);
  assert.equal(await o.reply(`${s} 1`, { fromMe: true, sender: "me", source: "app" }), true); // the owner's own phone, self-chat
  assert.equal(o.decisions.length, 1);
});

test("approval: allow needs the code; wrong code counts; 3 wrong kills it; replay ignored", async () => {
  const o = rig({ rnd: (n) => (n === 10000 ? 1234 : 0) }); await o.pend(appr); o.advance(200_000); await o.tick();
  const s = shortOf(o); assert.match(o.sent[0].text, /yes 1234/);
  await o.reply(`${s} yes`); await o.reply(`${s} yes 0000`); assert.equal(o.approvals.length, 0);
  await o.reply(`${s} yes 1111`); assert.match(o.sent.at(-1).text, /Too many wrong codes/);
  await o.reply(`${s} yes 1234`); assert.equal(o.approvals.length, 0); // the dead code never allows
  await o.reply(`${s} no`); assert.deepEqual(o.approvals, [{ id: "p1", d: "deny" }]); // but deny still works
  const o2 = rig({ rnd: (n) => (n === 10000 ? 1234 : 0) }); await o2.pend(appr); o2.advance(200_000); await o2.tick();
  await o2.reply(`${shortOf(o2)} yes 1234`);
  assert.deepEqual(o2.approvals, [{ id: "p1", d: "allow" }]); assert.match(o2.sent.at(-1).text, /Approved/);
  assert.equal(await o2.reply(`${shortOf(o2)} yes 1234`), false); assert.equal(o2.approvals.length, 1);
});

test("approval: code expires after 10 minutes; deny still works without a code", async () => {
  const o = rig({ rnd: (n) => (n === 10000 ? 7 : 0) }); await o.pend(appr); o.advance(200_000); await o.tick(); const s = shortOf(o);
  o.advance(F.CODE_TTL_MS + 1000);
  await o.reply(`${s} yes 0007`); assert.equal(o.approvals.length, 0); assert.match(o.sent.at(-1).text, /expired/);
  await o.reply(`${s} no`); assert.deepEqual(o.approvals, [{ id: "p1", d: "deny" }]); // deny after the code expired
  const o2 = rig(); await o2.pend(appr); o2.advance(200_000); await o2.tick();
  await o2.reply(`${shortOf(o2)} no`); assert.deepEqual(o2.approvals, [{ id: "p1", d: "deny" }]);
});

test("approval: irreversible can only be denied from WhatsApp", async () => {
  const o = rig(); await o.pend({ ...appr, id: "p2", action: "git push origin main", irreversible: true }); o.advance(200_000); await o.tick(); const s = shortOf(o);
  assert.ok(!/ \d{4}\b/.test(o.sent[0].text.replace(s, "")));
  await o.reply(`${s} yes 0000`); await o.reply(`${s} yes`); assert.equal(o.approvals.length, 0); assert.match(o.sent.at(-1).text, /Floq app/);
  await o.reply(`${s} no`); assert.deepEqual(o.approvals, [{ id: "p2", d: "deny" }]);
});

test("a decision reply cannot answer an approval and vice versa", async () => {
  const o = rig(); await o.pend(appr); o.advance(200_000); await o.tick();
  assert.equal(await o.reply(`${shortOf(o)} 1`), false);
  const d = rig(); await d.pend(dec); d.advance(200_000); await d.tick();
  assert.equal(await d.reply(`A${shortOf(d).slice(1)} yes 0000`), false);
});

test("dedupe: answered in the app edits the WhatsApp message; falls back to a follow-up", async () => {
  const o = rig(); await o.pend(dec); o.advance(200_000); await o.tick();
  o.resolved({ kind: "decision", id: "d1", status: "answered", by: "app" }); await o.fb.idle();
  assert.equal(o.edits.length, 1); assert.equal(o.edits[0].id, "wa1"); assert.match(o.edits[0].text, /Answered in Floq/);
  assert.equal(o.sent.length, 1);
  assert.equal(await o.reply(`${shortOf(o)} 1`), false);
  const f = rig(); f.editFails = true; await f.pend(dec); f.advance(200_000); await f.tick();
  f.resolved({ kind: "decision", id: "d1", status: "answered", by: "app" }); await f.fb.idle();
  assert.equal(f.sent.length, 2); assert.match(f.sent[1].text, /Answered in Floq/);
});

test("dedupe: resolved before the timer fires means no message; own WhatsApp answer causes no edit", async () => {
  const o = rig(); await o.pend(dec); o.resolved({ kind: "decision", id: "d1", status: "answered", by: "app" }); await o.fb.idle();
  o.advance(3600_000); await o.tick(); assert.equal(o.sent.length, 0);
  const w = rig(); await w.pend(dec); w.advance(200_000); await w.tick(); await w.reply(`${shortOf(w)} 1`);
  w.resolved({ kind: "decision", id: "d1", status: "answered", by: "plugin" }); await w.fb.idle(); assert.equal(w.edits.length, 0);
});

test("409 from the host: reported as already answered, no further tries", async () => {
  const o = rig(); await o.pend(dec); o.advance(200_000); await o.tick(); const s = shortOf(o);
  o.resolveError = Object.assign(new Error("conflict"), { status: 409 });
  assert.equal(await o.reply(`${s} 1`), true); assert.match(o.sent.at(-1).text, /Already answered/);
  assert.equal(await o.reply(`${s} 1`), false);
});

test("approval code is burned before allow is requested (host failure does not allow a retry)", async () => {
  const o = rig({ rnd: (n) => (n === 10000 ? 5 : 0) }); await o.pend(appr); o.advance(200_000); await o.tick(); const s = shortOf(o);
  o.resolveError = new Error("boom"); await o.reply(`${s} yes 0005`);
  o.resolveError = null; assert.equal(await o.reply(`${s} yes 0005`), false); assert.equal(o.approvals.length, 0);
});

test("client: WAHA edit and delete endpoints", async () => {
  const calls = [];
  const f = async (_u, url, init) => { calls.push({ url, ...init }); return { ok: true, status: 200 }; };
  await C.editText(f, "u", "https://w.example", "k", "default", "55@c.us", "true_55@c.us_AAA", "hi");
  await C.deleteMessage(f, "u", "https://w.example", "k", "default", "55@c.us", "true_55@c.us_AAA");
  assert.equal(calls[0].url, "https://w.example/api/default/chats/55%40c.us/messages/true_55%40c.us_AAA"); assert.equal(calls[0].method, "PUT"); assert.deepEqual(JSON.parse(calls[0].body), { text: "hi" });
  assert.equal(calls[1].method, "DELETE");
  await assert.rejects(C.editText(async () => ({ ok: false, status: 404 }), "u", "https://w", "k", "s", "c@c.us", "m", "t"), { status: 404 });
});

test("plugin wiring: webhook reply is consumed, not toasted; plugin without ctx.attention still starts", async () => {
  const hooks = {}, toasts = [], decisions = []; let pend;
  const base = {
    httpError: (s, c, m) => Object.assign(new Error(m), { status: s, code: c }), installOwner: async () => OWNER,
    settings: { get: async () => ({ baseUrl: "https://w.example", assistantPhone: "+5511999999999", waFallback: true, fallbackAfterMin: 1 }) },
    secrets: { getInstall: async () => "key" }, kv: { get: async () => null, set: async () => {} },
    fetchUserUrl: async () => ({ ok: true, status: 200, json: () => ({ id: "m1" }) }),
    db: { query: async () => ({ rows: [], rowCount: 1 }) }, events: { publish() {} }, toast: (_u, t) => toasts.push(t), log: { warn() {}, info() {} },
    approvals: {}, routes: { get() {}, post() {} }, internalRoutes: { call() {} }, webhooks: { on: (n, h) => (hooks[n] = h) }, schedule: () => () => {},
  };
  plugin.start({ ...base, attention: { onPending: (fn) => { pend = fn; return () => {}; }, onResolved: () => () => {}, resolveDecision: async (id, a) => decisions.push({ id, a }), resolveApproval: async () => {} } });
  plugin.start(base); // no attention: must not throw
  const ev = (body, extra = {}) => ({ json: () => ({ event: "message", session: "default", payload: { id: "x" + Math.random(), from: ME, to: "me", fromMe: false, body, timestamp: 1, ...extra } }) });
  // the plugin's own prompt send + tick need the real scheduler; drive through a hand-built prompt instead: no prompt => not consumed => toast
  await hooks.events(ev("Q7K2 1")); assert.equal(toasts.length, 1); assert.equal(decisions.length, 0); assert.ok(pend);
});

test("manifest + docs: flag, settings, skill and README mention the fallback", () => {
  const m = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
  assert.equal(m.contributes.attention, true);
  assert.ok(m.settings.find((s) => s.key === "waFallback" && s.type === "boolean"));
  assert.ok(m.settings.find((s) => s.key === "fallbackAfterMin" && s.type === "number"));
  assert.match(readFileSync(new URL("../skills/waha/SKILL.md", import.meta.url), "utf8"), /fallback/i);
  assert.match(readFileSync(new URL("../README.md", import.meta.url), "utf8"), /WhatsApp fallback/);
});

test("F4: several questions are never answered from WhatsApp: the message says to open Floq", async () => {
  const o = rig(); await o.pend({ ...dec, questions: [dec.questions[0], { ...dec.questions[0], id: "q2" }] }); o.advance(200_000); await o.tick();
  assert.match(o.sent[0].text, /2 questions are waiting.*Open Floq/); assert.ok(!/Reply/.test(o.sent[0].text));
  assert.equal(await o.reply(`${shortOf(o)} 1`), true); assert.equal(o.decisions.length, 0); assert.match(o.sent.at(-1).text, /Open Floq/);
});

test("F5: approvals by WhatsApp are deny-only unless waAllowApprovals is on", async () => {
  const o = rig(); o.cfg.allowApprovals = false; await o.pend(appr); o.advance(200_000); await o.tick(); const s = shortOf(o);
  assert.ok(!/ \d{4}\b/.test(o.sent[0].text.replace(s, ""))); assert.match(o.sent[0].text, /open Floq/i);
  await o.reply(`${s} yes 1234`); assert.equal(o.approvals.length, 0);
  await o.reply(`${s} no`); assert.deepEqual(o.approvals, [{ id: "p1", d: "deny" }]);
  const w = rig({ rnd: (n) => (n === 10000 ? 1234 : 0) }); await w.pend(appr); w.advance(200_000); await w.tick(); w.cfg.allowApprovals = false; // switched off after the prompt
  await w.reply(`${shortOf(w)} yes 1234`); assert.equal(w.approvals.length, 0);
});

test("F6/F14: approval shows a sanitized, truncated detail; links and formatting characters are stripped", async () => {
  const o = rig(); await o.pend({ ...appr, action: "Run *migrations* now", detail: "see https://evil.example/x?a=b and _more_ ~text~ " + "d".repeat(500) }); o.advance(200_000); await o.tick();
  const t = o.sent[0].text; assert.match(t, /Details: see \(link removed\) and more text d+/);
  assert.ok(!/evil\.example|[*_~]/.test(t)); assert.ok(t.length <= F.MESSAGE_MAX); assert.match(t, /`A[A-Z2-9]{3} yes \d{4}`/);
  assert.ok(!/[*_~]|https?:/.test(F.formatDecision("Q7K2", "s_s", "ask *this* www.x.com/y", [{ id: "a", label: "~A~" }], false, false)));
});

test("F9: the follow-up names what happened (cancelled, expired, denied)", async () => {
  for (const [status, word] of [["cancelled", "Cancelled"], ["expired", "Expired"], ["denied", "Denied in Floq"], ["answered", "Answered in Floq"]]) {
    const o = rig(); await o.pend(dec); o.advance(200_000); await o.tick();
    o.resolved({ kind: "decision", id: "d1", status, by: "app" }); await o.fb.idle(); assert.match(o.edits[0].text, new RegExp("^" + word));
  }
});

test("F15: settings text explains the delay versus the 10 minute question lifetime", () => {
  const m = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
  assert.match(m.settings.find((x) => x.key === "fallbackAfterMin").description, /10 minutes/);
  const a = m.settings.find((x) => x.key === "waAllowApprovals"); assert.equal(a.type, "boolean"); assert.ok(!a.default); assert.match(a.description, /RISK/);
  assert.match(readFileSync(new URL("../README.md", import.meta.url), "utf8"), /RISKY/);
});

test("F2 contract: the plugin's answer is accepted by the REAL core Decisions.resolve (pick sends text: \"\")", async (t) => {
  const core = new URL("../../../runtime/src/decisions.ts", import.meta.url).pathname;
  if (!existsSync(core)) return t.skip("core checkout not next to the plugin repo");
  const { Decisions } = await bundle(core, "core-decisions.mjs");
  for (const [questions, body, expect] of [
    [[{ id: "q1", question: "Where?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], multiSelect: false, allowText: false }], (s) => `${s} 2`, { optionIds: ["b"], text: "" }],
    [[{ id: "q1", question: "Where?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], multiSelect: true, allowText: false }], (s) => `${s} 1,2`, { optionIds: ["a", "b"], text: "" }],
    [[{ id: "q1", question: "Say?", options: [], multiSelect: false, allowText: true }], (s) => `${s} do it`, { optionIds: [], text: "do it" }],
  ]) {
    const decisions = new Decisions();
    const { id, decision } = await decisions.request(OWNER, { sessionId: "s", projectId: null, sessionName: "Dev", questions });
    const deps = { resolveDecision: async (did, answers) => { await decisions.resolve(OWNER, did, answers); } };
    const real = rig();
    // drive the plugin with a real item view, answering into the real Decisions
    const fb = F.createFallback({
      attention: { onPending: (fn) => { real.pending = fn; return () => {}; }, onResolved: () => () => {}, resolveDecision: deps.resolveDecision, resolveApproval: async () => {} },
      schedule: () => () => {}, getOwner: async () => OWNER, kv: { get: async () => null, set: async () => {} },
      settings: async () => ({ enabled: true, afterMin: 1, ownChat: ME, hmacConfigured: true }),
      send: async (_u, _c, text) => { real.sent.push({ text }); return "w1"; }, edit: async () => {}, now: () => Date.now() + 120_000, log: { warn() {} },
    });
    fb.start(); real.pending({ ...decision, kind: "decision", userId: OWNER, createdAt: Date.now() }); await fb.idle(); await fb.tick();
    const short = /\[(Q[A-Z2-9]{3})\]/.exec(real.sent[0].text)[1];
    assert.equal(await fb.inbound({ chatId: ME, fromMe: false, sender: ME, body: body(short), msgId: "r" + id }), true);
    assert.match(real.sent.at(-1).text, /Answer recorded/, real.sent.at(-1).text);
    const status = await decisions.status(OWNER, "s", id, 0);
    assert.equal(status.status, "answered"); assert.deepEqual(status.response.answers[0], { questionId: "q1", ...expect });
  }
});

// ---- F1: an agent must not be able to answer through its own WhatsApp message ----
function world({ nullId = false, selfNumber = ME.replace("@c.us", "") } = {}) {
  const rows = [], handlers = {}, internal = {}, resolves = [], sentBodies = []; let pend, sched, nextId = 0;
  const settings = { baseUrl: "https://w.example", assistantPhone: "+5511999999999", waFallback: true, fallbackAfterMin: 1, waAllowApprovals: true };
  const db = { query: async (sql, args) => {
    if (/INSERT INTO/.test(sql)) { const dup = rows.some((r) => r.session === args[1] && r.msg_id === args[3]); if (!dup) rows.push({ user_id: args[0], session: args[1], chat_id: args[2], msg_id: args[3], from_me: args[4], sender: args[5], body: args[6], has_media: args[7], sent_at: args[8] }); return { rows: dup ? [] : [{ id: 1 }], rowCount: dup ? 0 : 1 }; }
    if (/ARRAY_AGG/.test(sql)) { const last = rows.at(-1); return { rows: last ? [{ chat_id: last.chat_id, last_at: last.sent_at, total: rows.length, last_body: last.body }] : [] }; }
    return { rows: rows.filter((r) => r.chat_id === args[1]) };
  } };
  const ctx = {
    httpError: (st, c, m) => Object.assign(new Error(m), { status: st, code: c }), installOwner: async () => OWNER,
    settings: { get: async () => settings }, secrets: { getInstall: async () => "key" }, kv: { get: async () => null, set: async () => {} },
    fetchUserUrl: async (_u, url, init) => {
      if (url.endsWith("/api/sendText")) { const b = JSON.parse(init.body); sentBodies.push(b.text); return { ok: true, status: 200, json: () => (nullId ? {} : { id: "wa" + ++nextId }) }; }
      if (/\/api\/sessions\//.test(url)) return { ok: true, status: 200, json: () => ({ me: { id: `${selfNumber}@c.us` } }) };
      return { ok: true, status: 200, json: () => ({}) };
    },
    db, events: { publish() {} }, toast() {}, log: { warn() {}, info() {} }, approvals: {},
    routes: { get() {}, post() {} }, internalRoutes: { call: (n, h) => (internal[n] = h) }, webhooks: { on: (n, h) => (handlers[n] = h) },
    schedule: (_ms, fn) => { sched = fn; return () => {}; },
    attention: { onPending: (fn) => { pend = fn; return () => {}; }, onResolved: () => () => {}, resolveDecision: async (id, a) => resolves.push({ id, a }), resolveApproval: async (id, d) => resolves.push({ id, d }) },
  };
  plugin.start(ctx);
  const hook = (body, extra = {}) => handlers.events({ json: () => ({ event: "message.any", session: "default", payload: { id: "e" + Math.random(), from: ME, to: ME, fromMe: true, source: "api", body, timestamp: 1, ...extra } }) });
  const agent = (path, body) => internal[path]({ userId: OWNER, body });
  return { rows, resolves, sentBodies, hook, agent, internal,
    async prompt() { pend({ kind: "approval", id: "p1", userId: OWNER, sessionName: "Dev", action: "Run migrations", detail: "db", irreversible: false, createdAt: Date.now() - 600_000 }); await new Promise((r) => setTimeout(r, 5)); await sched(); await new Promise((r) => setTimeout(r, 5)); return sentBodies.at(-1); } };
}
const codeOf = (text) => ({ short: /\[(A[A-Z2-9]{3})\]/.exec(text)[1], code: /yes (\d{4})/.exec(text)[1] });

test("F1: fallback prompts are not stored and agents never read them or the code (chats and messages)", async () => {
  const w = world(); const prompt = await w.prompt(); assert.match(prompt, /^Floq approval/);
  assert.equal(w.rows.length, 0, "prompt not stored");
  // the webhook echo of the prompt (arriving at any time) is stored, but hidden from agents
  await w.hook(prompt, { id: "echo1", source: "app" });
  const msgs = await w.agent("/messages", { chatId: ME }); const chats = await w.agent("/chats", {});
  assert.ok(!JSON.stringify(msgs).includes(codeOf(prompt).code) && !JSON.stringify(chats).includes(codeOf(prompt).code));
  assert.match(msgs.messages[0].body, /hidden from assistants/); assert.match(chats.chats[0].lastBody, /hidden from assistants/);
});

test("F1: an agent message-me carrying a valid reply never resolves anything (webhook before store, after store, null WAHA id, source missing)", async () => {
  for (const variant of ["after", "before", "null-id", "no-source"]) {
    const w = world({ nullId: variant === "null-id" }); const { short, code } = codeOf(await w.prompt());
    const text = `${short} yes ${code}`;
    const src = variant === "no-source" ? { source: "" } : {};
    if (variant === "before") { await w.hook(text, { id: "wa2", ...src }); await w.agent("/message-me", { text }); } // echo of the id the send is about to return
    else { await w.agent("/message-me", { text }); await w.hook(text, { id: variant === "null-id" ? "unknown-echo" : "wa2", ...src }); }
    await w.hook(text, { id: "other-echo", source: "api" });
    assert.equal(w.resolves.length, 0, variant);
  }
  // a decision answered the same way
  const w = world(); await w.agent("/message-me", { text: "Q7K2 1" }); await w.hook("Q7K2 1", { id: "wa1" }); assert.equal(w.resolves.length, 0);
});

test("F1: fromMe is rejected when the WAHA session is not the owner's own number, even with source app; accepted for the owner's phone", async () => {
  const sep = world({ selfNumber: "5500000000000" }); const a = codeOf(await sep.prompt());
  await sep.hook(`${a.short} yes ${a.code}`, { source: "app" }); assert.equal(sep.resolves.length, 0);
  const own = world(); const b = codeOf(await own.prompt());
  await own.hook(`${b.short} yes ${b.code}`, { id: "phone1", source: "app" }); assert.deepEqual(own.resolves, [{ id: "p1", d: "allow" }]);
});

const LID = "123456789012345@lid";
test("F12: the owner's @lid is accepted, another @lid is rejected, a failed lookup is rejected", async () => {
  const mk = async (ownLid) => { const o = rig({ ownLid }); await o.pend(dec); o.advance(200_000); await o.tick(); return o; };
  const o = await mk(async (_u, own) => (own === ME ? LID : null));
  const s = shortOf(o);
  assert.equal(await o.reply(`${s} 1`, { chatId: "999999999999999@lid", sender: "999999999999999@lid" }), false); // someone else's lid
  assert.equal(await o.reply(`${s} 1`, { chatId: LID, sender: "999999999999999@lid" }), false); // owner's chat, foreign sender
  assert.equal(o.decisions.length, 0);
  assert.equal(await o.reply(`${s} 1`, { chatId: LID, sender: LID }), true);
  assert.equal(o.decisions.length, 1);
  assert.equal(o.sent.at(-1).chat, ME); // confirmations still go to the c.us chat
  for (const lookup of [async () => null, async () => { throw new Error("waha down"); }, undefined]) {
    const f = await mk(lookup);
    assert.equal(await f.reply(`${shortOf(f)} 1`, { chatId: LID, sender: LID }), false);
    assert.equal(f.decisions.length, 0);
  }
});

test("F12: lidForPhone reads GET /lids/pn/{digits} and fails closed", async () => {
  const calls = [];
  const mkFetch = (res) => async (_u, url, init) => { calls.push([url, init.method]); if (res instanceof Error) throw res; return res; };
  const ok = (json, status = 200) => ({ ok: status < 300, status, json: () => json });
  assert.equal(await C.lidForPhone(mkFetch(ok({ lid: LID, pn: ME })), "u", "http://w", "k", "default", ME), LID);
  assert.deepEqual(calls[0], ["http://w/api/default/lids/pn/5511999999999", "GET"]);
  assert.equal(await C.lidForPhone(mkFetch(ok({ lid: null, pn: ME })), "u", "http://w", "k", "default", ME), null);
  assert.equal(await C.lidForPhone(mkFetch(ok({ lid: "../x@lid" })), "u", "http://w", "k", "default", ME), null);
  assert.equal(await C.lidForPhone(mkFetch(ok({}, 500)), "u", "http://w", "k", "default", ME), null);
  assert.equal(await C.lidForPhone(mkFetch(new Error("x")), "u", "http://w", "k", "default", ME), null);
});
