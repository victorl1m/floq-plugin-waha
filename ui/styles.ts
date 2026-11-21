// One scoped stylesheet for the whole view. An installed plugin gets no Tailwind utilities of its own (the host only ships the classes the app uses),
// so every rule here is plain CSS under .wa-root. It is unlayered, so it wins over the kit components' layered utilities.
// The messenger palette (--wa-*) is the plugin's own, with a light and a dark set; fonts, focus ring and destructive colour come from the host.
import { INBOX_CSS } from "./styles-inbox";
import { COMPOSER_CSS } from "./styles-composer";
const DOODLE = "url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27240%27%20height%3D%27240%27%20viewBox%3D%270%200%20240%20240%27%20fill%3D%27none%27%20stroke%3D%27black%27%20stroke-width%3D%271.6%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M18%2022h30a6%206%200%200%201%206%206v14a6%206%200%200%201-6%206H32l-8%207v-7h-6a6%206%200%200%201-6-6V28a6%206%200%200%201%206-6Z%27%2F%3E%3Cpath%20d%3D%27M100%2020l4%209%2010%201-7.500%206.500%202.500%209.500-9-5-9%205%202.500-9.500L86%2030l10-1Z%27%2F%3E%3Ccircle%20cx%3D%27176%27%20cy%3D%2734%27%20r%3D%2712%27%2F%3E%3Cpath%20d%3D%27M171%2031v.5M181%2031v.5M170.500%2038c3%204%208%204%2011%200%27%2F%3E%3Cpath%20d%3D%27M214%2078c-6-9-20-3-14%208%203%205%209%209%2014%2013%205-4%2011-8%2014-13%206-11-8-17-14-8Z%27%2F%3E%3Cpath%20d%3D%27M22%2096l34-12-12%2034-7-14Z%27%2F%3E%3Cpath%20d%3D%27M37%20104l19-20%27%2F%3E%3Cpath%20d%3D%27M96%2086c0-7%2010-11%2016-6%208-2%2014%206%2010%2013%205%205%201%2013-6%2013H98c-9%200-11-13-2-20Z%27%2F%3E%3Cpath%20d%3D%27M150%20108c6-6%2012%206%2018%200s12%206%2018%200%27%2F%3E%3Crect%20x%3D%2720%27%20y%3D%27150%27%20width%3D%2734%27%20height%3D%2726%27%20rx%3D%275%27%2F%3E%3Ccircle%20cx%3D%2737%27%20cy%3D%27163%27%20r%3D%277%27%2F%3E%3Cpath%20d%3D%27M30%20150l3-5h8l3%205%27%2F%3E%3Cpath%20d%3D%27M92%20176v-26l24-5v26%27%2F%3E%3Ccircle%20cx%3D%2786%27%20cy%3D%27176%27%20r%3D%276%27%2F%3E%3Ccircle%20cx%3D%27110%27%20cy%3D%27171%27%20r%3D%276%27%2F%3E%3Cpath%20d%3D%27M156%20150h30v32l-15-9-15%209Z%27%2F%3E%3Ccircle%20cx%3D%27216%27%20cy%3D%27160%27%20r%3D%2711%27%2F%3E%3Cpath%20d%3D%27M216%20153v7l5%203%27%2F%3E%3Cpath%20d%3D%27M40%20214a10%2010%200%201%201%2020%200c0%208-10%2016-10%2016s-10-8-10-16Z%27%2F%3E%3Ccircle%20cx%3D%2750%27%20cy%3D%27214%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M112%20206l8%208-8%208M132%20222h12%27%2F%3E%3Cpath%20d%3D%27M176%20226v-18m-9%209h18%27%2F%3E%3Ccircle%20cx%3D%27222%27%20cy%3D%27218%27%20r%3D%274%27%2F%3E%3Ccircle%20cx%3D%2772%27%20cy%3D%2762%27%20r%3D%273%27%2F%3E%3Ccircle%20cx%3D%27140%27%20cy%3D%2762%27%20r%3D%273%27%2F%3E%3Cpath%20d%3D%27M64%20128l6%206m0-6-6%206M200%20124l6%206m0-6-6%206%27%2F%3E%3C%2Fsvg%3E\")";

export const CSS = `
.wa-root{position:absolute;inset:0;container-type:inline-size;font:14px/1.4 var(--font-sans,system-ui,sans-serif);color:var(--wa-text);background:var(--wa-panel);
  --wa-panel:#ffffff;--wa-bar:#f0f2f5;--wa-field:#ffffff;--wa-pill:#f0f2f5;--wa-hover:#f5f6f6;--wa-active:#e9edef;--wa-line:#e4e8eb;
  --wa-text:#111b21;--wa-sub:#5f6f79;--wa-icon:#54656f;--wa-green:#00a884;--wa-green-text:#008069;--wa-on-green:#ffffff;--wa-badge:#1fa855;
  --wa-wall:#efeae2;--wa-doodle:rgba(60,45,20,.085);--wa-in:#ffffff;--wa-out:#d9fdd3;--wa-meta:#667781;--wa-chip:#ffffff;--wa-tick:#7d8c94;
  --wa-shadow:0 1px .5px rgba(11,20,26,.13);--wa-l:42%;--wa-avatar-l:86%;--wa-avatar-fg:32%}
.dark .wa-root,.wa-root.wa-dark{
  --wa-panel:#111b21;--wa-bar:#1f2c33;--wa-field:#2a3942;--wa-pill:#1f2c33;--wa-hover:#1a262d;--wa-active:#2a3942;--wa-line:#222d34;
  --wa-text:#e9edef;--wa-sub:#8696a0;--wa-icon:#aebac1;--wa-green:#00a884;--wa-green-text:#21c063;--wa-on-green:#0b141a;--wa-badge:#21c063;
  --wa-wall:#0b141a;--wa-doodle:rgba(255,255,255,.055);--wa-in:#1f2c33;--wa-out:#005c4b;--wa-meta:#9fb0b8;--wa-chip:#182229;--wa-tick:#a7c4bc;
  --wa-shadow:0 1px .5px rgba(0,0,0,.4);--wa-l:68%;--wa-avatar-l:26%;--wa-avatar-fg:82%}
.wa-root *,.wa-root *::before,.wa-root *::after{box-sizing:border-box}
.wa-root button{font:inherit}
.wa-panel{height:100%;display:grid;grid-template-columns:clamp(300px,34%,440px) minmax(0,1fr);overflow:hidden;background:var(--wa-panel)}
.wa-pane{display:flex;flex-direction:column;min-height:0;min-width:0}
.wa-list-pane{border-right:1px solid var(--wa-line);background:var(--wa-panel)}
.wa-chat-pane{background:var(--wa-wall)}

/* headers */
.wa-head{display:flex;align-items:center;gap:12px;height:60px;flex:none;padding:0 16px}
.wa-list-pane .wa-head{padding-right:10px}
.wa-chat-head{background:var(--wa-bar);border-bottom:1px solid var(--wa-line);z-index:1}
.wa-title{margin:0;flex:1;min-width:0;font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1.2;color:var(--wa-text)}
.wa-root .wa-iconbtn{flex:none;display:inline-grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer;box-shadow:none}
.wa-root .wa-iconbtn:hover{background:color-mix(in srgb,var(--wa-text) 9%,transparent);color:var(--wa-icon)}
.wa-root .wa-iconbtn:focus-visible,.wa-row:focus-visible,.wa-chip:focus-visible,.wa-jump:focus-visible,.wa-root .wa-send:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-root .wa-iconbtn svg{width:22px;height:22px}

/* search + filters */
.wa-search{position:relative;margin:0 12px;flex:none}
.wa-search svg{position:absolute;left:14px;top:50%;width:17px;height:17px;transform:translateY(-50%);color:var(--wa-sub);pointer-events:none}
.wa-root .wa-search input{display:block;width:100%;height:36px;padding:0 14px 0 44px;border:1px solid transparent;border-radius:999px;background:var(--wa-pill);color:var(--wa-text);font:inherit;font-size:14px;box-shadow:none;outline:0}
.wa-root .wa-search input::placeholder{color:var(--wa-sub);opacity:1}
.wa-root .wa-search input:focus,.wa-root .wa-search input:focus-visible{border-color:var(--wa-green);background:var(--wa-panel);box-shadow:0 0 0 1px var(--wa-green);outline:0}
.wa-chips{display:flex;gap:8px;flex:none;padding:10px 12px 8px;overflow-x:auto;scrollbar-width:none}
.wa-chip{flex:none;height:30px;padding:0 12px;border:0;border-radius:999px;background:var(--wa-pill);color:var(--wa-sub);font-size:13.5px;line-height:30px;cursor:pointer;white-space:nowrap}
.wa-chip:hover{background:var(--wa-active)}
.wa-chip[aria-pressed="true"]{background:color-mix(in srgb,var(--wa-green) 20%,var(--wa-panel));color:var(--wa-green-text);font-weight:500}

/* chat rows */
.wa-scroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--wa-text) 22%,transparent) transparent}
.wa-list{list-style:none;margin:0;padding:0}
.wa-list li{margin:0;padding:0}
.wa-row{display:flex;align-items:stretch;width:100%;height:72px;margin:0;padding:0 0 0 13px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wa-row:hover{background:var(--wa-hover)}
.wa-row[aria-current="true"]{background:var(--wa-active)}
.wa-row>.wa-avatar{align-self:center;margin-right:13px}
.wa-avatar{flex:none;display:grid;place-items:center;width:49px;height:49px;border-radius:50%;font-size:17px;font-weight:500;line-height:1;letter-spacing:.01em;user-select:none;
  background:hsl(var(--wa-h,150) 38% var(--wa-avatar-l));color:hsl(var(--wa-h,150) 45% var(--wa-avatar-fg))}
.wa-avatar svg{width:52%;height:52%}
.wa-avatar-sm{width:40px;height:40px;font-size:14.5px}
.wa-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:3px;padding-right:15px;border-bottom:1px solid var(--wa-line)}
.wa-list li:last-child .wa-body{border-bottom-color:transparent}
.wa-row[aria-current="true"] .wa-body,.wa-row:hover .wa-body{border-bottom-color:transparent}
.wa-line{display:flex;align-items:center;gap:8px;min-width:0;min-height:20px}
.wa-name{flex:1;min-width:0;font-size:16px;font-weight:500;line-height:21px;color:var(--wa-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-time{flex:none;font-size:12px;line-height:14px;color:var(--wa-sub);font-variant-numeric:tabular-nums}
.wa-unread .wa-time{color:var(--wa-badge);font-weight:500}
.wa-preview{flex:1;min-width:0;display:flex;align-items:center;gap:4px;font-size:14px;line-height:20px;color:var(--wa-sub);overflow:hidden;white-space:nowrap}
.wa-preview span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-preview .wa-you{flex:none;overflow:visible}
.wa-preview svg{flex:none;width:16px;height:16px}
.wa-preview .wa-ptick{color:var(--wa-tick)}
.wa-unread .wa-preview{color:var(--wa-text)}
.wa-pill{flex:none;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--wa-badge);color:var(--wa-on-green);font-size:12px;font-weight:600;line-height:20px;text-align:center;font-variant-numeric:tabular-nums}

/* states */
.wa-center{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;text-align:center;color:var(--wa-sub);font-size:14px}
.wa-center strong{color:var(--wa-text);font-size:16px;font-weight:500}
.wa-center p{margin:0;max-width:36ch;line-height:1.45}
.wa-center>svg{color:var(--wa-sub)}
.wa-root .wa-btn{height:34px;margin-top:6px;padding:0 18px;border:1px solid var(--wa-line);border-radius:999px;background:var(--wa-panel);color:var(--wa-green-text);font-size:14px;font-weight:500;cursor:pointer;box-shadow:none}
.wa-root .wa-btn:hover{background:var(--wa-hover);color:var(--wa-green-text)}
.wa-quiet{margin:0;padding:32px 20px;text-align:center;color:var(--wa-sub);overflow-wrap:anywhere}
.wa-spin{display:inline-block;width:22px;height:22px;border-radius:50%;border:2.5px solid color-mix(in srgb,var(--wa-green) 25%,transparent);border-top-color:var(--wa-green)}
.wa-empty{background:var(--wa-bar);border-bottom:6px solid var(--wa-green);gap:0}
.wa-hero{display:grid;place-items:center;width:96px;height:96px;margin-bottom:26px;border-radius:50%;background:color-mix(in srgb,var(--wa-green) 14%,transparent);color:var(--wa-green)}
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
.wa-logwrap::before,.wa-wall::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:var(--wa-doodle);
  -webkit-mask:${DOODLE} 0 0/240px 240px repeat;mask:${DOODLE} 0 0/240px 240px repeat}
.wa-wall{position:relative;isolation:isolate}
.wa-log{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--wa-text) 22%,transparent) transparent;padding:10px 0 12px}
.wa-col{display:flex;flex-direction:column;padding:0 clamp(16px,6.5%,72px)}
.wa-day{align-self:center;margin:10px auto;padding:5px 12px 6px;border-radius:8px;background:var(--wa-chip);color:var(--wa-sub);font-size:12.5px;line-height:15px;box-shadow:var(--wa-shadow)}
.wa-msg{display:flex;flex-direction:column;margin-top:2px;max-width:100%}
.wa-msg.wa-first{margin-top:10px}
.wa-day+.wa-msg.wa-first{margin-top:2px}
.wa-msg.wa-mine{align-items:flex-end}
.wa-msg.wa-theirs{align-items:flex-start}
.wa-bubble{position:relative;max-width:65%;min-width:74px;padding:6px 9px 7px;border-radius:8px;font-size:14.2px;line-height:19px;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--wa-in);color:var(--wa-text);box-shadow:var(--wa-shadow)}
.wa-mine .wa-bubble{background:var(--wa-out)}
.wa-first .wa-bubble::before{content:"";position:absolute;top:0;width:9px;height:13px;background:inherit}
.wa-theirs.wa-first .wa-bubble{border-top-left-radius:0}
.wa-theirs.wa-first .wa-bubble::before{left:-8px;clip-path:polygon(0 0,100% 0,100% 100%,18% 14%);border-top-left-radius:3px}
.wa-mine.wa-first .wa-bubble{border-top-right-radius:0}
.wa-mine.wa-first .wa-bubble::before{right:-8px;clip-path:polygon(0 0,100% 0,82% 14%,0 100%);border-top-right-radius:3px}
.wa-pending .wa-bubble{opacity:.72}
.wa-sender{display:block;margin-bottom:1px;font-size:12.8px;font-weight:500;line-height:20px;color:hsl(var(--wa-h,150) 62% var(--wa-l));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-stamp{float:right;display:inline-flex;align-items:center;gap:3px;height:15px;margin:7px -2px -5px 12px;font-size:11px;line-height:15px;color:var(--wa-meta);font-variant-numeric:tabular-nums;white-space:nowrap}
.wa-mine .wa-stamp{color:color-mix(in srgb,var(--wa-text) 58%,var(--wa-out))}
.wa-stamp svg{width:15px;height:15px;stroke-width:2}
.wa-bubble::after{content:"";display:block;clear:both}
.wa-media{display:flex;align-items:center;gap:10px;margin:-1px -4px 5px;padding:9px 10px;border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent);white-space:normal}
.wa-media-ico{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:color-mix(in srgb,var(--wa-text) 10%,transparent);color:var(--wa-icon)}
.wa-media-ico svg{width:19px;height:19px}
.wa-media b{display:block;font-size:14px;font-weight:500;line-height:19px}
.wa-media span>span{display:block;font-size:12.5px;line-height:16px;color:var(--wa-meta)}
.wa-quote{display:block;width:calc(100% + 8px);min-width:140px;margin:-1px -4px 5px;padding:5px 10px 6px 9px;border:0;border-left:4px solid var(--wa-qc);border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent);color:inherit;font:inherit;text-align:left;white-space:normal;cursor:pointer;
  --wa-qc:hsl(var(--wa-qh,150) 62% var(--wa-l))}
.wa-quote:disabled{cursor:default}
.wa-quote:not(:disabled):hover{background:color-mix(in srgb,var(--wa-text) 11%,transparent)}
.wa-quote:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px}
.wa-quote-me{--wa-qc:var(--wa-green-text)}
.wa-mine .wa-quote-me{--wa-qc:color-mix(in srgb,var(--wa-green-text) 70%,var(--wa-text))}
.wa-quote b,.wa-replyto b{display:block;font-size:12.8px;font-weight:500;line-height:19px;color:var(--wa-qc);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-quote span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:18px;color:var(--wa-meta);overflow-wrap:anywhere}
.wa-mine .wa-quote span{color:color-mix(in srgb,var(--wa-text) 66%,var(--wa-out))}
.wa-quote svg,.wa-replyto svg{display:inline-block;width:14px;height:14px;margin:-2px 4px 0 0;vertical-align:middle}
.wa-act{position:absolute;top:50%;width:28px;height:28px;margin-top:-14px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--wa-text) 12%,transparent);color:var(--wa-icon);cursor:pointer;opacity:0}
.wa-theirs .wa-act{left:calc(100% + 8px)}
.wa-mine .wa-act{right:calc(100% + 8px)}
.wa-act svg{width:16px;height:16px}
.wa-msg:hover .wa-act,.wa-act:focus-visible{opacity:1}
.wa-act:hover{background:color-mix(in srgb,var(--wa-text) 20%,transparent);color:var(--wa-text)}
.wa-act:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px}
@media (hover:none){.wa-act:not(:focus-visible){display:none}}
@keyframes wa-flash{0%,55%{background:color-mix(in srgb,var(--wa-green) 22%,transparent)}100%{background:transparent}}
.wa-msg.wa-flash{animation:wa-flash 1.5s ease-out}
.wa-msg{margin-left:calc(-1 * clamp(16px,6.5%,72px));margin-right:calc(-1 * clamp(16px,6.5%,72px));padding:0 clamp(16px,6.5%,72px);max-width:none}
.wa-unsupported{font-style:italic;color:var(--wa-meta)}
.wa-note{align-self:center;margin:auto;padding:8px 14px;border-radius:8px;background:var(--wa-chip);color:var(--wa-sub);font-size:13px;box-shadow:var(--wa-shadow)}
.wa-jump{position:absolute;right:16px;bottom:14px;width:42px;height:42px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:var(--wa-in);color:var(--wa-icon);cursor:pointer;box-shadow:0 1px 3px rgba(11,20,26,.3)}
.wa-jump:hover{background:var(--wa-hover)}
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
` + COMPOSER_CSS + INBOX_CSS;
