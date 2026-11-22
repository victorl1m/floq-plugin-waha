// Contact info / group info beside the conversation (a third column when the inbox is wide, an overlay otherwise).
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Switch, Textarea, toast } from "@/plugins/kit";
import { displayName, matchesQuery, subtitle, type Chat } from "../shared/chat";
import { formatPhoneDisplay } from "../shared/phone";
import { errorText, useWa, useWaEvent } from "./context";
import { AddParticipantsDialog, ConfirmDialog, InviteLinkDialog, Pic, isGroupChat, phoneText } from "./group-dialogs";
import { IconSearch, IconX, Spinner } from "./icons";
import { IconBlock, IconChevronRight, IconDots, IconEdit, IconExit, IconLink, IconMerge, IconMessage, IconPhoto, IconShield, IconUserPlus } from "./icons-people";
import { fail } from "./people-utils";

interface ContactInfo { chatId: string; name: string; pushName: string; phone: string | null; about: string; blocked: boolean; isBusiness: boolean; isSelf: boolean; avatar: number | null; aliases: number }
interface Member { id: string; name: string; phone: string | null; role: "superadmin" | "admin" | "member"; isMe: boolean }
interface GroupInfo { chatId: string; subject: string; description: string; owner: string | null; createdAt: string | null; size: number; participants: Member[]; iAmAdmin: boolean; announce: boolean; restrict: boolean; avatar: number | null }

function Row({ icon, children, danger, onClick, aria, trailing }: { icon: ReactNode; children: ReactNode; danger?: boolean; onClick: () => void; aria?: string; trailing?: ReactNode }) {
  return <button type="button" className={"wa-info-row" + (danger ? " wa-danger" : "")} onClick={onClick} aria-label={aria}>{icon}<span>{children}</span>{trailing}</button>;
}

/** Contact info (1:1) or group info. onClose closes the panel. */
export function InfoPanel({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const group = isGroupChat(chat);
  useEffect(() => {
    // Escape inside a dialog or menu closes that, not the panel.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target as Element | null)?.closest?.("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]")) onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <aside className="wa-info" aria-label={group ? "Group info" : "Contact info"}>
      <div className="wa-head wa-info-head">
        <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Close info" onClick={onClose}><IconX /></Button>
        <h3 className="wa-info-title">{group ? "Group info" : "Contact info"}</h3>
      </div>
      <div className="wa-info-scroll">{group ? <GroupBody key={chat.chatId} chat={chat} /> : <ContactBody key={chat.chatId} chat={chat} />}</div>
    </aside>
  );
}

function Loading({ error, retry }: { error: string; retry: () => void }) {
  return error
    ? <div className="wa-center wa-info-state"><strong>Could not load the info</strong><p>{error}</p><Button type="button" variant="outline" size="sm" className="wa-btn" onClick={retry}>Try again</Button></div>
    : <div className="wa-center wa-info-state"><Spinner />Loading…</div>;
}

// ---- 1:1 ----

function ContactBody({ chat }: { chat: Chat }) {
  const { api, features, openChat, refreshChats, pluginId } = useWa();
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => {
    setError("");
    api<ContactInfo>(`/contact?chatId=${encodeURIComponent(chat.chatId)}`).then(setInfo).catch((e) => setError(errorText(e)));
  }, [api, chat.chatId]);
  useEffect(load, [load]);
  useWaEvent<{ chatId?: string }>("chats", () => load());

  if (!info) return <Loading error={error} retry={load} />;
  const merged = { ...chat, name: info.name || info.pushName || chat.name, phone: info.phone ?? chat.phone, avatar: info.avatar ?? chat.avatar };
  const name = displayName(merged), digits = info.phone && /^\d{6,15}$/.test(info.phone) ? info.phone : null;
  const sub = digits ? formatPhoneDisplay(digits) : "";

  async function refreshPhoto() {
    setBusy("photo");
    try { await api("/contact/refresh-picture", { method: "POST", body: { chatId: info!.chatId } }); toast.success("Photo refreshed"); load(); refreshChats(); }
    catch (e) { fail("Could not refresh the photo", e); }
    finally { setBusy(""); }
  }
  async function block() {
    try { await api("/contact/block", { method: "POST", body: { chatId: info!.chatId, blocked: !info!.blocked } }); toast.success(info!.blocked ? "Contact unblocked" : "Contact blocked"); load(); refreshChats(); }
    catch (e) { fail("Could not change the block", e); }
  }
  return (
    <>
      <section className="wa-card wa-hero-card">
        <Pic chat={merged} size="xl" />
        <h2 className="wa-info-name">{name}</h2>
        {sub && sub !== name && <p className="wa-info-sub">{sub}</p>}
        {info.isBusiness && <span className="wa-badge-pill">Business account</span>}
        {info.isSelf && <span className="wa-badge-pill">This is you</span>}
      </section>
      {info.about && features.about && <section className="wa-card"><h4 className="wa-label">About</h4><p className="wa-about">{info.about}</p></section>}
      {!info.isSelf && (
        <section className="wa-card wa-rows">
          <Row icon={<IconUserPlus />} onClick={() => setSaving(true)}>{info.name ? "Edit contact name" : "Save to contacts"}</Row>
          <Row icon={busy === "photo" ? <Spinner /> : <IconPhoto />} onClick={() => void refreshPhoto()}>Refresh photo</Row>
          <Row icon={<IconMerge />} onClick={() => setLinking(true)} aria={`${name} is the same person as another chat`}>This is the same person as…</Row>
          {info.aliases > 1 && <p className="wa-fine">This chat combines {info.aliases} WhatsApp ids of the same person.</p>}
        </section>
      )}
      {!info.isSelf && features.block && (
        <section className="wa-card wa-rows"><Row icon={<IconBlock />} danger onClick={() => (info.blocked ? void block() : setBlocking(true))}>{info.blocked ? `Unblock ${name}` : `Block ${name}`}</Row></section>
      )}
      <SaveContactDialog open={saving} onOpenChange={setSaving} chatId={info.chatId} current={info.name} onDone={() => { load(); refreshChats(); }} />
      <LinkChatDialog open={linking} onOpenChange={setLinking} chat={merged} onDone={(id) => { refreshChats(); if (id !== chat.chatId) openChat(id); else load(); }} />
      <ConfirmDialog open={blocking} onOpenChange={setBlocking} title={`Block ${name}?`} description="Blocked contacts cannot call you or send you messages. You can unblock them at any time." confirm="Block" onConfirm={block} />
    </>
  );
}

function SaveContactDialog({ open, onOpenChange, chatId, current, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; chatId: string; current: string; onDone: () => void }) {
  const { api } = useWa();
  const [first, setFirst] = useState(""), [last, setLast] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { const [f, ...rest] = current.split(" "); setFirst(f ?? ""); setLast(rest.join(" ")); } }, [open, current]);
  async function save() {
    setBusy(true);
    try { await api("/contact/save", { method: "POST", body: { chatId, firstName: first.trim(), lastName: last.trim() } }); toast.success("Contact saved"); onOpenChange(false); onDone(); }
    catch (e) { fail("Could not save the contact", e); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wa-dialog wa-dialog-sm">
        <form className="wa-dlg" onSubmit={(e) => { e.preventDefault(); if (first.trim() && !busy) void save(); }}>
          <DialogHeader><DialogTitle>Save to contacts</DialogTitle><DialogDescription>The name is saved in the address book of your WhatsApp phone.</DialogDescription></DialogHeader>
          <div className="wa-numform">
            <label htmlFor="wa-first">First name</label>
            <Input id="wa-first" autoFocus maxLength={80} value={first} onChange={(e) => setFirst(e.target.value)} />
            <label htmlFor="wa-last">Last name</label>
            <Input id="wa-last" maxLength={80} value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
          <DialogFooter className="wa-dlg-foot">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!first.trim() || busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** For a chat WhatsApp shows under two ids: pick the other chat and both become one. */
function LinkChatDialog({ open, onOpenChange, chat, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; chat: Chat; onDone: (chatId: string) => void }) {
  const { api, chats } = useWa();
  const [query, setQuery] = useState(""), [picked, setPicked] = useState<Chat | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQuery(""); setPicked(null); } }, [open]);
  const options = useMemo(() => chats.filter((c) => c.chatId !== chat.chatId && !isGroupChat(c) && c.kind !== "other" && !c.isSelf && matchesQuery(c, query)).slice(0, 60), [chats, chat.chatId, query]);
  async function merge() {
    if (!picked) return;
    setBusy(true);
    try { const r = await api<{ chatId: string }>("/link", { method: "POST", body: { chatId: chat.chatId, withChatId: picked.chatId } }); toast.success("Chats merged", { description: "Their messages now appear in one chat." }); onOpenChange(false); onDone(r.chatId); }
    catch (e) { fail("Could not merge the chats", e); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wa-dialog">
        <div className="wa-dlg">
          <DialogHeader><DialogTitle>Same person, two chats</DialogTitle><DialogDescription>WhatsApp sometimes shows one person under two ids. Pick the other chat of {displayName(chat)} and Floq shows both as one.</DialogDescription></DialogHeader>
          {picked ? (
            <div className="wa-merge">
              <Pic chat={chat} /><IconMerge className="wa-merge-ico" /><Pic chat={picked} />
              <p>Merge <b>{displayName(chat)}</b> with <b>{displayName(picked)}</b>? Messages from both are shown in one chat.</p>
            </div>
          ) : (
            <div className="wa-picker">
              <div className="wa-find"><IconSearch /><Input type="text" role="searchbox" autoFocus value={query} placeholder="Search your chats" aria-label="Search your chats" autoComplete="off" onChange={(e) => setQuery(e.target.value)} /></div>
              <div className="wa-picklist" role="group" aria-label="Chats">
                {options.length === 0 ? <div className="wa-dlg-note">{query ? `No chats match “${query}”.` : "No other chats to merge with."}</div>
                  : <ul role="list">{options.map((c) => (
                    <li key={c.chatId}><button type="button" className="wa-pickrow" onClick={() => setPicked(c)}><Pic chat={c} /><span className="wa-pickbody"><b>{displayName(c)}</b>{subtitle(c) && <span>{subtitle(c)}</span>}</span></button></li>
                  ))}</ul>}
              </div>
            </div>
          )}
          <DialogFooter className="wa-dlg-foot">
            {picked ? <Button type="button" variant="ghost" onClick={() => setPicked(null)}>Back</Button> : <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>}
            {picked && <Button type="button" disabled={busy} onClick={() => void merge()}>{busy ? "Merging…" : "Merge chats"}</Button>}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- group ----

function GroupBody({ chat }: { chat: Chat }) {
  const { api, openChat, refreshChats, pluginId } = useWa();
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [error, setError] = useState("");
  const [find, setFind] = useState<string | null>(null);
  const [adding, setAdding] = useState(false), [invite, setInvite] = useState(false), [leaving, setLeaving] = useState(false);
  const [edit, setEdit] = useState<null | "subject" | "description">(null);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<Member | null>(null);
  const load = useCallback((fresh = false) => {
    setError("");
    api<GroupInfo>(`/group?chatId=${encodeURIComponent(chat.chatId)}${fresh ? "&fresh=1" : ""}`).then(setInfo).catch((e) => setError(errorText(e)));
  }, [api, chat.chatId]);
  useEffect(() => load(), [load]);
  useWaEvent<{ chatId?: string }>("group", (d) => { if (!d?.chatId || d.chatId === chat.chatId) load(true); });

  const shown = useMemo(() => (info?.participants ?? []).filter((p) => find === null || !find.trim() || matchesQuery({ chatId: p.id, kind: "user", name: p.name, phone: p.phone }, find)), [info, find]);
  if (!info) return <Loading error={error} retry={() => load(true)} />;
  const merged = { ...chat, name: info.subject || chat.name, avatar: info.avatar ?? chat.avatar };
  const name = displayName(merged);

  const change = async (title: string, path: string, body: Record<string, unknown>, done?: string) => {
    try { await api(path, { method: "POST", body: { chatId: chat.chatId, ...body } }); if (done) toast.success(done); load(true); refreshChats(); return true; }
    catch (e) { fail(title, e); return false; }
  };
  const startEdit = (what: "subject" | "description") => { setDraft(what === "subject" ? info.subject : info.description); setEdit(what); };
  const saveEdit = async () => {
    if (edit === "subject" && !draft.trim()) return;
    if (await change(edit === "subject" ? "Could not rename the group" : "Could not change the description", edit === "subject" ? "/group/subject" : "/group/description", edit === "subject" ? { subject: draft } : { description: draft })) setEdit(null);
  };
  const editor = (what: "subject" | "description") => (
    <div className="wa-edit">
      {what === "subject"
        ? <Input autoFocus maxLength={100} value={draft} aria-label="Group name" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveEdit(); } if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } }} />
        : <Textarea autoFocus rows={4} maxLength={2048} value={draft} aria-label="Group description" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } }} />}
      <div className="wa-edit-actions"><Button type="button" size="sm" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button type="button" size="sm" disabled={what === "subject" && !draft.trim()} onClick={() => void saveEdit()}>Save</Button></div>
    </div>
  );
  const when = info.createdAt ? new Date(info.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
  const manage = (m: Member) => info.iAmAdmin && !m.isMe && m.role !== "superadmin";

  return (
    <>
      <section className="wa-card wa-hero-card">
        <Pic chat={merged} size="xl" />
        {edit === "subject" ? editor("subject") : (
          <h2 className="wa-info-name">{name}{info.iAmAdmin && <Button type="button" variant="ghost" size="icon" className="wa-iconbtn wa-mini" aria-label="Edit group name" onClick={() => startEdit("subject")}><IconEdit /></Button>}</h2>
        )}
        <p className="wa-info-sub">Group · {info.size} {info.size === 1 ? "participant" : "participants"}</p>
      </section>
      <section className="wa-card">
        <h4 className="wa-label">Description{info.iAmAdmin && edit !== "description" && <Button type="button" variant="ghost" size="icon" className="wa-iconbtn wa-mini" aria-label="Edit group description" onClick={() => startEdit("description")}><IconEdit /></Button>}</h4>
        {edit === "description" ? editor("description") : info.description ? <p className="wa-about">{info.description}</p> : <p className="wa-fine wa-flat">{info.iAmAdmin ? "Add a group description." : "No description."}</p>}
        {when && <p className="wa-fine wa-flat">Group created on {when}</p>}
      </section>
      {info.iAmAdmin && (
        <section className="wa-card wa-switches">
          <h4 className="wa-label">Group settings</h4>
          <label className="wa-switch"><span><b>Only admins can send messages</b><small>Members can read but not write.</small></span>
            <Switch checked={info.announce} aria-label="Only admins can send messages" onCheckedChange={(v) => { setInfo({ ...info, announce: v }); void change("Could not change the setting", "/group/settings", { announce: v }); }} /></label>
          <label className="wa-switch"><span><b>Only admins can edit group info</b><small>Name, description and picture.</small></span>
            <Switch checked={info.restrict} aria-label="Only admins can edit group info" onCheckedChange={(v) => { setInfo({ ...info, restrict: v }); void change("Could not change the setting", "/group/settings", { restrict: v }); }} /></label>
        </section>
      )}
      <section className="wa-card wa-people">
        <div className="wa-people-head">
          <h4 className="wa-label">{info.size} {info.size === 1 ? "participant" : "participants"}</h4>
          <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Search participants" aria-pressed={find !== null} onClick={() => setFind(find === null ? "" : null)}><IconSearch /></Button>
        </div>
        {find !== null && (
          <div className="wa-find wa-find-flat"><IconSearch /><Input type="text" role="searchbox" autoFocus value={find} placeholder="Search participants" aria-label="Search participants" autoComplete="off" onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setFind(null); } }} /></div>
        )}
        {info.iAmAdmin && find === null && <Row icon={<span className="wa-pic wa-pic-sm wa-pic-green"><IconUserPlus /></span>} onClick={() => setAdding(true)}>Add participant</Row>}
        <ul role="list" className="wa-members">
          {shown.map((p) => {
            const like = { chatId: p.id, kind: "user" as const, name: p.name, phone: p.phone };
            const label = p.name || (p.phone ? phoneText(p.phone) : "Unknown contact");
            return (
              <li key={p.id} className="wa-member">
                <button type="button" className="wa-member-main" disabled={p.isMe} onClick={() => openChat(p.id, { kind: "user", name: p.name, phone: p.phone })} aria-label={p.isMe ? "You" : `Message ${label}`}>
                  <Pic chat={like} />
                  <span className="wa-pickbody"><b>{p.isMe ? "You" : label}</b>{(p.name || p.isMe) && p.phone && <span>{phoneText(p.phone)}</span>}</span>
                  {p.role !== "member" && <span className="wa-role" title={p.role === "superadmin" ? "Group owner" : "Group admin"}><IconShield />Admin</span>}
                </button>
                {!p.isMe && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="wa-iconbtn wa-member-menu" aria-label={`Options for ${label}`}><IconDots /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="wa-menu">
                      <DropdownMenuItem onSelect={() => openChat(p.id, { kind: "user", name: p.name, phone: p.phone })}><IconMessage />Message {label}</DropdownMenuItem>
                      {manage(p) && (p.role === "admin"
                        ? <DropdownMenuItem onSelect={() => void change("Could not dismiss the admin", "/group/participants", { action: "demote", participants: [p.id] }, "Admin dismissed")}><IconShield />Dismiss as admin</DropdownMenuItem>
                        : <DropdownMenuItem onSelect={() => void change("Could not make an admin", "/group/participants", { action: "promote", participants: [p.id] }, "Admin added")}><IconShield />Make group admin</DropdownMenuItem>)}
                      {manage(p) && <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(p)}><IconExit />Remove from group</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
        {find !== null && find.trim() && shown.length === 0 && <p className="wa-dlg-note">No participants match “{find.trim()}”.</p>}
      </section>
      <section className="wa-card wa-rows">
        <Row icon={<IconLink />} onClick={() => setInvite(true)} trailing={<IconChevronRight className="wa-pchev" />}>Invite to group via link</Row>
        <Row icon={<IconExit />} danger onClick={() => setLeaving(true)}>Exit group</Row>
      </section>
      <AddParticipantsDialog open={adding} onOpenChange={setAdding} chatId={chat.chatId} existing={info.participants.map((p) => p.id)} onDone={() => load(true)} />
      <InviteLinkDialog open={invite} onOpenChange={setInvite} chatId={chat.chatId} />
      <ConfirmDialog open={leaving} onOpenChange={setLeaving} title="Exit this group?" description={`You will stop receiving messages from “${name}”.`} confirm="Exit group" onConfirm={() => change("Could not exit the group", "/group/leave", {}, "You left the group").then(() => undefined)} />
      <ConfirmDialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }} title={`Remove ${removing ? removing.name || phoneText(removing.phone) || "this person" : ""}?`} description={`They will no longer be part of “${name}”.`} confirm="Remove"
        onConfirm={() => (removing ? change("Could not remove the participant", "/group/participants", { action: "remove", participants: [removing.id] }, "Participant removed").then(() => undefined) : undefined)} />
    </>
  );
}
