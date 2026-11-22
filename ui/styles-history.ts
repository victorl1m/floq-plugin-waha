// History import (progress bar, QR note) and the contacts list. Appended to SESSION_CSS so dialogs and menus get it too; colours only through the --wa-* aliases (theme.ts).
export const HISTORY_CSS = `
.wa-hbar{flex:none;display:flex;flex-direction:column;gap:6px;padding:8px 8px 0 14px;background:color-mix(in srgb,var(--wa-accent) 9%,var(--wa-panel));border-bottom:1px solid color-mix(in srgb,var(--wa-accent) 22%,var(--wa-line));color:var(--wa-text);font-size:13.5px;line-height:1.3}
.wa-hbar-row{display:flex;align-items:center;gap:10px;min-height:32px}
.wa-hbar-row>svg{flex:none;width:18px;height:18px;color:var(--wa-accent-text)}
.wa-hbar-row .wa-spin{flex:none;width:16px;height:16px;border-width:2px}
.wa-hbar-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-hbar-text b{display:block;font-weight:600}
.wa-hbar-text span{display:block;overflow:hidden;text-overflow:ellipsis;color:var(--wa-sub);font-size:12.5px}
.wa-hbar-error{background:color-mix(in srgb,var(--wa-danger) 12%,var(--wa-panel));border-bottom-color:color-mix(in srgb,var(--wa-danger) 28%,var(--wa-line));padding-bottom:6px}
.wa-hbar-error .wa-hbar-row>svg{color:var(--wa-danger)}
.wa-hbar-error .wa-hbar-text{white-space:normal}
.wa-hbar-done{padding-bottom:6px}
.wa-hbar-done .wa-hbar-row>svg{color:var(--wa-ok)}
.wa-hbar-track{position:relative;height:4px;margin:0 8px 0 -14px;overflow:hidden;background:color-mix(in srgb,var(--wa-text) 12%,transparent)}
.wa-hbar-track i{position:absolute;left:0;top:0;bottom:0;display:block;width:0;background:var(--wa-accent);transition:width .35s ease}
.wa-hbar-track[data-indeterminate] i{width:35%;animation:wa-hbar-slide 1.3s ease-in-out infinite}
@keyframes wa-hbar-slide{0%{left:-35%}100%{left:100%}}
.wa-hnote{display:flex;align-items:flex-start;gap:10px;width:min(900px,100%);margin:20px 0 0;padding:10px 14px;border:1px solid var(--wa-line);border-radius:12px;background:var(--wa-pill);color:var(--wa-text);font-size:13.5px;line-height:1.45;text-align:left}
.wa-hnote>svg{flex:none;width:18px;height:18px;margin-top:1px;color:var(--wa-accent-text)}
.wa-hnote-warn{border-color:color-mix(in srgb,var(--wa-danger) 30%,var(--wa-line));background:color-mix(in srgb,var(--wa-danger) 9%,transparent)}
.wa-hnote-warn>svg{color:var(--wa-danger)}
.wa-sess-card>.wa-hnote{grid-column:1/-1;justify-self:center;margin-top:0}
.wa-adlg .wa-hnote{margin:12px 0 0;font-size:13px}
.wa-arow-prog{color:var(--wa-accent-text)}
.wa-amenu-prog{display:flex;align-items:center;gap:8px;padding-top:2px;padding-bottom:6px;color:var(--wa-sub);font-size:12.5px;font-weight:400}
.wa-amenu-prog .wa-spin{flex:none;width:14px;height:14px;border-width:2px}
.wa-contacts{display:flex;flex-direction:column;min-height:0;flex:1}
.wa-csync{display:flex;align-items:center;gap:10px;flex:none;padding:10px 16px 6px 20px;color:var(--wa-sub);font-size:12.5px;line-height:1.3}
.wa-csync span{flex:1;min-width:0}
.wa-csync .wa-spin{flex:none;width:14px;height:14px;border-width:2px}
.wa-clist{list-style:none;margin:0;padding:0 6px 12px}
.wa-crow{display:flex;align-items:center;gap:4px;border-radius:10px}
.wa-crow:hover{background:var(--wa-hover)}
.wa-root .wa-crow-main{flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 6px 8px 10px;border:0;border-radius:10px;background:transparent;color:var(--wa-text);text-align:left;cursor:pointer;box-shadow:none}
.wa-crow-main:focus-visible{outline:2px solid var(--wa-accent);outline-offset:-2px}
.wa-crow-t{flex:1;min-width:0;display:flex;flex-direction:column}
.wa-crow-t b{display:flex;align-items:center;gap:8px;min-width:0;font-size:15px;font-weight:500;line-height:20px}
.wa-crow-t b>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-crow-t>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;color:var(--wa-sub)}
.wa-cbadge{flex:none;font-style:normal;padding:0 7px;border-radius:999px;background:color-mix(in srgb,var(--wa-accent) 14%,transparent);color:var(--wa-accent-text);font-size:11px;font-weight:600;line-height:17px;letter-spacing:.01em}
.wa-root .wa-crow .wa-iconbtn{width:34px;height:34px;margin-right:4px}
.wa-root .wa-crow .wa-iconbtn svg{width:18px;height:18px}
.wa-cmore{display:flex;justify-content:center;padding:6px 0 4px}
`;
