const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
};
export const HeartIcon = ({ filled, ...p }) => (
  <svg {...base} {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20.5s-7.5-4.6-9-9.4C2 7.8 4 5 7 5c2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 3 0 5 2.8 4 6.1-1.5 4.8-9 9.4-9 9.4Z" />
  </svg>
);
export const LockIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="5" y="11" width="14" height="9" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const ArrowIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);
