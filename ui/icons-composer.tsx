import type { SVGProps } from "react";

// Composer icons (24x24 grid, 1.75 stroke). The shared ones (send, x, check, file, search) stay in icons.tsx.
type P = SVGProps<SVGSVGElement>;
const Svg = (p: P) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p} />
);

export const IconSmile = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8.500 14c.9 1.400 2.100 2.100 3.500 2.100s2.600-.7 3.500-2.100" /><path d="M9 9.500v.2M15 9.500v.2" strokeWidth={2.400} /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconMic = (p: P) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v3" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l1 12.500h9l1-12.500M10 11v5M14 11v5" /></Svg>;
export const IconImage = (p: P) => <Svg {...p}><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><circle cx="9" cy="10" r="1.600" /><path d="m4 17 5-4.500 3.500 3 3-2.500 4.500 4" /></Svg>;
export const IconDocument = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Svg>;
export const IconCamera = (p: P) => <Svg {...p}><path d="M4 8h3l1.500-2.500h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.400" /></Svg>;
export const IconPoll = (p: P) => <Svg {...p}><path d="M5 20V10M12 20V4M19 20v-7" strokeWidth={2.600} /></Svg>;
export const IconPin = (p: P) => <Svg {...p}><path d="M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0 1 13 0c0 5.400-6.500 11-6.500 11Z" /><circle cx="12" cy="10" r="2.400" /></Svg>;
export const IconContact = (p: P) => <Svg {...p}><circle cx="12" cy="9" r="3.500" /><path d="M5 20c.5-3.600 3.200-5.500 7-5.500s6.500 1.900 7 5.500" /></Svg>;
export const IconPlay = (p: P) => <Svg {...p}><path d="M8 5.500v13l11-6.500Z" fill="currentColor" /></Svg>;
export const IconPencil = (p: P) => <Svg {...p}><path d="m4 20 1-4.500L16.500 4a2 2 0 0 1 3 3L8 18.500 4 20Z" /><path d="m14.500 6 3.500 3.500" /></Svg>;
export const IconAudio = (p: P) => <Svg {...p}><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 11v2" /></Svg>;
