import { useEffect, useMemo, useState } from "react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, usePluginApi, toast } from "@/plugins/kit";
import type { PluginInfo } from "@/plugins/sdk";
import { COUNTRIES, countryOf, formatLocal } from "../shared/phone";

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const MAX_LOCAL = 13;

/** Below the generic settings form: "Your WhatsApp number" (country + number, formatted as you type), then a test message. */
export default function SettingsPanel({ plugin }: { plugin: PluginInfo }) {
  const api = usePluginApi(plugin.id);
  const [code, setCode] = useState("55");
  const [local, setLocal] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const country = useMemo(() => COUNTRIES.find((c) => c.code === code) ?? null, [code]);

  useEffect(() => {
    void api<{ phone: string | null; formatted: string | null }>("/phone").then((r) => {
      if (!r.phone) return;
      const digits = r.phone.slice(1);
      const c = countryOf(digits);
      if (c) { setCode(c.code); setLocal(digits.slice(c.code.length)); }
      setSaved(r.formatted);
    }).catch(() => undefined);
  }, [api]);

  const full = local ? `+${code}${local}` : "";
  const dirty = (saved ?? "") !== (local ? `+${code} ${formatLocal(local, country)}` : "");

  async function save() {
    setBusy("save"); setResult(null);
    try {
      const r = await api<{ formatted: string | null }>("/phone", { method: "POST", body: { phone: full } });
      setSaved(r.formatted);
      toast.success(r.formatted ? `Saved ${r.formatted}` : "Number removed");
    } catch (e) { setResult({ ok: false, text: messageOf(e) }); }
    finally { setBusy(null); }
  }
  async function test() {
    setBusy("test"); setResult(null);
    try { await api("/test-message", { method: "POST", body: {} }); setResult({ ok: true, text: "Test message sent. Check WhatsApp on that number." }); toast.success("Test message sent"); }
    catch (e) { setResult({ ok: false, text: messageOf(e) }); }
    finally { setBusy(null); }
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-border bg-card p-3 text-[13px]">
      <div className="space-y-1.5">
        <label htmlFor="waha-phone" className="text-sm font-medium">Your WhatsApp number</label>
        <p className="text-muted-foreground">The only number "Let the AI message me freely" writes to.</p>
        <div className="flex gap-2">
          <Select value={code} onValueChange={setCode}>
            <SelectTrigger aria-label="Country" className="w-36 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" className="max-h-72">
              {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} +{c.code} <span className="text-muted-foreground">{c.name}</span></SelectItem>)}
            </SelectContent>
          </Select>
          <Input id="waha-phone" inputMode="tel" autoComplete="tel-national" placeholder={formatLocal("11999999999".slice(0, country?.groups.reduce((a, b) => a + b, 0) ?? 10), country)}
            value={formatLocal(local, country)}
            onChange={(e) => {
              const typed = e.target.value;
              let digits = typed.replace(/\D/g, "");
              // A pasted full international number ("+55 11 ...") switches the country.
              if (typed.trim().startsWith("+")) { const c = countryOf(digits); if (c) { setCode(c.code); digits = digits.slice(c.code.length); } }
              setLocal(digits.replace(/^0+/, "").slice(0, MAX_LOCAL));
            }} />
          <Button size="sm" disabled={busy !== null || !dirty} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</Button>
        </div>
        {saved && !dirty && <p className="text-muted-foreground">Saved: {saved}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy !== null || !saved || dirty} onClick={test}>{busy === "test" ? "Sending…" : "Send test message"}</Button>
        {result && <span role="status" className={result.ok ? "text-foreground" : "text-destructive"}>{result.text}</span>}
      </div>
    </div>
  );
}
