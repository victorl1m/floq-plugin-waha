// Styles of labels, status, channels, calls and presence. Appended to the plugin stylesheet in styles.ts; colours come from the --wa-* variables.
// Dialogs and menus render in a portal outside .wa-root, so .wa-portal repeats the palette they use.
export const MORE_CSS = `
.wa-root{--wa-ring-seen:#c5ccd0}
.dark .wa-root,.wa-root.wa-dark{--wa-ring-seen:#3b4a54}
.wa-portal{--wa-panel:#ffffff;--wa-bar:#f0f2f5;--wa-field:#ffffff;--wa-pill:#f0f2f5;--wa-hover:#f5f6f6;--wa-active:#e9edef;--wa-line:#e4e8eb;--wa-text:#111b21;--wa-sub:#5f6f79;--wa-icon:#54656f;
  --wa-green:#00a884;--wa-green-text:#008069;--wa-on-green:#ffffff;--wa-danger:#d92b45;font-family:var(--font-sans,system-ui,sans-serif)}
.dark .wa-portal{--wa-panel:#202c33;--wa-bar:#1f2c33;--wa-field:#2a3942;--wa-pill:#2a3942;--wa-hover:#2a3942;--wa-active:#33444e;--wa-line:#2f3b43;--wa-text:#e9edef;--wa-sub:#8696a0;--wa-icon:#aebac1;
  --wa-green:#00a884;--wa-green-text:#21c063;--wa-on-green:#0b141a;--wa-danger:#ff6b81}
.wa-portal *,.wa-portal *::before,.wa-portal *::after{box-sizing:border-box}

/* presence */
.wa-who .wa-presence{display:block;font-size:13px;line-height:18px;color:var(--wa-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-who .wa-presence[data-live="true"]{color:var(--wa-green-text)}

/* labels */
.wa-lchips{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden}
.wa-lchip{flex:0 1 auto;min-width:0;max-width:96px;height:16px;padding:0 6px;border-radius:8px;font-size:11px;font-weight:500;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wa-lchip-more{flex:none;background:var(--wa-pill);color:var(--wa-sub)}
.wa-ldot{flex:none;display:inline-grid;place-items:center;width:12px;height:12px;border-radius:50%}
.wa-ldot-none{background:transparent;border:1.5px solid var(--wa-sub)}
.wa-ldot-lg{width:22px;height:22px}
.wa-ldot-lg svg{width:14px;height:14px;stroke-width:2.6}
.wa-root .wa-lfilter{display:inline-flex;align-items:center;gap:6px}
.wa-lfilter svg{width:15px;height:15px}
.wa-lfilter-name{max-width:110px;overflow:hidden;text-overflow:ellipsis}
.wa-lmenu{min-width:200px;max-width:min(280px,calc(100vw - 24px));padding:6px;background:var(--wa-panel);color:var(--wa-text);border:1px solid var(--wa-line);border-radius:12px}
.wa-lmenu .wa-lmenu-item{display:flex;align-items:center;gap:10px;min-height:36px;padding:0 10px;border-radius:8px;font-size:14px;color:var(--wa-text);cursor:pointer}
.wa-lmenu .wa-lmenu-item:hover,.wa-lmenu .wa-lmenu-item:focus,.wa-lmenu .wa-lmenu-item[data-highlighted]{background:var(--wa-hover);color:var(--wa-text);outline:0}
.wa-lmenu-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-lmenu-check{margin-left:auto;width:16px;height:16px;color:var(--wa-green-text);flex:none}

.wa-dlg{width:min(440px,calc(100vw - 24px));max-width:none;max-height:min(640px,calc(100vh - 32px));overflow:auto;padding:22px 20px 16px;gap:14px;background:var(--wa-panel);color:var(--wa-text);border:1px solid var(--wa-line);border-radius:18px}
.wa-dlg [data-slot="dialog-title"]{margin:0;font-size:19px;font-weight:600;letter-spacing:-.01em;line-height:1.25;color:var(--wa-text)}
.wa-dlg [data-slot="dialog-description"]{margin:2px 0 0;font-size:13.5px;line-height:1.4;color:var(--wa-sub)}
.wa-dlg [data-slot="dialog-header"]{text-align:left}
.wa-dlg input[type="text"],.wa-dlg [data-slot="input"]{width:100%;height:40px;padding:0 12px;border:1px solid var(--wa-line);border-radius:10px;background:var(--wa-field);color:var(--wa-text);font:inherit;font-size:14.5px;box-shadow:none}
.wa-dlg [data-slot="input"]:focus-visible,.wa-dlg input[type="text"]:focus-visible{outline:0;border-color:var(--wa-green);box-shadow:0 0 0 1px var(--wa-green)}
.wa-dlg .wa-dbtn{height:36px;padding:0 16px;border-radius:999px;font-size:14px;font-weight:500;color:var(--wa-green-text);background:transparent;border:0;box-shadow:none;cursor:pointer}
.wa-dlg .wa-dbtn:hover:not(:disabled){background:color-mix(in srgb,var(--wa-green) 12%,transparent);color:var(--wa-green-text)}
.wa-dlg .wa-dbtn:disabled{opacity:.5;cursor:default}
.wa-dlg .wa-dprimary,.wa-dlg .wa-dprimary:hover:not(:disabled){background:var(--wa-green);color:#fff}
.wa-dlg .wa-dprimary:hover:not(:disabled){background:color-mix(in srgb,var(--wa-green) 88%,#000)}
.wa-dlg .wa-ddanger,.wa-dlg .wa-ddanger:hover:not(:disabled){color:var(--wa-danger)}
.wa-dlg .wa-dbtn:focus-visible,.wa-lcheck:focus-visible,.wa-lmini:focus-visible,.wa-ladd:focus-visible,.wa-swatch:focus-visible,.wa-sc-drop:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px}
.wa-lcheck:focus-visible,.wa-ladd:focus-visible{outline-offset:-2px}
.wa-dfoot{display:flex;flex-direction:row;justify-content:flex-end;gap:8px;margin-top:2px}
.wa-llist{display:flex;flex-direction:column;gap:2px;margin:0 -6px;padding:0 6px}
.wa-llist>*{flex:none}
.wa-lrow{display:flex;align-items:center;gap:4px;min-height:44px;border-radius:10px}
.wa-lrow:hover{background:var(--wa-hover)}
.wa-lrow-edit{display:block;padding:8px;background:var(--wa-bar)}
.wa-lrow-edit:hover{background:var(--wa-bar)}
.wa-lcheck{flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:44px;padding:0 8px;border:0;border-radius:10px;background:transparent;color:var(--wa-text);font:inherit;font-size:15px;text-align:left;cursor:pointer}
.wa-lname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-lbtns{display:flex;gap:0;flex:none;opacity:.0}
.wa-lrow:hover .wa-lbtns,.wa-lrow:focus-within .wa-lbtns{opacity:1}
@media (hover:none){.wa-lbtns{opacity:1}}
.wa-lmini{display:inline-grid;place-items:center;width:32px;height:32px;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer}
.wa-lmini:hover{background:color-mix(in srgb,var(--wa-text) 10%,transparent)}
.wa-lmini svg{width:17px;height:17px}
.wa-lconfirm{display:inline-flex;align-items:center;gap:2px;flex:none;font-size:13px;color:var(--wa-sub)}
.wa-ladd{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 8px;border:0;border-radius:10px;background:transparent;color:var(--wa-green-text);font:inherit;font-size:15px;font-weight:500;cursor:pointer}
.wa-ladd:hover{background:var(--wa-hover)}
.wa-ladd svg{width:20px;height:20px}
.wa-lempty{display:flex;align-items:center;justify-content:center;gap:10px;padding:22px 8px;color:var(--wa-sub);font-size:14px;text-align:center}
.wa-leditor{display:flex;flex-direction:column;gap:10px}
.wa-lactions{display:flex;justify-content:flex-end;gap:6px}
.wa-swatches{display:grid;grid-template-columns:repeat(10,1fr);gap:6px}
.wa-swatch{display:grid;place-items:center;aspect-ratio:1;min-width:0;padding:0;border:2px solid transparent;border-radius:50%;cursor:pointer}
.wa-swatch[aria-checked="true"]{border-color:var(--wa-panel);box-shadow:0 0 0 2px var(--wa-text)}
.wa-swatch svg{width:60%;height:60%;stroke-width:2.6}
.wa-swatches-bg{grid-template-columns:repeat(8,1fr)}

/* status */
.wa-sv{position:relative;flex:1;background:var(--wa-panel)}
.wa-ring{flex:none;display:grid;place-items:center;width:52px;height:52px;padding:3px;border-radius:50%}
.wa-ring[data-empty="true"]{background:transparent;padding:0}
.wa-ring-in{position:relative;display:grid;place-items:center;width:100%;height:100%;border:2px solid var(--wa-panel);border-radius:50%;overflow:hidden;background:var(--wa-panel)}
.wa-ring[data-empty="true"] .wa-ring-in{border:0;overflow:visible}
.wa-ring-in img{width:100%;height:100%;object-fit:cover;display:block}
.wa-ring-in .wa-avatar{width:100%;height:100%}
.wa-ring[data-empty="true"] .wa-avatar{width:49px;height:49px}
.wa-ring-plus{position:absolute;right:-3px;bottom:-3px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--wa-green);color:#fff;border:2px solid var(--wa-panel)}
.wa-ring-plus svg{width:12px;height:12px;stroke-width:2.6}
.wa-ring[data-empty="true"] .wa-ring-in{box-shadow:none}
.wa-ring-lg{width:56px;height:56px}
.wa-row.wa-srow{padding-left:12px}
.wa-srow>.wa-ring{align-self:center;margin-right:12px}
.wa-list .wa-ssec{padding:14px 16px 6px;font-size:13px;font-weight:500;color:var(--wa-green-text);list-style:none}
.wa-root .wa-fab{position:absolute;right:16px;bottom:16px;display:grid;place-items:center;width:52px;height:52px;padding:0;border:0;border-radius:16px;background:var(--wa-green);color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(11,20,26,.3)}
.wa-root .wa-fab:hover{background:color-mix(in srgb,var(--wa-green) 88%,#000)}
.wa-root .wa-fab:focus-visible{outline:2px solid var(--wa-text);outline-offset:2px}
.wa-fab svg{width:24px;height:24px}

.wa-story{position:fixed;inset:0;z-index:60;display:flex;justify-content:center;background:#0b141a;color:#fff;outline:0}
.wa-story-col{position:relative;display:flex;flex-direction:column;width:min(100%,460px);height:100%;min-height:0}
.wa-story-bars{display:flex;gap:4px;padding:10px 12px 0}
.wa-story-bars span{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.3);overflow:hidden}
.wa-story-bars i{display:block;height:100%;background:#fff}
.wa-story-head{display:flex;align-items:center;gap:10px;padding:10px 12px;min-height:60px}
.wa-story-head .wa-ring{width:40px;height:40px;padding:0}
.wa-story-head .wa-ring-in{border:0;background:transparent}
.wa-story-head .wa-ring[data-empty="true"] .wa-avatar{width:40px;height:40px;font-size:14px}
.wa-story-who{flex:1;min-width:0;display:flex;flex-direction:column}
.wa-story-who b{font-size:15px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-story-who time{font-size:12.5px;line-height:16px;color:rgba(255,255,255,.72)}
.wa-story-confirm{display:inline-flex;align-items:center;gap:2px;font-size:13px}
.wa-story .wa-dbtn{height:32px;padding:0 12px;border-radius:999px;border:0;background:transparent;color:#fff;font-size:13.5px;font-weight:500;cursor:pointer}
.wa-story .wa-dbtn:hover:not(:disabled){background:rgba(255,255,255,.14);color:#fff}
.wa-story .wa-ddanger,.wa-story .wa-ddanger:hover:not(:disabled){color:#ff8a9b}
.wa-story-btn{display:inline-grid;place-items:center;flex:none;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:transparent;color:#fff;cursor:pointer}
.wa-story-btn:hover{background:rgba(255,255,255,.14)}
.wa-story-btn svg{width:22px;height:22px}
.wa-story-btn:focus-visible,.wa-story-nav:focus-visible,.wa-story .wa-dbtn:focus-visible{outline:2px solid #fff;outline-offset:-2px}
.wa-story-body{position:relative;flex:1;min-height:0;display:grid;place-items:center;overflow:hidden;border-radius:12px;margin:0 8px 12px;background:#111b21}
.wa-story-body img,.wa-story-body video{max-width:100%;max-height:100%;object-fit:contain}
.wa-story-body audio{width:min(86%,360px)}
.wa-story-text{margin:0;padding:24px 56px;max-width:100%;font-size:clamp(20px,5.5cqw,30px);font-weight:500;line-height:1.3;text-align:center;overflow-wrap:anywhere;white-space:pre-wrap}
.wa-story-caption{position:absolute;left:0;right:0;bottom:0;margin:0;padding:28px 56px 16px;font-size:15px;line-height:1.35;text-align:center;overflow-wrap:anywhere;background:linear-gradient(transparent,rgba(0,0,0,.65));pointer-events:none}
.wa-story-body[data-type="video"] .wa-story-caption{bottom:56px}
.wa-story-nav{position:absolute;top:0;bottom:0;width:48px;display:grid;place-items:center;padding:0;border:0;background:transparent;color:#fff;cursor:pointer;opacity:.0}
.wa-story-nav:hover,.wa-story-nav:focus-visible{opacity:1;background:linear-gradient(90deg,rgba(0,0,0,.3),transparent)}
.wa-story-next:hover,.wa-story-next:focus-visible{background:linear-gradient(270deg,rgba(0,0,0,.3),transparent)}
.wa-story-nav:disabled{display:none}
.wa-story-nav svg{width:26px;height:26px}
.wa-story-prev{left:0}.wa-story-next{right:0}
.wa-story-missing{display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px;color:rgba(255,255,255,.75);font-size:14px;text-align:center}
.wa-story-missing .wa-spin{border-color:rgba(255,255,255,.25);border-top-color:#fff}

.wa-sc{width:min(440px,calc(100vw - 24px))}
.wa-sc-tabs{display:flex;gap:8px}
.wa-sc-tabs .wa-chip{display:inline-flex;align-items:center;gap:6px;border:0;height:34px;padding:0 14px;border-radius:999px;background:var(--wa-pill);color:var(--wa-sub);font-size:14px;line-height:1;cursor:pointer}
.wa-sc-tabs .wa-chip:hover{background:var(--wa-active)}
.wa-sc-tabs .wa-chip[aria-selected="true"]{background:color-mix(in srgb,var(--wa-green) 20%,var(--wa-panel));color:var(--wa-green-text);font-weight:500}
.wa-sc-tabs .wa-chip:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px}
.wa-sc-tabs .wa-chip svg{width:16px;height:16px}
.wa-sc-preview{display:grid;place-items:center;height:220px;border-radius:14px;overflow:hidden;padding:16px}
.wa-sc-preview textarea{width:100%;height:100%;resize:none;border:0;outline:0;background:transparent;box-shadow:none;color:#fff;font:inherit;font-size:22px;font-weight:500;line-height:1.3;text-align:center;padding:56px 0 0}
.wa-sc-preview textarea::placeholder{color:rgba(255,255,255,.7);opacity:1}
.wa-sc-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:200px;border:1.5px dashed var(--wa-line);border-radius:14px;background:var(--wa-bar);color:var(--wa-sub);font:inherit;cursor:pointer}
.wa-sc-drop:hover{border-color:var(--wa-green)}
.wa-sc-drop svg{width:30px;height:30px}
.wa-sc-drop b{color:var(--wa-text);font-weight:500;font-size:15px}
.wa-sc-media{display:grid;place-items:center;height:240px;border-radius:14px;overflow:hidden;background:#0b141a}
.wa-sc-media img,.wa-sc-media video{max-width:100%;max-height:100%;object-fit:contain}
.wa-sc-cap{display:flex;align-items:center;gap:8px}
.wa-sc-cap input{flex:1;min-width:0}

/* channels */
.wa-cv{flex:1;background:var(--wa-panel)}
.wa-cv-open{background:var(--wa-wall)}
.wa-cv-open .wa-bubble{max-width:88%}
.wa-cv>.wa-search{margin-bottom:6px}
.wa-chrow{display:flex;align-items:center}
.wa-chrow>.wa-row{flex:1;min-width:0}
.wa-root .wa-follow{flex:none;margin:0 12px 0 0;height:32px;padding:0 14px}
.wa-chat-head .wa-follow{margin:0}
.wa-cavatar{overflow:hidden}
.wa-cavatar img{width:100%;height:100%;object-fit:cover;display:block}
.wa-verified{display:inline-block;flex:none;width:15px;height:15px;margin-left:4px;color:var(--wa-green);vertical-align:-2px}
.wa-line .wa-verified{margin-left:0}
.wa-chrow .wa-name{flex:0 1 auto}
.wa-readonly{flex:none;padding:12px 16px;background:var(--wa-bar);border-top:1px solid var(--wa-line);color:var(--wa-sub);font-size:13px;line-height:1.4;text-align:center}
.wa-views{margin-right:8px}
.wa-creacts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;font-size:12.5px;color:var(--wa-meta)}
.wa-creacts span{padding:1px 8px;border-radius:999px;background:color-mix(in srgb,var(--wa-text) 8%,transparent)}
.wa-cv .wa-chat-head .wa-who b{display:flex;align-items:center}

/* incoming call */
.wa-call{position:absolute;top:10px;left:50%;z-index:40;transform:translateX(-50%);display:flex;align-items:center;gap:12px;width:min(560px,calc(100% - 20px));padding:10px 12px;border-radius:16px;background:var(--wa-panel);color:var(--wa-text);border:1px solid var(--wa-line);box-shadow:0 8px 28px rgba(11,20,26,.28);animation:wa-call-in .22s ease-out}
.wa-call-avatar{position:relative;flex:none;display:inline-grid}
.wa-call-avatar .wa-avatar{width:44px;height:44px}
.wa-call-badge{position:absolute;right:-4px;bottom:-4px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--wa-green);color:#fff;border:2px solid var(--wa-panel);animation:wa-call-ring 1.4s ease-in-out infinite}
.wa-call-badge svg{width:11px;height:11px;stroke-width:2.2}
.wa-call-text{flex:1;min-width:0;display:flex;flex-direction:column}
.wa-call-text b{font-size:15px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-call-text span{font-size:13.5px;line-height:18px;color:var(--wa-green-text)}
.wa-call-text small{font-size:12px;line-height:16px;color:var(--wa-sub)}
.wa-root .wa-call-decline{flex:none;display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 16px;border:0;border-radius:999px;background:#d92b45;color:#fff;font-size:14px;font-weight:500;cursor:pointer;box-shadow:none}
.wa-root .wa-call-decline:hover:not(:disabled){background:#b8213a;color:#fff}
.wa-root .wa-call-decline:disabled{opacity:.6}
.wa-root .wa-call-decline:focus-visible{outline:2px solid var(--wa-text);outline-offset:2px}
.wa-call-decline svg{width:18px;height:18px}
@keyframes wa-call-in{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes wa-call-ring{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
@container (max-width:720px){
  .wa-call{padding:8px 10px;gap:10px}
  .wa-call-text small{display:none}
  .wa-root .wa-call-decline{padding:0 12px}
  .wa-story-text{padding:24px 44px}
  .wa-swatches{grid-template-columns:repeat(10,1fr);gap:4px}
}
@media (max-width:480px){.wa-call-text small{display:none}.wa-swatches{gap:4px}.wa-dlg{padding:18px 14px 12px}}
@media (prefers-reduced-motion:reduce){.wa-call,.wa-call-badge{animation:none}}
`;
