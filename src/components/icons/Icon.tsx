const PATHS = {
  doc: "M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  file: "M6 3h8l4 4v14H6z M14 3v4h4",
  video: "M3 6h18v12H3z M10 9.5l5 2.5-5 2.5z",
  image: "M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M6 11a6 6 0 0 0 12 0 M12 17v4",
  send: "M4 12l16-8-6 16-3-7z",
  cloud:
    "M7 18a5 5 0 0 1-.5-10 6 6 0 0 1 11.5 1.5A4 4 0 0 1 17 18z M12 11v6 M9.5 13.5L12 11l2.5 2.5",
  chevron: "M6 9.5l6 6 6-6",
  /* the agents without an image yet (AgentCarousel's placeholder): product management, requirements, performance */
  roadmap: "M4 6h7 M4 12h11 M4 18h6 M15 4l3 2-3 2 M18 16l2 2-2 2",
  checklist:
    "M9 6h11 M9 12h11 M9 18h11 M3.5 6l1.2 1.2L7 5 M3.5 12l1.2 1.2L7 11 M3.5 18l1.2 1.2L7 17",
  gauge:
    "M4 17a8 8 0 1 1 16 0 M12 17l4-5 M12 17h.01 M6.5 13.5l1 .5 M17.5 13.5l-1 .5 M12 9v1",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
