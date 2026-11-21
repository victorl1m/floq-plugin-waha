import type { SVGProps } from "react";

// Icons of the chat menu, the info panel and the new chat / group dialogs (24x24 grid, 1.75 stroke). Shared ones (x, check, search, users, arrow) stay in icons.tsx.
type P = SVGProps<SVGSVGElement>;
const Svg = (p: P) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p} />
);

export const IconDots = (p: P) => <Svg {...p}><circle cx="12" cy="5.500" r="1.500" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.500" fill="currentColor" stroke="none" /><circle cx="12" cy="18.500" r="1.500" fill="currentColor" stroke="none" /></Svg>;
export const IconArchive = (p: P) => <Svg {...p}><path d="M3.500 4h17v3.500h-17Z" /><path d="M5 7.500V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.500" /><path d="M10 12h4" /></Svg>;
export const IconUnarchive = (p: P) => <Svg {...p}><path d="M3.500 4h17v3.500h-17Z" /><path d="M5 7.500V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.500" /><path d="M12 17v-5M9.500 14.500 12 12l2.500 2.500" /></Svg>;
export const IconPinChat = (p: P) => <Svg {...p}><path d="M9 4h6l-1 5 3 3.500H7L10 9 9 4Z" /><path d="M12 12.500V20" /></Svg>;
export const IconPinOff = (p: P) => <Svg {...p}><path d="M9 4h6l-1 5 3 3.500H7L10 9 9 4Z" /><path d="M12 12.500V20M4 4l16 16" /></Svg>;
export const IconBell = (p: P) => <Svg {...p}><path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15L6 16.500Z" /><path d="M10 21h4" /></Svg>;
export const IconBellOff = (p: P) => <Svg {...p}><path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15L6 16.500Z" /><path d="M10 21h4M4 4l16 16" /></Svg>;
export const IconMarkUnread = (p: P) => <Svg {...p}><rect x="3.500" y="6" width="17" height="12.500" rx="2" /><path d="m4 7 8 6 8-6" /></Svg>;
export const IconMarkRead = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="m8.500 12.300 2.500 2.500 4.500-5" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="M12 11v5.500M12 7.700v.1" /></Svg>;
export const IconClearChat = (p: P) => <Svg {...p}><path d="M14 4l6 6-9.500 9.500H6l-3-3L14 4Z" /><path d="M8.500 9.500l6 6" /></Svg>;
export const IconBin = (p: P) => <Svg {...p}><path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l1 12.500h9l1-12.500M10 11v5M14 11v5" /></Svg>;
export const IconBlock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.500" /><path d="m6 6 12 12" /></Svg>;
export const IconExit = (p: P) => <Svg {...p}><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="m15 8 4 4-4 4M19 12H9" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="8.500" y="8.500" width="11" height="11" rx="2" /><path d="M15.500 8.500V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.500a2 2 0 0 0 2 2h2.500" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" /></Svg>;
export const IconUserPlus = (p: P) => <Svg {...p}><circle cx="10" cy="8.500" r="3.500" /><path d="M3.500 20c.4-3.600 3-5.500 6.500-5.500 1.200 0 2.300.2 3.200.7M18 8v6M15 11h6" /></Svg>;
export const IconUsersPlus = (p: P) => <Svg {...p}><circle cx="9" cy="8.500" r="3.200" /><path d="M3 19c0-3.300 2.700-5.500 6-5.500 1.300 0 2.500.3 3.500 1M18 12v6M15 15h6" /></Svg>;
export const IconMerge = (p: P) => <Svg {...p}><circle cx="9" cy="12" r="5.500" /><circle cx="15" cy="12" r="5.500" /></Svg>;
export const IconShield = (p: P) => <Svg {...p}><path d="m12 3.500 7 2.700v5.300c0 4.300-3 7.300-7 9-4-1.700-7-4.700-7-9V6.200l7-2.700Z" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="m4 20 1-4.500L16.500 4a2 2 0 0 1 3 3L8 18.500 4 20Z" /><path d="m14.500 6 3.500 3.500" /></Svg>;
export const IconPhoto = (p: P) => <Svg {...p}><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><circle cx="9" cy="10" r="1.600" /><path d="m4 17 5-4.500 3.500 3 3-2.500 4.500 4" /></Svg>;
export const IconPhone = (p: P) => <Svg {...p}><path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A15 15 0 0 1 4 5a1 1 0 0 1 1-1Z" /></Svg>;
export const IconNewChat = (p: P) => <Svg {...p}><path d="M20 12.500V16a2 2 0 0 1-2 2h-6.500L7 21v-3H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h7" /><path d="M18 3v6M15 6h6" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const IconMessage = (p: P) => <Svg {...p}><path d="M5 5.500h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.500L7 21v-3.500H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /></Svg>;
