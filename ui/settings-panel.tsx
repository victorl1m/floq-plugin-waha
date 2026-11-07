import { useState } from "react";
import { Button, usePluginApi, toast } from "@/plugins/kit";
import type { PluginInfo } from "@/plugins/sdk";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** Below the generic settings form: sends a test message to the saved "Assistant can message me" number. */
export default function SettingsPanel({ plugin }: { plugin: PluginInfo }) {
  const api = usePluginApi(plugin.id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  async function test() {
    setBusy(true); setResult(null);
    try { await api("/test-message", { method: "POST", body: {} }); setResult({ ok: true, text: "Test message sent. Check WhatsApp on that number." }); toast.success("Test message sent"); }
    catch (e) { setResult({ ok: false, text: messageOf(e) }); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-4 rounded-md border border-border bg-card p-3 text-[13px]">
      <p className="text-muted-foreground">Save your number above first, then send yourself a test. Automatic sending is off unless you enabled it: agents then ask you before each message.</p>
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={test}>{busy ? "Sending…" : "Send test message"}</Button>
        {result && <span role="status" className={result.ok ? "text-foreground" : "text-destructive"}>{result.text}</span>}
      </div>
    </div>
  );
}
