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
/** A solid gold trophy (shaded, with a shine) for PR moments. Same shape as TrophyIcon. */
export const GoldTrophyIcon = ({ width = 30, height = 30, ...p }: P) => (
  <svg viewBox="0 0 24 24" width={width} height={height} aria-hidden {...p}>
    <defs>
      <linearGradient id="gt-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff4c2" /><stop offset=".35" stopColor="#fcd34d" /><stop offset=".7" stopColor="#f2a516" /><stop offset="1" stopColor="#b86e04" />
      </linearGradient>
    </defs>
    <g stroke="#8a5a00" strokeWidth=".7" strokeLinejoin="round">
      <path d="M7.3 5.6H4.6a.6.6 0 0 0-.6.7 4 4 0 0 0 3.9 3.9" fill="none" stroke="url(#gt-gold)" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M16.7 5.6h2.7a.6.6 0 0 1 .6.7 4 4 0 0 1-3.9 3.9" fill="none" stroke="url(#gt-gold)" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M6.8 3.2h10.4v5.6a5.2 5.2 0 0 1-10.4 0z" fill="url(#gt-gold)" />
      <path d="M10.7 13.7h2.6v3.4h-2.6z" fill="url(#gt-gold)" />
      <rect x="7.3" y="17" width="9.4" height="3.6" rx="1.1" fill="url(#gt-gold)" />
    </g>
    <path d="M8.9 4.8v3.8a3.2 3.2 0 0 0 1.4 2.6" fill="none" stroke="#fffbe8" strokeOpacity=".8" strokeWidth="1.1" strokeLinecap="round" />
  </svg>
)
export const TrophyIcon = (p: P) => <svg {...base(p)}><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4.5a3 3 0 003.5 4M16 6h3.5a3 3 0 01-3.5 4M12 13v4M8.5 20h7M10 17h4" /></svg>
export const SearchIcon = (p: P) => <svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
export const ShareIcon = (p: P) => <svg {...base(p)}><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1" /></svg>
export const SendIcon = (p: P) => <svg {...base(p)}><path d="M12 19.5V5M6 10.5L12 4.5l6 6" /></svg>
export const ChatIcon = (p: P) => <svg {...base(p)}><path d="M4.5 18.5l1.2-3.4A7.5 7.5 0 1112 19.5a7.6 7.6 0 01-3.6-.9z" /></svg>
export const CommentIcon = (p: P) => <svg {...base(p)}><path d="M5 18.5V6.5A2.5 2.5 0 017.5 4h9A2.5 2.5 0 0119 6.5v7a2.5 2.5 0 01-2.5 2.5H9z" /></svg>
export const StatsIcon = (p: P) => <svg {...base(p)}><path d="M4 20h16M7 16v-4M12 16V7M17 16v-7" /></svg>
export const LockIcon = (p: P) => <svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></svg>
export const GlobeIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></svg>
export const SettingsIcon = (p: P) => <svg {...base(p)}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
export const PaletteIcon = (p: P) => <svg {...base(p)}><path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.8 0-1 .8-1.7 1.8-1.7h2.2a3.8 3.8 0 003.8-3.8C20.5 6.7 16.7 3.5 12 3.5z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10" cy="7.5" r="1.2" /><circle cx="14.5" cy="7.5" r="1.2" /></svg>
export const InfoIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></svg>
export const BellIcon = (p: P) => <svg {...base(p)}><path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15zM10 20.5a2 2 0 004 0" /></svg>
export const DotsIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="5.5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18.5" r="1.2" fill="currentColor" /></svg>
export const GripIcon = (p: P) => <svg {...base(p)}><circle cx="9" cy="6" r="1.3" fill="currentColor" /><circle cx="15" cy="6" r="1.3" fill="currentColor" /><circle cx="9" cy="12" r="1.3" fill="currentColor" /><circle cx="15" cy="12" r="1.3" fill="currentColor" /><circle cx="9" cy="18" r="1.3" fill="currentColor" /><circle cx="15" cy="18" r="1.3" fill="currentColor" /></svg>
export const TimerIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 2M10 2.5h4" /></svg>
export const HistoryIcon = (p: P) => <svg {...base(p)}><path d="M3.5 12a8.5 8.5 0 102.5-6L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2" /></svg>
export const CalendarIcon = (p: P) => <svg {...base(p)}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
export const FriendsIcon = (p: P) => <svg {...base(p)}><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c.9-3.2 3.4-5 6.5-5s5.6 1.8 6.5 5M16 5.2a3.5 3.5 0 010 6.6M18 15.3c1.7.7 2.9 2.3 3.5 4.7" /></svg>
export const ExercisesIcon = (p: P) => <svg {...base(p)}><path d="M5 4.5h10.5a2 2 0 012 2V20H7a2 2 0 01-2-2zM5 18a2 2 0 012-2h10.5M9 8.5h5M9 11.5h3" /></svg>
export const NutritionIcon = (p: P) => <svg {...base(p)}><path d="M12 8c-1.6-1.3-3.6-1.7-5.3-.8C4.4 8.5 3.8 11.6 4.8 14.7c1 3.2 3.1 6 5.2 6.3.8.1 1.3-.4 2-.4s1.2.5 2 .4c2.1-.3 4.2-3.1 5.2-6.3 1-3.1.4-6.2-1.9-7.5-1.7-.9-3.7-.5-5.3.8z" /><path d="M12 8c0-2.2 1-3.8 3-4.5" /></svg>
export const BarcodeIcon = (p: P) => <svg {...base(p)}><path d="M4 7V5.5A1.5 1.5 0 015.5 4H7M17 4h1.5A1.5 1.5 0 0120 5.5V7M20 17v1.5a1.5 1.5 0 01-1.5 1.5H17M7 20H5.5A1.5 1.5 0 014 18.5V17M8 8v8M11 8v8M14 8v8M17 8v8" /></svg>
export const FlameIcon = (p: P) => <svg {...base(p)}><path d="M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-2.6 1.4-4.4 2.8-6 .3 1.6 1.2 2.7 2.2 3.2-.3-3.4 1.4-6.3 3.9-8 .2 2.5 1.5 4.2 2.9 5.6 1.2 1.3 1.9 3 1.9 5.2 0 3.6-3.1 6.2-7.2 6.2z" /></svg>
export const SparkIcon = (p: P) => <svg {...base(p)}><path d="M12 3.5l1.8 4.9 4.9 1.8-4.9 1.8L12 16.9l-1.8-4.9-4.9-1.8 4.9-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></svg>
export const BoltIcon = (p: P) => <svg {...base(p)}><path d="M13 3L5 13.5h6L10.5 21 19 10.5h-6z" /></svg>
export const BookIcon = (p: P) => <svg {...base(p)}><path d="M4.5 5.5A1.5 1.5 0 016 4h4.5a1.5 1.5 0 011.5 1.5V20a1.5 1.5 0 00-1.5-1.5H6A1.5 1.5 0 014.5 17zM19.5 5.5A1.5 1.5 0 0018 4h-4.5A1.5 1.5 0 0012 5.5V20a1.5 1.5 0 011.5-1.5H18a1.5 1.5 0 001.5-1.5z" /></svg>
export const BedIcon = (p: P) => <svg {...base(p)}><path d="M3.5 18.5V6M3.5 14h17v4.5M20.5 14v-2.5a3 3 0 00-3-3H11v5.5" /><circle cx="7.3" cy="10.8" r="1.8" /></svg>

// ---- Replacements for emoji (same 24px line style) ----
export const MuscleIcon = (p: P) => <svg {...base(p)}><path d="M4.5 15.5c0-3.2 1.6-5.6 3.4-7.6l1.8-2.3c.6-.8 1.8-.9 2.5-.2.6.6.6 1.6.1 2.3l-1.3 1.7c1.4-.4 2.9-.1 4 .8 1.5-1.4 3.9-1.2 5 .5 1.1 1.6.5 3.9-1.3 4.9-2.3 1.3-5.3 2.4-8.4 2.4H7a2.5 2.5 0 01-2.5-2.5z" /><path d="M10.5 13.5c1.2-.9 2.7-1 4-.3" /></svg>
export const ClapIcon = (p: P) => <svg {...base(p)}><path d="M8.5 12.5V7a1.25 1.25 0 012.5 0v4.5M11 11V5.5a1.25 1.25 0 012.5 0V11M13.5 11V6.5a1.25 1.25 0 012.5 0V12M16 12V9.5a1.25 1.25 0 012.5 0v4.3a6.2 6.2 0 01-6.2 6.2h-.6a6 6 0 01-4.7-2.3l-2.2-2.8a1.3 1.3 0 012-1.7l.7.8" /><path d="M3.5 8.5l1.6.8M4.5 5l1.2 1.4M7.5 3.5l.3 1.7" /></svg>
export const RocketIcon = (p: P) => <svg {...base(p)}><path d="M14.5 4.5c2.6-1.1 4.6-1.1 5.1-.6s.5 2.5-.6 5.1l-5.6 5.6-4.5-4.5z" /><path d="M8.9 10.1L5.5 9.6 3.5 11.6l3.6 1.3M13.9 15.1l.5 3.4-2 2-1.3-3.6M6.8 17.2c-1.4.4-2.6 1.7-2.8 2.8 1.1-.2 2.4-1.4 2.8-2.8" /><circle cx="15.5" cy="8.5" r="1.3" /></svg>
export const StarIcon = (p: P) => <svg {...base(p)}><path d="M12 3.8l2.5 5.1 5.6.8-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z" /></svg>
export const MailIcon = (p: P) => <svg {...base(p)}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4.5 7.5l7.5 5.5 7.5-5.5" /></svg>
export const LinkIcon = (p: P) => <svg {...base(p)}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>
export const TargetIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></svg>
export const ScaleIcon = (p: P) => <svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M8.3 10a5 5 0 017.4 0M12 10.2l1.4-1.8" /></svg>
export const TrendIcon = (p: P) => <svg {...base(p)}><path d="M3.5 17l5.5-5.5 3.5 3.5 7-7M14.5 8h5v5" /></svg>
export const ForecastIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="10.5" r="6.5" /><path d="M7.8 15.5L6.5 20.5h11l-1.3-5M9.5 8.3a3 3 0 012.7-1.6" /></svg>
export const DnaIcon = (p: P) => <svg {...base(p)}><path d="M7 3.5c0 5.5 10 5.5 10 8.5s-10 3-10 8.5M17 3.5c0 5.5-10 5.5-10 8.5s10 3 10 8.5M8.5 6.5h7M8.5 17.5h7" /></svg>
export const MoonIcon = (p: P) => <svg {...base(p)}><path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z" /></svg>
export const SunriseIcon = (p: P) => <svg {...base(p)}><path d="M12 4v3.5M5.6 9.1l1.6 1.6M18.4 9.1l-1.6 1.6M3.5 17h17M7 17a5 5 0 0110 0M7.5 20.5h9" /></svg>
export const SproutIcon = (p: P) => <svg {...base(p)}><path d="M12 20.5V11M12 13.5c0-4-2.8-6.5-7-6.5 0 4 2.8 6.5 7 6.5zM12 11c0-3.6 2.6-6.2 6.5-6.2 0 3.6-2.6 6.2-6.5 6.2z" /></svg>
export const BikeIcon = (p: P) => <svg {...base(p)}><circle cx="5.5" cy="16" r="3.5" /><circle cx="18.5" cy="16" r="3.5" /><path d="M5.5 16l4-7h5.5l3.5 7M9.5 9l3.5 7M12.5 6.5H15" /></svg>
export const RulerIcon = (p: P) => <svg {...base(p)}><path d="M3.5 16l12.5-12.5 4.5 4.5L8 20.5z" /><path d="M7 12.5l1.5 1.5M10 9.5l1.5 1.5M13 6.5l1.5 1.5" /></svg>
export const RepeatIcon = (p: P) => <svg {...base(p)}><path d="M4 11V9.5A3.5 3.5 0 017.5 6H19M16 3l3 3-3 3M20 13v1.5a3.5 3.5 0 01-3.5 3.5H5M8 21l-3-3 3-3" /></svg>
export const PuzzleIcon = (p: P) => <svg {...base(p)}><path d="M5 8.5h3.5a2 2 0 114 0H16V12a2 2 0 110 4v3.5h-3.5a2 2 0 10-4 0H5V16a2 2 0 100-4z" /></svg>
export const TagIcon = (p: P) => <svg {...base(p)}><path d="M3.5 12.2V4.5a1 1 0 011-1h7.7l8.3 8.3a1.5 1.5 0 010 2.1l-6.6 6.6a1.5 1.5 0 01-2.1 0z" /><circle cx="8" cy="8" r="1.3" /></svg>
export const SleepIcon = (p: P) => <svg {...base(p)}><path d="M4.5 10.5h5l-5 6.5h5M13 4h6.5L13 12h6.5" /></svg>
export const BurstIcon = (p: P) => <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>
export const ImportIcon = (p: P) => <svg {...base(p)}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 15.5V18a2 2 0 002 2h11a2 2 0 002-2v-2.5" /></svg>
export const SmileIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14a4.5 4.5 0 007 0M9 9.5v.5M15 9.5v.5" /></svg>
export const UserPlusIcon = (p: P) => <svg {...base(p)}><circle cx="9.5" cy="8.5" r="3.5" /><path d="M3.5 19.5c.9-3 3.1-4.5 6-4.5s5.1 1.5 6 4.5M18.5 8v6M15.5 11h6" /></svg>
export const UserCheckIcon = (p: P) => <svg {...base(p)}><circle cx="9.5" cy="8.5" r="3.5" /><path d="M3.5 19.5c.9-3 3.1-4.5 6-4.5s5.1 1.5 6 4.5M15.5 11.5l2 2 3.5-3.5" /></svg>
export const ReplyIcon = (p: P) => <svg {...base(p)}><path d="M9.5 6l-5 5 5 5M4.5 11H14a5.5 5.5 0 015.5 5.5V18" /></svg>
export const CheckCircleIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.5l2.7 2.7L16 9.8" /></svg>
export const XCircleIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></svg>
export const HelpIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.5a2.4 2.4 0 014.6.9c0 1.6-2.3 2-2.3 3.6M12 17v.2" /></svg>
export const PlateIcon = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 3.5v3M12 17.5v3" /></svg>
