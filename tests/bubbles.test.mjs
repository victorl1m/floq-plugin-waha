import { test, before } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let f;
before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), "waha-bubbles-")), "format.mjs");
  await build({ entryPoints: [new URL("../shared/format.ts", import.meta.url).pathname], outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  f = await import(pathToFileURL(out).href);
});

test("Lru evicts the oldest entry past the cap and reports it", () => {
  const gone = [];
  const l = new f.Lru(3, (k) => gone.push(k));
  for (const k of ["a", "b", "c", "d"]) l.set(k, { n: k });
  assert.deepEqual(gone, ["a"]);
  assert.deepEqual(l.keys(), ["b", "c", "d"]);
});
test("Lru get marks an entry as recently used", () => {
  const gone = [];
  const l = new f.Lru(2, (k) => gone.push(k));
  l.set("a", 1); l.set("b", 2);
  assert.equal(l.get("a"), 1);
  l.set("c", 3);
  assert.deepEqual(gone, ["b"]);
});
test("Lru keeps entries that are still in use", () => {
  const gone = [];
  const l = new f.Lru(2, (k) => gone.push(k), (v) => v.refs === 0);
  l.set("a", { refs: 1 }); l.set("b", { refs: 0 }); l.set("c", { refs: 0 });
  assert.equal(l.size, 2);
  assert.deepEqual(gone, ["b"]);
  assert.deepEqual(l.keys(), ["a", "c"]);
  l.get("a").refs = 0;
  l.set("d", { refs: 0 });
  assert.deepEqual(gone, ["b", "c"]);
});
test("Lru delete reports the eviction", () => {
  const gone = [];
  const l = new f.Lru(5, (k) => gone.push(k));
  l.set("a", 1); l.delete("a"); l.delete("zz");
  assert.deepEqual(gone, ["a"]);
  assert.equal(l.size, 0);
});
test("messageKind", () => {
  const media = (mime, o = {}) => ({ mime, filename: "x", size: 1, duration: null, width: 10, height: 10, available: true, ...o });
  assert.equal(f.messageKind({ type: "image", hasMedia: true }), "image");
  assert.equal(f.messageKind({ type: "chat", hasMedia: false }), "text");
  assert.equal(f.messageKind({ hasMedia: false }), "text");
  assert.equal(f.messageKind({ hasMedia: true }), "media");
  assert.equal(f.messageKind({ hasMedia: true, media: media("video/mp4") }), "video");
  assert.equal(f.messageKind({ hasMedia: true, media: media("audio/ogg") }), "audio");
  assert.equal(f.messageKind({ hasMedia: true, media: media("application/pdf") }), "document");
  assert.equal(f.messageKind({ hasMedia: true, media: media("image/webp", { width: null }) }), "sticker");
  assert.equal(f.messageKind({ type: "chat", deleted: true }), "deleted");
  assert.equal(f.messageKind({ type: "unknown", location: { lat: 1, lng: 2, name: "", address: "" } }), "location");
  assert.equal(f.messageKind({ type: "unknown", poll: { name: "q", multiple: false, voters: 0, options: [] } }), "poll");
});
test("fitBox keeps the ratio inside 330x360 and defaults unknown sizes", () => {
  assert.deepEqual(f.fitBox(1000, 500), { width: 330, height: 165 });
  assert.deepEqual(f.fitBox(500, 1000), { width: 180, height: 360 });
  assert.deepEqual(f.fitBox(200, 100), { width: 200, height: 100 });
  assert.deepEqual(f.fitBox(null, null), { width: 240, height: 180 });
  assert.deepEqual(f.fitBox(0, 10), { width: 240, height: 180 });
});
const ALL = { react: true, edit: true, deleteForEveryone: true, forward: true, star: true, pinMessage: true };
const NOW = Date.parse("2026-01-01T12:00:00Z");
const msg = (o = {}) => ({ id: "m1", fromMe: true, sender: "", body: "hi", hasMedia: false, sentAt: new Date(NOW - 60000).toISOString(), ...o });
test("menuPlan: everything for a fresh own text message", () => {
  assert.deepEqual(f.menuPlan(msg(), ALL, NOW), ["reply", "react", "forward", "star", "pin", "copy", "edit", "info", "delete"]);
});
test("menuPlan: star and pin flip, no edit after 15 minutes or for others", () => {
  assert.deepEqual(f.menuPlan(msg({ starred: true, pinned: true, sentAt: new Date(NOW - 20 * 60000).toISOString() }), ALL, NOW), ["reply", "react", "forward", "unstar", "unpin", "copy", "info", "delete"]);
  assert.equal(f.menuPlan(msg({ fromMe: false }), ALL, NOW).includes("edit"), false);
});
test("menuPlan: items the engine cannot do are hidden", () => {
  const none = { react: false, edit: false, deleteForEveryone: false, forward: false, star: false, pinMessage: false };
  assert.deepEqual(f.menuPlan(msg(), none, NOW), ["reply", "copy", "info", "delete"]);
});
test("menuPlan: media gets Download only when available", () => {
  const media = { mime: "image/png", filename: "a.png", size: 1, duration: null, width: 1, height: 1, available: true };
  assert.equal(f.menuPlan(msg({ type: "image", media, body: "" }), ALL, NOW).includes("download"), true);
  assert.equal(f.menuPlan(msg({ type: "image", media: { ...media, available: false }, body: "" }), ALL, NOW).includes("download"), false);
  assert.equal(f.menuPlan(msg({ type: "image", media, body: "" }), ALL, NOW).includes("copy"), false);
});
test("menuPlan: pending, deleted, system and call messages", () => {
  assert.deepEqual(f.menuPlan(msg({ pending: true }), ALL, NOW), ["copy"]);
  assert.deepEqual(f.menuPlan(msg({ id: "pending-1", body: "" }), ALL, NOW), []);
  assert.deepEqual(f.menuPlan(msg({ deleted: true }), ALL, NOW), ["delete"]);
  assert.deepEqual(f.menuPlan(msg({ type: "system" }), ALL, NOW), []);
  assert.deepEqual(f.menuPlan(msg({ type: "call" }), ALL, NOW), []);
});
