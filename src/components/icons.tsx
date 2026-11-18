import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (p: P) => ({
  viewBox: '0 0 24 24', width: 26, height: 26, fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
})

export const FeedIcon = (p: P) => <svg {...base(p)}><rect x="3.5" y="4" width="17" height="7" rx="2.5" /><rect x="3.5" y="13" width="17" height="7" rx="2.5" /></svg>
export const WorkoutIcon = (p: P) => <svg {...base(p)}><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /></svg>
export const RoutinesIcon = (p: P) => <svg {...base(p)}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>
export const ProfileIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></svg>
export const PlusIcon = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
export const CheckIcon = (p: P) => <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
export const ChevronIcon = (p: P) => <svg {...base(p)}><path d="M9 5l7 7-7 7" /></svg>
export const BackIcon = (p: P) => <svg {...base(p)}><path d="M15 5l-7 7 7 7" /></svg>
export const CloseIcon = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const TrashIcon = (p: P) => <svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5L18 7M9 7V4.5h6V7" /></svg>
export const UpIcon = (p: P) => <svg {...base(p)}><path d="M6 15l6-6 6 6" /></svg>
export const DownIcon = (p: P) => <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>
export const TrophyIcon = (p: P) => <svg {...base(p)}><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4.5a3 3 0 003.5 4M16 6h3.5a3 3 0 01-3.5 4M12 13v4M8.5 20h7M10 17h4" /></svg>
export const SearchIcon = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
export const CommentIcon = (p: P) => <svg {...base(p)}><path d="M5 18.5V6.5A2.5 2.5 0 017.5 4h9A2.5 2.5 0 0119 6.5v7a2.5 2.5 0 01-2.5 2.5H9z" /></svg>
export const StatsIcon = (p: P) => <svg {...base(p)}><path d="M4 20h16M7 16v-4M12 16V7M17 16v-7" /></svg>
export const LockIcon = (p: P) => <svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></svg>
export const GlobeIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></svg>
export const SettingsIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
export const PaletteIcon = (p: P) => <svg {...base(p)}><path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.8 0-1 .8-1.7 1.8-1.7h2.2a3.8 3.8 0 003.8-3.8C20.5 6.7 16.7 3.5 12 3.5z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10" cy="7.5" r="1.2" /><circle cx="14.5" cy="7.5" r="1.2" /></svg>
export const InfoIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></svg>
export const BellIcon = (p: P) => <svg {...base(p)}><path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0" /></svg>
export const DotsIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="5.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18.5" r="1.2" fill="currentColor" /></svg>
export const TimerIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 2M10 2.5h4" /></svg>
