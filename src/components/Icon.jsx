// Small line icons drawn on a 24×24 grid. They use currentColor.
const P = {
  client: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 13.8c.5-.2 1-.3 1.5-.3 2.5 0 4.2 2 4.2 4.8" />
    </>
  ),
  bot: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="2.5" />
      <path d="M12 8V4.5M9.5 13h.01M14.5 13h.01M9.5 16.5h5" />
      <circle cx="12" cy="4" r="1" />
    </>
  ),
  cdn: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5s1.1-5.9 3.6-8.5z" />
    </>
  ),
  dns: (
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
      <circle cx="18" cy="17.5" r="2" />
    </>
  ),
  lb: (
    <>
      <circle cx="5" cy="12" r="2" />
      <path d="M7 12h4M11 12l7-6M11 12h7M11 12l7 6" />
      <path d="M16 5h2.5v2.5M16 19h2.5v-2.5" />
    </>
  ),
  app: (
    <>
      <rect x="4" y="3.5" width="16" height="7" rx="1.5" />
      <rect x="4" y="13.5" width="16" height="7" rx="1.5" />
      <path d="M7.5 7h.01M7.5 17h.01M11 7h5M11 17h5" />
    </>
  ),
  server: (
    <>
      <rect x="3.5" y="3" width="17" height="18" rx="2" />
      <path d="M3.5 9h17M3.5 15h17M7 6h.01M7 12h.01M7 18h.01M11 6h6M11 12h6M11 18h6" />
    </>
  ),
  gateway: (
    <>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6M4 20h16" />
    </>
  ),
  ratelimit: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" />
      <path d="M9 12h6" />
    </>
  ),
  service: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  nosql: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" />
      <path d="M9 11.5l2 2-2 2M13 15.5h3" />
    </>
  ),
  blob: (
    <>
      <path d="M4 8l8-4.5L20 8v8l-8 4.5L4 16z" />
      <path d="M4 8l8 4.5L20 8M12 12.5v8" />
    </>
  ),
  stream: (
    <>
      <path d="M3 7h12M3 12h18M3 17h12" />
      <path d="M17 4.5l3 2.5-3 2.5M17 14.5l3 2.5-3 2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.4-4.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9M7 13.5l5-5 5 5M5 4h14" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5s1.1-5.9 3.6-8.5z" />
    </>
  ),
  svc: (
    <>
      <path d="M12 3l7.5 4.3v9.4L12 21l-7.5-4.3V7.3z" />
      <path d="M12 12l7.5-4.7M12 12v9M12 12L4.5 7.3" />
    </>
  ),
  cache: <path d="M13.5 3L5 13.5h6L10 21l9-11h-6.2z" />,
  db: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
    </>
  ),
  replica: (
    <>
      <ellipse cx="10" cy="6" rx="6" ry="2.3" />
      <path d="M4 6v10c0 1.3 2.7 2.3 6 2.3M16 6v3" />
      <ellipse cx="16" cy="12.5" rx="5" ry="1.9" />
      <path d="M11 12.5v6.5c0 1 2.2 1.9 5 1.9s5-.9 5-1.9v-6.5" />
    </>
  ),
  queue: (
    <>
      <rect x="3" y="8" width="4" height="8" rx="1" />
      <rect x="9" y="8" width="4" height="8" rx="1" />
      <rect x="15" y="8" width="4" height="8" rx="1" />
      <path d="M20.5 12h1" />
    </>
  ),
  worker: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  ext: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  // UI glyphs
  book: <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5c-.8 0-1.5-.7-1.5-1.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  window: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8.5h18M6.5 6.2h.01M9 6.2h.01" />
    </>
  ),
  sheets: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
  pause: <path d="M8 5.5v13M16 5.5v13" />,
  left: <path d="M14.5 6l-6 6 6 6" />,
  right: <path d="M9.5 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M7 7l10 10M17 7L7 17" />,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />,
  bolt: <path d="M13.5 3L5 13.5h6L10 21l9-11h-6.2z" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />,
  alert: <path d="M12 4l9 16H3zM12 10v4.5M12 17.5h.01" />,
  sparkles: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  arrowRight: <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />,
  reset: <path d="M4.5 12a7.5 7.5 0 102.2-5.3M4.5 4.5v4h4" />,
  flame: <path d="M12 21c-3.9 0-6.5-2.7-6.5-6.2 0-3.6 3-5.6 3.6-9.3 2 1.3 3.2 3 3.4 5 .9-.6 1.6-1.6 1.8-2.8 2.4 1.9 4.2 4.4 4.2 7.1 0 3.5-2.6 6.2-6.5 6.2z" />,
  link: <path d="M10 14l4-4M8.5 11.5L6.3 13.7a3.5 3.5 0 105 5l2.2-2.2M15.5 12.5l2.2-2.2a3.5 3.5 0 10-5-5L10.5 7.5" />,
  lightbulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" />,
};

export default function Icon({ name, size = 18, stroke = 1.8, className = '', title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {P[name] || P.svc}
    </svg>
  );
}

// raw paths for use inside another <svg>
export function IconPaths({ name }) {
  return P[name] || P.svc;
}
