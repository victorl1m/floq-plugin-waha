// Styles of the conversation log: bubbles, media, menus, lightbox, dialogs. Appended to the plugin stylesheet in styles.ts.
// Dialogs render in a portal outside .wa-root, so .wa-dlg repeats the palette variables they need.
export const BUBBLES_CSS = `
.wa-root{--wa-tick-read:#53bdeb;--wa-link:#027eb5;--wa-red:#e5484d;--wa-mark:#ffe08a;--wa-map-bg:#e8e6df;--wa-map-road:#ffffff;--wa-map-park:#c3e2bb;--wa-map-main:#f6e2a0}
.dark .wa-root,.wa-root.wa-dark{--wa-link:#53bdeb;--wa-red:#f2777b;--wa-mark:#8a6d00;--wa-map-bg:#1f2b31;--wa-map-road:#34444c;--wa-map-park:#21402f;--wa-map-main:#4a4326}

/* bubbles: structure */
.wa-bw{display:flex;flex-direction:column;align-items:flex-start;min-width:0;max-width:min(65%,560px)}
.wa-bubble{--wa-bb:var(--wa-in);white-space:normal;max-width:100%;min-width:84px}
.wa-mine .wa-bubble{--wa-bb:var(--wa-out)}
.wa-p{white-space:pre-wrap;overflow-wrap:anywhere}
.wa-text{min-width:0}
.wa-pad{display:inline-block;height:1px;vertical-align:bottom}
.wa-pre{margin:3px 0;padding:6px 9px;border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent);font:12.5px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;overflow-x:auto}
.wa-code{padding:0 3px;border-radius:4px;background:color-mix(in srgb,var(--wa-text) 9%,transparent);font:.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.wa-bq{margin:3px 0;padding:1px 0 1px 9px;border-left:4px solid color-mix(in srgb,var(--wa-text) 25%,transparent);color:color-mix(in srgb,var(--wa-text) 80%,var(--wa-bb));white-space:pre-wrap;overflow-wrap:anywhere}
.wa-ul,.wa-ol{margin:2px 0;padding-left:22px;white-space:normal}
.wa-ul{list-style:disc outside}
.wa-ol{list-style:decimal outside}
.wa-ul li,.wa-ol li{padding-left:2px;white-space:pre-wrap;overflow-wrap:anywhere}
.wa-link{color:var(--wa-link);text-decoration:none;overflow-wrap:anywhere}
.wa-link:hover{text-decoration:underline}
.wa-link:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px;border-radius:2px}
.wa-at{padding:0 2px;border-radius:4px;background:color-mix(in srgb,var(--wa-green) 16%,transparent);color:var(--wa-green-text);font-weight:500}
.wa-mark{padding:0 1px;border-radius:2px;background:var(--wa-mark);color:inherit}
.wa-emoji-big{font-size:34px;line-height:1.2;white-space:pre-wrap}
.wa-emoji-big[data-n="1"]{font-size:48px;line-height:1.1}
.wa-emoji-big[data-n="2"]{font-size:40px}
.wa-fwd{display:flex;align-items:center;gap:5px;margin-bottom:2px;font-size:12.5px;font-style:italic;line-height:18px;color:var(--wa-meta)}
.wa-fwd svg{width:14px;height:14px}
.wa-unsupported{display:block}

/* time row */
.wa-stamp{float:none;gap:4px;margin:0;height:15px}
.wa-stamp-inline{position:absolute;right:8px;bottom:5px}
.wa-stamp-flow{display:flex;justify-content:flex-end;margin:2px -2px -3px 0}
.wa-stamp-over{position:absolute;right:8px;bottom:7px;padding:1px 6px;border-radius:9px;background:rgba(11,20,26,.52);color:#fff!important}
.wa-stamp-over .wa-tick{color:#fff}
.wa-stamp .wa-tick{width:16px;height:16px;color:var(--wa-tick);stroke-width:2}
.wa-stamp .wa-tick-read{color:var(--wa-tick-read)}
.wa-stamp .wa-tick-failed{color:var(--wa-red)}
.wa-stamp .wa-st-ico{width:12px;height:12px;stroke-width:2}
.wa-edited{font-style:italic}
.wa-bubble{padding-bottom:7px}

/* hover tools */
.wa-chev{position:absolute;top:2px;right:3px;z-index:2;display:grid;place-items:center;width:26px;height:22px;padding:0;border:0;border-radius:6px;color:var(--wa-icon);cursor:pointer;opacity:0;background:linear-gradient(to left,var(--wa-bb) 55%,transparent)}
.wa-chev svg{width:18px;height:18px}
.wa-bubble:hover .wa-chev,.wa-chev:focus-visible,.wa-chev[aria-expanded="true"]{opacity:1}
.wa-chev:focus-visible{outline:2px solid var(--wa-green);outline-offset:-1px}
.wa-has-media .wa-chev,.wa-b-media .wa-chev{color:#fff;background:linear-gradient(to bottom left,rgba(0,0,0,.55),transparent 75%)}
@media (hover:none){.wa-chev{pointer-events:none}}
.wa-acts{position:absolute;top:50%;display:flex;gap:4px;margin-top:-14px;opacity:0}
.wa-theirs .wa-acts{left:calc(100% + 6px)}
.wa-mine .wa-acts{right:calc(100% + 6px);flex-direction:row-reverse}
.wa-msg:hover .wa-acts,.wa-acts:focus-within{opacity:1}
.wa-acts .wa-act{position:static;margin:0;opacity:1;left:auto;right:auto}
@media (hover:none){.wa-acts{display:none}}
.wa-qbar{position:absolute;bottom:calc(100% + 6px);z-index:7;display:flex;gap:2px;padding:4px 6px;border-radius:26px;background:var(--wa-panel);color:var(--wa-text);box-shadow:0 0 0 1px var(--wa-line),0 6px 22px rgba(11,20,26,.26)}
.wa-theirs .wa-qbar{left:0}
.wa-mine .wa-qbar{right:0}
.wa-qe{width:38px;height:38px;padding:0;border:0;border-radius:50%;background:transparent;font-size:23px;line-height:1;cursor:pointer;color:inherit}
.wa-qe:hover{background:var(--wa-active)}
.wa-qe:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-qe-on{background:color-mix(in srgb,var(--wa-green) 22%,transparent)}
.wa-qe-more{font-size:22px;color:var(--wa-icon);background:var(--wa-hover)}
@media (prefers-reduced-motion:no-preference){.wa-qe{transition:transform .1s}.wa-qe:hover{transform:scale(1.18)}}
.wa-menu{min-width:11rem}
.wa-mi svg{width:16px;height:16px}

/* reactions */
.wa-reacts{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:4px;margin:-4px 6px 2px}
.wa-react{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 7px;border:1px solid var(--wa-line);border-radius:11px;background:var(--wa-panel);color:var(--wa-text);font-size:13.5px;line-height:1;cursor:pointer;box-shadow:var(--wa-shadow)}
.wa-react i{font-style:normal;font-size:11.5px;color:var(--wa-meta)}
.wa-react-me{border-color:color-mix(in srgb,var(--wa-green) 60%,transparent);background:color-mix(in srgb,var(--wa-green) 22%,var(--wa-panel))}
.wa-react:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px}

/* media */
.wa-has-media{padding:3px 3px 7px}
.wa-has-media .wa-sender,.wa-has-media .wa-fwd{padding:2px 6px 0}
.wa-has-media .wa-quote{width:auto;min-width:0;margin:0 0 4px}
.wa-has-media .wa-caption{padding:4px 6px 0}
.wa-b-media{padding:3px}
.wa-b-media .wa-stamp-over{bottom:8px}
.wa-img{position:relative;overflow:hidden;border-radius:6px;background:color-mix(in srgb,var(--wa-text) 8%,transparent)}
.wa-img-btn{display:block;width:100%;height:100%;padding:0;border:0;background:none;cursor:zoom-in;line-height:0}
.wa-img-btn:disabled{cursor:default}
.wa-img-btn:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-img img{display:block;width:100%;height:100%;object-fit:cover}
.wa-skel{display:grid;place-items:center;width:100%;height:100%;color:var(--wa-meta);background:linear-gradient(100deg,transparent 30%,color-mix(in srgb,var(--wa-text) 7%,transparent) 50%,transparent 70%) 0 0/200% 100%}
.wa-skel svg{width:30px;height:30px;opacity:.6}
@media (prefers-reduced-motion:no-preference){.wa-skel{animation:wa-shim 1.4s linear infinite}.wa-in{animation:wa-fade .2s ease-out}}
@keyframes wa-shim{to{background-position:-200% 0}}
@keyframes wa-fade{from{opacity:0}to{opacity:1}}
.wa-sticker{background:none;border-radius:0}
.wa-sticker img{object-fit:contain}
.wa-nobg{padding:0;background:transparent!important;box-shadow:none}
.wa-nobg::before{display:none!important}
.wa-nobg .wa-stamp-over{bottom:4px}
.wa-video video{display:block;width:100%;height:100%;object-fit:contain;background:#000}
.wa-vposter{position:relative;display:block;width:100%;height:100%;padding:0;border:0;cursor:pointer;color:#fff;background:linear-gradient(135deg,#34444c,#111b21)}
.wa-vposter:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-vplay{position:absolute;inset:0;margin:auto;display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:rgba(0,0,0,.55)}
.wa-vplay svg{width:26px;height:26px}
.wa-vmeta{position:absolute;left:8px;bottom:7px;display:inline-flex;align-items:center;gap:4px;font-size:12px;font-variant-numeric:tabular-nums}
.wa-vmeta svg{width:15px;height:15px}
.wa-gone{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:9px 11px;border-radius:6px;font-size:13px;line-height:18px;color:var(--wa-meta);background:color-mix(in srgb,var(--wa-text) 6%,transparent)}
.wa-gone>svg{width:18px;height:18px}
.wa-img .wa-gone-c{position:absolute;inset:0;align-items:center;justify-content:center;text-align:center;border-radius:0;font-size:12.5px;line-height:16px;padding:8px}
.wa-linkbtn{display:inline-flex;align-items:center;gap:4px;padding:0;border:0;background:none;color:var(--wa-link);font-size:13px;font-weight:500;cursor:pointer}
.wa-linkbtn:hover{text-decoration:underline}
.wa-linkbtn:disabled{opacity:.5;cursor:default}
.wa-linkbtn:focus-visible{outline:2px solid var(--wa-green);outline-offset:2px;border-radius:3px}
.wa-linkbtn svg{width:14px;height:14px}

/* document */
.wa-doc-w{display:flex;flex-direction:column;gap:4px}
.wa-doc{display:flex;align-items:center;gap:10px;min-width:min(250px,64cqw);padding:8px 10px;border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent)}
.wa-doc-ico{flex:none;display:grid;place-items:center;width:38px;height:44px;border-radius:6px;background:var(--wa-k,#6b7c85);color:#fff}
.wa-doc-ico b{font-size:10.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
.wa-doc-ico svg{width:22px;height:22px}
.wa-k-pdf{--wa-k:#e5493a}.wa-k-word{--wa-k:#2b7cd3}.wa-k-sheet{--wa-k:#1f9d57}.wa-k-slide{--wa-k:#e0752b}.wa-k-zip{--wa-k:#8a6d3b}.wa-k-audio{--wa-k:#7e57c2}.wa-k-video{--wa-k:#d6336c}.wa-k-image{--wa-k:#3d8bdc}
.wa-doc-t{flex:1;min-width:0;display:flex;flex-direction:column}
.wa-doc-t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:19px}
.wa-doc-t span{font-size:12px;line-height:16px;color:var(--wa-meta)}
.wa-doc-dl{flex:none;display:grid;place-items:center;width:34px;height:34px;padding:0;border:1.5px solid var(--wa-meta);border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer}
.wa-doc-dl:hover:not(:disabled){background:color-mix(in srgb,var(--wa-text) 8%,transparent)}
.wa-doc-dl:disabled{opacity:.45;cursor:default}
.wa-doc-dl svg{width:18px;height:18px}
.wa-doc-dl:focus-visible{outline:2px solid var(--wa-green);outline-offset:2px}

/* voice notes and audio */
.wa-audio{display:flex;align-items:center;gap:8px;min-width:min(250px,62cqw);padding:1px 0}
.wa-ptt{min-width:min(280px,66cqw)}
.wa-aplay{flex:none;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer}
.wa-aplay:hover{background:color-mix(in srgb,var(--wa-text) 8%,transparent)}
.wa-aplay:focus-visible{outline:2px solid var(--wa-green);outline-offset:-1px}
.wa-aplay svg{width:26px;height:26px}
.wa-abody{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.wa-bars{position:relative;display:flex;align-items:center;gap:2px;height:28px;cursor:pointer;touch-action:none;border-radius:4px}
.wa-bars:focus-visible{outline:2px solid var(--wa-green);outline-offset:2px}
.wa-bars i{flex:1;min-width:2px;max-width:4px;border-radius:2px;background:color-mix(in srgb,var(--wa-text) 28%,transparent)}
.wa-bars i[data-on]{background:var(--wa-green-text)}
.wa-knob{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--wa-green-text);pointer-events:none}
.wa-ameta{display:flex;justify-content:space-between;gap:8px;min-width:0;font-size:11.5px;line-height:14px;color:var(--wa-meta);font-variant-numeric:tabular-nums}
.wa-aname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-speed{flex:none;min-width:38px;height:26px;padding:0 6px;border:0;border-radius:13px;background:color-mix(in srgb,var(--wa-text) 12%,transparent);color:var(--wa-text);font-size:12px;font-weight:600;cursor:pointer}
.wa-speed:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px}
.wa-ptt .wa-avatar-sm{width:44px;height:44px}

/* link preview, location, contact, poll */
.wa-lp{display:block;margin:-1px -4px 5px;padding:7px 10px 8px;border-left:4px solid var(--wa-green);border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent);color:inherit;text-decoration:none;overflow:hidden}
a.wa-lp:hover{background:color-mix(in srgb,var(--wa-text) 11%,transparent)}
.wa-lp b{display:block;font-size:13.5px;font-weight:500;line-height:18px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.wa-lp-d{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:1px;font-size:12.8px;line-height:17px;color:var(--wa-meta)}
.wa-lp-h{display:block;margin-top:3px;font-size:12px;line-height:15px;color:var(--wa-meta)}
.wa-loc{display:flex;flex-direction:column;gap:6px;width:min(290px,64cqw)}
.wa-map{position:relative;height:128px;overflow:hidden;border-radius:6px;background:
  radial-gradient(ellipse at 80% 20%,var(--wa-map-park) 0 17%,transparent 18%),
  radial-gradient(ellipse at 15% 85%,var(--wa-map-park) 0 14%,transparent 15%),
  linear-gradient(28deg,transparent 0 46%,var(--wa-map-main) 46% 51%,transparent 51%),
  linear-gradient(90deg,transparent 0 30%,var(--wa-map-road) 30% 34%,transparent 34% 66%,var(--wa-map-road) 66% 69%,transparent 69%),
  linear-gradient(0deg,transparent 0 24%,var(--wa-map-road) 24% 28%,transparent 28% 62%,var(--wa-map-road) 62% 66%,transparent 66%),var(--wa-map-bg)}
.wa-pin{position:absolute;left:50%;top:50%;display:grid;place-items:center;transform:translate(-50%,-88%);color:#ea4335;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
.wa-pin svg{width:36px;height:36px;fill:currentColor;stroke:#fff;stroke-width:1.4}
.wa-loc-t{display:flex;flex-direction:column;min-width:0}
.wa-loc-t b{font-size:14px;font-weight:500;line-height:19px;overflow-wrap:anywhere}
.wa-loc-t span{font-size:12.8px;line-height:17px;color:var(--wa-meta);overflow-wrap:anywhere}
.wa-coords{font-variant-numeric:tabular-nums}
.wa-loc-open{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;font-size:13px;font-weight:500;color:var(--wa-link);text-decoration:none}
.wa-loc-open:hover{text-decoration:underline}
.wa-loc-open svg{width:14px;height:14px}
.wa-cards{display:flex;flex-direction:column;gap:5px}
.wa-bcard{min-width:min(240px,62cqw);padding:9px 10px 0;border-radius:6px;background:color-mix(in srgb,var(--wa-text) 7%,transparent);overflow:hidden}
.wa-card-h{display:flex;align-items:center;gap:10px;padding-bottom:8px}
.wa-card-t{display:flex;flex-direction:column;min-width:0}
.wa-card-t b{font-size:14.5px;font-weight:500;line-height:19px;overflow-wrap:anywhere}
.wa-card-t span{font-size:12.8px;line-height:17px;color:var(--wa-meta)}
.wa-card-b{display:block;width:calc(100% + 20px);margin:0 -10px;padding:9px 10px;border:0;border-top:1px solid color-mix(in srgb,var(--wa-text) 10%,transparent);background:transparent;color:var(--wa-green-text);font-size:14px;font-weight:500;cursor:pointer}
.wa-card-b:hover{background:color-mix(in srgb,var(--wa-text) 6%,transparent)}
.wa-card-b:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-poll{display:flex;flex-direction:column;gap:2px;min-width:min(264px,66cqw)}
.wa-poll-q{font-size:15px;font-weight:500;line-height:20px;overflow-wrap:anywhere}
.wa-poll-h{display:inline-flex;align-items:center;gap:5px;margin:2px 0 4px;font-size:12.5px;color:var(--wa-meta)}
.wa-poll-h svg{width:14px;height:14px}
.wa-opt{display:grid;grid-template-columns:20px minmax(0,1fr);column-gap:10px;row-gap:3px;width:100%;padding:5px 0 3px;border:0;background:none;color:inherit;text-align:left;cursor:pointer}
.wa-opt:disabled{cursor:default}
.wa-opt:focus-visible{outline:2px solid var(--wa-green);outline-offset:1px;border-radius:4px}
.wa-opt-box{grid-row:1;display:grid;place-items:center;width:20px;height:20px;border:1.5px solid var(--wa-meta);border-radius:50%;color:#fff}
.wa-opt[role="checkbox"] .wa-opt-box{border-radius:5px}
.wa-opt-box svg{width:14px;height:14px;stroke-width:2.6}
.wa-opt-on .wa-opt-box{border-color:var(--wa-green);background:var(--wa-green)}
.wa-opt-t{display:flex;justify-content:space-between;gap:10px;font-size:14px;line-height:20px;overflow-wrap:anywhere}
.wa-opt-n{font-style:normal;font-size:12.5px;color:var(--wa-meta);font-variant-numeric:tabular-nums}
.wa-opt-bar{grid-column:2;height:6px;overflow:hidden;border-radius:3px;background:color-mix(in srgb,var(--wa-text) 10%,transparent)}
.wa-opt-bar i{display:block;height:100%;border-radius:3px;background:var(--wa-green)}
@media (prefers-reduced-motion:no-preference){.wa-opt-bar i{transition:width .25s ease}}
.wa-poll-hint{margin-top:3px;font-size:12px;color:var(--wa-meta)}
.wa-poll-v{margin-top:4px;padding-top:6px;border-top:1px solid color-mix(in srgb,var(--wa-text) 10%,transparent);font-size:12.5px;color:var(--wa-meta);text-align:center}

/* system, call, deleted */
.wa-sys{align-items:center;margin:8px 0}
.wa-sys-chip{display:inline-flex;align-items:center;gap:7px;max-width:82%;padding:5px 12px 6px;border-radius:8px;background:var(--wa-chip);color:var(--wa-sub);font-size:12.5px;line-height:17px;text-align:center;box-shadow:var(--wa-shadow);overflow-wrap:anywhere}
.wa-sys-chip svg{flex:none;width:16px;height:16px}
.wa-sys-chip time{font-size:11px;opacity:.8}
.wa-callrow-missed svg{color:var(--wa-red)}
.wa-del{display:flex;align-items:center;gap:6px;font-style:italic;color:var(--wa-meta)}
.wa-del svg{flex:none;width:16px;height:16px}

/* log extras */
.wa-pinbar{display:flex;align-items:center;gap:8px;flex:none;width:100%;padding:8px 14px;border:0;border-bottom:1px solid var(--wa-line);background:var(--wa-bar);color:var(--wa-text);font-size:13px;text-align:left;cursor:pointer;z-index:2}
.wa-pinbar:hover{background:var(--wa-hover)}
.wa-pinbar:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-pinbar svg{flex:none;width:16px;height:16px;color:var(--wa-green-text)}
.wa-pin-l{flex:none;font-weight:500;color:var(--wa-green-text)}
.wa-pin-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--wa-sub)}
.wa-older{align-self:center;margin:4px 0 8px;padding:6px 14px;border:0;border-radius:999px;background:var(--wa-chip);color:var(--wa-green-text);font-size:13px;box-shadow:var(--wa-shadow);cursor:pointer}
.wa-older:focus-visible{outline:2px solid var(--wa-green);outline-offset:2px}
.wa-qpick-back{position:absolute;inset:0;z-index:7}
.wa-qpick{position:absolute;z-index:8;width:min(380px,calc(100% - 16px))}
.wa-qpick .wa-emoji{position:static;width:100%;height:min(340px,55vh);animation:none}

/* lightbox: the log is its own stacking context, so it must rise above the header while the viewer is open */
.wa-logwrap.wa-lb-on{z-index:20}
.wa-lb{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;background:rgba(5,10,13,.93);color:#fff;outline:0}
.wa-lb-top{display:flex;align-items:center;gap:6px;flex:none;padding:10px 12px}
.wa-lb-count{margin-right:auto;font-size:13px;opacity:.85}
.wa-lb-btn{display:grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
.wa-lb-btn:hover:not(:disabled){background:rgba(255,255,255,.2)}
.wa-lb-btn:disabled{opacity:.35;cursor:default}
.wa-lb-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}
.wa-lb-btn svg{width:22px;height:22px}
.wa-lb-stage{flex:1;min-height:0;display:grid;place-items:center;overflow:hidden;padding:0 60px}
.wa-lb-stage img{max-width:100%;max-height:100%;object-fit:contain;user-select:none;cursor:zoom-in}
.wa-lb-stage img[data-zoom]{cursor:grab}
.wa-lb-prev,.wa-lb-next{position:absolute;top:50%;margin-top:-20px}
.wa-lb-prev{left:10px}
.wa-lb-next{right:10px}
.wa-lb-cap{flex:none;max-height:22%;overflow:auto;padding:10px 20px 18px;text-align:center;font-size:14px;line-height:20px;white-space:pre-wrap}
.wa-lb-state{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:14px;opacity:.9}
.wa-lb-state .wa-linkbtn{color:#7dd3fc}
@container (max-width:720px){
  .wa-acts{display:none}
  .wa-bw{max-width:88%}
  .wa-lb-stage{padding:0 8px}
  .wa-lb-prev{left:4px}.wa-lb-next{right:4px}
  .wa-reacts{margin-left:4px;margin-right:4px}
}

/* search in chat */
.wa-search-bar{position:relative;flex:none;z-index:3;background:var(--wa-bar);border-bottom:1px solid var(--wa-line)}
.wa-sb-in{display:flex;align-items:center;gap:8px;padding:8px 12px}
.wa-sb-in>svg{flex:none;width:18px;height:18px;color:var(--wa-sub)}
.wa-root .wa-sb-in input{flex:1;min-width:0;height:36px;padding:0 14px;border:1px solid transparent;border-radius:999px;background:var(--wa-field);color:var(--wa-text);font:inherit;font-size:14px;box-shadow:none;outline:0}
.wa-root .wa-sb-in input:focus{border-color:var(--wa-green);box-shadow:0 0 0 1px var(--wa-green)}
.wa-sb-x{display:grid;place-items:center;flex:none;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer}
.wa-sb-x:hover{background:color-mix(in srgb,var(--wa-text) 9%,transparent)}
.wa-sb-x:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-sb-x svg{width:18px;height:18px}
.wa-sb-res{position:absolute;left:0;right:0;top:100%;margin:0;padding:0;list-style:none;max-height:min(50vh,320px);overflow:auto;background:var(--wa-panel);border-bottom:1px solid var(--wa-line);box-shadow:0 10px 24px rgba(11,20,26,.2)}
.wa-sb-res button{display:block;width:100%;padding:8px 16px;border:0;border-bottom:1px solid var(--wa-line);background:transparent;color:var(--wa-text);text-align:left;cursor:pointer}
.wa-sb-res button:hover,.wa-sb-res button:focus-visible{background:var(--wa-hover);outline:0}
.wa-sb-d{display:block;font-size:12px;line-height:16px;color:var(--wa-sub)}
.wa-sb-t{display:block;font-size:13.5px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-sb-res .wa-dlg-none{padding:16px;text-align:center;color:var(--wa-sub);font-size:13px}

/* dialogs: they render in a portal outside .wa-root, so they carry their own palette */
.wa-dlg{--wa-text:#111b21;--wa-sub:#5f6f79;--wa-line:#e4e8eb;--wa-green:#00a884;--wa-green-text:#008069;--wa-hover:#f5f6f6;--wa-active:#e9edef;--wa-pill:#f0f2f5;--wa-icon:#54656f;--wa-meta:#667781;--wa-badge:#1fa855;--wa-on-green:#fff;--wa-l:42%;--wa-avatar-l:86%;--wa-avatar-fg:32%;--wa-link:#027eb5;--wa-red:#e5484d}
.dark .wa-dlg{--wa-text:#e9edef;--wa-sub:#8696a0;--wa-line:#2a3942;--wa-green-text:#21c063;--wa-hover:#1a262d;--wa-active:#2a3942;--wa-pill:#1f2c33;--wa-icon:#aebac1;--wa-meta:#9fb0b8;--wa-on-green:#0b141a;--wa-l:68%;--wa-avatar-l:26%;--wa-avatar-fg:82%;--wa-link:#53bdeb;--wa-red:#f2777b}
.wa-dlg *,.wa-dlg *::before,.wa-dlg *::after{box-sizing:border-box}
.wa-dlg{max-width:min(440px,calc(100vw - 24px))!important}
.wa-dlg-search{position:relative}
.wa-dlg-search svg{position:absolute;left:10px;top:50%;width:16px;height:16px;transform:translateY(-50%);color:var(--wa-sub);pointer-events:none}
.wa-dlg-search input{padding-left:32px}
.wa-pick{margin:0;padding:0;list-style:none;max-height:min(44vh,320px);overflow:auto}
.wa-pick li{margin:0;padding:0}
.wa-pick-row{display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.wa-pick-row:hover:not(:disabled){background:var(--wa-hover)}
.wa-pick-row:disabled{opacity:.45;cursor:default}
.wa-pick-row:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-pick-on{background:color-mix(in srgb,var(--wa-green) 13%,transparent)}
.wa-check{flex:none;display:grid;place-items:center;width:20px;height:20px;border:1.5px solid var(--wa-meta);border-radius:6px;color:#fff}
.wa-check svg{width:14px;height:14px;stroke-width:2.6}
.wa-pick-on .wa-check{border-color:var(--wa-green);background:var(--wa-green)}
.wa-pick-t{display:flex;flex-direction:column;min-width:0}
.wa-pick-t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14.5px;font-weight:500}
.wa-pick-t span{font-size:12.5px;color:var(--wa-sub)}
.wa-dlg-none{padding:18px;text-align:center;font-size:13px;color:var(--wa-sub)}
.wa-dlg-count{margin-right:auto;align-self:center;font-size:13px;color:var(--wa-sub)}
.wa-dlg-quote{margin:0;padding:8px 10px;border-left:3px solid var(--wa-green);border-radius:6px;background:var(--wa-pill);font-size:13px;line-height:18px;color:var(--wa-sub);overflow-wrap:anywhere}
.wa-form{display:flex;flex-direction:column;gap:8px}
.wa-lbl{font-size:12.5px;font-weight:500;color:var(--wa-sub)}
.wa-optrow{display:flex;align-items:center;gap:6px}
.wa-optrow svg{width:18px;height:18px}
.wa-addopt{align-self:flex-start}
.wa-addopt svg{width:16px;height:16px}
.wa-switchrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;font-size:14px}
.wa-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wa-err{display:flex;align-items:flex-start;gap:6px;margin:0;font-size:13px;line-height:18px;color:var(--wa-red)}
.wa-err svg{flex:none;width:16px;height:16px;margin-top:1px}
.wa-bchosen{display:flex;flex-wrap:wrap;gap:6px}
.wa-btag{display:inline-flex;align-items:center;gap:2px;padding:3px 4px 3px 10px;border-radius:999px;background:var(--wa-pill);font-size:13px}
.wa-btag button{display:grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wa-icon);cursor:pointer}
.wa-btag button:hover{background:var(--wa-active)}
.wa-btag svg{width:13px;height:13px}
.wa-self{align-self:flex-start;margin-top:2px}
.wa-minfo{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px 12px;margin:0;font-size:14px}
.wa-minfo dt{color:var(--wa-sub)}
.wa-minfo dd{margin:0;overflow-wrap:anywhere}
.wa-who-react{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.wa-who-react li{display:flex;align-items:center;gap:8px}
.wa-who-react span{font-size:18px}
.wa-who-react i{margin-left:auto;font-style:normal;font-size:12px;color:var(--wa-sub)}
@media (forced-colors:active){.wa-react,.wa-qbar,.wa-stamp-over{border:1px solid CanvasText}}
`;
