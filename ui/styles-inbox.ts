// Styles added in 3.0 for the chat list and the frame around the conversation (pictures, state icons, archived entry, side panel slots).
export const INBOX_CSS = `
.wa-root{--wa-tick-read:#53bdeb;--wa-danger:#ea0038}
.dark .wa-root,.wa-root.wa-dark{--wa-tick-read:#53bdeb;--wa-danger:#f15c6d}
.wa-avatar-img{background:var(--wa-active);overflow:hidden}
.wa-avatar-img img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}
.wa-preview .wa-tick-read,.wa-tick-read{color:var(--wa-tick-read)}
.wa-preview .wa-tick-failed{color:var(--wa-danger)}
.wa-preview .wa-prefix{flex:none;overflow:visible}
.wa-preview-quiet{font-style:italic}
.wa-rowico{flex:none;width:16px;height:16px;color:var(--wa-sub)}
.wa-pill:empty{min-width:12px;width:12px;height:12px;padding:0;align-self:center}
.wa-pill-muted{background:var(--wa-sub)}
.wa-rowwrap{position:relative}
.wa-rowmenu{position:absolute;right:8px;bottom:8px;display:none}
.wa-rowwrap:hover .wa-rowmenu,.wa-rowwrap:focus-within .wa-rowmenu,.wa-rowmenu:has([data-state="open"]){display:block}
.wa-rowmenu .wa-iconbtn{width:28px;height:28px;background:var(--wa-hover)}
.wa-rowwrap:hover .wa-row .wa-pill,.wa-rowwrap:hover .wa-row .wa-rowico{visibility:hidden}
@media (hover:none){.wa-rowmenu{display:none!important}}
.wa-archived{flex:none;display:flex;align-items:center;gap:22px;width:100%;height:50px;padding:0 20px 0 26px;border:0;border-bottom:1px solid var(--wa-line);background:transparent;color:var(--wa-text);font:inherit;font-size:15px;text-align:left;cursor:pointer}
.wa-archived:hover{background:var(--wa-hover)}
.wa-archived:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-archived svg{width:20px;height:20px;color:var(--wa-green-text)}
.wa-archived span{flex:1}
.wa-archived b{font-size:12px;font-weight:600;color:var(--wa-green-text)}
.wa-head-actions{display:flex;align-items:center;gap:2px;margin-left:auto}
.wa-chat-head .wa-who{flex:1;min-width:0}
.wa-root .wa-who-btn{flex:1;min-width:0;display:flex;align-items:center;gap:12px;height:100%;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.wa-root .wa-who-btn:focus-visible{outline:2px solid var(--wa-green);outline-offset:-2px}
.wa-chat-area{position:relative;display:flex;min-width:0;min-height:0}
.wa-chat-area>.wa-chat-pane{flex:1;min-width:0}
.wa-side{flex:none;width:clamp(300px,34%,400px);display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--wa-line);background:var(--wa-panel);overflow:hidden}
@container (max-width:1000px){.wa-side{position:absolute;inset:0;width:auto;border-left:0;z-index:5}}
.wa-overlay{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;min-height:0;background:var(--wa-panel)}
.wa-list-pane{position:relative}
.wa-gate{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;background:var(--wa-bar);overflow:auto}
.wa-gate>:last-child{flex:1;min-height:0;position:relative}
.wa-root .wa-gate-back{align-self:flex-start;margin:10px 12px 0;color:var(--wa-sub);gap:6px}
.wa-root .wa-gate-back svg{width:16px;height:16px}
.wa-list-pane .wa-head{gap:2px}
.wa-list-pane .wa-title{margin-right:auto}
`;
