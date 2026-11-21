// Small helpers shared by the chat menu, the info panel and the dialogs of this area.
import { useEffect, useState } from "react";
import { toast } from "@/plugins/kit";
import { errorCode, errorText } from "./context";

/** One error toast: an engine that cannot do it (501 "unsupported") says so instead of showing a server message. */
export function fail(title: string, e: unknown) {
  toast.error(title, { description: errorCode(e) === "unsupported" ? "This WhatsApp engine does not support that." : errorText(e) });
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** A person of GET /contacts. phone is digits for display with formatPhoneDisplay. */
export interface Contact { chatId: string; name: string | null; phone: string | null; isMyContact: boolean; avatar: number | null }
