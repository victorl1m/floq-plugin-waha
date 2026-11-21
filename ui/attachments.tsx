import { formatBytes, kindOfFile, type AttachmentKind } from "./composer-utils";
import { IconAudio, IconDocument, IconPlay, IconPlus } from "./icons-composer";
import { IconX } from "./icons";

export interface Attachment { id: string; file: File; kind: AttachmentKind; previewUrl?: string /* object URL for image/video, revoked by the composer */ }

let seq = 0;
export function makeAttachment(file: File): Attachment {
  const kind = kindOfFile(file);
  return { id: `att-${Date.now().toString(36)}-${++seq}`, file, kind, previewUrl: kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined };
}
export const revokeAttachment = (a: Attachment) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); };

const KIND_LABEL: Record<AttachmentKind, string> = { image: "Photo", video: "Video", audio: "Audio", document: "Document" };

/** Preview tray above the message field: thumbnails for photos and videos, name and size chips for the rest. */
export function AttachmentTray({ items, onRemove, onAdd }: { items: Attachment[]; onRemove: (id: string) => void; onAdd?: () => void }) {
  if (!items.length) return null;
  return (
    <ul className="wa-tray" aria-label={`${items.length} attached file${items.length === 1 ? "" : "s"}`}>
      {items.map((a) => (
        <li key={a.id} className={"wa-att wa-att-" + (a.previewUrl ? "thumb" : "chip")}>
          {a.kind === "image" && <img src={a.previewUrl} alt={a.file.name} draggable={false} />}
          {a.kind === "video" && <><video src={a.previewUrl} muted preload="metadata" aria-label={a.file.name} /><span className="wa-att-play"><IconPlay /></span></>}
          {!a.previewUrl && (
            <>
              <span className="wa-att-ico">{a.kind === "audio" ? <IconAudio /> : <IconDocument />}</span>
              <span className="wa-att-meta"><b title={a.file.name}>{a.file.name}</b><span>{KIND_LABEL[a.kind]} · {formatBytes(a.file.size)}</span></span>
            </>
          )}
          <button type="button" className="wa-att-x" aria-label={`Remove ${a.file.name}`} onClick={() => onRemove(a.id)}><IconX /></button>
        </li>
      ))}
      {onAdd && <li className="wa-att-addwrap"><button type="button" className="wa-att-add" aria-label="Add more files" onClick={onAdd}><IconPlus /></button></li>}
    </ul>
  );
}
