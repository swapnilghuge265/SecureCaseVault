// ---------------------------------------------------------------------------
// Inline SVG icon set (stroke-based, sized via Tailwind classes like w-4 h-4).
// Keeping icons local avoids an extra dependency and keeps the design
// consistent.
// ---------------------------------------------------------------------------

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function S({ children, ...props }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconShield = (p: P) => (
  <S {...p}>
    <path d="M12 3l7 3v5c0 4.6-3.1 8.1-7 10-3.9-1.9-7-5.4-7-10V6l7-3z" />
  </S>
);

export const IconShieldCheck = (p: P) => (
  <S {...p}>
    <path d="M12 3l7 3v5c0 4.6-3.1 8.1-7 10-3.9-1.9-7-5.4-7-10V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </S>
);

export const IconDashboard = (p: P) => (
  <S {...p}>
    <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
    <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
    <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5" />
  </S>
);

export const IconFile = (p: P) => (
  <S {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    <path d="M14 3v5h5" />
  </S>
);

export const IconFileText = (p: P) => (
  <S {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </S>
);

export const IconFolder = (p: P) => (
  <S {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </S>
);

export const IconList = (p: P) => (
  <S {...p}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.4} />
  </S>
);

export const IconBell = (p: P) => (
  <S {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
    <path d="M10.3 20a2 2 0 0 0 3.4 0" />
  </S>
);

export const IconUser = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.5c1.4-3.6 4.5-5 7.5-5s6.1 1.4 7.5 5" />
  </S>
);

export const IconUsers = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 20c1.2-3.2 3.8-4.6 6.5-4.6s5.3 1.4 6.5 4.6" />
    <path d="M15.8 5.3a3.2 3.2 0 0 1 0 5.6M18.4 15.9c1.5.7 2.7 2 3.1 4.1" />
  </S>
);

export const IconCog = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M4.7 4.7l2.1 2.1M17.2 17.2l2.1 2.1M2.5 12h3M18.5 12h3M4.7 19.3l2.1-2.1M17.2 6.8l2.1-2.1" />
  </S>
);

export const IconLogout = (p: P) => (
  <S {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </S>
);

export const IconSearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20.5 20.5L16.7 16.7" />
  </S>
);

export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);

export const IconDownload = (p: P) => (
  <S {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </S>
);

export const IconUpload = (p: P) => (
  <S {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </S>
);

export const IconTrash = (p: P) => (
  <S {...p}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </S>
);

export const IconEye = (p: P) => (
  <S {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </S>
);

export const IconX = (p: P) => (
  <S {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </S>
);

export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="M20 6L9 17l-5-5" />
  </S>
);

export const IconAlert = (p: P) => (
  <S {...p}>
    <path d="M10.3 3.9L1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </S>
);

export const IconClock = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3 2" />
  </S>
);

export const IconChevronRight = (p: P) => (
  <S {...p}>
    <path d="M9 6l6 6-6 6" />
  </S>
);

export const IconKey = (p: P) => (
  <S {...p}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M11 12l9.5-9.5M15 8l3 3" />
  </S>
);

export const IconLock = (p: P) => (
  <S {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </S>
);

export const IconActivity = (p: P) => (
  <S {...p}>
    <path d="M22 12h-4l-3 8L9 4l-3 8H2" />
  </S>
);

export const IconInbox = (p: P) => (
  <S {...p}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5 4h14l3 8v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3-8z" />
  </S>
);

export const IconMenu = (p: P) => (
  <S {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </S>
);

export const IconDatabase = (p: P) => (
  <S {...p}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </S>
);

export const IconFilter = (p: P) => (
  <S {...p}>
    <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" />
  </S>
);

export const IconPencil = (p: P) => (
  <S {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </S>
);
