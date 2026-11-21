import { useEffect, useReducer, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Tooltip, TooltipContent, TooltipTrigger, cn, toast, usePluginEvent } from "@/plugins/kit";
import type { Chat } from "../shared/chat";
import { errorCode, useWa, type Api } from "./context";
import { IconCheck } from "./icons";
import { IconChevronDown, Spinner } from "./icons";
import { IconPencilSmall, IconPlusSmall, IconTag, IconTrashSmall } from "./icons-more";

export interface Label { id: string; name: string; color: string }
/** WhatsApp's 20 label colours (the runtime maps any hex to the closest one). */
export const LABEL_COLORS = ["#ff9485", "#64c4ff", "#ffd429", "#dfaef0", "#99b6c1", "#55ccb3", "#ff9dff", "#d3a91d", "#6d7cce", "#d7e752", "#00d0e2", "#ffc5c7", "#93ceac", "#f74848", "#00a0f2", "#83e422", "#ffaf04", "#b5ebff", "#9ba6ff", "#9368cf"];

/** Black or white text, whichever reads better on a label colour. */
export function inkOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111b21" : "#ffffff";
}

// One label list per api caller, shared by every component on screen.
interface Shared { labels: Label[]; supported: boolean; loaded: boolean; subs: Set<() => void>; loading: boolean }
const shared = new WeakMap<Api, Shared>();
function sharedOf(api: Api): Shared { let s = shared.get(api); if (!s) { s = { labels: [], supported: true, loaded: false, subs: new Set(), loading: false }; shared.set(api, s); } return s; }
async function reload(api: Api) {
  const s = sharedOf(api);
  if (s.loading) return;
  s.loading = true;
  try { const r = await api<{ labels: Label[]; supported: boolean }>("/labels"); s.labels = r.labels ?? []; s.supported = r.supported !== false; }
  catch { /* keep what is shown; labels are optional */ }
  finally { s.loaded = true; s.loading = false; s.subs.forEach((f) => f()); }
}

/** The label list. `supported` is false for engines or accounts without labels: components then render nothing. */
export function useLabels(): { labels: Label[]; supported: boolean; loaded: boolean; reload: () => void } {
  const { api, pluginId, features } = useWa();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const s = sharedOf(api);
  useEffect(() => {
    s.subs.add(tick);
    if (features.labels && !s.loaded) void reload(api);
    return () => { s.subs.delete(tick); };
  }, [api, s, features.labels]);
  usePluginEvent(pluginId, "labels", () => void reload(api));
  const on = features.labels && s.supported;
  return { labels: on ? s.labels : [], supported: on, loaded: s.loaded, reload: () => void reload(api) };
}

/** Small coloured chips for a chat row: the first two labels and "+N". */
export function LabelChips({ ids, max = 2 }: { ids?: string[]; max?: number }) {
  const { labels, supported } = useLabels();
  if (!supported || !ids?.length) return null;
  const own = ids.map((id) => labels.find((l) => l.id === id)).filter((l): l is Label => !!l);
  if (!own.length) return null;
  return (
    <span className="wa-lchips" role="list" aria-label="Labels">
      {own.slice(0, max).map((l) => <span key={l.id} role="listitem" className="wa-lchip" style={{ background: l.color, color: inkOn(l.color) }} title={l.name}>{l.name}</span>)}
      {own.length > max && <span role="listitem" className="wa-lchip wa-lchip-more" title={own.slice(max).map((l) => l.name).join(", ")}>+{own.length - max}</span>}
    </span>
  );
}

/** Chat-list filter: "" is every chat, otherwise a label id (a chat passes when its labels include it). */
export function LabelFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { labels, supported } = useLabels();
  if (!supported || !labels.length) return null;
  const current = labels.find((l) => l.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="wa-chip wa-lfilter" aria-pressed={current ? "true" : "false"} aria-label={current ? `Label filter: ${current.name}` : "Filter by label"}>
          {current ? <span className="wa-ldot" style={{ background: current.color }} /> : <IconTag />}
          <span className="wa-lfilter-name">{current ? current.name : "Labels"}</span><IconChevronDown />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="wa-portal wa-lmenu">
        <DropdownMenuItem onSelect={() => onChange("")} className="wa-lmenu-item"><span className="wa-ldot wa-ldot-none" />All labels{!value && <IconCheck className="wa-lmenu-check" />}</DropdownMenuItem>
        {labels.map((l) => (
          <DropdownMenuItem key={l.id} onSelect={() => onChange(l.id === value ? "" : l.id)} className="wa-lmenu-item">
            <span className="wa-ldot" style={{ background: l.color }} /><span className="wa-lmenu-name">{l.name}</span>{l.id === value && <IconCheck className="wa-lmenu-check" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Swatches({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  return (
    <div className="wa-swatches" role="radiogroup" aria-label={label}>
      {LABEL_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} className="wa-swatch" style={{ background: c, color: inkOn(c) }} onClick={() => onChange(c)}>{value === c && <IconCheck />}</button>
      ))}
    </div>
  );
}

type Mode = { kind: "none" } | { kind: "new" } | { kind: "edit"; id: string } | { kind: "delete"; id: string };
const asText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
const fail = (title: string, e: unknown) => toast.error(title, { description: errorCode(e) === "unsupported" ? "This WAHA engine does not support labels." : asText(e) });

/** Dialog to give a chat labels and to create, rename, recolour and delete labels. `open` / `onOpenChange` make it controlled (no trigger button then). */
export function LabelPicker({ chat, open, onOpenChange }: { chat: Pick<Chat, "chatId"> & Partial<Chat>; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { api, refreshChats } = useWa();
  const { labels, supported, reload: refreshLabels } = useLabels();
  const [inner, setInner] = useState(false);
  const isOpen = open ?? inner;
  const setOpen = (v: boolean) => { setInner(v); onOpenChange?.(v); };
  const [picked, setPicked] = useState<string[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[1]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) { setPicked(null); setMode({ kind: "none" }); return; }
    let live = true;
    api<{ labels: string[] }>(`/labels/chat?chatId=${encodeURIComponent(chat.chatId)}`)
      .then((r) => { if (live) setPicked(r.labels ?? []); })
      .catch((e) => { if (live) { setPicked(chat.labels ?? []); fail("Could not read the labels of this chat", e); } });
    return () => { live = false; };
  }, [isOpen, api, chat.chatId, chat.labels]);

  if (!supported) return null;
  const toggle = (id: string) => setPicked((p) => (p ?? []).includes(id) ? (p ?? []).filter((x) => x !== id) : [...(p ?? []), id]);
  const startNew = () => { setName(""); setColor(LABEL_COLORS[1]); setMode({ kind: "new" }); };
  const startEdit = (l: Label) => { setName(l.name); setColor(LABEL_COLORS.includes(l.color) ? l.color : LABEL_COLORS[1]); setMode({ kind: "edit", id: l.id }); };
  const run = async (what: string, job: () => Promise<unknown>) => {
    setBusy(true);
    try { await job(); refreshLabels(); setMode({ kind: "none" }); return true; }
    catch (e) { fail(what, e); return false; }
    finally { setBusy(false); }
  };
  const saveLabel = () => {
    const n = name.trim();
    if (!n) return;
    void run(mode.kind === "edit" ? "Could not rename the label" : "Could not create the label", () => mode.kind === "edit"
      ? api("/labels/update", { method: "POST", body: { id: mode.id, name: n, color } })
      : api("/labels", { method: "POST", body: { name: n, color } }));
  };
  const remove = (id: string) => void run("Could not delete the label", async () => { await api("/labels/delete", { method: "POST", body: { id } }); setPicked((p) => (p ?? []).filter((x) => x !== id)); refreshChats(); });
  const save = async () => {
    setBusy(true);
    try { await api("/labels/chat", { method: "POST", body: { chatId: chat.chatId, labels: picked ?? [] } }); refreshChats(); setOpen(false); }
    catch (e) { fail("Labels not saved", e); }
    finally { setBusy(false); }
  };
  const editor = (
    <div className="wa-leditor">
      <Input value={name} maxLength={100} placeholder="Label name" aria-label="Label name" autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveLabel(); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMode({ kind: "none" }); } }} />
      <Swatches value={color} onChange={setColor} label="Label colour" />
      <div className="wa-lactions">
        <Button type="button" variant="ghost" size="sm" className="wa-dbtn" onClick={() => setMode({ kind: "none" })}>Cancel</Button>
        <Button type="button" size="sm" className="wa-dbtn wa-dprimary" disabled={!name.trim() || busy} onClick={saveLabel}>{mode.kind === "edit" ? "Save label" : "Add label"}</Button>
      </div>
    </div>
  );

  return (
    <>
      {open === undefined && (
        <Tooltip>
          <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Labels" onClick={() => setOpen(true)}><IconTag /></Button></TooltipTrigger>
          <TooltipContent>Labels</TooltipContent>
        </Tooltip>
      )}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="wa-portal wa-mdlg">
          <DialogHeader><DialogTitle>Labels</DialogTitle><DialogDescription>Tick the labels this chat should have.</DialogDescription></DialogHeader>
          <div className="wa-llist" role="group" aria-label="Labels of this chat">
            {picked === null ? <div className="wa-lempty"><Spinner />Loading</div> : labels.length === 0 && mode.kind !== "new" ? <div className="wa-lempty">No labels yet. Create the first one below.</div> : labels.map((l) => (
              mode.kind === "edit" && mode.id === l.id ? <div key={l.id} className="wa-lrow wa-lrow-edit">{editor}</div> : (
                <div key={l.id} className="wa-lrow">
                  <button type="button" role="checkbox" aria-checked={picked.includes(l.id)} className="wa-lcheck" onClick={() => toggle(l.id)}>
                    <span className="wa-ldot wa-ldot-lg" style={{ background: l.color, color: inkOn(l.color) }}>{picked.includes(l.id) && <IconCheck />}</span>
                    <span className="wa-lname">{l.name}</span>
                  </button>
                  {mode.kind === "delete" && mode.id === l.id ? (
                    <span className="wa-lconfirm">Delete?<Button type="button" variant="ghost" size="sm" className="wa-dbtn wa-ddanger" disabled={busy} onClick={() => remove(l.id)}>Delete</Button><Button type="button" variant="ghost" size="sm" className="wa-dbtn" onClick={() => setMode({ kind: "none" })}>Keep</Button></span>
                  ) : (
                    <span className="wa-lbtns">
                      <button type="button" className="wa-lmini" aria-label={`Rename ${l.name}`} onClick={() => startEdit(l)}><IconPencilSmall /></button>
                      <button type="button" className="wa-lmini" aria-label={`Delete ${l.name}`} onClick={() => setMode({ kind: "delete", id: l.id })}><IconTrashSmall /></button>
                    </span>
                  )}
                </div>
              )
            ))}
            {mode.kind === "new" ? <div className="wa-lrow wa-lrow-edit">{editor}</div> : (
              <button type="button" className={cn("wa-ladd")} onClick={startNew}><IconPlusSmall />New label</button>
            )}
          </div>
          <DialogFooter className="wa-dfoot">
            <Button type="button" variant="ghost" className="wa-dbtn" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" className="wa-dbtn wa-dprimary" disabled={busy || picked === null} onClick={() => void save()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
