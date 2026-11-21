import { test, before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let u, e, v;
before(async () => {
  const dir = mkdtempSync(join(tmpdir(), "waha-composer-"));
  const load = async (name, entry) => {
    const outfile = join(dir, name + ".mjs");
    await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
    return import(pathToFileURL(outfile).href);
  };
  u = await load("utils", "ui/composer-utils.ts");
  e = await load("emoji", "ui/emoji-data.ts");
  v = await load("voice", "ui/voice-recorder.ts");
});

test("kindOfFile by mime, falling back to the extension", () => {
  assert.equal(u.kindOfFile({ type: "image/png", name: "a.png" }), "image");
  assert.equal(u.kindOfFile({ type: "video/mp4", name: "a.mp4" }), "video");
  assert.equal(u.kindOfFile({ type: "audio/ogg", name: "a.ogg" }), "audio");
  assert.equal(u.kindOfFile({ type: "application/pdf", name: "a.pdf" }), "document");
  assert.equal(u.kindOfFile({ type: "image/svg+xml", name: "a.svg" }), "document");
  assert.equal(u.kindOfFile({ type: "", name: "IMG_1.JPG" }), "image");
  assert.equal(u.kindOfFile({ type: "", name: "clip.mov" }), "video");
  assert.equal(u.kindOfFile({ type: "", name: "notes" }), "document");
});

test("formatDuration", () => {
  assert.equal(u.formatDuration(0), "0:00");
  assert.equal(u.formatDuration(7000), "0:07");
  assert.equal(u.formatDuration(7999), "0:07");
  assert.equal(u.formatDuration(65_000), "1:05");
  assert.equal(u.formatDuration(3_725_000), "1:02:05");
  assert.equal(u.formatDuration(-5), "0:00");
  assert.equal(u.formatDuration(NaN), "0:00");
});

test("formatBytes", () => {
  assert.equal(u.formatBytes(500), "500 B");
  assert.equal(u.formatBytes(2048), "2 KB");
  assert.equal(u.formatBytes(3.5 * 1024 * 1024), "3.5 MB");
});

test("screenFiles: size cap, empty files, count cap", () => {
  const big = { name: "big.mov", size: u.MAX_FILE_BYTES + 1 };
  const r = u.screenFiles([{ name: "a.png", size: 10 }, big, { name: "z.txt", size: 0 }], 0);
  assert.deepEqual(r.ok, [0]);
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /big\.mov/);
  assert.match(r.errors[0], /3\.5 MB/);
  const many = Array.from({ length: 4 }, (_, i) => ({ name: "f" + i, size: 1 }));
  const c = u.screenFiles(many, 8);
  assert.deepEqual(c.ok, [0, 1]);
  assert.equal(c.errors.length, 1);
  assert.match(c.errors[0], /At most 10/);
});

test("insertAtCursor: caret, selection and clamping", () => {
  assert.deepEqual(u.insertAtCursor("hello", 5, 5, "😀"), { value: "hello😀", cursor: 7 });
  assert.deepEqual(u.insertAtCursor("hello world", 0, 5, "bye"), { value: "bye world", cursor: 3 });
  assert.deepEqual(u.insertAtCursor("ab", 1, 1, "X"), { value: "aXb", cursor: 2 });
  assert.deepEqual(u.insertAtCursor("ab", 9, 20, "X"), { value: "abX", cursor: 3 });
});

const group = [
  { id: "1@c.us", name: "Rafael Souza", phone: "5511911112222" },
  { id: "2@c.us", name: "Bia Nogueira" },
  { id: "3@c.us", name: "Bia", phone: "5511933334444" },
];

test("mentionsIn matches @phone and @name tags, not partial words", () => {
  assert.deepEqual(u.mentionsIn("oi @5511911112222 e @Bia Nogueira!", group), ["1@c.us", "2@c.us", "3@c.us"].filter((x) => x !== "3@c.us"));
  assert.deepEqual(u.mentionsIn("ping @5511933334444", group), ["3@c.us"]);
  assert.deepEqual(u.mentionsIn("mail me@5511911112222", group), []);
  assert.deepEqual(u.mentionsIn("@5511911112222x", group), []);
  assert.deepEqual(u.mentionsIn("@rafael souza?", [{ id: "r", name: "Rafael Souza" }]), ["r"]);
  assert.deepEqual(u.mentionsIn("nothing here", group), []);
  assert.deepEqual(u.mentionsIn("@x", undefined), []);
});

test("mentionQuery finds the open @ at the cursor", () => {
  assert.deepEqual(u.mentionQuery("hi @ra", 6), { start: 3, query: "ra" });
  assert.deepEqual(u.mentionQuery("@", 1), { start: 0, query: "" });
  assert.equal(u.mentionQuery("mail a@b", 8), null);
  assert.equal(u.mentionQuery("hi @ra done", 11), null);
  assert.deepEqual(u.mentionQuery("hi @ra done", 6), { start: 3, query: "ra" });
});

test("filterMentions and applyMention", () => {
  assert.deepEqual(u.filterMentions(group, "so").map((m) => m.id), ["1@c.us"]);
  assert.deepEqual(u.filterMentions(group, "bia").map((m) => m.id), ["2@c.us", "3@c.us"]);
  assert.deepEqual(u.filterMentions(group, "55119333").map((m) => m.id), ["3@c.us"]);
  assert.equal(u.filterMentions(group, "").length, 3);
  assert.deepEqual(u.applyMention("hi @ra", 3, 6, group[0]), { value: "hi @5511911112222 ", cursor: 18 });
  assert.deepEqual(u.applyMention("@b", 0, 2, group[1]), { value: "@Bia Nogueira ", cursor: 14 });
});

test("emoji data: categories, flags, dedupe", () => {
  const idx = e.emojiIndex();
  assert.equal(Object.keys(idx.byCat).length, 9);
  assert.ok(idx.all.length > 800, "about 900+ emoji");
  assert.equal(new Set(idx.all.map((x) => x.char)).size, idx.all.length);
  assert.ok(idx.byCat.flags.some((f) => f.char === "🇧🇷" && /Brazil/.test(f.name)));
  for (const x of idx.all) assert.ok(x.char && x.name, JSON.stringify(x));
});

test("searchEmoji ranks prefix matches first and needs every word", () => {
  const r = e.searchEmoji("heart");
  assert.ok(r.length > 5);
  assert.ok(r[0].name.toLowerCase().startsWith("heart") || r[0].name.toLowerCase().includes("heart"));
  assert.ok(e.searchEmoji("thumbs up").some((x) => x.char === "👍"));
  assert.ok(e.searchEmoji("pizza").some((x) => x.char === "🍕"));
  assert.deepEqual(e.searchEmoji("   "), []);
  assert.deepEqual(e.searchEmoji("zzzzqq"), []);
  assert.ok(e.searchEmoji("brazil").some((x) => x.char === "🇧🇷"));
});

test("recent emoji: most recent first, no repeats, capped", () => {
  assert.deepEqual(e.pushRecent(["a", "b", "c"], "b"), ["b", "a", "c"]);
  const many = Array.from({ length: 40 }, (_, i) => "e" + i);
  assert.equal(e.pushRecent(many, "new").length, 32);
  assert.deepEqual(e.loadRecent(), []); // no localStorage in node: guarded
  e.saveRecent(["x"]); // must not throw
});

test("pickVoiceMime takes the first supported type", () => {
  assert.equal(v.pickVoiceMime(() => true), "audio/ogg;codecs=opus");
  assert.equal(v.pickVoiceMime((m) => m.startsWith("audio/webm")), "audio/webm;codecs=opus");
  assert.equal(v.pickVoiceMime((m) => m === "audio/mp4"), "audio/mp4");
  assert.equal(v.pickVoiceMime(() => false), null);
  assert.equal(v.pickVoiceMime(() => { throw new Error("x"); }), null);
});
