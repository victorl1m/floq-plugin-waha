// Styles of the chat menu, the info panel and the new chat / group dialogs. Appended to the plugin stylesheet in styles.ts (PEOPLE_CSS).
// Panels live inside .wa-root and use its --wa-* variables. Dialogs and menus are portalled to <body>, outside .wa-root: .wa-dlg re-declares the
// variables it needs from the host theme (so light and dark follow the app) plus the WhatsApp green.
export const PEOPLE_CSS = `
.wa-dlg{--wa-green:#00a884;--wa-green-text:#008069;--wa-on-green:#fff;--wa-danger:#d4183d;--wa-text:var(--foreground,#111b21);--wa-sub:var(--muted-foreground,#5f6f79);--wa-line:var(--border,#e4e8eb);
  --wa-hover:color-mix(in srgb,var(--foreground,#000) 6%,transparent);--wa-active:color-mix(in srgb,var(--foreground,#000) 11%,transparent);--wa-icon:var(--muted-foreground,#54656f);--wa-pill:color-mix(in srgb,var(--foreground,#000) 7%,transparent);
  --wa-avatar-l:86%;--wa-avatar-fg:32%;display:flex;flex-direction:column;gap:14px;min-width:0;font-size:14px;line-height:1.4;color:var(--wa-text)}
.dark .wa-dlg{--wa-green-text:#21c063;--wa-danger:#f15c6d;--wa-avatar-l:26%;--wa-avatar-fg:82%}
.wa-dlg *,.wa-dlg *::before,.wa-dlg *::after{box-sizing:border-box}
.wa-dlg button{font:inherit}
.wa-dialog{width:min(440px,calc(100vw - 2rem));max-width:min(440px,calc(100vw - 2rem))}
.wa-dialog-sm{width:min(380px,calc(100vw - 2rem));max-width:min(380px,calc(100vw - 2rem))}
.wa-dlg-title{display:flex;align-items:center;gap:6px;min-height:36px}
.wa-dlg-title .wa-iconbtn{margin-left:-8px}
.wa-dlg-title [data-slot=dialog-title]{font-size:17px;line-height:1.3}
.wa-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.wa-dlg .wa-iconbtn,.wa-info .wa-iconbtn.wa-mini{flex:none;display:inline-grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer;box-shadow:none}
.wa-dlg .wa-iconbtn:hover{background:var(--wa-hover);color:var(--wa-text)}
.wa-dlg .wa-iconbtn svg{width:22px;height:22px}
.wa-dlg-foot.wa-dlg-foot{margin:0;padding:0;border:0;background:transparent;border-radius:0;flex-direction:row;justify-content:flex-end;gap:8px}
.wa-dlg-foot svg{width:16px;height:16px;margin-right:6px}
.wa-dlg-note{display:flex;align-items:center;justify-content:center;gap:10px;padding:28px 16px;text-align:center;color:var(--wa-sub);overflow-wrap:anywhere}
.wa-dlg-note .wa-spin,.wa-info-state .wa-spin{border-color:color-mix(in srgb,var(--wa-green) 25%,transparent);border-top-color:var(--wa-green)}

/* the host's primary button is the app accent; inside these dialogs it is WhatsApp green */
:is(.wa-dlg,.wa-info) button[data-variant="default"],:is(.wa-dlg,.wa-info) [data-floq-variant="default"]{background:var(--wa-green);background-image:none;color:var(--wa-on-green);border-color:transparent;box-shadow:none}
:is(.wa-dlg,.wa-info) button[data-variant="default"]:hover:not(:disabled),:is(.wa-dlg,.wa-info) [data-floq-variant="default"]:hover:not(:disabled){background:color-mix(in srgb,var(--wa-green) 88%,#000)}
:is(.wa-dlg,.wa-info) button[data-variant="default"]:disabled{opacity:.5}

:is(.wa-dlg,.wa-info) [data-slot="input"]:focus-visible,.wa-info [data-slot="textarea"]:focus-visible{border-color:var(--wa-green);box-shadow:0 0 0 2px color-mix(in srgb,var(--wa-green) 35%,transparent);outline:0}

/* avatar with a picture */
.wa-pic{flex:none;position:relative;display:inline-grid;place-items:center;width:40px;height:40px;border-radius:50%;overflow:hidden;font-size:14.5px}
.wa-pic-md{width:49px;height:49px;font-size:17px}
.wa-pic-xl{width:140px;height:140px;font-size:46px}
.wa-pic .wa-avatar{width:100%;height:100%;font-size:inherit}
.wa-pic img{display:block;width:100%;height:100%;object-fit:cover}
.wa-pic-green{background:var(--wa-green);color:var(--wa-on-green)}
.wa-pic-green svg{width:55%;height:55%}

/* contact picker */
.wa-picker{display:flex;flex-direction:column;gap:10px;min-height:0}
.wa-chosen{display:flex;flex-wrap:wrap;gap:6px;max-height:84px;margin:0;padding:0;overflow-y:auto;list-style:none}
.wa-chosen li{margin:0}
.wa-tag{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:3px 4px 3px 11px;border-radius:999px;background:color-mix(in srgb,var(--wa-green) 18%,transparent);color:var(--wa-text);font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-tag button{display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}
.wa-tag button:hover{background:var(--wa-active)}
.wa-tag button svg{width:13px;height:13px}
.wa-find{position:relative;flex:none}
.wa-find>svg{position:absolute;left:13px;top:50%;width:17px;height:17px;transform:translateY(-50%);color:var(--wa-sub);pointer-events:none}
.wa-find input{display:block;width:100%;height:38px;padding:0 14px 0 40px;border:1px solid transparent;border-radius:999px;background:var(--wa-pill);color:var(--wa-text);font:inherit;font-size:14px;box-shadow:none;outline:0}
.wa-find input::placeholder{color:var(--wa-sub);opacity:1}
.wa-find input:focus,.wa-find input:focus-visible{border-color:var(--wa-green);box-shadow:0 0 0 1px var(--wa-green);outline:0}
.wa-picklist{height:min(340px,calc(100dvh - 330px));min-height:180px;margin:0 -6px;padding:0 6px;overflow-y:auto;scrollbar-width:thin}
.wa-picklist ul{list-style:none;margin:0;padding:0}
.wa-picklist li{margin:0}
.wa-pickrow{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;margin:0;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:var(--wa-text);text-align:left;cursor:pointer}
.wa-pickrow:hover{background:var(--wa-hover)}
.wa-pickrow[aria-pressed="true"]{background:color-mix(in srgb,var(--wa-green) 12%,transparent)}
.wa-pickrow:focus-visible,.wa-info-row:focus-visible,.wa-member-main:focus-visible,.wa-seg button:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-pickbody{flex:1;min-width:0;display:flex;flex-direction:column}
.wa-pickbody b{font-size:15px;font-weight:500;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-pickbody span{font-size:13px;line-height:18px;color:var(--wa-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-ptk{flex:none;display:grid;place-items:center;width:22px;height:22px;margin-left:auto;border:1.5px solid var(--wa-line);border-radius:50%;color:var(--wa-on-green)}
.wa-pickrow[aria-pressed="true"] .wa-ptk{border-color:var(--wa-green);background:var(--wa-green)}
.wa-ptk svg{width:14px;height:14px;stroke-width:2.6}
.wa-pickaction .wa-pickbody b{color:var(--wa-text)}
.wa-pchev{flex:none;width:18px;height:18px;margin-left:auto;color:var(--wa-sub)}

/* new chat */
.wa-seg{display:flex;gap:4px;padding:3px;border-radius:999px;background:var(--wa-pill)}
.wa-seg button{flex:1;height:32px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:var(--wa-sub);font-size:13.5px;cursor:pointer;white-space:nowrap}
.wa-seg button[aria-pressed="true"]{background:var(--popover,#fff);color:var(--wa-text);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.14)}
.wa-numform{display:flex;flex-direction:column;gap:8px}
.wa-numform label{font-size:13px;font-weight:500;color:var(--wa-sub)}
.wa-numrow{display:flex;gap:8px;min-width:0}
.wa-numrow>*:last-child{flex:1;min-width:0}
.wa-country{flex:none;width:150px}
.wa-error{margin:0;color:var(--wa-danger);font-size:13px}
.wa-hint{display:flex;align-items:center;gap:8px;margin:2px 0 6px;color:var(--wa-sub);font-size:13px}
.wa-hint svg{flex:none;width:15px;height:15px}
.wa-groupname{display:flex;align-items:flex-end;gap:12px}
.wa-groupname>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.wa-faces{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.wa-faces li{margin:0}
.wa-faces .wa-pic{width:34px;height:34px;font-size:12.5px}

/* invite link, merge */
.wa-linkbox{display:flex;align-items:center;gap:10px;padding:0 12px;height:42px;border-radius:10px;background:var(--wa-pill);color:var(--wa-icon)}
.wa-linkbox svg{flex:none;width:18px;height:18px}
.wa-linkfield{flex:1;min-width:0;height:100%;padding:0;border:0;background:transparent;color:var(--wa-text);font:inherit;font-size:13.5px;outline:0;text-overflow:ellipsis}
.wa-merge{display:grid;grid-template-columns:auto auto auto;justify-content:center;align-items:center;gap:14px;padding:6px 0}
.wa-merge .wa-pic{width:56px;height:56px;font-size:19px}
.wa-merge-ico{width:28px;height:28px;color:var(--wa-sub)}
.wa-merge p{grid-column:1/-1;margin:6px 0 0;text-align:center;color:var(--wa-sub);overflow-wrap:anywhere}
.wa-merge p b{color:var(--wa-text);font-weight:500}

/* menus (portalled) */
.wa-menu{width:236px}
.wa-menu [role=menuitem]{min-height:34px}
.wa-menu-sub{width:150px}

/* info panel */
.wa-info{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--wa-bar);border-left:1px solid var(--wa-line);color:var(--wa-text)}
.wa-info-head{background:var(--wa-bar);border-bottom:1px solid var(--wa-line);gap:10px;padding:0 12px}
.wa-info-head .wa-iconbtn{margin-left:0}
.wa-info-title{margin:0;flex:1;min-width:0;font-size:16px;font-weight:500;line-height:21px;color:var(--wa-text)}
.wa-info-scroll{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--wa-text) 22%,transparent) transparent}
.wa-info-state{height:100%}
.wa-card{margin:0 0 8px;padding:14px 24px;background:var(--wa-panel);box-shadow:var(--wa-shadow)}
.wa-info-scroll>.wa-card:first-child{margin-top:0}
.wa-hero-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 24px 22px;text-align:center}
.wa-hero-card .wa-pic{margin-bottom:10px}
.wa-info-name{display:flex;align-items:center;justify-content:center;gap:4px;max-width:100%;margin:0;font-size:22px;font-weight:400;line-height:28px;letter-spacing:-.01em;color:var(--wa-text);overflow-wrap:anywhere}
.wa-info-sub{margin:0;font-size:15px;line-height:20px;color:var(--wa-sub)}
.wa-badge-pill{display:inline-block;margin-top:4px;padding:2px 10px;border-radius:999px;background:color-mix(in srgb,var(--wa-green) 16%,transparent);color:var(--wa-green-text);font-size:12.5px;font-weight:500}
.wa-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 6px;font-size:14px;font-weight:400;line-height:20px;color:var(--wa-sub)}
.wa-label .wa-mini{margin:-8px -10px -8px 0}
.wa-about{margin:0;font-size:15px;line-height:21px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--wa-text)}
.wa-fine{margin:0;padding:8px 0 2px;font-size:12.5px;line-height:17px;color:var(--wa-sub)}
.wa-fine.wa-flat{padding:4px 0 0}
.wa-rows{padding:6px 0}
.wa-rows>.wa-fine{padding:6px 24px 8px}
.wa-info-row{display:flex;align-items:center;gap:20px;width:100%;min-height:48px;margin:0;padding:10px 24px;border:0;border-radius:0;background:transparent;color:var(--wa-text);font-size:15px;line-height:20px;text-align:left;cursor:pointer}
.wa-info-row:hover{background:var(--wa-hover)}
.wa-info-row>svg{flex:none;width:22px;height:22px;color:var(--wa-icon)}
.wa-info-row>span:not(.wa-pic){flex:1;min-width:0;overflow-wrap:anywhere}
.wa-info-row .wa-pic{margin:-6px -2px -6px -4px}
.wa-info-row .wa-spin{width:20px;height:20px;margin:1px}
.wa-info-row.wa-danger,.wa-info-row.wa-danger>svg{color:var(--wa-danger)}
.wa-edit{display:flex;flex-direction:column;gap:8px;width:100%;text-align:left}
.wa-edit-actions{display:flex;justify-content:flex-end;gap:6px}
.wa-switches{display:flex;flex-direction:column;gap:2px}
.wa-switch{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 0;cursor:pointer}
.wa-switch span{display:flex;flex-direction:column;min-width:0}
.wa-switch b{font-size:15px;font-weight:400;line-height:20px}
.wa-switch small{font-size:12.5px;line-height:17px;color:var(--wa-sub)}
.wa-people{padding:10px 0 6px}
.wa-people-head{display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 24px}
.wa-people-head .wa-label{margin:0}
.wa-people .wa-find{margin:4px 16px 8px}
.wa-members{list-style:none;margin:0;padding:0}
.wa-member{position:relative;display:flex;align-items:center;margin:0;content-visibility:auto;contain-intrinsic-size:auto 60px}
.wa-member:hover{background:var(--wa-hover)}
.wa-member-main{flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:60px;margin:0;padding:8px 6px 8px 24px;border:0;background:transparent;color:var(--wa-text);text-align:left;cursor:pointer}
.wa-member-main:disabled{cursor:default}
.wa-member-main .wa-pickbody{flex:1 1 0}
.wa-role{flex:none;display:inline-flex;align-items:center;gap:4px;padding:1px 8px 1px 6px;border:1px solid color-mix(in srgb,var(--wa-green) 55%,transparent);border-radius:6px;color:var(--wa-green-text);font-size:11.5px;line-height:17px;white-space:nowrap}
.wa-role svg{width:12px;height:12px}
.wa-root .wa-member-menu{flex:none;width:36px;height:36px;margin-right:8px;opacity:0}
.wa-member:hover .wa-member-menu,.wa-member:focus-within .wa-member-menu,.wa-member-menu[data-state=open]{opacity:1}
.wa-member:not(:has(.wa-member-menu)) .wa-member-main{padding-right:16px}
@media (hover:none){.wa-root .wa-member-menu{opacity:1}}

/* demo (people-demo.tsx) */
.wa-demo-list{position:relative;display:flex;flex-direction:column;min-height:0;min-width:0}
.wa-demo-list>.wa-list-pane{flex:1}
.wa-root .wa-demo-fab{position:absolute;right:16px;bottom:16px;width:52px;height:52px;border-radius:16px;background:var(--wa-green);color:var(--wa-on-green);box-shadow:0 2px 8px rgba(11,20,26,.3)}
.wa-root .wa-demo-fab svg{width:24px;height:24px}

/* layout: a third column when the inbox is wide, an overlay when it is not */
@container (min-width:1000px){
  .wa-panel:has(>.wa-info){grid-template-columns:clamp(300px,29%,400px) minmax(0,1fr) clamp(320px,29%,380px)}
}
@container (max-width:720px){
  .wa-root[data-pane="chat"] .wa-demo-list{display:none}
  .wa-root[data-pane="list"] .wa-demo-list{display:flex}
}
@container (max-width:999px){
  .wa-info{position:absolute;top:0;right:0;bottom:0;z-index:30;width:min(400px,100%);box-shadow:-10px 0 30px rgba(11,20,26,.28)}
}
@media (prefers-reduced-motion:no-preference){
  @container (max-width:999px){.wa-info{animation:wa-slide .18s ease-out}}
  .wa-pickrow,.wa-info-row,.wa-member,.wa-root .wa-member-menu,.wa-seg button{transition:background-color .12s ease,opacity .12s ease}
}
@keyframes wa-slide{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}
@media (forced-colors:active){.wa-info{border-left:1px solid CanvasText}.wa-pickrow[aria-pressed="true"]{outline:2px solid Highlight}}
`;
