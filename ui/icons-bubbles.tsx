import type { SVGProps } from "react";

// Icons of the conversation log (24x24, 1.75 stroke), same conventions as ui/icons.tsx.
type P = SVGProps<SVGSVGElement>;
const Svg = (p: P) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p} />
);

export const IconPlay = (p: P) => <Svg {...p}><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" /></Svg>;
export const IconPause = (p: P) => <Svg {...p}><rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor" /><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11" /><path d="m7.500 11 4.500 4.500L16.500 11" /><path d="M5 19.500h14" /></Svg>;
export const IconBan = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="m6 6 12 12" /></Svg>;
export const IconForward = (p: P) => <Svg {...p}><path d="M14 8.500V5l6.500 6.500L14 18v-3.600c-4.600 0-7.800 1.400-10.500 5.100.9-5.900 4.300-10.300 10.500-11Z" /></Svg>;
export const IconStar = (p: P) => <Svg {...p}><path d="m12 3.800 2.600 5.300 5.800.8-4.200 4.100 1 5.800L12 17.100l-5.200 2.700 1-5.800-4.200-4.100 5.800-.8L12 3.800Z" /></Svg>;
export const IconStarFilled = (p: P) => <Svg {...p}><path d="m12 3.800 2.600 5.300 5.800.8-4.200 4.100 1 5.800L12 17.100l-5.200 2.700 1-5.800-4.200-4.100 5.800-.8L12 3.800Z" fill="currentColor" /></Svg>;
export const IconPin = (p: P) => <Svg {...p}><path d="M9 4h6l-1 5.500 3 3V14H7v-1.500l3-3L9 4Z" /><path d="M12 14v6" /></Svg>;
export const IconPinOff = (p: P) => <Svg {...p}><path d="M9 4h6l-1 5.500 3 3V14H7v-1.500l3-3L9 4Z" /><path d="M12 14v6" /><path d="m4 4 16 16" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="8.500" y="8.500" width="11" height="11" rx="2" /><path d="M15.500 8.500V6.500a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16v4Z" /><path d="m13.500 6.500 4 4" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M4.500 7h15" /><path d="M9.500 7V4.500h5V7" /><path d="m6.500 7 .8 12.500h9.400L17.500 7" /><path d="M10 11v5M14 11v5" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="M12 11v5.500" /><path d="M12 7.800v.1" /></Svg>;
export const IconSmile = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="M8.500 14c.8 1.400 2 2.100 3.500 2.100s2.700-.7 3.500-2.100" /><path d="M9 9.800v.1M15 9.800v.1" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></Svg>;
export const IconArrowRight = (p: P) => <Svg {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></Svg>;
export const IconZoomIn = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.500" /><path d="m20 20-4.200-4.200" /><path d="M8.500 11h5M11 8.500v5" /></Svg>;
export const IconZoomOut = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.500" /><path d="m20 20-4.200-4.200" /><path d="M8.500 11h5" /></Svg>;
export const IconVideo = (p: P) => <Svg {...p}><rect x="3.500" y="6.500" width="12" height="11" rx="2.500" /><path d="m15.500 10.500 5-2.500v8l-5-2.500" /></Svg>;
export const IconPhone = (p: P) => <Svg {...p}><path d="M6.500 4h3l1.500 4-2 1.300a11 11 0 0 0 5.700 5.700L16 13l4 1.500v3a2.500 2.500 0 0 1-2.700 2.500A15 15 0 0 1 4 6.700 2.500 2.500 0 0 1 6.500 4Z" /></Svg>;
export const IconMapPin = (p: P) => <Svg {...p}><path d="M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0 1 13 0c0 5.400-6.500 11-6.500 11Z" /><circle cx="12" cy="10" r="2.400" /></Svg>;
export const IconUser = (p: P) => <Svg {...p}><circle cx="12" cy="8.500" r="3.800" /><path d="M4.500 20c0-3.800 3.400-6 7.500-6s7.500 2.200 7.500 6" /></Svg>;
export const IconMic = (p: P) => <Svg {...p}><rect x="9" y="3.500" width="6" height="11" rx="3" /><path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v2.500" /></Svg>;
export const IconPoll = (p: P) => <Svg {...p}><path d="M5 20V10M12 20V4M19 20v-6" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.500" /><path d="m20 20-4.200-4.200" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconAlertCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="M12 7.500v5.500" /><path d="M12 16.200v.1" /></Svg>;
export const IconCheckCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="m8.200 12.300 2.800 2.800 4.800-5.300" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M20 11a8 8 0 0 0-14.300-4.500L4 8.500" /><path d="M4 4v4.500h4.500" /><path d="M4 13a8 8 0 0 0 14.300 4.500l1.700-2" /><path d="M20 20v-4.500h-4.500" /></Svg>;
export const IconFileText = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 16.500h4" /></Svg>;
export const IconImage = (p: P) => <Svg {...p}><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><circle cx="9" cy="10" r="1.700" /><path d="m4 17 5-4.500 4 3.500 3-2.500 4 3.500" /></Svg>;
export const IconExternal = (p: P) => <Svg {...p}><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></Svg>;
export const IconCallMissed = (p: P) => <Svg {...p}><path d="m3.500 4 6 6M3.500 9.500V4H9" /><path d="M8 11.500a11 11 0 0 0 4.500 4.500l1.700-1.700 3.800 1.500v2.700a2 2 0 0 1-2.200 2A14 14 0 0 1 6.500 9.500 2 2 0 0 1 8.500 7.300" /></Svg>;

/** Ticks of an own message. */
export const IconTickClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="7.500" /><path d="M12 8v4.200l2.600 1.600" /></Svg>;
export const IconTick1 = (p: P) => <Svg {...p}><path d="m5.500 12.500 4.500 4.500 8.500-9.500" /></Svg>;
export const IconTick2 = (p: P) => <Svg {...p}><path d="m2.500 12.500 4.500 4.500 8-9" /><path d="m10.500 15.500 1.500 1.500 9-9.500" /></Svg>;
export const IconTickFail = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8" fill="currentColor" stroke="none" /><path d="M12 7.800v5" stroke="#fff" /><path d="M12 16.100v.1" stroke="#fff" /></Svg>;
