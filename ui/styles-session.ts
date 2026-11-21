// Connection screen, reconnect bar and account menu styles. Appended to the plugin stylesheet (styles.ts); colours only through the --wa-* variables.
// Menus and dialogs are portaled outside .wa-root, so they use the host's styling and nothing here.
export const SESSION_CSS = `
.wa-sess{position:absolute;inset:0;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:32px 24px;background:var(--wa-panel);color:var(--wa-text)}
.wa-sess-in{width:100%;margin:auto 0;display:flex;flex-direction:column;align-items:center}
.wa-sess-card{width:min(900px,100%);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:56px;align-items:center}
.wa-sess-h{margin:0 0 6px;font-size:28px;font-weight:300;line-height:1.2;letter-spacing:-.01em;color:var(--wa-text)}
.wa-sess-sub{margin:0 0 24px;color:var(--wa-sub);font-size:15px;line-height:1.45}
.wa-sess-steps{list-style:none;margin:0 0 24px;padding:0;display:flex;flex-direction:column;gap:14px;counter-reset:wa-step}
.wa-sess-steps li{counter-increment:wa-step;display:flex;align-items:center;gap:14px;font-size:16px;line-height:1.35;color:var(--wa-text)}
.wa-sess-steps li::before{content:counter(wa-step);flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--wa-pill);color:var(--wa-icon);font-size:13px;font-weight:600}
.wa-sess-steps b{font-weight:600}
.wa-sess-qr{display:grid;place-items:center}
.wa-qr-box{position:relative;display:grid;place-items:center;width:294px;height:294px;padding:14px;border:1px solid var(--wa-line);border-radius:18px;background:#fff;box-shadow:0 1px 3px rgba(11,20,26,.08)}
.wa-qr-box svg,.wa-qr-box img{display:block;width:264px;height:264px;max-width:100%;height:auto;aspect-ratio:1;image-rendering:pixelated}
.wa-qr-busy{position:absolute;inset:0;display:grid;place-items:center;border-radius:18px;background:rgba(255,255,255,.78);color:#667781;font-size:13px}
.wa-qr-err{margin:10px 0 0;max-width:294px;text-align:center;color:var(--wa-sub);font-size:13px}
.wa-root .wa-slink{display:inline-flex;align-items:center;gap:8px;width:fit-content;height:auto;min-height:36px;padding:6px 2px;border:0;border-radius:8px;background:transparent;color:var(--wa-green-text);font-size:15px;font-weight:500;cursor:pointer;box-shadow:none}
.wa-root .wa-slink:hover:not(:disabled){background:transparent;color:var(--wa-green-text);text-decoration:underline}
.wa-root .wa-slink:focus-visible,.wa-root .wa-pbtn:focus-visible,.wa-root .wa-obtn:focus-visible,.wa-root .wa-acct:focus-visible,.wa-root .wa-sbar-btn:focus-visible{outline:2px solid var(--wa-green);outline-offset:2px}
.wa-sess-foot{display:flex;align-items:center;justify-content:center;gap:8px;margin:36px 0 0;color:var(--wa-sub);font-size:13px;text-align:center}
.wa-sess-foot svg{flex:none;width:14px;height:14px}

.wa-sess-state{width:min(460px,100%);display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.wa-sess-ico{display:grid;place-items:center;width:72px;height:72px;margin-bottom:8px;border-radius:50%;background:var(--wa-pill);color:var(--wa-icon)}
.wa-sess-ico svg{width:34px;height:34px}
.wa-sess-ico.wa-ok{background:color-mix(in srgb,var(--wa-green) 16%,transparent);color:var(--wa-green-text)}
.wa-sess-ico.wa-warn{background:color-mix(in srgb,#e0a000 18%,transparent);color:#b27c00}
.dark .wa-sess-ico.wa-warn,.wa-root.wa-dark .wa-sess-ico.wa-warn{color:#f0c040}
.wa-sess-ico .wa-spin{width:30px;height:30px;border-width:3px}
.wa-sess-state h2{margin:0;font-size:22px;font-weight:400;line-height:1.25;color:var(--wa-text)}
.wa-sess-state p{margin:0;max-width:42ch;color:var(--wa-sub);font-size:15px;line-height:1.5}
.wa-sess-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:14px}
.wa-root .wa-pbtn,.wa-root .wa-obtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 22px;border-radius:999px;font-size:15px;font-weight:500;cursor:pointer;box-shadow:none}
.wa-root .wa-pbtn{border:0;background:var(--wa-green);color:var(--wa-on-green)}
.wa-root .wa-pbtn:hover:not(:disabled){background:color-mix(in srgb,var(--wa-green) 88%,#000);color:var(--wa-on-green)}
.wa-root .wa-obtn{border:1px solid var(--wa-line);background:var(--wa-panel);color:var(--wa-green-text)}
.wa-root .wa-obtn:hover:not(:disabled){background:var(--wa-hover);color:var(--wa-green-text)}
.wa-root .wa-pbtn:disabled,.wa-root .wa-obtn:disabled{opacity:.55;cursor:default}
.wa-pbtn .wa-spin{width:16px;height:16px;border-width:2px;border-color:color-mix(in srgb,var(--wa-on-green) 35%,transparent);border-top-color:var(--wa-on-green)}

.wa-pair{width:min(460px,100%);display:flex;flex-direction:column;gap:8px}
.wa-pair .wa-sess-sub{margin-bottom:12px}
.wa-pair label{font-size:13px;font-weight:500;color:var(--wa-sub)}
.wa-pair-row{display:flex;gap:10px;align-items:stretch}
.wa-root .wa-pair-row input{flex:1;min-width:0;height:44px;padding:0 16px;border:1px solid var(--wa-line);border-radius:12px;background:var(--wa-field);color:var(--wa-text);font:inherit;font-size:16px;box-shadow:none;outline:0}
.wa-root .wa-pair-row input:focus,.wa-root .wa-pair-row input:focus-visible{border-color:var(--wa-green);box-shadow:0 0 0 1px var(--wa-green);outline:0}
.wa-root .wa-pair-row .wa-pbtn{height:44px;flex:none}
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
.wa-root .wa-sbar-btn{flex:none;height:32px;padding:0 14px;border:1px solid color-mix(in srgb,var(--wa-text) 18%,transparent);border-radius:999px;background:var(--wa-panel);color:var(--wa-text);font-size:13px;font-weight:500;cursor:pointer;box-shadow:none}
.wa-root .wa-sbar-btn:hover:not(:disabled){background:var(--wa-hover);color:var(--wa-text)}
.wa-sbar .wa-spin{flex:none;width:16px;height:16px;border-width:2px}

.wa-root .wa-acct{position:relative;flex:none;display:inline-grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;box-shadow:none}
.wa-root .wa-acct:hover{background:color-mix(in srgb,var(--wa-text) 9%,transparent)}
.wa-acct-av{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:hsl(var(--wa-h,160) 38% var(--wa-avatar-l));color:hsl(var(--wa-h,160) 40% var(--wa-avatar-fg));font-size:13px;font-weight:600;letter-spacing:.02em}
.wa-dot{position:absolute;right:3px;bottom:3px;width:11px;height:11px;border-radius:50%;border:2px solid var(--wa-panel);background:var(--wa-sub)}
.wa-dot[data-s="WORKING"]{background:var(--wa-badge)}
.wa-dot[data-s="STARTING"],.wa-dot[data-s="SCAN_QR_CODE"],.wa-dot[data-s="PASSKEY_REQUIRED"],.wa-dot[data-s="PASSKEY_CONFIRMATION_REQUIRED"]{background:#e0a000}
.wa-dot[data-s="FAILED"],.wa-dot[data-s="UNREACHABLE"],.wa-dot[data-s="UNAUTHORIZED"]{background:var(--destructive,#d92d20)}

@container (max-width:720px){
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
