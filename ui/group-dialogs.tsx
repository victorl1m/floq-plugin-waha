// Shared pieces of the group flows: the avatar with its picture, the contact picker, a confirmation dialog, "add participants" and the invite link.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, cn, toast } from "@/plugins/kit";
import { chatKind, displayName, type Chat } from "../shared/chat";
import { formatPhoneDisplay } from "../shared/phone";
import { Avatar } from "./avatar";
import { useWa, errorText } from "./context";
import { IconCheck, IconSearch, IconX, Spinner } from "./icons";
import { IconCopy, IconLink } from "./icons-people";
import { fail, useDebounced, type Contact } from "./people-utils";

type Like = Pick<Chat, "chatId"> & Partial<Chat>;
export const phoneText = (phone: string | null | undefined) => (phone && /^\d{6,15}$/.test(phone) ? formatPhoneDisplay(phone) : "");

/** Round picture (or the initials avatar while there is none). size: sm 40px (default), md 49px, xl 140px. */
export function Pic({ chat, size = "sm" }: { chat: Like; size?: "sm" | "md" | "xl" }) {
  const { useAvatar } = useWa();
  const url = useAvatar({ chatId: chat.chatId, avatar: chat.avatar ?? null });
  return <span className={cn("wa-pic", "wa-pic-" + size)}>{url ? <img src={url} alt="" draggable={false} /> : <Avatar chat={chat} />}</span>;
}

/** Yes/no question before something that cannot be undone. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirm, danger = true, onConfirm }:
  { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirm: string; danger?: boolean; onConfirm: () => void | Promise<void> }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={danger ? "destructive" : "default"} onClick={() => void onConfirm()}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Search box + the contacts of GET /contacts. Single pick (onPick) or multiple (selected + onToggle). */
export function ContactPicker({ selected, onToggle, exclude = [], placeholder = "Search name or number", autoFocus, header, multi = true }:
  { selected: Contact[]; onToggle: (c: Contact) => void; exclude?: string[]; placeholder?: string; autoFocus?: boolean; header?: ReactNode; multi?: boolean }) {
  const { api } = useWa();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 200);
  const [state, setState] = useState<{ contacts: Contact[]; loading: boolean; error: string }>({ contacts: [], loading: true, error: "" });
  useEffect(() => {
    let dead = false;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api<{ contacts: Contact[] }>(`/contacts?q=${encodeURIComponent(q)}&limit=80`)
      .then((r) => { if (!dead) setState({ contacts: r.contacts ?? [], loading: false, error: "" }); })
      .catch((e) => { if (!dead) setState({ contacts: [], loading: false, error: errorText(e) }); });
    return () => { dead = true; };
  }, [api, q]);
  const hidden = useMemo(() => new Set(exclude), [exclude]);
  const picked = new Set(selected.map((c) => c.chatId));
  const rows = state.contacts.filter((c) => !hidden.has(c.chatId));
  return (
    <div className="wa-picker">
      {selected.length > 0 && (
        <ul className="wa-chosen" role="list" aria-label="Selected">
          {selected.map((c) => (
            <li key={c.chatId}>
              <span className="wa-tag">{c.name || phoneText(c.phone) || "Unknown contact"}<button type="button" aria-label={`Remove ${c.name || phoneText(c.phone) || "contact"}`} onClick={() => onToggle(c)}><IconX /></button></span>
            </li>
          ))}
        </ul>
      )}
      <div className="wa-find">
        <IconSearch />
        <Input type="text" role="searchbox" value={query} placeholder={placeholder} aria-label="Search contacts" autoComplete="off" spellCheck={false} autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); e.stopPropagation(); setQuery(""); } }} />
      </div>
      <div className="wa-picklist" role="group" aria-label="Contacts">
        {header}
        {state.loading && !rows.length ? <div className="wa-dlg-note"><Spinner />Loading contacts…</div>
          : state.error ? <div className="wa-dlg-note">Could not load contacts. {state.error}</div>
          : !rows.length ? <div className="wa-dlg-note">{q ? `No contacts match “${q}”.` : "No contacts yet. Use a phone number instead."}</div>
          : <ul role="list">{rows.map((c) => {
              const on = picked.has(c.chatId), like: Like = { chatId: c.chatId, kind: "user", name: c.name, phone: c.phone, avatar: c.avatar };
              return (
                <li key={c.chatId}>
                  <button type="button" className="wa-pickrow" aria-pressed={on} onClick={() => onToggle(c)}>
                    <Pic chat={like} />
                    <span className="wa-pickbody"><b>{displayName(like)}</b>{c.name && phoneText(c.phone) && <span>{phoneText(c.phone)}</span>}</span>
                    {multi && <span className="wa-ptk" aria-hidden="true">{on && <IconCheck />}</span>}
                  </button>
                </li>
              );
            })}</ul>}
      </div>
    </div>
  );
}

export function AddParticipantsDialog({ open, onOpenChange, chatId, existing, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; chatId: string; existing: string[]; onDone: () => void }) {
  const { api } = useWa();
  const [picked, setPicked] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPicked([]); }, [open]);
  const toggle = (c: Contact) => setPicked((p) => (p.some((x) => x.chatId === c.chatId) ? p.filter((x) => x.chatId !== c.chatId) : [...p, c]));
  async function add() {
    setBusy(true);
    try {
      await api("/group/participants", { method: "POST", body: { chatId, action: "add", participants: picked.map((c) => c.chatId) } });
      toast.success(picked.length === 1 ? "Participant added" : `${picked.length} participants added`);
      onOpenChange(false); onDone();
    } catch (e) { fail("Could not add participants", e); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wa-dialog">
        <div className="wa-dlg">
          <DialogHeader><DialogTitle>Add participants</DialogTitle><DialogDescription>Pick the people to add to this group.</DialogDescription></DialogHeader>
          <ContactPicker selected={picked} onToggle={toggle} exclude={existing} autoFocus />
          <DialogFooter className="wa-dlg-foot">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={!picked.length || busy} onClick={() => void add()}>{busy ? "Adding…" : picked.length ? `Add ${picked.length}` : "Add"}</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InviteLinkDialog({ open, onOpenChange, chatId }: { open: boolean; onOpenChange: (o: boolean) => void; chatId: string }) {
  const { api } = useWa();
  const [link, setLink] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    let dead = false;
    setState("loading"); setLink("");
    api<{ link: string }>(`/group/invite?chatId=${encodeURIComponent(chatId)}`)
      .then((r) => { if (!dead) { setLink(r.link); setState("ready"); } })
      .catch((e) => { if (!dead) { setError(errorText(e)); setState("error"); } });
    return () => { dead = true; };
  }, [api, chatId, open]);
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast.success("Link copied"); }
    catch { field.current?.select(); toast.info("Press Ctrl+C to copy the link"); }
  }
  async function revoke() {
    setBusy(true);
    try { setLink((await api<{ link: string }>("/group/invite/revoke", { method: "POST", body: { chatId } })).link); toast.success("Link reset", { description: "The old link no longer works." }); }
    catch (e) { fail("Could not reset the link", e); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="wa-dialog">
          <div className="wa-dlg">
            <DialogHeader><DialogTitle>Invite to group via link</DialogTitle><DialogDescription>Anyone with this link can join the group.</DialogDescription></DialogHeader>
            {state === "loading" ? <div className="wa-dlg-note"><Spinner />Getting the link…</div>
              : state === "error" ? <div className="wa-dlg-note">Could not get the invite link. {error}</div>
              : (
                <div className="wa-linkbox">
                  <IconLink />
                  <input ref={field} className="wa-linkfield" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                </div>
              )}
            <DialogFooter className="wa-dlg-foot">
              <Button type="button" variant="ghost" disabled={state !== "ready" || busy} onClick={() => setAsking(true)}>Reset link</Button>
              <Button type="button" disabled={state !== "ready"} onClick={() => void copy()}><IconCopy />Copy link</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={asking} onOpenChange={setAsking} title="Reset the invite link?" description="The current link stops working and a new one is created." confirm="Reset link" onConfirm={revoke} />
    </>
  );
}

export const isGroupChat = (c: Like) => (c.kind ?? chatKind(c.chatId)) === "group";
