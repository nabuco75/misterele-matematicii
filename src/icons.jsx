// Iconițe în linie subțire (stil unitar), desenate pe o grilă de 24×24; culoarea vine din `color` (currentColor).
const PATHS = {
  school: (
    <>
      <path d="M3 21h18" />
      <path d="M5 21V10l7-5 7 5v11" />
      <path d="M10 21v-5h4v5" />
      <path d="M12 5V2.5l3 1.2-3 1.2" />
      <path d="M8.5 12.5h1M14.5 12.5h1" />
    </>
  ),
  seat: (
    <>
      <path d="M7 3h10v8H7z" />
      <path d="M5 11h14v3H5z" />
      <path d="M7 14v7M17 14v7" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 15v2.5" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3h10v5" />
      <rect x="3" y="8" width="18" height="9" rx="2.5" />
      <path d="M7 14h10v7H7z" />
      <path d="M17.5 11.5h.01" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5z" />
      <path d="M14 6.5l3 3" />
      <path d="M13 20h7" />
    </>
  ),
  plus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.7 2.7L16.5 9.5" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 5 5 6 5 9s-5 4-5 9" />
      <path d="M17 3c0 5-5 6-5 9s5 4 5 9" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-4M12 16V7M17 16v-7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .7 3.2 2.4 3.5 5.2" />
    </>
  ),
  list: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  teacher: (
    <>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 20c.4-3.6 2.6-6 5.5-6s5.1 2.4 5.5 6" />
      <path d="M13 4h8v9h-6" />
      <path d="M15.5 7.5h3" />
    </>
  ),
  building: (
    <>
      <path d="M3 21h18" />
      <path d="M4 9l8-5 8 5" />
      <path d="M6 9v9M10 9v9M14 9v9M18 9v9" />
      <path d="M4 18h16" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export default function Icon({ name, size = 24, strokeWidth = 1.75, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] || PATHS.sparkle}
    </svg>
  );
}
