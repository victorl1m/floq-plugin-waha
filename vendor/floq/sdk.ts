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
  // No secret env or headers: plugin secrets never enter the agent sandbox (the manifest validator rejects envSecrets/headerSecrets).
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
  /** Lets the plugin see the install owner's pending decisions/approvals and answer them (`ctx.attention`). Install-scoped plugins only. */
  attention: boolean;
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
  /**
   * Install-scoped plugins only: the full public URL of a declared webhook, `<public base>/v1/plugins/<id>/hooks/<name>/<token>`, so the plugin
   * can register it with the outside service itself. The token is a host-managed one (created on first use, valid next to the one an admin
   * rotates by hand; an admin rotation replaces both). Null when the runtime has no address the outside can reach (BETTER_AUTH_URL is a
   * loopback address and FLOQ_PUBLIC_URL is not set). The URL is a credential: never log it or return it from a route.
   */
  url(name: string): Promise<string | null>;
}

export interface PluginNotifyAction {
  /** Sent back to the plugin's action route. Letters, digits, - and _; at most 32 characters. */
  id: string;
  /** Button text, at most 40 characters. */
  label: string;
  /** Present: the action takes one line of text typed by the user (an inline reply). */
  input?: { placeholder?: string };
}
export interface PluginNotifyInput {
  /** "message": a person wrote (avatar, name, preview, inline reply). Default "message". */
  kind?: "message";
  /** Sender or headline, at most 120 characters. */
  title: string;
  /** Preview text, at most 2000 characters. */
  body?: string;
  /** Small line above the title next to the plugin name (account, group), at most 120 characters. */
  subtitle?: string;
  /** `data:image/(png|jpeg|webp|gif);base64,...` of at most 32 KiB. Anything else is dropped (initials are shown). */
  avatar?: string;
  /** A new notification with the same tag replaces the previous one of this plugin and user (one per chat). At most 200 characters. */
  tag?: string;
  /** At most 4. */
  actions?: PluginNotifyAction[];
  /** The plugin's own POST route (`ctx.routes.post`) that receives `{ notificationId, actionId, input, data }` as the user. Required with actions. */
  actionRoute?: string;
  /** Opaque JSON (at most 2 KiB) handed back to the action route. Never sent to the app. */
  data?: unknown;
  /** Where "open" goes: one of the plugin's own views plus string params the view receives (`usePluginOpen` in the UI SDK). */
  target?: { view: string; params?: Record<string, string> };
}
export interface PluginNotifications {
  /** Removes this plugin's notifications of that user with this tag (the chat was read elsewhere). */
  clear(userId: string, tag: string): Promise<void>;
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

export interface AttentionQuestion { id: string; question: string; header?: string; options: { id: string; label: string; description?: string }[]; multiSelect: boolean; allowText: boolean }
export type AttentionPending =
  | { kind: "decision"; id: string; userId: string; sessionName: string; sessionId: string; projectId: string | null; questions: AttentionQuestion[]; allowText: boolean; irreversible: false; createdAt: string }
  | { kind: "approval"; id: string; userId: string; sessionName: string; sessionId: string; projectId: string | null; action: string; detail: string; options: { id: "allow" | "deny"; label: string }[]; allowText: false; irreversible: boolean; createdAt: string };
export interface AttentionResolved { kind: "decision" | "approval"; id: string; status: string; by: "app" | "plugin" }
export interface PluginAttention {
  /**
   * Requires `contributes.attention` and an install-scoped plugin. Calls `fn` for every pending item of the install owner (replayed on subscribe,
   * then live). Plugin-originated approvals are never delivered. Returns an unsubscribe function. The owner is read when you subscribe.
   */
  onPending(fn: (item: AttentionPending) => void): () => void;
  /** Called once for each item previously delivered to `onPending` when it ends (answered, cancelled, expired). `by` is "plugin" when this plugin answered it. */
  onResolved(fn: (event: AttentionResolved) => void): () => void;
  /** Answers as the install owner (the host binds the user; it is never a parameter). Rejects with `status` 409 when already answered. */
  resolveDecision(id: string, answers: { questionId: string; optionIds: string[]; text: string }[]): Promise<void>;
  /** Answers as the install owner. "allow" is refused (403) for irreversible actions and for plugin-originated approvals. Audited as `resolvedVia: "plugin:<id>"`. 409 when already answered. */
  resolveApproval(id: string, decision: "allow" | "deny"): Promise<void>;
}

/** Host API for the bundled `storage-sense` plugin only (other plugins get a refusal): cleanup of what agents leave in awake homes. */
export interface PluginStorageSense {
  awakeUserIds(): string[];
  run(userId: string, config: import("../storageSense/plan.js").StorageSenseConfig, options: { dryRun: boolean; trigger: "schedule" | "low-space" | "manual"; budgetMs?: number }): Promise<import("../storageSense/plan.js").StorageSenseReport | null>;
  freePercent(userId: string): Promise<number | null>;
  /** Sends a notification (category system) to the user. */
  notify(userId: string, note: { title: string; body: string; level: "info" | "warning" }): Promise<void>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly manifest: PluginManifest;
  /** Install-scoped plugins only: the administrator who enabled the plugin (who owns the install's settings and any owner-only views), or null. */
  installOwner(): Promise<string | null>;
  /** Builds the host's `HttpError` (status, code, message) so a bundled plugin needs no host imports. Throw it from a route or provider. */
  httpError(status: number, code: string, message: string): Error;
  routes: PluginRoutes;
  internalRoutes: PluginInternalRoutes;
  webhooks: PluginWebhooks;
  secrets: {
    /** Install-scoped plugins only: stores a declared install secret in the plugin secret store (a key the plugin generates itself, e.g. a webhook HMAC key). Audited as `plugin:<id>`. */
    setInstall(name: string, value: string): Promise<void>;
    /** User-scoped plugins only: the calling user's own secret from the plugin secret store (never the vault). Declared names only; throws for install scope. */
    get(userId: string, name: string): Promise<string | undefined>;
    /** Install-scoped plugins only: the installation's secret from the plugin secret store (never the vault). Throws for user-scoped plugins. */
    getInstall(name: string): Promise<string | undefined>;
  };
  fetch(url: string, init?: PluginFetchInit): Promise<PluginFetchResponse>;
  /** Like `fetch`, but reaches only the origin of a saved `url` setting (self-hosted services). Needs a `url` setting in the manifest. */
  fetchUserUrl(userId: string, url: string, init?: PluginFetchInit): Promise<PluginFetchResponse>;
  db: PluginDb;
  /**
   * A notification for that user from this plugin: Notification Center (category "message") and the island, with the plugin's own actions.
   * An action only ever calls `actionRoute` of this same plugin, as the user who clicked, through the host. Text is cleaned like any
   * notification. Rate-limited per user and plugin (120 a minute; throws HttpError 429).
   */
  notify(userId: string, note: PluginNotifyInput): Promise<{ id: string }>;
  notifications: PluginNotifications;
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
  /** User ids that switched this (user-scoped) plugin on. */
  enabledUserIds(): Promise<string[]>;
  /** Only for the bundled `storage-sense` plugin; throws for any other plugin. */
  storageSense: PluginStorageSense;
  events: PluginEvents;
  approvals: PluginApprovals;
  attention: PluginAttention;
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
