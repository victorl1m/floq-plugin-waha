import { test, before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let f;
before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), "waha-format-")), "format.mjs");
  await build({ entryPoints: [new URL("../shared/format.ts", import.meta.url).pathname], outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  f = await import(pathToFileURL(out).href);
});

const inl = (s, o) => f.parseFormat(s, o)[0].c;
const T = (v) => ({ t: "text", v });

test("plain text, newlines stay in one paragraph", () => {
  assert.deepEqual(f.parseFormat("hello"), [{ t: "p", c: [T("hello")] }]);
  assert.deepEqual(f.parseFormat("a\nb"), [{ t: "p", c: [T("a"), T("\n"), T("b")] }]);
  assert.deepEqual(f.parseFormat(""), []);
});
test("bold, italic, strike", () => {
  assert.deepEqual(inl("*hi*"), [{ t: "b", c: [T("hi")] }]);
  assert.deepEqual(inl("_hi_ there"), [{ t: "i", c: [T("hi")] }, T(" there")]);
  assert.deepEqual(inl("~gone~"), [{ t: "s", c: [T("gone")] }]);
});
test("nesting", () => {
  assert.deepEqual(inl("*bold _both_ x*"), [{ t: "b", c: [T("bold "), { t: "i", c: [T("both")] }, T(" x")] }]);
  assert.deepEqual(inl("_~a~_"), [{ t: "i", c: [{ t: "s", c: [T("a")] }] }]);
});
test("unbalanced and spaced markers stay literal", () => {
  assert.deepEqual(inl("*oops"), [T("*oops")]);
  assert.deepEqual(inl("a * b * c"), [T("a * b * c")]);
  assert.deepEqual(inl("** x"), [T("** x")]);
  assert.deepEqual(inl("*a *"), [T("*a *")]);
  assert.deepEqual(inl("_a_b"), [T("_a_b")]);
  assert.deepEqual(inl("snake_case_name"), [T("snake_case_name")]);
  assert.deepEqual(inl("2*3*4"), [T("2*3*4")]);
});
test("formatting does not span lines", () => {
  assert.deepEqual(f.parseFormat("*a\nb*")[0].c.some((n) => n.t === "b"), false);
});
test("inline code is not formatted inside", () => {
  assert.deepEqual(inl("`*x*` and *y*"), [{ t: "code", v: "*x*" }, T(" and "), { t: "b", c: [T("y")] }]);
  assert.deepEqual(inl("`open"), [T("`open")]);
});
test("a closing marker inside code is skipped", () => {
  assert.deepEqual(inl("*a `b*` c*"), [{ t: "b", c: [T("a "), { t: "code", v: "b*" }, T(" c")] }]);
});
test("fenced code blocks keep their text and are not formatted", () => {
    assert.deepEqual(f.parseFormat("before\n```\n*raw* _x_\nline2\n```\nafter"), [{ t: "p", c: [T("before")] }, { t: "pre", v: "*raw* _x_\nline2" }, { t: "p", c: [T("after")] }]);
  assert.deepEqual(f.parseFormat("```unclosed *x*")[0].c.some((n) => n.t === "b"), true);
});
test("links: http and https only, trailing punctuation trimmed", () => {
  assert.deepEqual(inl("see https://a.com/x."), [T("see "), { t: "link", href: "https://a.com/x", v: "https://a.com/x" }, T(".")]);
  assert.deepEqual(inl("(https://a.com/p_(1))"), [T("("), { t: "link", href: "https://a.com/p_(1)", v: "https://a.com/p_(1)" }, T(")")]);
  assert.equal(inl("javascript:alert(1)").some((n) => n.t === "link"), false);
  assert.equal(inl("ftp://x.com/a").some((n) => n.t === "link"), false);
});
test("URLs with underscores and asterisks are not formatted", () => {
  const n = inl("go https://x.com/a_b_c/*d*/e_ now");
  assert.equal(n.filter((x) => x.t === "link").length, 1);
  assert.equal(n.some((x) => x.t === "i" || x.t === "b"), false);
  const m = inl("_look https://x.com/a_b_ ok_");
  assert.equal(m[0].t, "i");
  assert.equal(m[0].c.some((x) => x.t === "link"), true);
});
test("a link inside bold", () => {
  const n = inl("*https://a.com*");
  assert.equal(n[0].t, "b");
  assert.equal(n[0].c[0].t, "link");
  assert.equal(n[0].c[0].href, "https://a.com/");
});
test("phone numbers are left alone", () => {
  assert.deepEqual(inl("call +55 (11) 98765-4321 now"), [T("call +55 (11) 98765-4321 now")]);
  assert.deepEqual(inl("5511987654321"), [T("5511987654321")]);
});
test("quotes", () => {
  assert.deepEqual(f.parseFormat("> one\n> *two*\nafter"), [{ t: "quote", c: [[T("one")], [{ t: "b", c: [T("two")] }]] }, { t: "p", c: [T("after")] }]);
  assert.deepEqual(f.parseFormat("a > b"), [{ t: "p", c: [T("a > b")] }]);
});
test("lists", () => {
  assert.deepEqual(f.parseFormat("- a\n- b"), [{ t: "list", ordered: false, start: 1, items: [[T("a")], [T("b")]] }]);
  assert.deepEqual(f.parseFormat("3. x\n4. y"), [{ t: "list", ordered: true, start: 3, items: [[T("x")], [T("y")]] }]);
  assert.deepEqual(f.parseFormat("-not a list"), [{ t: "p", c: [T("-not a list")] }]);
  assert.deepEqual(f.parseFormat("* item\n1. other").map((b) => b.t), ["list", "list"]);
});
test("mentions only for the listed ids", () => {
  const n = inl("hi @5511987654321 and @5511000000000", { mentions: ["5511987654321@c.us"] });
  assert.deepEqual(n, [T("hi "), { t: "mention", id: "5511987654321@c.us", v: "@5511987654321" }, T(" and @5511000000000")]);
  assert.deepEqual(inl("hi @5511987654321"), [T("hi @5511987654321")]);
});
test("no html is ever produced: markup stays text", () => {
  assert.deepEqual(inl("<b>x</b> <img src=x onerror=1>"), [T("<b>x</b> <img src=x onerror=1>")]);
});
test("deep nesting is bounded", () => {
  const s = "*_~*_~a~_*~_*".repeat(5);
  assert.ok(f.parseFormat(s).length >= 1);
});
test("plainOf", () => assert.equal(f.plainOf(inl("*a _b_* c")), "a b c"));

test("emojiOnly counts 1-3 emoji", () => {
  assert.equal(f.emojiOnly("😀"), 1);
  assert.equal(f.emojiOnly("👍🏽 ❤️"), 2);
  assert.equal(f.emojiOnly("👨‍👩‍👧🇧🇷😂"), 3);
  assert.equal(f.emojiOnly("😀😀😀😀"), 0);
  assert.equal(f.emojiOnly("hi 😀"), 0);
  assert.equal(f.emojiOnly("1"), 0);
  assert.equal(f.emojiOnly("1️⃣"), 1);
  assert.equal(f.emojiOnly(""), 0);
});
test("splitHighlight", () => {
  assert.deepEqual(f.splitHighlight("Olá Mundo olá", "ola"), [{ v: "Olá", hit: true }, { v: " Mundo ", hit: false }, { v: "olá", hit: true }]);
  assert.deepEqual(f.splitHighlight("abc", ""), [{ v: "abc", hit: false }]);
});
test("ackState", () => {
  assert.equal(f.ackState({ pending: true }), "pending");
  assert.equal(f.ackState({ ack: 0 }), "pending");
  assert.equal(f.ackState({ ack: 1 }), "sent");
  assert.equal(f.ackState({}), "sent");
  assert.equal(f.ackState({ ack: 2 }), "delivered");
  assert.equal(f.ackState({ ack: 3 }), "read");
  assert.equal(f.ackState({ ack: 4 }), "read");
  assert.equal(f.ackState({ ack: -1 }), "failed");
  assert.equal(f.ackState({ failed: true, ack: 1 }), "failed");
});
test("canEdit: own text under 15 minutes", () => {
  const now = Date.parse("2026-01-01T12:00:00Z"), at = (min) => new Date(now - min * 60000).toISOString();
  assert.equal(f.canEdit({ fromMe: true, sentAt: at(14) }, now), true);
  assert.equal(f.canEdit({ fromMe: true, sentAt: at(16) }, now), false);
  assert.equal(f.canEdit({ fromMe: false, sentAt: at(1) }, now), false);
  assert.equal(f.canEdit({ fromMe: true, type: "image", sentAt: at(1) }, now), false);
  assert.equal(f.canEdit({ fromMe: true, deleted: true, sentAt: at(1) }, now), false);
  assert.equal(f.canEdit({ fromMe: true, pending: true, sentAt: at(1) }, now), false);
});
test("parseCoords", () => {
  assert.deepEqual(f.parseCoords("-23.5505, -46.6333"), { lat: -23.5505, lng: -46.6333 });
  assert.deepEqual(f.parseCoords("https://www.google.com/maps/@-23.55,-46.63,15z"), { lat: -23.55, lng: -46.63 });
  assert.deepEqual(f.parseCoords("https://maps.google.com/?q=48.85,2.35"), { lat: 48.85, lng: 2.35 });
  assert.deepEqual(f.parseCoords("https://www.google.com/maps/place/X/data=!3d-22.9!4d-43.2"), { lat: -22.9, lng: -43.2 });
  assert.deepEqual(f.parseCoords("geo:10.5,20.25"), { lat: 10.5, lng: 20.25 });
  assert.equal(f.parseCoords("95, 10"), null);
  assert.equal(f.parseCoords("hello"), null);
  assert.equal(f.parseCoords(""), null);
});
test("mapsUrl and cleanPhone", () => {
  assert.equal(f.mapsUrl(1.5, -2), "https://www.google.com/maps?q=1.500000,-2.000000");
  assert.equal(f.cleanPhone("+55 (11) 98765-4321"), "5511987654321");
  assert.equal(f.cleanPhone("123"), "");
});
test("docKind", () => {
  assert.equal(f.docKind("a.PDF").kind, "pdf");
  assert.equal(f.docKind("b.xlsx").kind, "sheet");
  assert.equal(f.docKind("c", "application/zip").kind, "file");
  assert.equal(f.docKind("c.zip").kind, "zip");
});
test("peaks", () => {
  assert.equal(f.fakePeaks("a").length, 40);
  assert.deepEqual(f.fakePeaks("a"), f.fakePeaks("a"));
  assert.notDeepEqual(f.fakePeaks("a"), f.fakePeaks("b"));
  assert.ok(f.fakePeaks("x").every((v) => v >= 0.15 && v <= 1));
  const p = f.peaksOf(new Float32Array(4000).map((_, i) => Math.sin(i / 20)), 10);
  assert.equal(p.length, 10);
  assert.ok(Math.max(...p) === 1);
});
test("withMyReaction", () => {
  const base = [{ emoji: "👍", count: 2, mine: true, senders: [] }, { emoji: "❤️", count: 1, mine: false, senders: [] }];
  assert.deepEqual(f.withMyReaction(base, "❤️").map((r) => [r.emoji, r.count, r.mine]), [["👍", 1, false], ["❤️", 2, true]]);
  assert.deepEqual(f.withMyReaction(base, "").map((r) => [r.emoji, r.count, r.mine]), [["👍", 1, false], ["❤️", 1, false]]);
  assert.deepEqual(f.withMyReaction(undefined, "😂").map((r) => [r.emoji, r.count, r.mine]), [["😂", 1, true]]);
  assert.equal(base[0].count, 2);
});
test("callLabel", () => {
  assert.equal(f.callLabel({ video: false, status: "missed" }), "Missed voice call");
  assert.equal(f.callLabel({ video: true, status: "reject" }), "Missed video call");
  assert.equal(f.callLabel({ video: true, status: "" }), "Video call");
});
