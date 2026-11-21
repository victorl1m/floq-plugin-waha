// "New chat": search a contact, or type a phone number (checked against WhatsApp first); "New group": pick people, name it, create it.
import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from "@/plugins/kit";
import { COUNTRIES, countryOf, formatLocal } from "../shared/phone";
import { useWa } from "./context";
import { ContactPicker, Pic, phoneText } from "./group-dialogs";
import { IconArrowLeft, IconUsers } from "./icons";
import { IconChevronRight, IconPhone, IconUsersPlus } from "./icons-people";
import { fail, type Contact } from "./people-utils";

const MAX_LOCAL = 13, NAME_MAX = 100;
type Step = "start" | "pick" | "name";
type Tab = "contacts" | "number";

export function NewChatDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { api, features, openChat, refreshChats } = useWa();
  const [step, setStep] = useState<Step>("start");
  const [tab, setTab] = useState<Tab>("contacts");
  const [picked, setPicked] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // phone tab (same field as the settings panel: country + number, grouped as you type)
  const [code, setCode] = useState("55");
  const [local, setLocal] = useState("");
  const [notFound, setNotFound] = useState("");
  const country = useMemo(() => COUNTRIES.find((c) => c.code === code) ?? null, [code]);
  useEffect(() => { if (open) { setStep("start"); setTab("contacts"); setPicked([]); setName(""); setLocal(""); setNotFound(""); setBusy(false); } }, [open]);

  const toggle = (c: Contact) => setPicked((p) => (p.some((x) => x.chatId === c.chatId) ? p.filter((x) => x.chatId !== c.chatId) : [...p, c]));
  const start = (c: Contact) => { onOpenChange(false); openChat(c.chatId, { kind: "user", name: c.name, phone: c.phone }); };

  async function check() {
    setBusy(true); setNotFound("");
    try {
      const r = await api<{ exists: boolean; chatId: string | null; phone: string }>("/contacts/check", { method: "POST", body: { phone: `+${code}${local}` } });
      if (!r.exists || !r.chatId) { setNotFound(`${phoneText(r.phone) || "That number"} is not on WhatsApp.`); return; }
      onOpenChange(false);
      openChat(r.chatId, { kind: "user", phone: r.phone });
    } catch (e) { fail("Could not check the number", e); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true);
    try {
      const r = await api<{ chatId: string }>("/group/create", { method: "POST", body: { name: name.trim(), participants: picked.map((c) => c.chatId) } });
      toast.success("Group created");
      onOpenChange(false); refreshChats();
      openChat(r.chatId, { kind: "group", name: name.trim() });
    } catch (e) { fail("Could not create the group", e); }
    finally { setBusy(false); }
  }

  const title = step === "start" ? "New chat" : step === "pick" ? "Add group participants" : "New group";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="wa-dialog">
        <div className="wa-dlg">
          <DialogHeader>
            <div className="wa-dlg-title">
              {step !== "start" && <Button type="button" variant="ghost" size="icon" className="wa-iconbtn" aria-label="Back" onClick={() => setStep(step === "name" ? "pick" : "start")}><IconArrowLeft /></Button>}
              <DialogTitle>{title}</DialogTitle>
            </div>
            <DialogDescription className="wa-sr">{step === "start" ? "Start a chat with a contact or a phone number." : step === "pick" ? "Pick the people for the new group." : "Name the new group."}</DialogDescription>
          </DialogHeader>

          {step === "start" && (
            <>
              <div className="wa-seg" role="group" aria-label="Find the person by">
                <button type="button" aria-pressed={tab === "contacts"} onClick={() => setTab("contacts")}>Contacts</button>
                <button type="button" aria-pressed={tab === "number"} onClick={() => setTab("number")}>Phone number</button>
              </div>
              {tab === "contacts" ? (
                <ContactPicker selected={[]} onToggle={start} multi={false} autoFocus
                  header={features.groups && (
                    <button type="button" className="wa-pickrow wa-pickaction" onClick={() => { setPicked([]); setStep("pick"); }}>
                      <span className="wa-pic wa-pic-sm wa-pic-green"><IconUsersPlus /></span>
                      <span className="wa-pickbody"><b>New group</b></span><IconChevronRight className="wa-chev" />
                    </button>
                  )} />
              ) : (
                <form className="wa-numform" onSubmit={(e) => { e.preventDefault(); if (local.length >= 6 && !busy) void check(); }}>
                  <label htmlFor="wa-new-number">Phone number</label>
                  <div className="wa-numrow">
                    <Select value={code} onValueChange={(v) => { setCode(v); setNotFound(""); }}>
                      <SelectTrigger aria-label="Country" className="wa-country"><SelectValue /></SelectTrigger>
                      <SelectContent position="popper" className="wa-country-list">
                        {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} +{c.code} {c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input id="wa-new-number" inputMode="tel" autoComplete="off" autoFocus placeholder={formatLocal("11999999999".slice(0, country?.groups.reduce((a, b) => a + b, 0) ?? 10), country)}
                      value={formatLocal(local, country)} aria-invalid={notFound ? true : undefined} aria-describedby={notFound ? "wa-new-number-error" : undefined}
                      onChange={(e) => {
                        const typed = e.target.value;
                        let digits = typed.replace(/\D/g, "");
                        // A pasted full international number ("+55 11 ...") switches the country.
                        if (typed.trim().startsWith("+")) { const c = countryOf(digits); if (c) { setCode(c.code); digits = digits.slice(c.code.length); } }
                        setLocal(digits.replace(/^0+/, "").slice(0, MAX_LOCAL)); setNotFound("");
                      }} />
                  </div>
                  {notFound && <p id="wa-new-number-error" role="alert" className="wa-error">{notFound}</p>}
                  <p className="wa-hint"><IconPhone />The number is checked on WhatsApp before the chat opens.</p>
                  <Button type="submit" disabled={local.length < 6 || busy}>{busy ? "Checking…" : "Start chat"}</Button>
                </form>
              )}
            </>
          )}

          {step === "pick" && (
            <>
              <ContactPicker selected={picked} onToggle={toggle} autoFocus />
              <DialogFooter className="wa-dlg-foot">
                <Button type="button" disabled={!picked.length} onClick={() => setStep("name")}>Next{picked.length ? ` (${picked.length})` : ""}</Button>
              </DialogFooter>
            </>
          )}

          {step === "name" && (
            <form className="wa-numform" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !busy) void create(); }}>
              <div className="wa-groupname"><span className="wa-pic wa-pic-md wa-pic-green"><IconUsers /></span>
                <div><label htmlFor="wa-group-name">Group name</label>
                  <Input id="wa-group-name" autoFocus maxLength={NAME_MAX} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              </div>
              <p className="wa-hint">{picked.length} {picked.length === 1 ? "participant" : "participants"}: {picked.slice(0, 3).map((c) => c.name || phoneText(c.phone) || "Unknown").join(", ")}{picked.length > 3 ? ` and ${picked.length - 3} more` : ""}</p>
              <ul className="wa-faces" role="list" aria-label="Participants">{picked.slice(0, 8).map((c) => <li key={c.chatId}><Pic chat={{ chatId: c.chatId, kind: "user", name: c.name, phone: c.phone, avatar: c.avatar }} /></li>)}</ul>
              <DialogFooter className="wa-dlg-foot">
                <Button type="submit" disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create group"}</Button>
              </DialogFooter>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
