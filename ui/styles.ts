import { INBOX_CSS } from "./styles-inbox";
import { COMPOSER_CSS } from "./styles-composer";
import { PEOPLE_CSS } from "./styles-people";
import { MORE_CSS } from "./styles-more";
import { BUBBLES_CSS } from "./styles-bubbles";
import { FIELDS_CSS, THEME_CSS } from "./theme";
// One scoped stylesheet for the whole view. An installed plugin gets no Tailwind utilities of its own (the host only ships the classes the app uses),
// so every rule here is plain CSS under .wa-root. It is unlayered, so it wins over the kit components' layered utilities.
// Colours are Floq's theme tokens through the --wa-* aliases of theme.ts: nothing here is a fixed brand colour.

export const CSS = THEME_CSS + `
.wa-root{position:absolute;inset:0;container-type:inline-size;font:14px/1.4 var(--font-sans,system-ui,sans-serif);color:var(--wa-text);background:var(--wa-panel);-webkit-backdrop-filter:var(--wa-blur);backdrop-filter:var(--wa-blur)}
.wa-root *,.wa-root *::before,.wa-root *::after{box-sizing:border-box}
.wa-root button{font:inherit}
.wa-panel{height:100%;display:grid;grid-template-columns:clamp(300px,34%,440px) minmax(0,1fr);overflow:hidden}
.wa-pane{display:flex;flex-direction:column;min-height:0;min-width:0}
.wa-list-pane{border-right:1px solid var(--wa-line)}
.wa-chat-pane{background:var(--wa-wall)}
.wa-cv-open{background:var(--wa-wall)}

/* headers */
.wa-head{display:flex;align-items:center;gap:12px;height:60px;flex:none;padding:0 16px}
.wa-list-pane .wa-head{padding-right:10px}
.wa-chat-head{background:var(--wa-bar);border-bottom:1px solid var(--wa-line);z-index:1}
.wa-title{margin:0;flex:1;min-width:0;font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1.2;color:var(--wa-text)}
.wa-root .wa-iconbtn{flex:none;display:inline-grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer;box-shadow:none}
.wa-root .wa-iconbtn:hover{background:color-mix(in srgb,var(--wa-text) 9%,transparent);color:var(--wa-icon)}
.wa-root .wa-iconbtn:focus-visible,.wa-row:focus-visible,.wa-chip:focus-visible,.wa-jump:focus-visible,.wa-root .wa-send:focus-visible{outline:2px solid var(--wa-accent);outline-offset:-2px}
.wa-root .wa-iconbtn svg{width:22px;height:22px}

/* search + filters */
.wa-search{position:relative;margin:0 12px;flex:none}
.wa-search svg{position:absolute;left:14px;top:50%;width:17px;height:17px;transform:translateY(-50%);color:var(--wa-sub);pointer-events:none}
.wa-root .wa-search input{display:block;width:100%;height:36px;padding:0 14px 0 44px;border:1px solid transparent;border-radius:999px;background:var(--wa-pill);color:var(--wa-text);font:inherit;font-size:14px;box-shadow:none;outline:0}
.wa-root .wa-search input::placeholder{color:var(--wa-sub);opacity:1}
.wa-root .wa-search input:focus,.wa-root .wa-search input:focus-visible{border-color:var(--wa-accent);box-shadow:0 0 0 1px var(--wa-accent);outline:0}
.wa-chips{display:flex;gap:8px;flex:none;padding:10px 12px 8px;overflow-x:auto;scrollbar-width:none}
.wa-chip{flex:none;height:30px;padding:0 12px;border:0;border-radius:999px;background:var(--wa-pill);color:var(--wa-sub);font-size:13.5px;line-height:30px;cursor:pointer;white-space:nowrap}
.wa-chip:hover{background:var(--wa-active)}
.wa-chip[aria-pressed="true"]{background:color-mix(in oklab,var(--wa-accent) 16%,transparent);color:var(--wa-accent-text);font-weight:500}

/* chat rows */
.wa-scroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--wa-text) 22%,transparent) transparent}
.wa-list{list-style:none;margin:0;padding:0}
.wa-list li{margin:0;padding:0}
.wa-row{display:flex;align-items:stretch;width:100%;height:72px;margin:0;padding:0 0 0 13px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wa-row:hover{background:var(--wa-hover)}
.wa-row[aria-current="true"]{background:var(--wa-active)}
.wa-row>.wa-avatar{align-self:center;margin-right:13px}
.wa-avatar{flex:none;display:grid;place-items:center;width:49px;height:49px;border-radius:50%;font-size:17px;font-weight:500;line-height:1;letter-spacing:.01em;user-select:none;
  background:hsl(var(--wa-h,215) 38% var(--wa-avatar-l));color:hsl(var(--wa-h,215) 45% var(--wa-avatar-fg))}
.wa-avatar svg{width:52%;height:52%}
.wa-avatar-sm{width:40px;height:40px;font-size:14.5px}
.wa-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;padding-right:15px;border-bottom:1px solid var(--wa-line)}
.wa-list li:last-child .wa-body{border-bottom-color:transparent}
.wa-row[aria-current="true"] .wa-body,.wa-row:hover .wa-body{border-bottom-color:transparent}
.wa-line{display:flex;align-items:center;gap:8px;min-width:0;min-height:20px}
.wa-name{flex:1;min-width:0;font-size:16px;font-weight:500;line-height:21px;color:var(--wa-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-time{flex:none;font-size:12px;line-height:14px;color:var(--wa-sub);font-variant-numeric:tabular-nums}
.wa-unread .wa-time{color:var(--wa-accent-text);font-weight:500}
.wa-preview{flex:1;min-width:0;display:flex;align-items:center;gap:4px;font-size:14px;line-height:20px;color:var(--wa-sub);overflow:hidden;white-space:nowrap}
.wa-preview span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-preview .wa-you{flex:none;overflow:visible}
.wa-preview svg{flex:none;width:16px;height:16px}
.wa-preview .wa-ptick{color:var(--wa-tick)}
.wa-unread .wa-preview{color:var(--wa-text)}
.wa-pill{flex:none;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--wa-badge);color:var(--wa-on-accent);font-size:12px;font-weight:600;line-height:20px;text-align:center;font-variant-numeric:tabular-nums}

/* states */
.wa-center{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;text-align:center;color:var(--wa-sub);font-size:14px}
.wa-center strong{color:var(--wa-text);font-size:16px;font-weight:500}
.wa-center p{margin:0;max-width:36ch;line-height:1.45}
.wa-center>svg{color:var(--wa-sub)}
.wa-root .wa-btn{height:34px;margin-top:6px;padding:0 18px;border:1px solid var(--wa-line);border-radius:999px;background:var(--wa-field);color:var(--wa-accent-text);font-size:14px;font-weight:500;cursor:pointer;box-shadow:none}
.wa-root .wa-btn:hover{background:color-mix(in oklab,var(--wa-text) 6%,var(--wa-field));color:var(--wa-accent-text)}
.wa-quiet{margin:0;padding:32px 20px;text-align:center;color:var(--wa-sub);overflow-wrap:anywhere}
.wa-spin{display:inline-block;width:22px;height:22px;border-radius:50%;border:2.5px solid color-mix(in srgb,var(--wa-accent) 25%,transparent);border-top-color:var(--wa-accent)}
.wa-empty{background:radial-gradient(circle at center,var(--wa-wall-dot) .8px,transparent 1.2px) 0 0/22px 22px,var(--wa-wall);gap:0}
.wa-hero{display:grid;place-items:center;width:96px;height:96px;margin-bottom:26px;border-radius:50%;background:color-mix(in srgb,var(--wa-accent) 14%,transparent);color:var(--wa-accent)}
.wa-hero svg{width:48px;height:48px;stroke-width:1.4}
.wa-hero-title{margin-bottom:12px;font-size:28px;font-weight:300;letter-spacing:-.01em;line-height:1.2;color:var(--wa-text)}
.wa-empty p{max-width:44ch}
.wa-small{margin-top:28px;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--wa-sub)}
.wa-small svg{width:13px;height:13px}

/* conversation */
.wa-root .wa-back{display:none;margin-left:-8px;margin-right:-6px}
.wa-who{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center}
.wa-who b{font-size:16px;font-weight:500;line-height:21px;color:var(--wa-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-who span{font-size:13px;line-height:18px;color:var(--wa-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-logwrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;isolation:isolate}
.wa-logwrap::before,.wa-wall::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(circle at center,var(--wa-wall-dot) .8px,transparent 1.2px) 0 0/22px 22px}
.wa-wall{position:relative;isolation:isolate}
.wa-log{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--wa-text) 22%,transparent) transparent;padding:10px 0 12px}
.wa-col{display:flex;flex-direction:column;padding:0 clamp(16px,6.5%,72px)}
.wa-day{align-self:center;margin:10px auto;padding:5px 12px 6px;border-radius:8px;background:var(--wa-chip);color:var(--wa-sub);font-size:12.5px;line-height:15px;box-shadow:var(--wa-shadow)}
.wa-msg{display:flex;flex-direction:column;margin-top:2px;max-width:100%}
.wa-msg.wa-first{margin-top:10px}
.wa-day+.wa-msg.wa-first{margin-top:2px}
.wa-msg.wa-mine{align-items:flex-end}
.wa-msg.wa-theirs{align-items:flex-start}
.wa-bubble{position:relative;max-width:65%;min-width:74px;padding:6px 9px 7px;border-radius:var(--wa-radius);font-size:14.2px;line-height:19px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--wa-in);color:var(--wa-text);box-shadow:var(--wa-shadow)}
.wa-mine .wa-bubble{background:var(--wa-out)}
.wa-first .wa-bubble::before{content:"";position:absolute;top:0;width:9px;height:13px;background:inherit}
.wa-theirs.wa-first .wa-bubble{border-top-left-radius:0}
.wa-theirs.wa-first .wa-bubble::before{left:-8px;clip-path:polygon(0 0,100% 0,100% 100%,18% 14%);border-top-left-radius:3px}
.wa-mine.wa-first .wa-bubble{border-top-right-radius:0}
.wa-mine.wa-first .wa-bubble::before{right:-8px;clip-path:polygon(0 0,100% 0,82% 14%,0 100%);border-top-right-radius:3px}
.wa-pending .wa-bubble{opacity:.72}
.wa-sender{display:block;margin-bottom:1px;font-size:12.8px;font-weight:500;line-height:20px;color:hsl(var(--wa-h,215) 62% var(--wa-l));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-stamp{float:right;display:inline-flex;align-items:center;gap:3px;height:15px;margin:7px -2px -5px 12px;font-size:11px;line-height:15px;color:var(--wa-meta);font-variant-numeric:tabular-nums;white-space:nowrap}
.wa-mine .wa-stamp{color:color-mix(in srgb,var(--wa-text) 70%,var(--wa-out))}
.wa-stamp svg{width:15px;height:15px;stroke-width:2}
.wa-bubble::after{content:"";display:block;clear:both}
.wa-media{display:flex;align-items:center;gap:10px;margin:-1px -4px 5px;padding:9px 10px;border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent);white-space:normal}
.wa-media-ico{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--wa-text) 10%,transparent);color:var(--wa-icon)}
.wa-media-ico svg{width:19px;height:19px}
.wa-media b{display:block;font-size:14px;font-weight:500;line-height:19px}
.wa-media span>span{display:block;font-size:12.5px;line-height:16px;color:var(--wa-meta)}
.wa-quote{display:block;width:calc(100% + 8px);min-width:140px;margin:-1px -4px 5px;padding:5px 10px 6px 9px;border:0;border-left:4px solid var(--wa-qc);border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent);color:inherit;font:inherit;text-align:left;white-space:normal;cursor:pointer;
  --wa-qc:hsl(var(--wa-qh,215) 62% var(--wa-l))}
.wa-quote:disabled{cursor:default}
.wa-quote:not(:disabled):hover{background:color-mix(in srgb,var(--wa-text) 11%,transparent)}
.wa-quote:focus-visible{outline:2px solid var(--wa-accent);outline-offset:1px}
.wa-quote-me{--wa-qc:var(--wa-accent-text)}
.wa-mine .wa-quote-me{--wa-qc:color-mix(in srgb,var(--wa-accent-text) 70%,var(--wa-text))}
.wa-quote b,.wa-replyto b{display:block;font-size:12.8px;font-weight:500;line-height:19px;color:var(--wa-qc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-quote span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:18px;color:var(--wa-meta);overflow-wrap:anywhere}
.wa-mine .wa-quote span{color:color-mix(in srgb,var(--wa-text) 74%,var(--wa-out))}
.wa-quote svg,.wa-replyto svg{display:inline-block;width:14px;height:14px;margin:-2px 4px 0 0;vertical-align:middle}
.wa-act{position:absolute;top:50%;width:28px;height:28px;margin-top:-14px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--wa-text) 12%,transparent);color:var(--wa-icon);cursor:pointer;opacity:0}
.wa-theirs .wa-act{left:calc(100% + 8px)}
.wa-mine .wa-act{right:calc(100% + 8px)}
.wa-act svg{width:16px;height:16px}
.wa-msg:hover .wa-act,.wa-act:focus-visible{opacity:1}
.wa-act:hover{background:color-mix(in srgb,var(--wa-text) 20%,transparent);color:var(--wa-text)}
.wa-act:focus-visible{outline:2px solid var(--wa-accent);outline-offset:1px}
@media (hover:none){.wa-act:not(:focus-visible){display:none}}
@keyframes wa-flash{0%,55%{background:color-mix(in srgb,var(--wa-accent) 22%,transparent)}100%{background:transparent}}
.wa-msg.wa-flash{animation:wa-flash 1.5s ease-out}
.wa-msg{margin-left:calc(-1 * clamp(16px,6.5%,72px));margin-right:calc(-1 * clamp(16px,6.5%,72px));padding:0 clamp(16px,6.5%,72px);max-width:none}
.wa-unsupported{font-style:italic;color:var(--wa-meta)}
.wa-note{align-self:center;margin:auto;padding:8px 14px;border-radius:8px;background:var(--wa-chip);color:var(--wa-sub);font-size:13px;box-shadow:var(--wa-shadow)}
.wa-jump{position:absolute;right:16px;bottom:14px;width:42px;height:42px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:var(--wa-in);color:var(--wa-icon);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.wa-jump:hover{background:color-mix(in oklab,var(--wa-text) 7%,var(--wa-in))}
.wa-jump svg{width:22px;height:22px}
.wa-jump i{position:absolute;top:-2px;left:-2px;width:12px;height:12px;border-radius:50%;background:var(--wa-badge)}

@keyframes wa-rot{to{transform:rotate(360deg)}}
.wa-spin{animation:wa-rot .8s linear infinite}
@media (prefers-reduced-motion:no-preference){
  .wa-row,.wa-chip,.wa-root .wa-iconbtn,.wa-root .wa-send,.wa-jump{transition:background-color .12s ease}
  .wa-spin-on svg{animation:wa-rot .8s linear infinite}
}
@media (prefers-reduced-motion:reduce){.wa-spin{animation-duration:2.4s}}
@container (max-width:720px){
  .wa-panel{grid-template-columns:minmax(0,1fr)}
  .wa-list-pane{border-right:0}
  .wa-root[data-pane="list"] .wa-chat-pane{display:none}
  .wa-root[data-pane="chat"] .wa-list-pane{display:none}
  .wa-root .wa-back{display:inline-grid}
  .wa-chat-head{padding:0 12px}
  .wa-col{padding:0 14px}
  .wa-msg{margin-left:-14px;margin-right:-14px;padding:0 14px}
  .wa-bubble{max-width:82%}
}
@media (forced-colors:active){
  .wa-bubble,.wa-day{border:1px solid CanvasText}
  .wa-row[aria-current="true"]{outline:2px solid Highlight;outline-offset:-2px}
}
` + INBOX_CSS + COMPOSER_CSS + PEOPLE_CSS + MORE_CSS + BUBBLES_CSS + FIELDS_CSS;
