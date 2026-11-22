import type { SVGProps } from "react";

// Icons of the connection screen and the account menu (24x24, 1.75 stroke), like ui/icons.tsx.
type P = SVGProps<SVGSVGElement>;
const Svg = (p: P) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p} />
);

export const IconSmartphone = (p: P) => <Svg {...p}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></Svg>;
export const IconPlugOff = (p: P) => <Svg {...p}><path d="M9 3v4M15 3v4" /><path d="M6.5 7h11v3.500a5.500 5.500 0 0 1-11 0V7Z" /><path d="M12 16v5" /><path d="m3 3 18 18" /></Svg>;
export const IconServerOff = (p: P) => <Svg {...p}><rect x="3.500" y="4" width="17" height="6.500" rx="2" /><rect x="3.500" y="13.500" width="17" height="6.500" rx="2" /><path d="M7.500 7.200v.1M7.500 16.700v.1" /><path d="m3 3 18 18" /></Svg>;
export const IconKey = (p: P) => <Svg {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 8.500-8.500M16 6.500l2.500 2.500M14 8.500l2 2" /></Svg>;
export const IconPower = (p: P) => <Svg {...p}><path d="M12 3v8.500" /><path d="M7 6.300a8 8 0 1 0 10 0" /></Svg>;
export const IconStop = (p: P) => <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2.500" /></Svg>;
export const IconLogout = (p: P) => <Svg {...p}><path d="M10 4H6.500A2.500 2.500 0 0 0 4 6.500v11A2.500 2.500 0 0 0 6.500 20H10" /><path d="M15 8l4 4-4 4M19 12H9.500" /></Svg>;
export const IconSliders = (p: P) => <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>;
export const IconCamera = (p: P) => <Svg {...p}><path d="M4.500 8h3l1.500-2.500h6L16.500 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.500" /></Svg>;
export const IconCheckCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12.500 3 3 5-6" /></Svg>;
export const IconQr = (p: P) => <Svg {...p}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.500v2.500H14zM19 14v.1M14 19.500v.1M17 19.500h3M19 17v.1" /></Svg>;
export const IconAlertCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.500v5.500M12 16.300v.1" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7.500 10.500 12 15l4.500-4.500M5 19.500h14" /></Svg>;
