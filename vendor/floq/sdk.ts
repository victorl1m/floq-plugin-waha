/** Plugin API types (runtime truth). Types only; no runtime code. */

export const PLUGIN_API_VERSION = 1;

export type PluginTier = "core" | "external";
export type PluginScope = "user" | "install";
/** Who can use an install-scope plugin: everyone on the runtime, or only the administrator who enabled it (WAHA: a private inbox). */
export type PluginAccess = "everyone" | "owner";

export interface PluginSecretDecl { name: string; description?: string; required?: boolean }

export type PluginSettingType = "text" | "url" | "number" | "boolean" | "select" | "secretRef";
export interface PluginSettingDecl {
  key: string;
  type: PluginSettingType;
  label: string;
  description?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export interface PluginViewDecl { id: string; label: string; icon?: string }
export interface PluginTaskSourceDecl { id: string; label: string; view: "generic" | "custom" }
export interface PluginRightSidebarTabDecl { id: string; label: string; icon?: string }

export interface PluginMcpServerDecl {
  name: string;
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  /** env var name -> declared secret name */
  envSecrets?: Record<string, string>;
  /** header name -> template with {{SECRET}} placeholders of declared secrets */
  headerSecrets?: Record<string, string>;
}

export interface PluginContributes {
  views: PluginViewDecl[];
  taskSources: PluginTaskSourceDecl[];
  rightSidebarTabs: PluginRightSidebarTabDecl[];
  settingsPanel: boolean;
  routes: boolean;
  internalRoutes: boolean;
  webhooks: string[];
  mcpServers: PluginMcpServerDecl[];
  skills: string[];
  migrations: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: 1;
  tier: "core";
  description: string;
  icon?: string;
  scope: PluginScope;
  access: PluginAccess;
  secrets: PluginSecretDecl[];
  network: { allow: string[] };
  settings: PluginSettingDecl[];
  contributes: PluginContributes;
}

// ---- Runtime API handed to plugin code (Tier 1: trusted, guard rails only) ----
// Not a sandbox: plugin SQL shares the database role, so `search_path` scoping does not prevent reading core tables. Tier 1 code is reviewed like core code (CODEOWNERS).

export interface PluginRouteRequest {
  userId: string;
  /** Set for agent calls through `/internal/plugins/<id>/*`: the calling session. */
  sessionId?: string;
  /** Internal calls only: aborted when the agent's request goes away (the CLI gave up or the session ended). Pass it on to anything long-running. */
  signal?: AbortSignal;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}
/** Return value becomes the JSON body (HTTP 200). Throw `HttpError` for other statuses. */
export type PluginRouteHandler = (req: PluginRouteRequest) => unknown | Promise<unknown>;
export type PluginRouteMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface PluginRoutes {
  get(pattern: string, handler: PluginRouteHandler): void;
  post(pattern: string, handler: PluginRouteHandler): void;
  put(pattern: string, handler: PluginRouteHandler): void;
  delete(pattern: string, handler: PluginRouteHandler): void;
}

export interface PluginFetchInit { method?: string; headers?: Record<string, string>; body?: string | Uint8Array }
export interface PluginFetchResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  bytes: Uint8Array;
  text(): string;
  json(): unknown;
}

export interface PluginDb {
  /** Runs inside a transaction scoped to the plugin schema (or with the `{{p}}` table prefix in fallback mode). */
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>;
  /** Same, but `$1` is always the userId and caller params start at `$2`. */
  forUser(userId: string): { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> };
}

export interface PluginLog {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface PluginTaskSources {
  /** `id` must be declared in `contributes.taskSources`. Items are validated and clamped to `ExternalTask` by the host. */
  register(source: { id: string; provider: import("./taskSources.js").TaskSourceProvider }): void;
}

export interface PluginInternalRoutes {
  /**
   * Agent-callable (`floq plugin call <id> <path> [--json BODY]`), authenticated by the session token; always POST on the wire.
   * Requires `contributes.internalRoutes`. Output is sanitized (forged approval markers neutralized) before the agent sees it.
   * An outward-facing write triggered from here must go through `ctx.approvals.request`.
   */
  call(pattern: string, handler: PluginRouteHandler): void;
}

export interface WebhookRequest { rawBody: Uint8Array; headers: Record<string, string>; query: Record<string, string>; json(): unknown }
export type WebhookHandler = (req: WebhookRequest) => unknown | Promise<unknown>;
export interface PluginWebhooks {
  /**
   * `name` must be declared in `contributes.webhooks`. Exposed unauthenticated at `/v1/plugins/<id>/hooks/<name>/<installToken>`: the
   * host checks the token (constant time), caps the body at 256 KiB and rate-limits. `verify` (e.g. an HMAC check) runs after that;
   * returning false answers 401. There is no calling user: use `ctx.secrets.getInstall`.
   */
  on(name: string, handler: WebhookHandler, options?: { verify?: (req: WebhookRequest) => boolean | Promise<boolean> }): void;
}

export interface PluginEvents {
  /** Sends a `/v1/events` frame `{type:"plugin", pluginId, name, data}` to that user's open apps only. Data is JSON, at most 64 KiB; otherwise this throws. */
  publish(userId: string, name: string, data?: unknown): void;
}

export interface PluginApprovals {
  /**
   * Asks the signed-in user to approve an outward-facing action (shown as "Plugin: <name>"). Only the user can answer; a plugin
   * or agent token cannot. Resolves once per request: "approved" (single use), "denied", or "expired" (withdrawn, plugin stopped).
   * Use it whenever an agent triggers a write; a click in the UI is consent already.
   */
  request(input: { userId: string; action: string; detail?: string; signal?: AbortSignal; timeoutMs?: number }): Promise<"approved" | "denied" | "expired">;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly manifest: PluginManifest;
  /** Install-scoped plugins only: the administrator who enabled the plugin (whose vault and settings it uses), or null. */
  installOwner(): Promise<string | null>;
  /** Builds the host's `HttpError` (status, code, message) so a bundled plugin needs no host imports. Throw it from a route or provider. */
  httpError(status: number, code: string, message: string): Error;
  routes: PluginRoutes;
  internalRoutes: PluginInternalRoutes;
  webhooks: PluginWebhooks;
  secrets: {
    /** User-scoped plugins: the calling user's own secret. Only names declared in the manifest; throws otherwise. */
    get(userId: string, name: string): Promise<string | undefined>;
    /** Install-scoped plugins only: the secret of the admin who enabled the plugin (`floq_plugins.config_owner`). Throws for user-scoped plugins. */
    getInstall(name: string): Promise<string | undefined>;
  };
  fetch(url: string, init?: PluginFetchInit): Promise<PluginFetchResponse>;
  /** Like `fetch`, but reaches only the origin of a saved `url` setting (self-hosted services). Needs a `url` setting in the manifest. */
  fetchUserUrl(userId: string, url: string, init?: PluginFetchInit): Promise<PluginFetchResponse>;
  db: PluginDb;
  /** Shows a toast in that user's open apps (a `toast` event the host renders). Title up to 120 chars, description up to 300. */
  toast(userId: string, toast: { title: string; description?: string }): void;
  settings: {
    /** The values saved through Settings > Plugins, validated against `manifest.settings`: the install config for `scope:"install"`, otherwise `userId`'s own. */
    get(userId: string): Promise<Record<string, unknown>>;
  };
  kv: {
    get(userId: string, key: string): Promise<unknown>;
    set(userId: string, key: string, value: unknown): Promise<void>;
  };
  taskSources: PluginTaskSources;
  events: PluginEvents;
  approvals: PluginApprovals;
  log: PluginLog;
  /** Serialized: a run is skipped while the previous one is still in flight. Returns a cancel function. Cleared on stop. */
  schedule(intervalMs: number, fn: () => void | Promise<void>): () => void;
}

export interface PluginMigration { id: string; sql: string }

export interface PluginDefinition {
  /** Raw manifest object (usually the imported plugin.json); validated by `parseManifest`. */
  manifest: unknown;
  /** Ordered. Applied ids never change; only append. In SQL, `{{p}}` expands to the table prefix in fallback mode and to "" in schema mode. */
  migrations?: PluginMigration[];
  /** Absolute directory of the plugin (for `contributes.skills`: skill folders live in `<dir>/skills/<name>/SKILL.md`). */
  dir?: string;
  start?(ctx: PluginContext): void | Promise<void>;
  stop?(): void | Promise<void>;
}

export const definePlugin = (def: PluginDefinition): PluginDefinition => def;
