import { test, before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let c, p;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "waha-chat-"));
  const load = async (name) => {
    const out = join(dir, name + ".mjs");
    await build({ entryPoints: [new URL("../shared/" + name + ".ts", import.meta.url).pathname], outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
    return import(pathToFileURL(out).href);
  };
  [c, p] = await Promise.all([load("chat"), load("phone")]);
});

const L = "en-GB";
const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const now = new Date(2026, 10, 21, 15, 0); // Sat 21 Nov 2026, local
const chat = (o) => ({ chatId: "1@c.us", lastBody: "", lastAt: at(2026, 11, 21), total: 1, ...o });

test("formatPhoneDisplay groups from the end", () => {
  assert.equal(p.formatPhoneDisplay("553492637647"), "+55 34 9263-7647");
  assert.equal(p.formatPhoneDisplay("5511999999999"), "+55 11 99999-9999");
  assert.equal(p.formatPhoneDisplay("15551234567"), "+1 555 123-4567");
  assert.equal(p.formatPhoneDisplay("351912345678"), "+351 912 345 678");
  assert.equal(p.formatPhoneDisplay("998901234567"), "+998 901 234 567");
  assert.equal(p.formatPhoneDisplay("9981234567"), "+9981 234 567");
});

test("displayName never leaks an id", () => {
  assert.equal(c.displayName(chat({ name: "Ana Souza" })), "Ana Souza");
  assert.equal(c.displayName(chat({ chatId: "553492637647@c.us" })), "+55 34 9263-7647");
  assert.equal(c.displayName(chat({ chatId: "553492637647@s.whatsapp.net" })), "+55 34 9263-7647");
  assert.equal(c.displayName(chat({ chatId: "99887766@lid" })), "Unknown contact");
  assert.equal(c.displayName(chat({ chatId: "99887766@lid", phone: "5511999999999" })), "+55 11 99999-9999");
  assert.equal(c.displayName(chat({ chatId: "1203630@g.us" })), "Group chat");
  assert.equal(c.displayName(chat({ chatId: "1203630@g.us", name: "Family" })), "Family");
  assert.equal(c.chatPhoneDigits(chat({ chatId: "99887766554@lid" })), null);
  for (const x of [chat({ name: "a@b" }), chat({ chatId: "123@lid" }), chat({ chatId: "x@g.us" }), chat({ chatId: "5511999999999@c.us", name: "Bob" })]) {
    for (const s of [c.displayName(x), c.subtitle(x), c.initials(x)]) assert.ok(!s.includes("@"), s);
  }
});

test("subtitle and initials", () => {
  assert.equal(c.subtitle(chat({ chatId: "5511999999999@c.us", name: "Bob" })), "+55 11 99999-9999");
  assert.equal(c.subtitle(chat({ chatId: "5511999999999@c.us" })), "");
  assert.equal(c.subtitle(chat({ chatId: "1@g.us" })), "Group");
  assert.equal(c.initials(chat({ name: "ana maria souza" })), "AS");
  assert.equal(c.initials(chat({ name: "Élan" })), "ÉL");
  assert.equal(c.initials(chat({ chatId: "5511999999999@c.us" })), "99");
  assert.equal(c.initials(chat({ chatId: "1@lid" })), "?");
  assert.equal(c.hueOf("a@c.us"), c.hueOf("a@c.us"));
  assert.ok(c.hueOf("zzz") >= 0 && c.hueOf("zzz") < 360);
});

test("previewText", () => {
  assert.deepEqual(c.previewText(chat({ lastBody: "a\n\nb", lastFromMe: true })), { prefix: "You: ", text: "a b", media: false });
  assert.deepEqual(c.previewText(chat({ lastHasMedia: true })), { prefix: "", text: "Photo or file", media: true });
  assert.equal(c.previewText(chat({})).text, "No text");
});

test("relativeTime and dayLabel boundaries", () => {
  const rt = (iso) => c.relativeTime(iso, now, L);
  assert.equal(rt(new Date(now - 59_000).toISOString()), "now");
  assert.equal(rt(new Date(now - 60_000).toISOString()), "1 min");
  assert.equal(rt(new Date(now - 59 * 60_000).toISOString()), "59 min");
  assert.equal(rt(at(2026, 11, 21, 9, 5)), "09:05");
  assert.equal(rt(at(2026, 11, 20, 23, 59)), "Yesterday");
  assert.equal(rt(at(2026, 11, 15, 10)), "Sun");
  assert.equal(rt(at(2026, 11, 14, 10)), "14 Nov");
  assert.equal(rt(at(2025, 11, 14, 10)), "14 Nov 2025");
  const dl = (iso) => c.dayLabel(iso, now, L);
  assert.equal(dl(at(2026, 11, 21, 0, 1)), "Today");
  assert.equal(dl(at(2026, 11, 20, 23, 0)), "Yesterday");
  assert.equal(dl(at(2026, 11, 19)), "Thursday");
  assert.equal(dl(at(2026, 11, 15)), "Sunday");
  assert.equal(dl(at(2026, 11, 14)), "14 Nov");
  assert.equal(dl(at(2025, 3, 3)), "3 Mar 2025");
});

test("groupMessages: 5 minute rule, day change, sender change", () => {
  const m = (id, fromMe, sender, sentAt) => ({ id, fromMe, sender, body: id, hasMedia: false, sentAt });
  const rows = c.groupMessages([
    m("a", false, "x", at(2026, 11, 20, 23, 58)),
    m("b", false, "x", at(2026, 11, 21, 0, 1)), // next day: new group
    m("c", false, "x", at(2026, 11, 21, 0, 5)), // 4 min: same group
    m("d", false, "y", at(2026, 11, 21, 0, 6)), // other sender
    m("e", true, "me", at(2026, 11, 21, 0, 7)),
    m("f", true, "me", at(2026, 11, 21, 0, 13)), // 6 min gap
  ], now, L);
  assert.deepEqual(rows.filter((r) => r.type === "day").map((r) => r.label), ["Yesterday", "Today"]);
  const f = Object.fromEntries(rows.filter((r) => r.type === "msg").map((r) => [r.key, [r.first, r.last]]));
  assert.deepEqual(f, { a: [true, true], b: [true, false], c: [false, true], d: [true, true], e: [true, true], f: [true, true] });
});

test("matchesQuery: accents, case, digits", () => {
  const ana = chat({ chatId: "553492637647@c.us", name: "José Álvares", lastBody: "Reunião amanhã" });
  assert.ok(c.matchesQuery(ana, ""));
  assert.ok(c.matchesQuery(ana, "jose alv"));
  assert.ok(c.matchesQuery(ana, "REUNIAO"));
  assert.ok(c.matchesQuery(ana, "92637647"));
  assert.ok(c.matchesQuery(ana, "9263-7647"));
  assert.ok(c.matchesQuery(ana, "+55 34"));
  assert.ok(!c.matchesQuery(ana, "maria"));
  assert.ok(!c.matchesQuery(ana, "9999"));
  assert.ok(!c.matchesQuery(chat({ chatId: "1@lid" }), "1"));
});
