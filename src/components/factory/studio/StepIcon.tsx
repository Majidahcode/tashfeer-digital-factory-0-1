import type { StepIcon as Name } from "@/domain/factory-story";

/** The factory window's small line icons (24 px grid, stroke follows the text colour). */
const PATHS: Record<Name, string> = {
  layers: "M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  palette:
    "M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 5.9 17 3 12 3ZM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M17 11h.01",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  home: "M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  calendar: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h2m4 0h2m-8 4h2m4 0h2",
  check: "M5 12.5 10 17l9-10",
  flow: "M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3-3m-3 3 3 3",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h2",
  click: "M9 9l11 4-5 2-2 5-4-11ZM4 4l2.5 2.5M9 2v3M2 9h3",
  box: "M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8",
  cart: "M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01",
  mail: "M4 6h16v12H4V6Zm0 0 8 7 8-7",
  monitor: "M3 5h18v11H3V5Zm6 15h6m-3-4v4",
  shield: "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

export function StepIcon({ name, size = 22 }: { name: Name; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** the station's own icon, for the window's head and the stations' rail */
export const STATION_ICON: Record<string, Name> = {
  setup: "layers",
  interfaces: "monitor",
  services: "database",
  quality: "shield",
  delivery: "box",
};
