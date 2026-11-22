// Connection screen, reconnect bar and account menu styles. Appended to the plugin stylesheet (styles.ts); colours only through the --wa-* aliases of Floq's theme tokens (theme.ts).
// Menus and dialogs are portaled outside .wa-root, so they use the host's styling and nothing here.
import { HISTORY_CSS } from "./styles-history";
const BASE_CSS = `
.wa-sess{position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:32px 24px;color:var(--wa-text)}
.wa-sess-in{width:100%;margin:auto 0;display:flex;flex-direction:column;align-items:center}
.wa-sess-card{width:min(900px,100%);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:56px;align-items:center}
.wa-sess-h{margin:0 0 6px;font-size:28px;font-weight:300;line-height:1.2;letter-spacing:-.01em;color:var(--wa-text)}
.wa-sess-sub{margin:0 0 24px;color:var(--wa-sub);font-size:15px;line-height:1.45}
.wa-sess-steps{list-style:none;margin:0 0 24px;padding:0;display:flex;flex-direction:column;gap:14px;counter-reset:wa-step}
.wa-sess-steps li{counter-increment:wa-step;display:flex;align-items:center;gap:14px;font-size:16px;line-height:1.35;color:var(--wa-text)}
.wa-sess-steps li::before{content:counter(wa-step);flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--wa-pill);color:var(--wa-icon);font-size:13px;font-weight:600}
.wa-sess-steps b{font-weight:600}
.wa-sess-qr{display:grid;place-items:center}
.wa-qr-box{position:relative;display:grid;place-items:center;width:294px;height:294px;padding:14px;border:1px solid var(--wa-line);border-radius:18px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.wa-qr-box svg,.wa-qr-box img{display:block;width:264px;height:264px;max-width:100%;height:auto;aspect-ratio:1;image-rendering:pixelated}
.wa-qr-busy{position:absolute;inset:0;display:grid;place-items:center;border-radius:18px;background:rgba(255,255,255,.78);color:#596476;font-size:13px}
.wa-qr-err{margin:10px 0 0;max-width:294px;text-align:center;color:var(--wa-sub);font-size:13px}
:is(.wa-root,.wa-adlg) .wa-slink{display:inline-flex;align-items:center;gap:8px;width:fit-content;height:auto;min-height:36px;padding:6px 2px;border:0;border-radius:8px;background:transparent;color:var(--wa-accent-text);font-size:15px;font-weight:500;cursor:pointer;box-shadow:none}
:is(.wa-root,.wa-adlg) .wa-slink:hover:not(:disabled){background:transparent;color:var(--wa-accent-text);text-decoration:underline}
:is(.wa-root,.wa-adlg) .wa-slink:focus-visible,:is(.wa-root,.wa-adlg) .wa-pbtn:focus-visible,:is(.wa-root,.wa-adlg) .wa-obtn:focus-visible,:is(.wa-root,.wa-adlg) .wa-acct:focus-visible,:is(.wa-root,.wa-adlg) .wa-sbar-btn:focus-visible{outline:2px solid var(--wa-accent);outline-offset:2px}
.wa-sess-foot{display:flex;align-items:center;justify-content:center;gap:8px;margin:36px 0 0;color:var(--wa-sub);font-size:13px;text-align:center}
.wa-sess-foot svg{flex:none;width:14px;height:14px}

.wa-sess-state{width:min(460px,100%);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.wa-sess-ico{display:grid;place-items:center;width:72px;height:72px;margin-bottom:8px;border-radius:50%;background:var(--wa-pill);color:var(--wa-icon)}
.wa-sess-ico svg{width:34px;height:34px}
.wa-sess-ico.wa-ok{background:color-mix(in srgb,var(--wa-accent) 16%,transparent);color:var(--wa-accent-text)}
.wa-sess-ico.wa-warn{background:color-mix(in srgb,#e0a000 18%,transparent);color:#b27c00}
.dark .wa-sess-ico.wa-warn,.wa-root.wa-dark .wa-sess-ico.wa-warn{color:#f0c040}
.wa-sess-ico .wa-spin{width:30px;height:30px;border-width:3px}
.wa-sess-state h2{margin:0;font-size:22px;font-weight:400;line-height:1.25;color:var(--wa-text)}
.wa-sess-state p{margin:0;max-width:42ch;color:var(--wa-sub);font-size:15px;line-height:1.5}
.wa-sess-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:14px}
:is(.wa-root,.wa-adlg) .wa-pbtn,:is(.wa-root,.wa-adlg) .wa-obtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 22px;border-radius:999px;font-size:15px;font-weight:500;cursor:pointer;box-shadow:none}
:is(.wa-root,.wa-adlg) .wa-pbtn{border:0;background:var(--wa-accent);color:var(--wa-on-accent)}
:is(.wa-root,.wa-adlg) .wa-pbtn:hover:not(:disabled){background:color-mix(in srgb,var(--wa-accent) 88%,#000);color:var(--wa-on-accent)}
:is(.wa-root,.wa-adlg) .wa-obtn{border:1px solid var(--wa-line);background:var(--wa-field);color:var(--wa-accent-text)}
:is(.wa-root,.wa-adlg) .wa-obtn:hover:not(:disabled){background:color-mix(in oklab,var(--wa-text) 6%,var(--wa-field));color:var(--wa-accent-text)}
:is(.wa-root,.wa-adlg) .wa-pbtn:disabled,:is(.wa-root,.wa-adlg) .wa-obtn:disabled{opacity:.55;cursor:default}
.wa-pbtn .wa-spin{width:16px;height:16px;border-width:2px;border-color:color-mix(in srgb,var(--wa-on-accent) 35%,transparent);border-top-color:var(--wa-on-accent)}

.wa-pair{width:min(460px,100%);display:flex;flex-direction:column;gap:8px}
.wa-pair .wa-sess-sub{margin-bottom:12px}
.wa-pair label{font-size:13px;font-weight:500;color:var(--wa-sub)}
.wa-spick{max-width:520px;flex:none}
.wa-spick>*{flex:none}
.wa-spick-busy{display:flex;justify-content:center;padding:24px 0}
:is(.wa-root,.wa-adlg) .wa-spick-list{list-style:none;margin:4px 0 18px;padding:0;display:flex;flex-direction:column;gap:8px;max-height:264px;overflow:auto;flex:none}
:is(.wa-root,.wa-adlg) .wa-spick-list li{flex:none}
:is(.wa-root,.wa-adlg) .wa-spick-item{display:flex;box-sizing:border-box;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:56px;padding:8px 14px;border:1px solid var(--wa-line);border-radius:12px;background:var(--wa-field);color:var(--wa-text);font:inherit;text-align:left;cursor:pointer}
:is(.wa-root,.wa-adlg) .wa-spick-item:hover:not(:disabled),:is(.wa-root,.wa-adlg) .wa-spick-item:focus-visible{border-color:var(--wa-accent);outline:0}
:is(.wa-root,.wa-adlg) .wa-spick-item:disabled{opacity:.6;cursor:default}
.wa-spick-main{display:flex;flex-direction:column;min-width:0}
.wa-spick-main b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-spick-main span{font-size:13px;color:var(--wa-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-spick-st{flex:none;font-size:13px;color:var(--wa-sub)}
.wa-spick-st.wa-ok{color:var(--wa-ok)}
@media (max-width:480px){.wa-spick .wa-pair-row{flex-direction:column}:is(.wa-root,.wa-adlg) .wa-spick .wa-pair-row input{flex:none;width:100%;box-sizing:border-box}}
.wa-pair-row{display:flex;gap:10px;align-items:stretch}
:is(.wa-root,.wa-adlg) .wa-pair-row input{flex:1;min-width:0;height:44px;padding:0 16px;border:1px solid var(--wa-line);border-radius:12px;background:var(--wa-field);color:var(--wa-text);font:inherit;font-size:16px;box-shadow:none;outline:0}
:is(.wa-root,.wa-adlg) .wa-pair-row input:focus,:is(.wa-root,.wa-adlg) .wa-pair-row input:focus-visible{border-color:var(--wa-accent);box-shadow:0 0 0 1px var(--wa-accent);outline:0}
:is(.wa-root,.wa-adlg) .wa-pair-row .wa-pbtn{height:44px;flex:none}
.wa-pair-err{margin:0;color:var(--destructive,#d92d20);font-size:13px}
.wa-code{display:flex;align-items:center;justify-content:center;gap:6px;margin:14px 0 6px}
.wa-code-box{flex:1 1 0;max-width:46px;aspect-ratio:46/58;display:grid;place-items:center;border:1px solid var(--wa-line);border-radius:10px;background:var(--wa-bar);color:var(--wa-text);font:600 26px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.wa-code-dash{flex:none;width:12px;height:2px;margin:0 4px;border-radius:1px;background:var(--wa-sub)}
.wa-pair .wa-sess-steps{margin:18px 0 8px}
.wa-pair .wa-sess-steps li{font-size:15px}
.wa-pair-note{margin:0;color:var(--wa-sub);font-size:13px;line-height:1.45}

.wa-sbar{display:flex;align-items:center;gap:10px;flex:none;min-height:44px;padding:6px 8px 6px 14px;background:color-mix(in srgb,#e0a000 16%,var(--wa-panel));border-bottom:1px solid color-mix(in srgb,#e0a000 30%,var(--wa-line));color:var(--wa-text);font-size:13.5px;line-height:1.3}
.wa-sbar>svg{flex:none;width:20px;height:20px;color:#b27c00}
.dark .wa-sbar>svg,.wa-root.wa-dark .wa-sbar>svg{color:#f0c040}
.wa-sbar-text{flex:1;min-width:0}
.wa-sbar-text b{display:block;font-weight:600}
.wa-sbar-text span{display:block;color:var(--wa-sub);font-size:12.5px}
.wa-sbar-error{background:color-mix(in srgb,var(--destructive,#d92d20) 12%,var(--wa-panel));border-bottom-color:color-mix(in srgb,var(--destructive,#d92d20) 28%,var(--wa-line))}
.wa-sbar-error>svg{color:var(--destructive,#d92d20)}
:is(.wa-root,.wa-adlg) .wa-sbar-btn{flex:none;height:32px;padding:0 14px;border:1px solid color-mix(in srgb,var(--wa-text) 18%,transparent);border-radius:999px;background:var(--wa-field);color:var(--wa-text);font-size:13px;font-weight:500;cursor:pointer;box-shadow:none}
:is(.wa-root,.wa-adlg) .wa-sbar-btn:hover:not(:disabled){background:color-mix(in oklab,var(--wa-text) 6%,var(--wa-field));color:var(--wa-text)}
.wa-sbar .wa-spin{flex:none;width:16px;height:16px;border-width:2px}

:is(.wa-root,.wa-adlg) .wa-acct{position:relative;flex:none;display:inline-grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;box-shadow:none}
:is(.wa-root,.wa-adlg) .wa-acct:hover{background:color-mix(in srgb,var(--wa-text) 9%,transparent)}
.wa-acct-av{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:hsl(var(--wa-h,215) 38% var(--wa-avatar-l));color:hsl(var(--wa-h,215) 40% var(--wa-avatar-fg));font-size:13px;font-weight:600;letter-spacing:.02em}
.wa-dot{position:absolute;right:3px;bottom:3px;width:11px;height:11px;border-radius:50%;border:2px solid var(--wa-solid);background:var(--wa-sub)}
.wa-dot[data-s="WORKING"]{background:var(--wa-ok)}
.wa-dot[data-s="STARTING"],.wa-dot[data-s="SCAN_QR_CODE"],.wa-dot[data-s="PASSKEY_REQUIRED"],.wa-dot[data-s="PASSKEY_CONFIRMATION_REQUIRED"]{background:#e0a000}
.wa-dot[data-s="FAILED"],.wa-dot[data-s="UNREACHABLE"],.wa-dot[data-s="UNAUTHORIZED"]{background:var(--destructive,#d92d20)}


/* ---- accounts: the switcher in the account menu, the account chip of a conversation, the add-account dialog ---- */
.wa-acct-n{position:absolute;top:-1px;right:-3px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;border:2px solid var(--wa-solid);background:var(--wa-badge);color:var(--wa-on-accent);font-size:10px;font-weight:700;line-height:13px;text-align:center}
.wa-amenu{width:min(320px,calc(100vw - 24px))}
.wa-amenu [role=menuitemradio]{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 8px;cursor:pointer}
.wa-arow-av{position:relative;flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:hsl(var(--wa-h,215) 38% var(--wa-avatar-l));color:hsl(var(--wa-h,215) 40% var(--wa-avatar-fg));font-size:13px;font-weight:600;letter-spacing:.02em}
.wa-arow-av .wa-dot{right:-2px;bottom:-2px;border-color:var(--popover,var(--wa-solid))}
.wa-arow-main{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.wa-arow-main b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-arow-main span{font-size:12px;color:var(--wa-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-arow-n{flex:none;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--wa-badge);color:var(--wa-on-accent);font-size:11px;font-weight:700;line-height:20px;text-align:center}
.wa-arow-check{flex:none;width:18px;height:18px;color:var(--wa-accent-text)}
.wa-amenu-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:600;color:var(--wa-sub)}
.wa-amenu-h span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-amenu-h small{flex:none;font-size:11px;font-weight:500;letter-spacing:.03em;opacity:.8}
.wa-chip-acct{flex:none;display:inline-flex;align-items:center;gap:6px;max-width:150px;height:24px;padding:0 9px 0 4px;border-radius:999px;background:var(--wa-pill);color:var(--wa-sub);font-size:12px;font-weight:500;white-space:nowrap}
.wa-chip-acct i{flex:none;width:16px;height:16px;border-radius:50%;background:hsl(var(--wa-h,215) 45% var(--wa-l))}
.wa-chip-acct span{overflow:hidden;text-overflow:ellipsis}
.wa-noacct{position:absolute;inset:0;display:grid;place-items:center;padding:24px;overflow-y:auto}
.wa-noacct .wa-hello button{margin-top:16px}

.wa-adlg{display:flex;flex-direction:column;gap:16px;min-width:0;max-height:min(640px,calc(100vh - 32px));overflow-y:auto;color:var(--wa-text);font-size:14px;line-height:1.4}
.wa-adlg *,.wa-adlg *::before,.wa-adlg *::after{box-sizing:border-box}
.wa-adlg button,.wa-adlg input{font:inherit}
.wa-adlg-opts{display:flex;flex-direction:column;gap:10px}
.wa-adlg-opt{display:flex;align-items:center;gap:14px;width:100%;min-height:76px;padding:12px 14px;border:1px solid var(--wa-line);border-radius:14px;background:var(--wa-field);color:var(--wa-text);text-align:left;cursor:pointer}
.wa-adlg-opt:hover:not(:disabled),.wa-adlg-opt:focus-visible{border-color:var(--wa-accent);outline:0;box-shadow:0 0 0 1px var(--wa-accent)}
.wa-adlg-opt:disabled{opacity:.6;cursor:default}
.wa-adlg-ico{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:color-mix(in oklab,var(--wa-accent) 14%,transparent);color:var(--wa-accent-text)}
.wa-adlg-ico svg{width:24px;height:24px}
.wa-adlg-opt>span:nth-child(2){flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.wa-adlg-opt b{font-weight:600;font-size:15px}
.wa-adlg-opt small{color:var(--wa-sub);font-size:13px;line-height:1.35}
.wa-adlg-opt>svg{flex:none;width:18px;height:18px;color:var(--wa-sub)}
.wa-adlg-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.wa-adlg-row{display:flex;align-items:center;gap:12px;min-height:60px;padding:8px 8px 8px 12px;border:1px solid var(--wa-line);border-radius:12px;background:var(--wa-field)}
.wa-adlg-row .wa-arow-main span{white-space:normal}
.wa-nb{font-style:normal;white-space:nowrap}
.wa-adlg-st{flex:none;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--wa-sub)}
.wa-adlg-st::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--wa-sub)}
.wa-adlg-st[data-s="WORKING"]{color:var(--wa-text)}
.wa-adlg-st[data-s="WORKING"]::before{background:var(--wa-ok)}
.wa-adlg-st[data-s="SCAN_QR_CODE"]::before,.wa-adlg-st[data-s="STARTING"]::before{background:#e0a000}
.wa-adlg-st[data-s="FAILED"]::before{background:var(--wa-danger)}
.wa-adlg-note{display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px 12px;text-align:center;color:var(--wa-sub)}
.wa-adlg-note b{color:var(--wa-text);font-weight:600;font-size:15px}
.wa-adlg-field{display:flex;flex-direction:column;gap:6px}
.wa-adlg-field label{font-size:13px;font-weight:500;color:var(--wa-sub)}
.wa-adlg-field small{font-size:12px;color:var(--wa-sub)}
.wa-adlg-err{margin:0;color:var(--wa-danger);font-size:13px}
.wa-adlg-link{display:flex;flex-direction:column;align-items:center;gap:14px}
.wa-adlg-link .wa-qr-box{width:252px;height:252px;padding:12px}
.wa-adlg-link .wa-qr-box svg,.wa-adlg-link .wa-qr-box img{width:226px;height:226px}
.wa-adlg-link .wa-sess-steps{margin:0;gap:8px;align-self:stretch}
.wa-adlg-link .wa-sess-steps li{font-size:14px;gap:10px}
.wa-adlg-link .wa-sess-steps li::before{width:22px;height:22px;font-size:12px}
.wa-adlg-link .wa-pair{width:100%}
.wa-adlg-link .wa-sess-h{font-size:18px;font-weight:600}
.wa-adlg-link .wa-sess-sub{font-size:14px;margin-bottom:8px}
.wa-adlg-done{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:color-mix(in oklab,var(--wa-ok) 16%,transparent);color:var(--wa-ok)}
.wa-adlg-done svg{width:34px;height:34px}
.wa-adlg-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.wa-adlg-foot>span{display:flex;gap:8px;margin-left:auto}
.wa-adlg-check{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--wa-text);cursor:pointer}
.wa-adlg-check input{margin-top:2px;accent-color:var(--wa-accent)}
.wa-adlg .wa-spin{border-color:color-mix(in srgb,var(--wa-accent) 25%,transparent);border-top-color:var(--wa-accent)}
@media (forced-colors:active){.wa-adlg-opt,.wa-adlg-row{border:1px solid CanvasText}}

@container (max-width:720px){
  /* little room beside the contact's name: the account's colour stays, its name is in the tooltip and the accessible name */
  .wa-chip-acct{padding:0 4px}
  .wa-chip-acct span{display:none}
  .wa-sess{padding:20px 16px}
  .wa-sess-card{grid-template-columns:minmax(0,1fr);gap:24px;justify-items:center}
  .wa-sess-qr{order:-1;width:100%}
  .wa-sess-steps-col{width:100%}
  .wa-qr-box{width:min(294px,100%);height:auto;aspect-ratio:1}
  .wa-sess-h{font-size:24px}
  .wa-sess-steps li{font-size:15px}
  .wa-sess-foot{margin-top:24px}
}
@media (prefers-reduced-motion:reduce){.wa-sess .wa-spin{animation-duration:2.4s}}
@media (forced-colors:active){.wa-qr-box,.wa-code-box{border:1px solid CanvasText}}
`;
export const SESSION_CSS = BASE_CSS + HISTORY_CSS;
