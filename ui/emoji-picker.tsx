import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EMOJI_CATEGORIES, emojiIndex, loadRecent, pushRecent, saveRecent, searchEmoji, type Emoji } from "./emoji-data";
import { IconSearch } from "./icons";

interface Section { id: string; label: string; items: Emoji[] }
const RECENT = "recent";

/** Emoji popover: search by name, category tabs, recently used, arrow-key navigation. Picking never moves focus out of the message field (the parent refocuses it). */
export function EmojiPicker({ onPick, onClose }: { onPick: (char: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [tab, setTab] = useState<string>(recent.length ? RECENT : EMOJI_CATEGORIES[0].id);
  const root = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);

  const sections = useMemo<Section[]>(() => {
    const idx = emojiIndex();
    if (query.trim()) return [{ id: "results", label: "Search results", items: searchEmoji(query, idx.all) }];
    const names = new Map(idx.all.map((e) => [e.char, e.name]));
    const rec = recent.map((c) => ({ char: c, name: names.get(c) ?? "" }));
    return [...(rec.length ? [{ id: RECENT, label: "Recently used", items: rec }] : []), ...EMOJI_CATEGORIES.map((c) => ({ id: c.id, label: c.label, items: idx.byCat[c.id] }))];
  }, [query, recent]);

  const pick = (char: string) => {
    const next = pushRecent(recent, char);
    setRecent(next); saveRecent(next);
    onPick(char);
  };
  const buttons = () => [...(body.current?.querySelectorAll<HTMLButtonElement>("button[data-emoji]") ?? [])];
  const goTo = (id: string) => {
    const sec = body.current?.querySelector<HTMLElement>(`[data-sec="${id}"]`);
    if (sec && body.current) { body.current.scrollTop = sec.offsetTop - 2; setTab(id); }
  };
  const onScroll = () => {
    if (query.trim() || !body.current) return;
    const top = body.current.scrollTop + 8;
    let cur = sections[0]?.id;
    for (const s of sections) { const el = body.current.querySelector<HTMLElement>(`[data-sec="${s.id}"]`); if (el && el.offsetTop <= top) cur = s.id; }
    if (cur) setTab(cur);
  };

  const onGridKey = (e: KeyboardEvent) => {
    const list = buttons(), i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const go = (b?: HTMLElement) => { if (b) { e.preventDefault(); b.focus(); b.scrollIntoView({ block: "nearest" }); } };
    const r = list[i].getBoundingClientRect(), cx = r.left + r.width / 2;
    const vertical = (dir: 1 | -1) => {
      const rows = list.filter((b) => (dir > 0 ? b.getBoundingClientRect().top > r.top + 4 : b.getBoundingClientRect().top < r.top - 4));
      if (!rows.length) return dir < 0 ? search.current ?? undefined : undefined;
      const rowTop = dir > 0 ? Math.min(...rows.map((b) => b.getBoundingClientRect().top)) : Math.max(...rows.map((b) => b.getBoundingClientRect().top));
      const row = rows.filter((b) => Math.abs(b.getBoundingClientRect().top - rowTop) < 4);
      return row.sort((a, b) => Math.abs(a.getBoundingClientRect().left + 16 - cx) - Math.abs(b.getBoundingClientRect().left + 16 - cx))[0];
    };
    if (e.key === "ArrowRight") go(list[i + 1]);
    else if (e.key === "ArrowLeft") go(list[i - 1] ?? search.current ?? undefined);
    else if (e.key === "ArrowDown") go(vertical(1));
    else if (e.key === "ArrowUp") go(vertical(-1));
    else if (e.key === "Home") go(list[0]);
    else if (e.key === "End") go(list[list.length - 1]);
  };

  const onRootKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const f = [...(root.current?.querySelectorAll<HTMLElement>("input, button:not([tabindex='-1'])") ?? [])];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const first = sections[0]?.items[0]?.char;
  return (
    <div ref={root} className="wa-popover wa-emoji" data-wa-pop role="dialog" aria-label="Emoji" onKeyDown={onRootKey}>
      <div className="wa-emoji-search">
        <IconSearch />
        <input ref={search} type="text" value={query} placeholder="Search emoji" aria-label="Search emoji" autoComplete="off" spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); buttons()[0]?.focus(); } }} />
      </div>
      {!query.trim() && (
        <div className="wa-emoji-tabs" role="tablist" aria-label="Emoji categories">
          {[...(recent.length ? [{ id: RECENT, label: "Recently used", icon: "🕘" }] : []), ...EMOJI_CATEGORIES].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={tab === c.id} aria-label={c.label} title={c.label} className="wa-emoji-tab" onClick={() => goTo(c.id)}>{c.icon}</button>
          ))}
        </div>
      )}
      <div ref={body} className="wa-emoji-body" onScroll={onScroll} onKeyDown={onGridKey}>
        {sections.map((s) => (
          <section key={s.id} data-sec={s.id} aria-label={s.label}>
            <h3 className="wa-emoji-h">{s.label}</h3>
            {s.items.length === 0 ? <p className="wa-emoji-none">No emoji found</p> : (
              <div className="wa-emoji-grid" role="group" aria-label={s.label}>
                {s.items.map((e) => (
                  <button key={e.char} type="button" data-emoji tabIndex={e.char === first && s === sections[0] ? 0 : -1} className="wa-emoji-btn" aria-label={e.name || e.char} title={e.name}
                    onMouseDown={(ev) => ev.preventDefault()} onClick={() => pick(e.char)}>{e.char}</button>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
