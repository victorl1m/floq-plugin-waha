import { VAULT_NAME } from "./mcpConfig.js";
import { PLUGIN_API_VERSION, type PluginManifest } from "./sdk.js";

/** Thrown for any invalid manifest. Messages name the field path only and never echo submitted values. */
export class ManifestError extends Error {
  constructor(message: string) { super(message); this.name = "ManifestError"; }
}

/** No "--" or trailing "-": ids map to schema/prefix names where those would collide (a--b vs a + b__). */
/** Path segments of the host\'s own `/v1/plugins/*` routes. */
export const RESERVED_IDS = ["catalog", "install"];
const ID = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){1,31}$/;
const SUB_ID = /^[a-z][a-z0-9-]{0,31}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SETTING_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ICON = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const HOST = /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const SETTING_TYPES = ["text", "url", "number", "boolean", "select", "secretRef"];
const HEADER_PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

const fail = (msg: string): never => { throw new ManifestError(msg); };
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function obj(v: unknown, path: string, allowed: string[]): Record<string, unknown> {
  if (!isObj(v)) return fail(`${path} must be an object`);
  const keys = Object.keys(v);
  const i = keys.findIndex((k) => !allowed.includes(k));
  if (i >= 0) return fail(`${path}: unknown key at position ${i + 1} (allowed: ${allowed.join(", ")})`);
  return v;
}
function str(v: unknown, path: string, max = 200): string {
  if (typeof v !== "string" || !v.trim() || v.length > max) return fail(`${path} must be a non-empty string up to ${max} characters`);
  return v;
}
const optStr = (v: unknown, path: string, max?: number) => (v === undefined ? undefined : str(v, path, max));
function arr(v: unknown, path: string, max = 64): unknown[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) return fail(`${path} must be an array of at most ${max} items`);
  return v;
}
function bool(v: unknown, path: string, dflt: boolean): boolean {
  if (v === undefined) return dflt;
  if (typeof v !== "boolean") return fail(`${path} must be a boolean`);
  return v;
}
function icon(v: unknown, path: string): string | undefined {
  const s = optStr(v, path, 64);
  if (s !== undefined && !ICON.test(s)) fail(`${path} must be an icon name (letters and digits)`);
  return s;
}
function strMap(v: unknown, path: string): Record<string, string> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) return fail(`${path} must be an object`);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (k.length > 128) fail(`${path} has a key that is too long`);
    out[k] = str(val, `${path} value`, 2048);
  }
  return out;
}

export function parseManifest(input: unknown): PluginManifest {
  if (isObj(input) && "contributes" in input && isObj(input.contributes) && "canvasNodes" in input.contributes) {
    fail("contributes.canvasNodes is reserved and not supported in apiVersion 1");
  }
  const m = obj(input, "manifest", ["id", "name", "version", "apiVersion", "tier", "description", "icon", "scope", "access", "secrets", "network", "settings", "contributes"]);

  const id = str(m.id, "id", 64);
  if (!ID.test(id)) fail("id must be 2-32 lowercase letters, digits and single hyphens, starting with a letter");
  if (RESERVED_IDS.includes(id)) fail("this id is reserved by the host");
  const version = str(m.version, "version", 64);
  if (!SEMVER.test(version)) fail("version must be a semver string");
  if (m.apiVersion !== PLUGIN_API_VERSION) fail(`apiVersion must be ${PLUGIN_API_VERSION}`);
  if (m.tier !== "core") fail('tier must be "core" (external plugins are not supported yet)');
  if (m.scope !== "user" && m.scope !== "install") fail('scope must be "user" or "install"');

  if (m.access !== undefined && m.access !== "everyone" && m.access !== "owner") fail('access must be "everyone" or "owner"');
  if (m.access === "owner" && m.scope !== "install") fail('access "owner" only applies to scope "install"');
  const secrets = arr(m.secrets, "secrets", 32).map((raw, i) => {
    const s = obj(raw, `secrets[${i}]`, ["name", "description", "required"]);
    const name = str(s.name, `secrets[${i}].name`, 128);
    if (!VAULT_NAME.test(name)) fail(`secrets[${i}]: secret name must match the vault name format`);
    return { name, description: optStr(s.description, `secrets[${i}].description`, 300), required: s.required === undefined ? undefined : bool(s.required, `secrets[${i}].required`, false) };
  });
  const secretNames = new Set<string>();
  secrets.forEach((s, i) => { if (secretNames.has(s.name)) fail(`secrets[${i}]: duplicate secret name`); secretNames.add(s.name); });

  const net = m.network === undefined ? {} : obj(m.network, "network", ["allow"]);
  const allow = arr(net.allow, "network.allow", 32).map((h, i) => {
    const host = str(h, `network.allow[${i}]`, 253);
    const labels = host.replace(/^\*\./, "").split(".");
    // No IP literals (all-numeric last label), and a wildcard needs at least two labels after "*.".
    if (!HOST.test(host) || /^\d+$/.test(labels[labels.length - 1]) || (host.startsWith("*.") && labels.length < 2)) fail(`network.allow[${i}] must be a host name or *.suffix (no IP addresses)`);
    return host;
  });

  const settingKeys = new Set<string>();
  const settings = arr(m.settings, "settings", 64).map((raw, i) => {
    const s = obj(raw, `settings[${i}]`, ["key", "type", "label", "description", "required", "options"]);
    const key = str(s.key, `settings[${i}].key`, 64);
    if (!SETTING_KEY.test(key)) fail(`settings[${i}].key has an invalid format`);
    if (settingKeys.has(key)) fail(`settings[${i}]: duplicate key`);
    settingKeys.add(key);
    if (typeof s.type !== "string" || !SETTING_TYPES.includes(s.type)) fail(`settings[${i}].type must be one of ${SETTING_TYPES.join(", ")}`);
    const type = s.type as PluginManifest["settings"][number]["type"];
    let options: { value: string; label: string }[] | undefined;
    if (type === "select") {
      options = arr(s.options, `settings[${i}].options`, 64).map((o, j) => {
        const r = obj(o, `settings[${i}].options[${j}]`, ["value", "label"]);
        return { value: str(r.value, `settings[${i}].options[${j}].value`), label: str(r.label, `settings[${i}].options[${j}].label`) };
      });
      if (!options.length) fail(`settings[${i}].options is required for select`);
    } else if (s.options !== undefined) fail(`settings[${i}].options is only allowed for select`);
    return { key, type, label: str(s.label, `settings[${i}].label`), description: optStr(s.description, `settings[${i}].description`, 300), required: s.required === undefined ? undefined : bool(s.required, `settings[${i}].required`, false), options };
  });

  const c = m.contributes === undefined ? {} : obj(m.contributes, "contributes", ["views", "taskSources", "rightSidebarTabs", "settingsPanel", "routes", "internalRoutes", "webhooks", "mcpServers", "skills", "migrations"]);

  const idList = <T extends { id: string }>(raw: unknown, path: string, label: string, build: (r: Record<string, unknown>, p: string) => T, keys: string[]): T[] => {
    const seen = new Set<string>();
    return arr(raw, `contributes.${path}`, 32).map((item, i) => {
      const p = `contributes.${path}[${i}]`;
      const r = obj(item, p, keys);
      const sid = str(r.id, `${p}.id`, 64);
      if (!SUB_ID.test(sid)) fail(`${p}: ${label} id must match ^[a-z][a-z0-9-]{0,31}$`);
      if (seen.has(sid)) fail(`${p}: duplicate ${label} id`);
      seen.add(sid);
      return build(r, p);
    });
  };
  const views = idList(c.views, "views", "view", (r, p) => ({ id: r.id as string, label: str(r.label, `${p}.label`, 80), icon: icon(r.icon, `${p}.icon`) }), ["id", "label", "icon"]);
  const tabs = idList(c.rightSidebarTabs, "rightSidebarTabs", "tab", (r, p) => ({ id: r.id as string, label: str(r.label, `${p}.label`, 80), icon: icon(r.icon, `${p}.icon`) }), ["id", "label", "icon"]);
  const taskSources = idList(c.taskSources, "taskSources", "task source", (r, p) => {
    if (r.view !== "generic" && r.view !== "custom") fail(`${p}.view must be "generic" or "custom"`);
    return { id: r.id as string, label: str(r.label, `${p}.label`, 80), view: r.view as "generic" | "custom" };
  }, ["id", "label", "view"]);

  const webhookSeen = new Set<string>();
  const webhooks = arr(c.webhooks, "contributes.webhooks", 16).map((w, i) => {
    const name = str(w, `contributes.webhooks[${i}]`, 64);
    if (!SUB_ID.test(name)) fail(`contributes.webhooks[${i}] must match ^[a-z][a-z0-9-]{0,31}$`);
    if (webhookSeen.has(name)) fail(`contributes.webhooks[${i}]: duplicate webhook name`);
    webhookSeen.add(name);
    return name;
  });
  const skillSeen = new Set<string>();
  const skills = arr(c.skills, "contributes.skills", 32).map((w, i) => {
    const name = str(w, `contributes.skills[${i}]`, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) fail(`contributes.skills[${i}] must be a folder name`);
    if (skillSeen.has(name)) fail(`contributes.skills[${i}]: duplicate skill`);
    skillSeen.add(name);
    return name;
  });

  const requireDeclared = (name: string, path: string) => {
    if (!VAULT_NAME.test(name)) fail(`${path}: secret name must match the vault name format`);
    if (!secretNames.has(name)) fail(`${path}: references an undeclared secret`);
  };
  const mcpSeen = new Set<string>();
  const mcpServers = arr(c.mcpServers, "contributes.mcpServers", 16).map((raw, i) => {
    const p = `contributes.mcpServers[${i}]`;
    const r = obj(raw, p, ["name", "type", "command", "args", "url", "env", "headers", "envSecrets", "headerSecrets"]);
    const name = str(r.name, `${p}.name`, 64);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) fail(`${p}.name has an invalid format`);
    if (`plugin-${id}-${name}`.length > 64) fail(`${p}.name is too long: installed as plugin-<id>-<name>, at most 64 characters`);
    if (mcpSeen.has(name)) fail(`${p}: duplicate server name`);
    mcpSeen.add(name);
    if (r.type !== "stdio" && r.type !== "http") fail(`${p}.type must be "stdio" or "http"`);
    const type = r.type as "stdio" | "http";
    const command = optStr(r.command, `${p}.command`, 500);
    const url = optStr(r.url, `${p}.url`, 2048);
    if (type === "stdio" && !command) fail(`${p}.command is required for stdio`);
    if (type === "http" && !url) fail(`${p}.url is required for http`);
    const args = r.args === undefined ? undefined : arr(r.args, `${p}.args`, 64).map((a, j) => str(a, `${p}.args[${j}]`, 1024));
    const envSecrets = strMap(r.envSecrets, `${p}.envSecrets`);
    if (envSecrets) for (const v of Object.values(envSecrets)) requireDeclared(v, `${p}.envSecrets`);
    const headerSecrets = strMap(r.headerSecrets, `${p}.headerSecrets`);
    if (headerSecrets) for (const tpl of Object.values(headerSecrets)) for (const mt of tpl.matchAll(HEADER_PLACEHOLDER)) requireDeclared(mt[1], `${p}.headerSecrets`);
    return { name, type, command, args, url, env: strMap(r.env, `${p}.env`), headers: strMap(r.headers, `${p}.headers`), envSecrets, headerSecrets };
  });

  return {
    id, name: str(m.name, "name", 80), version, apiVersion: 1, tier: "core",
    description: str(m.description, "description", 500), icon: icon(m.icon, "icon"), scope: m.scope as PluginManifest["scope"], access: (m.access ?? "everyone") as PluginManifest["access"],
    secrets, network: { allow }, settings,
    contributes: {
      views, taskSources, rightSidebarTabs: tabs,
      settingsPanel: bool(c.settingsPanel, "contributes.settingsPanel", false),
      routes: bool(c.routes, "contributes.routes", false),
      internalRoutes: bool(c.internalRoutes, "contributes.internalRoutes", false),
      webhooks, mcpServers, skills,
      migrations: bool(c.migrations, "contributes.migrations", false),
    },
  };
}
