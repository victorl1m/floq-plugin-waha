import { Fragment, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/plugins/kit";
import type { Message } from "../shared/chat";
import type { MenuKey } from "../shared/format";
import { IconChevronDown, IconCopy, IconDownload, IconEdit, IconForward, IconInfo, IconPin, IconPinOff, IconSmile, IconStar, IconStarFilled, IconTrash } from "./icons-bubbles";
import { IconReply } from "./icons";

const ITEMS: Record<MenuKey, { label: string; icon: ReactNode }> = {
  reply: { label: "Reply", icon: <IconReply /> },
  react: { label: "React", icon: <IconSmile /> },
  forward: { label: "Forward", icon: <IconForward /> },
  star: { label: "Star", icon: <IconStar /> },
  unstar: { label: "Unstar", icon: <IconStarFilled /> },
  pin: { label: "Pin", icon: <IconPin /> },
  unpin: { label: "Unpin", icon: <IconPinOff /> },
  copy: { label: "Copy text", icon: <IconCopy /> },
  edit: { label: "Edit", icon: <IconEdit /> },
  download: { label: "Download", icon: <IconDownload /> },
  info: { label: "Message info", icon: <IconInfo /> },
  delete: { label: "Delete", icon: <IconTrash /> },
};

/** The chevron on a bubble and the menu it opens (also opened by right-click and a long press). Items come from menuPlan(), already filtered by what the engine can do. */
export function MessageMenu({ m, plan, open, onOpenChange, onRun, mine }: { m: Message; plan: MenuKey[]; open: boolean; onOpenChange: (v: boolean) => void; onRun: (k: MenuKey) => void; mine: boolean }) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="wa-chev" aria-label="Message options" title="Message options" data-mid-menu={m.id} onDoubleClick={(e) => e.stopPropagation()}><IconChevronDown /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mine ? "end" : "start"} className="wa-menu min-w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
        {plan.map((k) => (
          <Fragment key={k}>
            {k === "delete" && plan.length > 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem className="wa-mi" variant={k === "delete" ? "destructive" : undefined} onSelect={() => onRun(k)}>{ITEMS[k].icon}{ITEMS[k].label}</DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
