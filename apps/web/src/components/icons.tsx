import { SVGProps } from "react";

/** Stroke-based line icons (currentColor), matching the design-system reference. */
type P = SVGProps<SVGSVGElement> & { size?: number };

function S({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const Icon = {
  search: (p: P) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></S>,
  calendar: (p: P) => <S {...p}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></S>,
  access: (p: P) => <S {...p}><circle cx="12" cy="4" r="1.6" /><path d="M4 8h16M12 8v7M12 15l-4 5M12 15l4 5" /></S>,
  globe: (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></S>,
  menu: (p: P) => <S {...p}><path d="M3 6h18M3 12h18M3 18h18" /></S>,
  grid: (p: P) => <S {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></S>,
  clock: (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></S>,
  wallet: (p: P) => <S {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 14h2" /></S>,
  shield: (p: P) => <S {...p}><path d="M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></S>,
  leaf: (p: P) => <S {...p}><path d="M12 21V11M12 11C12 7 15 4 20 4c0 5-4 7-8 7zM12 13C12 9 8 6 4 7c0 4 4 6 8 6z" /></S>,
  book: (p: P) => <S {...p}><path d="M12 5L3 9l9 4 9-4-9-4zM6 11v5c0 1.4 2.7 3 6 3s6-1.6 6-3v-5" /></S>,
  home: (p: P) => <S {...p}><path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-5h4v5" /></S>,
  heart: (p: P) => <S {...p}><path d="M12 21S3 14.5 3 8.5A4.5 4.5 0 0112 5a4.5 4.5 0 019 3.5C21 14.5 12 21 12 21z" /></S>,
  briefcase: (p: P) => <S {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M3 12h18" /></S>,
  users: (p: P) => <S {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M16 5a3 3 0 010 6M17 15c2.5.4 4 2 4 5" /></S>,
  cart: (p: P) => <S {...p}><path d="M3 5h2l1.5 11h12L21 8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></S>,
  chart: (p: P) => <S {...p}><path d="M4 20V9M10 20V4M16 20v-7M3 20h18" /></S>,
  layers: (p: P) => <S {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 14l9 5 9-5" /></S>,
  scale: (p: P) => <S {...p}><path d="M12 3v18M6 7h12M6 7l-3 6h6zM18 7l3 6h-6zM5 21h14" /></S>,
  file: (p: P) => <S {...p}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></S>,
  bell: (p: P) => <S {...p}><path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 004 0" /></S>,
  check: (p: P) => <S {...p}><path d="M5 13l4 4L19 7" /></S>,
  checkCircle: (p: P) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 12l2.5 2.5L16 9" /></S>,
  x: (p: P) => <S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>,
  arrowRight: (p: P) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>,
  chevronRight: (p: P) => <S {...p}><path d="M9 6l6 6-6 6" /></S>,
  chevronLeft: (p: P) => <S {...p}><path d="M15 6l-6 6 6 6" /></S>,
  logout: (p: P) => <S {...p}><path d="M9 4H5v16h4M15 8l4 4-4 4M19 12H9" /></S>,
  plus: (p: P) => <S {...p}><path d="M12 5v14M5 12h14" /></S>,
  ledger: (p: P) => <S {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></S>,
  building: (p: P) => <S {...p}><path d="M4 21V5l8-2 8 2v16M9 9h2M13 9h2M9 13h2M13 13h2M9 17h2M13 17h2" /></S>,
  rupee: (p: P) => <S {...p}><path d="M7 4h10M7 8h10M16 4c0 5-5 5-9 5l7 11" /></S>,
  send: (p: P) => <S {...p}><path d="M21 3L11 13M21 3l-6 18-4-8-8-4 18-6z" /></S>,
  user: (p: P) => <S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></S>,
  alert: (p: P) => <S {...p}><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></S>,
  sparkle: (p: P) => <S {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></S>,
  lock: (p: P) => <S {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 018 0v3" /></S>,
  phone: (p: P) => <S {...p}><path d="M5 3h4l2 5-3 2c1 2 3 4 5 5l2-3 5 2v4a2 2 0 01-2 2C10 21 3 14 3 5a2 2 0 012-2z" /></S>,
  doc: (p: P) => <S {...p}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /></S>,
  external: (p: P) => <S {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" /></S>,
  refresh: (p: P) => <S {...p}><path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M18 4v5h-5M6 20v-5h5" /></S>,
  store: (p: P) => <S {...p}><path d="M4 9l1.5-5h13L20 9M4 9h16M4 9v11h16V9M9 20v-6h6v6" /></S>,
};

export type IconName = keyof typeof Icon;
