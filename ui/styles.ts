// One scoped stylesheet for the whole view. The host's Tailwind only has classes the app itself uses, so nothing here relies on utilities.
// Colours come from host tokens; the avatar hue (--wa-h) is the only non-token colour.
export const CSS = `
.wa-root{position:absolute;inset:0;padding:12px;container-type:inline-size;font:13px/1.4 var(--font-sans);color:var(--foreground)}
.wa-root *{box-sizing:border-box}
.wa-panel{height:100%;display:grid;grid-template-columns:320px minmax(0,1fr);border:1px solid color-mix(in oklab,var(--border) 76%,transparent);border-radius:16px;overflow:hidden;background:color-mix(in oklab,var(--card) 88%,transparent)}
.wa-pane{display:flex;flex-direction:column;min-height:0;min-width:0}
.wa-list-pane{border-right:1px solid color-mix(in oklab,var(--border) 76%,transparent)}
.wa-head{display:flex;align-items:center;gap:10px;height:56px;flex:none;padding:0 14px}
.wa-chat-head{border-bottom:1px solid color-mix(in oklab,var(--border) 76%,transparent);padding:0 12px}
.wa-title{font-size:15px;font-weight:600;letter-spacing:-.01em;flex:1;min-width:0}
.wa-grow{flex:1;min-width:0}
.wa-ghost{flex:none}
.wa-search{position:relative;margin:0 12px 8px;flex:none}
.wa-search svg{position:absolute;left:10px;top:50%;width:15px;height:15px;transform:translateY(-50%);color:var(--muted-foreground);pointer-events:none}
.wa-search input{padding-left:32px;width:100%}
.wa-scroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin}
.wa-list{list-style:none;margin:0;padding:0 0 8px}
.wa-row{display:flex;align-items:center;gap:10px;width:calc(100% - 12px);min-height:60px;margin:0 6px;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wa-row:hover{background:color-mix(in oklab,var(--accent) 60%,transparent)}
.wa-row[aria-current="true"]{background:var(--accent)}
.wa-row:focus-visible{outline:2px solid var(--ring);outline-offset:-2px}
.wa-avatar{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;font-size:13px;font-weight:600;line-height:1;user-select:none;
  background:color-mix(in oklab,hsl(var(--wa-h,0) 70% 50%) 18%,var(--card));color:color-mix(in oklab,hsl(var(--wa-h,0) 70% 45%) 70%,var(--foreground))}
.wa-avatar svg{width:55%;height:55%}
.wa-avatar-sm{width:32px;height:32px;font-size:11.5px}
.wa-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.wa-line{display:flex;align-items:center;gap:8px;min-width:0;min-height:18px}
.wa-name{flex:1;min-width:0;font-size:13.5px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-unread .wa-name{font-weight:650}
.wa-time{flex:none;font-size:11px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.wa-unread .wa-time{color:var(--primary-text)}
.wa-preview{flex:1;min-width:0;display:flex;align-items:center;gap:4px;font-size:12.5px;color:var(--muted-foreground);overflow:hidden;white-space:nowrap}
.wa-preview span{overflow:hidden;text-overflow:ellipsis}
.wa-preview svg{flex:none;width:13px;height:13px}
.wa-pill{flex:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--primary);color:var(--primary-foreground);font-size:11px;font-weight:600;line-height:18px;text-align:center;font-variant-numeric:tabular-nums}
.wa-center{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;color:var(--muted-foreground)}
.wa-center strong{color:var(--foreground);font-size:13.5px;font-weight:600}
.wa-center p{margin:0;max-width:32ch}
.wa-quiet{padding:24px 16px;text-align:center;color:var(--muted-foreground);overflow-wrap:anywhere}
.wa-spin{display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in oklab,currentColor 30%,transparent);border-top-color:currentColor}
.wa-hero{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:color-mix(in oklab,var(--primary) 12%,transparent);color:var(--primary-text);font-size:26px}
.wa-hero svg{width:26px;height:26px}
.wa-hero-title{font-size:15px;font-weight:600;color:var(--foreground)}
.wa-small{font-size:11.5px}
.wa-back{display:none;flex:none}
.wa-who{flex:1;min-width:0;display:flex;flex-direction:column}
.wa-who b{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-who span{font-size:12px;color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-logwrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}
.wa-log{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;padding:16px 20px}
.wa-col{max-width:760px;margin:0 auto;display:flex;flex-direction:column}
.wa-day{align-self:center;margin:12px auto;padding:3px 10px;border-radius:999px;background:color-mix(in oklab,var(--muted) 70%,transparent);color:var(--muted-foreground);font-size:11.5px;font-weight:500}
.wa-msg{display:flex;flex-direction:column;margin-top:2px;max-width:100%}
.wa-msg.wa-first{margin-top:10px}
.wa-msg.wa-mine{align-items:flex-end}
.wa-msg.wa-theirs{align-items:flex-start}
.wa-day+.wa-msg.wa-first{margin-top:0}
.wa-bubble{max-width:min(72%,520px);padding:7px 10px 6px;border-radius:14px;font-size:13.5px;line-height:1.42;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--muted);color:var(--foreground)}
.wa-mine .wa-bubble{background:color-mix(in oklab,var(--primary) 16%,var(--card))}
.wa-mine.wa-last .wa-bubble{border-bottom-right-radius:4px}
.wa-theirs.wa-last .wa-bubble{border-bottom-left-radius:4px}
.wa-pending .wa-bubble{opacity:.6}
.wa-sender{display:block;margin-bottom:2px;font-size:11.5px;font-weight:600;color:color-mix(in oklab,hsl(var(--wa-h,0) 70% 45%) 70%,var(--foreground));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-stamp{float:right;margin:6px 0 -2px 10px;font-size:10.5px;line-height:1.4;color:var(--muted-foreground);font-variant-numeric:tabular-nums;white-space:nowrap}
.wa-bubble::after{content:"";display:block;clear:both}
.wa-media{display:flex;align-items:center;gap:8px;padding:8px;margin-bottom:4px;border-radius:10px;background:color-mix(in oklab,var(--foreground) 6%,transparent);white-space:normal}
.wa-media-ico{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:color-mix(in oklab,var(--foreground) 8%,transparent)}
.wa-media-ico svg{width:17px;height:17px}
.wa-media b{display:block;font-size:12.5px;font-weight:550}
.wa-media span{display:block;font-size:11.5px;color:var(--muted-foreground)}
.wa-unsupported{font-style:italic;color:var(--muted-foreground)}
.wa-jump{position:absolute;right:16px;bottom:12px;width:36px;height:36px;padding:0;border-radius:50%;display:grid;place-items:center;border:1px solid var(--border);background:var(--card);color:var(--foreground);cursor:pointer;box-shadow:0 1px 4px color-mix(in oklab,var(--foreground) 18%,transparent)}
.wa-jump:hover{background:var(--accent)}
.wa-jump:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
.wa-jump svg{width:18px;height:18px}
.wa-jump i{position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;background:var(--primary);border:2px solid var(--card)}
.wa-composer{flex:none;border-top:1px solid color-mix(in oklab,var(--border) 76%,transparent);padding:10px 12px}
.wa-field{display:flex;align-items:flex-end;gap:8px;max-width:760px;margin:0 auto;padding:4px 4px 4px 12px;border-radius:12px;border:1px solid var(--input);background:color-mix(in oklab,var(--background) 60%,transparent)}
.wa-field:focus-within{outline:2px solid var(--ring);outline-offset:-1px}
.wa-field textarea{flex:1;min-width:0;border:0;outline:0;resize:none;background:transparent;color:inherit;font:inherit;font-size:13.5px;line-height:1.45;padding:6px 0;max-height:calc(6 * 1.45em + 12px);overflow-y:auto;scrollbar-width:thin}
.wa-field textarea::placeholder{color:var(--muted-foreground)}
.wa-send{flex:none;width:32px;height:32px;border-radius:50%}
.wa-send svg{width:16px;height:16px}
.wa-hint{max-width:760px;margin:6px auto 0;text-align:right;font-size:11px;color:var(--muted-foreground)}
.wa-hint kbd{margin:0 2px}
@keyframes wa-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:no-preference){
  .wa-row,.wa-jump{transition:background-color .12s ease}
  .wa-spin-on svg,.wa-spin{animation:wa-rot .8s linear infinite}
}
@container (max-width:720px){
  .wa-panel{grid-template-columns:minmax(0,1fr)}
  .wa-list-pane{border-right:0}
  .wa-root[data-pane="list"] .wa-chat-pane{display:none}
  .wa-root[data-pane="chat"] .wa-list-pane{display:none}
  .wa-back{display:inline-flex}
  .wa-hint{display:none}
  .wa-log{padding:12px}
}
@media (forced-colors:active){
  .wa-bubble{border:1px solid CanvasText}
  .wa-row[aria-current="true"]{border:1px solid CanvasText}
}
`;
