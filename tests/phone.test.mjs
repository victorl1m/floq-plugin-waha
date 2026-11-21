import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

test("phone: parse any common format, format per country", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "waha-phone-")), "phone.mjs");
  await build({ entryPoints: ["shared/phone.ts"], outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  const { phoneDigits, formatPhone, formatLocal, countryOf } = await import(pathToFileURL(out).href);
  assert.equal(phoneDigits("+55 (11) 99999-9999"), "5511999999999");
  assert.equal(phoneDigits("(11) 99999-9999", "55"), "5511999999999");
  assert.equal(phoneDigits("011 99999-9999", "55"), "5511999999999");
  assert.equal(phoneDigits("+55 11 9999; DROP"), null);
  assert.equal(formatPhone("5511999999999"), "+55 (11) 99999-9999");
  assert.equal(formatPhone("15551234567"), "+1 (555) 123-4567");
  assert.equal(formatPhone("351912345678"), "+351 912 345 678");
  assert.equal(formatLocal("119", countryOf("55")), "(11) 9");
  assert.equal(formatLocal("1", countryOf("55")), "1");
});
