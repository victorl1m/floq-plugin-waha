// Composer styles (message field, emoji picker, attach menu, tray, voice bar, drop overlay). Appended to the plugin stylesheet in styles.ts.
export const COMPOSER_CSS = `
.wa-chat-pane{position:relative}
.wa-composer{position:relative;flex:none;display:flex;flex-direction:column;gap:6px;min-width:0;padding:8px 12px;background:var(--wa-bar);border-top:1px solid var(--wa-line)}
.wa-bar{display:flex;align-items:flex-end;gap:8px;min-width:0}
.wa-root .wa-cbtn{flex:none;display:inline-grid;place-items:center;width:42px;height:42px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer;box-shadow:none}
.wa-root .wa-cbtn:hover:not(:disabled){background:color-mix(in srgb,var(--wa-text) 9%,transparent);color:var(--wa-icon)}
.wa-root .wa-cbtn[aria-expanded="true"]{background:color-mix(in srgb,var(--wa-text) 12%,transparent)}
.wa-root .wa-cbtn:disabled{opacity:.45;cursor:default}
.wa-root .wa-cbtn svg{width:24px;height:24px}
.wa-root .wa-cbtn:focus-visible,.wa-root .wa-action:focus-visible,.wa-menuitem:focus-visible,.wa-att-x:focus-visible,.wa-att-add:focus-visible{outline:2px solid var(--wa-accent);outline-offset:1px}
.wa-anchor{position:relative;flex:none}

.wa-cfield{flex:1;min-width:0;display:flex;min-height:42px;padding:0 16px;border:1px solid var(--wa-line);border-radius:21px;background:var(--wa-field)}
.wa-cfield:focus-within{box-shadow:0 0 0 1.5px color-mix(in srgb,var(--wa-accent) 38%,transparent)}
.wa-root .wa-cfield textarea{flex:1;min-width:0;display:block;width:100%;margin:0;padding:10px 0;border:0;border-radius:0;outline:0;box-shadow:none;resize:none;background:transparent;color:var(--wa-text);font:inherit;font-size:15px;line-height:20px;max-height:140px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--wa-text) 25%,transparent) transparent}
.wa-root .wa-cfield textarea:focus,.wa-root .wa-cfield textarea:focus-visible{outline:0;box-shadow:none;border:0}
.wa-root .wa-cfield textarea::placeholder{color:var(--wa-sub);opacity:1}
.wa-root .wa-cfield textarea:disabled{cursor:not-allowed}
.wa-composer[data-disabled] .wa-cfield{opacity:.7}

.wa-root .wa-action{position:relative;flex:none;width:42px;height:42px;padding:0;border:0;border-radius:50%;background:var(--wa-accent);color:var(--wa-on-accent);cursor:pointer;box-shadow:none;overflow:hidden}
.wa-root .wa-action:hover:not(:disabled){background:color-mix(in srgb,var(--wa-accent) 88%,#000);color:var(--wa-on-accent)}
.wa-root .wa-action[data-mode="mic"]{background:transparent;color:var(--wa-icon)}
.wa-root .wa-action[data-mode="mic"]:hover:not(:disabled){background:color-mix(in srgb,var(--wa-text) 9%,transparent);color:var(--wa-icon)}
.wa-root .wa-action:disabled{background:transparent;color:var(--wa-icon);opacity:.5;cursor:default}
.wa-ico{position:absolute;inset:0;display:grid;place-items:center}
.wa-ico svg{width:24px;height:24px}
.wa-ico-send svg{width:22px;height:22px}
.wa-ico-send .wa-spin{width:20px;height:20px;border-color:color-mix(in srgb,currentColor 35%,transparent);border-top-color:currentColor}
.wa-action[data-mode="mic"] .wa-ico-send,.wa-action:not([data-mode="mic"]) .wa-ico-mic{opacity:0;transform:scale(.55);pointer-events:none}

.wa-recbar{align-items:center}
.wa-rec{flex:1;min-width:0;display:flex;align-items:center;gap:10px;height:42px;padding:0 16px;border-radius:21px;background:var(--wa-field)}
.wa-rec-dot{flex:none;width:10px;height:10px;border-radius:50%;background:var(--wa-danger)}
.wa-rec-time{flex:none;min-width:34px;font-variant-numeric:tabular-nums;color:var(--wa-text);font-size:15px}
.wa-rec-bars{flex:1;min-width:0;height:28px;display:flex;align-items:center;justify-content:flex-end;gap:2px;overflow:hidden}
.wa-rec-bars i{flex:none;width:3px;border-radius:2px;background:var(--wa-icon);opacity:.8}
.wa-root .wa-rec-cancel:hover:not(:disabled){color:var(--wa-danger)}

.wa-replybar{display:flex;align-items:center;gap:6px;--wa-qc:hsl(var(--wa-qh,215) 62% var(--wa-l))}
.wa-replyto{flex:1;min-width:0;padding:6px 12px 7px;border-left:4px solid var(--wa-qc);border-radius:8px;background:color-mix(in srgb,var(--wa-text) 6%,var(--wa-field))}
.wa-replyto span{display:block;font-size:13px;line-height:18px;color:var(--wa-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.wa-tray{list-style:none;margin:0;padding:2px 0 4px;display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:thin}
.wa-tray li{margin:0;padding:0;flex:none}
.wa-att{position:relative}
.wa-att-thumb{width:72px;height:72px;border-radius:10px;overflow:hidden;background:var(--wa-active)}
.wa-att-thumb img,.wa-att-thumb video{display:block;width:100%;height:100%;object-fit:cover}
.wa-att-play{position:absolute;inset:0;display:grid;place-items:center;color:#fff;background:rgba(0,0,0,.22);pointer-events:none}
.wa-att-play svg{width:26px;height:26px}
.wa-att-chip{display:flex;align-items:center;gap:10px;height:56px;width:210px;max-width:70cqw;padding:0 38px 0 10px;border:1px solid var(--wa-line);border-radius:10px;background:var(--wa-field)}
.wa-att-ico{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--wa-text) 10%,transparent);color:var(--wa-icon)}
.wa-att-ico svg{width:20px;height:20px}
.wa-att-meta{min-width:0;display:flex;flex-direction:column}
.wa-att-meta b{font-size:13.5px;font-weight:500;line-height:18px;color:var(--wa-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-att-meta span{font-size:12px;line-height:16px;color:var(--wa-sub)}
.wa-root .wa-att-x{position:absolute;top:4px;right:4px;display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;box-shadow:none}
.wa-att-chip .wa-att-x{top:50%;margin-top:-12px;background:color-mix(in srgb,var(--wa-text) 14%,transparent);color:var(--wa-text)}
.wa-att-x::before{content:"";position:absolute;inset:-8px}
.wa-att-x svg{width:14px;height:14px}
.wa-root .wa-att-add{display:grid;place-items:center;width:56px;height:56px;padding:0;border:1.5px dashed var(--wa-sub);border-radius:10px;background:transparent;color:var(--wa-icon);cursor:pointer;box-shadow:none}
.wa-att-add:hover{background:var(--wa-hover)}
.wa-att-add svg{width:24px;height:24px}

.wa-popover{position:absolute;z-index:6;background:var(--wa-pop);-webkit-backdrop-filter:var(--wa-pop-blur);backdrop-filter:var(--wa-pop-blur);color:var(--wa-text);border-radius:calc(var(--wa-radius) + 2px);box-shadow:0 0 0 1px var(--wa-line),0 8px 28px rgba(0,0,0,.28)}
.wa-emoji{left:8px;bottom:calc(100% + 8px);width:min(380px,calc(100% - 16px));height:min(340px,55vh);display:flex;flex-direction:column;overflow:hidden;background:var(--wa-solid)}
.wa-emoji-search{position:relative;flex:none;margin:10px 10px 4px}
.wa-emoji-search svg{position:absolute;left:13px;top:50%;width:17px;height:17px;transform:translateY(-50%);color:var(--wa-sub);pointer-events:none}
.wa-root .wa-emoji-search input{display:block;width:100%;height:36px;padding:0 14px 0 40px;border:1px solid transparent;border-radius:999px;background:var(--wa-pill);color:var(--wa-text);font:inherit;font-size:14px;box-shadow:none;outline:0}
.wa-root .wa-emoji-search input::placeholder{color:var(--wa-sub);opacity:1}
.wa-root .wa-emoji-search input:focus,.wa-root .wa-emoji-search input:focus-visible{border-color:var(--wa-accent);box-shadow:0 0 0 1px var(--wa-accent);outline:0}
.wa-emoji-tabs{flex:none;display:flex;padding:0 6px;border-bottom:1px solid var(--wa-line)}
.wa-root .wa-emoji-tab{flex:1;min-width:0;height:40px;padding:0;border:0;border-radius:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;opacity:.55;box-shadow:none;color:inherit;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.wa-emoji-tab:hover{opacity:.9}
.wa-root .wa-emoji-tab[aria-selected="true"]{opacity:1;box-shadow:inset 0 -2px 0 var(--wa-accent)}
.wa-root .wa-emoji-tab:focus-visible{outline:2px solid var(--wa-accent);outline-offset:-2px}
.wa-emoji-body{position:relative;flex:1;min-height:0;overflow-y:auto;padding:0 8px 8px;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--wa-text) 22%,transparent) transparent}
.wa-emoji-h{position:sticky;top:0;z-index:1;margin:0;padding:8px 4px 4px;background:var(--wa-solid);font-size:12.5px;font-weight:500;line-height:16px;color:var(--wa-sub)}
.wa-emoji-none{margin:16px 4px;color:var(--wa-sub);font-size:14px}
.wa-emoji-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(38px,1fr))}
.wa-root .wa-emoji-btn{height:38px;padding:0;border:0;border-radius:8px;background:transparent;font-size:24px;line-height:1;cursor:pointer;box-shadow:none;color:inherit;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.wa-emoji-btn:hover{background:var(--wa-hover)}
.wa-root .wa-emoji-btn:focus-visible{outline:2px solid var(--wa-accent);outline-offset:-2px;background:var(--wa-active)}

.wa-menu{left:0;bottom:calc(100% + 10px);min-width:220px;padding:8px 0}
.wa-root .wa-menuitem{display:flex;align-items:center;gap:16px;width:100%;height:44px;padding:0 22px 0 18px;border:0;border-radius:0;background:transparent;color:var(--wa-text);font:inherit;font-size:15px;text-align:left;cursor:pointer;box-shadow:none;white-space:nowrap}
.wa-menuitem:hover{background:var(--wa-hover)}
.wa-root .wa-menuitem:focus-visible{background:var(--wa-active);outline-offset:-2px}
.wa-menuitem svg{flex:none;width:24px;height:24px;color:var(--wa-icon)}

.wa-mentions{left:12px;right:12px;bottom:calc(100% + 4px);list-style:none;margin:0;padding:6px;max-height:240px;overflow-y:auto}
.wa-mention{display:flex;align-items:baseline;gap:10px;min-height:40px;padding:9px 12px;border-radius:8px;cursor:pointer;margin:0}
.wa-mention b{font-weight:500;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-mention span{flex:none;font-size:12.5px;color:var(--wa-sub)}
.wa-mention[aria-selected="true"]{background:var(--wa-active)}

.wa-drop{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:14px;background:color-mix(in oklab,var(--wa-solid) 82%,transparent);pointer-events:none}
.wa-drop>div{display:grid;place-items:center;align-content:center;gap:10px;width:100%;height:100%;border:2px dashed var(--wa-accent);border-radius:16px;color:var(--wa-accent-text);font-size:18px;font-weight:500}
.wa-drop svg{width:40px;height:40px}

@media (prefers-reduced-motion:no-preference){
  .wa-ico{transition:opacity .16s ease,transform .16s ease}
  .wa-root .wa-action,.wa-root .wa-cbtn{transition:background-color .15s ease,color .15s ease}
  .wa-popover{animation:wa-pop .13s ease-out;transform-origin:bottom left}
  .wa-rec-dot{animation:wa-blink 1.2s ease-in-out infinite}
}
@keyframes wa-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes wa-blink{50%{opacity:.35}}
@container (max-width:380px){
  .wa-composer{padding:6px}
  .wa-bar{gap:4px}
  .wa-cfield{padding:0 12px}
  .wa-rec{padding:0 12px;gap:8px}
  .wa-att-chip{width:170px}
}
@media (forced-colors:active){
  .wa-cfield,.wa-rec,.wa-popover,.wa-att-chip{border:1px solid CanvasText}
  .wa-root .wa-action{border:1px solid ButtonText;background:ButtonFace;color:ButtonText}
  .wa-root .wa-action:disabled{color:GrayText;border-color:GrayText}
  .wa-cfield:focus-within{outline:2px solid Highlight}
  .wa-rec-dot{background:Highlight}
  .wa-emoji-btn:focus-visible,.wa-menuitem:focus-visible,.wa-mention[aria-selected="true"]{outline:2px solid Highlight}
}
`;
