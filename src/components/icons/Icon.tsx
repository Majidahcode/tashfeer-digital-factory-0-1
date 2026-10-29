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
  /* the team screen: the production journey and the agent's details */
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5L20 20",
  pen: "M4 20l4-1 11-11-3-3L5 16z M14 7l3 3",
  code: "M8 8l-4 4 4 4 M16 8l4 4-4 4 M13.5 6l-3 12",
  check: "M5 12.5l4.5 4.5L19 7.5",
  rocket:
    "M12 3c3 2 5 5.5 5 9.5l-2.5 3.5h-5L7 12.5C7 8.5 9 5 12 3z M12 9.5h.01 M9.5 16l-1.5 4 2.5-1.5 M14.5 16l1.5 4-2.5-1.5",
  target:
    "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9",
  tools:
    "M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6L20 12l-8 8-3-3 8-8z M4 20l5-5 M5 4l4 4-1 1-4-4z",
  handoff:
    "M7 11V7a2 2 0 0 1 4 0v4 M13 11V6a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5v-2a2 2 0 0 1 3-1.7",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01",
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
