import type { SVGProps } from "react";

// Small inline icons (24x24, 1.75 stroke): the app's icon package is not shared with plugin bundles.
type P = SVGProps<SVGSVGElement>;
const Svg = (p: P) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p} />
);

export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>;
export const IconSend = (p: P) => <Svg {...p}><path d="M3.400 20.400 21 12 3.400 3.600 3.400 10.100 15 12 3.400 13.900Z" fill="currentColor" stroke="none" /></Svg>;
export const IconArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M4 13a8 8 0 0 0 14.3 4.5l1.7-2" /><path d="M20 20v-4.5h-4.5" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.5" /><path d="M12 17.2v.1" /></Svg>;
export const IconUsers = (p: P) => <Svg {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M15.5 5.5a3 3 0 0 1 0 6" /><path d="M17.5 14c2 .6 3.5 2.3 3.5 5" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4.2l2.6 1.6" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.5L7 21v-3.500H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><path d="M8 10h8M8 13.500h5" /></Svg>;
export const IconReply = (p: P) => <Svg {...p}><path d="M10 8.500V5L3.500 11.500 10 18v-3.600c4.600 0 7.800 1.400 10.500 5.100-.900-5.900-4.300-10.300-10.500-11Z" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconChecks = (p: P) => <Svg {...p}><path d="m2.5 12.5 4 4L15 8" /><path d="m11 16.5 1.200 1.200L21.500 8" /></Svg>;
export const IconArchive = (p: P) => <Svg {...p}><rect x="3.500" y="4.500" width="17" height="4" rx="1" /><path d="M5 8.500V18a1.500 1.500 0 0 0 1.500 1.500h11A1.500 1.500 0 0 0 19 18V8.500" /><path d="M10 12.500h4" /></Svg>;
export const IconBan = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" /><path d="m6.500 6.500 11 11" /></Svg>;
export const IconMuted = (p: P) => <Svg {...p}><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500H4Z" /><path d="m16 9.500 4.500 5M20.500 9.500 16 14.500" /></Svg>;
export const IconPinned = (p: P) => <Svg {...p}><path d="M9 4h6l-1 5.500 3 3.500H7l3-3.500L9 4Z" /><path d="M12 13v7" /></Svg>;
export const IconDots = (p: P) => <Svg {...p}><path d="M12 5.500v.1M12 12v.1M12 18.500v.1" strokeWidth={2.600} /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="M12 11v5.500" /><path d="M12 7.800v.1" strokeWidth={2.400} /></Svg>;
export const Spinner = () => <span className="wa-spin" aria-hidden="true" />;
