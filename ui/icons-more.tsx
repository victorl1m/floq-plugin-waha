import type { SVGProps } from "react";

// Icons of labels, status, channels and calls (24x24, 1.75 stroke, like icons.tsx).
type P = SVGProps<SVGSVGElement>;
const Svg = (p: P) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p} />
);

export const IconTag = (p: P) => <Svg {...p}><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7a1 1 0 0 1 .7.3l7.6 7.6a1.5 1.5 0 0 1 0 2.1l-6.3 6.3a1.5 1.5 0 0 1-2.1 0l-7.6-7.6a1 1 0 0 1-.3-.7Z" /><circle cx="8" cy="8" r="1.4" /></Svg>;
export const IconStatus = (p: P) => <Svg {...p}><path d="M12 3a9 9 0 0 1 7.800 4.500" /><path d="M20.900 12.400A9 9 0 0 1 16.500 19.800" /><path d="M12.600 21A9 9 0 0 1 5.200 17.500" /><path d="M3.300 12.800A9 9 0 0 1 6.500 5.200" /><circle cx="12" cy="12" r="3.200" /></Svg>;
export const IconMegaphone = (p: P) => <Svg {...p}><path d="M4 10v4a1 1 0 0 0 1 1h2.500L15 19.500v-15L7.500 9H5a1 1 0 0 0-1 1Z" /><path d="M18.500 9.500a3.500 3.500 0 0 1 0 5" /><path d="M7.500 15l1 4.500" /></Svg>;
export const IconPhone = (p: P) => <Svg {...p}><path d="M5.500 4h3l1.500 4-2 1.300a11 11 0 0 0 5.700 5.700L15 13l4 1.500v3a2 2 0 0 1-2 2A13.500 13.500 0 0 1 3.500 6a2 2 0 0 1 2-2Z" /></Svg>;
export const IconVideoCall = (p: P) => <Svg {...p}><rect x="3" y="6.500" width="12" height="11" rx="2.500" /><path d="m15 11 5.500-3.200v8.400L15 13" /></Svg>;
export const IconPhoneDown = (p: P) => <Svg {...p}><path d="M3 14.500c5-4.600 13-4.600 18 0l-1.800 2.600-3.200-1.400v-2.600a10 10 0 0 0-8 0v2.600L4.800 17.100Z" /></Svg>;
export const IconChevronLeft = (p: P) => <Svg {...p}><path d="m15 5-7 7 7 7" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m9 5 7 7-7 7" /></Svg>;
export const IconPlusSmall = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconPencilSmall = (p: P) => <Svg {...p}><path d="m4 20 1-4L16.500 4.500a2.100 2.100 0 0 1 3 3L8 19l-4 1Z" /><path d="m14.500 6.500 3 3" /></Svg>;
export const IconTrashSmall = (p: P) => <Svg {...p}><path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12a1.500 1.500 0 0 0 1.500 1.400h6.400a1.500 1.500 0 0 0 1.500-1.400l.8-12" /><path d="M10 11v5M14 11v5" /></Svg>;
export const IconTextT = (p: P) => <Svg {...p}><path d="M5 7V5h14v2M12 5v14M9.500 19h5" /></Svg>;
export const IconImageSmall = (p: P) => <Svg {...p}><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><circle cx="9" cy="10" r="1.600" /><path d="m4 17 5-4.500 3.500 3 3-2.500L20 16.500" /></Svg>;
export const IconPlay = (p: P) => <Svg {...p}><path d="M8 5.500v13l11-6.500Z" fill="currentColor" stroke="none" /></Svg>;
export const IconVerified = (p: P) => <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false" {...p}><path d="M12 2.500 14.600 4.600l3.300-.2.9 3.200 2.800 1.800-1.100 3.100 1.100 3.100-2.800 1.800-.9 3.200-3.300-.2L12 21.500l-2.600-2.100-3.300.2-.9-3.200L2.400 14.600l1.100-3.100L2.400 8.400l2.800-1.800.9-3.200 3.300.2Z" fill="currentColor" /><path d="m8.500 12.200 2.400 2.400 4.600-4.800" fill="none" stroke="#fff" strokeWidth={1.900} strokeLinecap="round" strokeLinejoin="round" /></svg>;
