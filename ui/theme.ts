// The plugin has no palette of its own: every colour is one of Floq's theme tokens, so the view follows the theme (light, dark), the material
// (acrylic, mica, vibrancy, solid, with or without the native window material) and the accent the user picked in Settings, live.
// The --wa-* names are the plugin's internal aliases. The second value of each var() is only used where the host stylesheet is absent.
// Dialogs and menus are portalled to <body>, outside .wa-root, so their wrappers (.wa-dlg, .wa-portal, .wa-bdlg) get the same aliases.
const vars = (dark: boolean) => {
  const v = (light: string, dk: string) => (dark ? dk : light);
  return [
    `--wa-text:var(--foreground,${v("#202633", "#f5f5f7")})`,
    `--wa-sub:var(--muted-foreground,${v("#596476", "#98989d")})`, "--wa-icon:var(--wa-sub)", "--wa-meta:var(--wa-sub)", "--wa-tick:var(--wa-sub)",
    `--wa-line:var(--glass-row-edge,var(--border,${v("#d6dbe4", "#38383a")}))`,
    "--wa-accent:var(--primary,#f97316)", `--wa-accent-text:var(--primary-text,var(--primary,${v("#b54708", "#fb923c")}))`, "--wa-on-accent:var(--primary-foreground,#211007)", "--wa-badge:var(--wa-accent)",
    `--wa-solid:var(--card,${v("#fbfcfe", "#1c1c1e")})`, `--wa-muted:var(--muted,${v("#eef0f4", "#1c1c1e")})`,
    `--wa-field:${v("var(--wa-solid)", "color-mix(in oklab,var(--wa-text) 5%,var(--wa-solid))")}`,
    "--wa-pill:color-mix(in oklab,var(--wa-text) 6%,transparent)",
    "--wa-hover:var(--glass-row-hover,color-mix(in oklab,var(--wa-text) 4%,transparent))", "--wa-active:var(--glass-row-active,color-mix(in oklab,var(--wa-text) 7%,transparent))",
    `--wa-danger:var(--destructive,${v("#d92d20", "#f15c6d")})`, "--wa-red:var(--wa-danger)",
    `--wa-in:${v("var(--wa-solid)", "color-mix(in oklab,var(--wa-text) 6%,var(--wa-solid))")}`, "--wa-out:color-mix(in oklab,var(--wa-accent) 16%,var(--wa-in))", "--wa-chip:var(--wa-in)",
    "--wa-tick-read:#53bdeb", `--wa-ok:${v("#16a34a", "#4ade80")}`, // connected: a status colour like the amber and red beside it, not the accent
    `--wa-link:${v("#0b6fa8", "#53bdeb")}`, `--wa-mark:${v("#ffe08a", "#8a6d00")}`, "--wa-ring-seen:color-mix(in oklab,var(--wa-text) 24%,transparent)",
    `--wa-map-bg:${v("#e8e6df", "#1f2b31")}`, `--wa-map-road:${v("#ffffff", "#34444c")}`, `--wa-map-park:${v("#c3e2bb", "#21402f")}`, `--wa-map-main:${v("#f6e2a0", "#4a4326")}`,
    `--wa-shadow:${v("0 1px 1.5px rgb(28 38 54 / .14)", "0 1px 1px rgb(0 0 0 / .45)")}`, "--wa-radius:var(--radius,10px)",
    `--wa-l:${v("42%", "68%")}`, `--wa-avatar-l:${v("86%", "26%")}`, `--wa-avatar-fg:${v("32%", "82%")}`,
    // the agent canvas: .canvas-chrome-light's tokens in light, React Flow's dark defaults in dark
    `--wa-wall-d:${v("#f4f5f8", "#141414")}`, `--wa-dot-d:${v("#aab2c0", "#777777")}`, `--wa-dot-a:${v("55%", "32%")}`,
  ].join(";");
};

export const THEME_CSS = `
.wa-root,.wa-dlg,.wa-portal,.wa-bdlg{${vars(false)}}
.dark :is(.wa-root,.wa-dlg,.wa-portal,.wa-bdlg){${vars(true)}}
.wa-dlg,.wa-portal,.wa-bdlg{--wa-panel:var(--popover,var(--wa-solid));--wa-bar:var(--wa-muted)}
/* surfaces. Acrylic by default: translucent card over the workspace, like Floq's panes. The chat pane is the agent canvas. */
.wa-root{--wa-panel:color-mix(in oklab,var(--wa-solid) 76%,transparent);--wa-bar:color-mix(in oklab,var(--wa-muted) 62%,transparent);--wa-pop:color-mix(in oklab,var(--popover,var(--wa-solid)) 78%,transparent);
  --wa-blur:blur(24px) saturate(1.5);--wa-pop-blur:blur(14px) saturate(1.4);--wa-wall:var(--canvas-bg,var(--wa-wall-d));--wa-wall-dot:color-mix(in oklab,var(--canvas-dot,var(--wa-dot-d)) var(--wa-dot-a),transparent)}
/* native window material: the OS draws the blur behind the window, so the panes are only a light tint and the chat is the canvas pane */
:root[data-native-material] .wa-root{--wa-panel:color-mix(in oklab,var(--wa-solid) 40%,transparent);--wa-blur:none;--wa-wall:var(--canvas-bg,var(--native-canvas-pane,var(--wa-wall-d)))}
:root[data-material="solid"] .wa-root{--wa-panel:var(--wa-solid);--wa-bar:var(--wa-muted);--wa-pop:var(--popover,var(--wa-solid));--wa-blur:none;--wa-pop-blur:none;--wa-wall:var(--wa-wall-d)}
@media (prefers-reduced-transparency:reduce){
  :root:root .wa-root{--wa-panel:var(--wa-solid);--wa-bar:var(--wa-muted);--wa-pop:var(--popover,var(--wa-solid));--wa-blur:none;--wa-pop-blur:none}
  :root:not([data-native-material]) .wa-root{--wa-wall:var(--wa-wall-d)}
}
@media (forced-colors:active){
  :root:root .wa-root{--wa-panel:Canvas;--wa-bar:Canvas;--wa-pop:Canvas;--wa-wall:Canvas;--wa-wall-dot:transparent;--wa-solid:Canvas;--wa-in:Canvas;--wa-out:Canvas;--wa-field:Canvas;--wa-blur:none;--wa-pop-blur:none}
}
`;

// The app styles every input and textarea of the workspace (.workspace-frame :is(input,textarea), and a stronger rule with the native material).
// The plugin's own fields sit inside shapes that already carry the fill, so these declarations must win whatever the host adds.
export const FIELDS_CSS = `
.wa-root :is(.wa-cfield textarea,.wa-linkfield),.wa-root :is(.wa-cfield textarea,.wa-linkfield):is(:focus,:focus-visible){background:transparent!important;border-color:transparent!important;box-shadow:none!important}
.wa-root :is(.wa-search,.wa-emoji-search,.wa-find) input{background:var(--wa-pill)!important;border-color:transparent!important;box-shadow:none!important}
.wa-root :is(.wa-sb-in,.wa-pair-row) input{background:var(--wa-field)!important;border-color:var(--wa-line)!important;box-shadow:none!important}
.wa-root :is(.wa-search,.wa-emoji-search,.wa-find,.wa-sb-in,.wa-pair-row) input:is(:focus,:focus-visible){border-color:var(--wa-accent)!important;box-shadow:0 0 0 1px var(--wa-accent)!important;outline:0}
`;
