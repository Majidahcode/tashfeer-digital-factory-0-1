/**
 * The two visual directions shown on the prototypes review. Today both are illustrative previews of one example site —
 * the same content and functions in two styles, so the comparison is fair — and nothing is generated from the
 * visitor's idea. When real outputs exist, a prototype's `source` becomes an image or a live URL and the review shows
 * it instead (PrototypePreview.tsx); the rest of the screen does not change.
 */
import type { ModelId } from "@/lib/project-store";

export type PrototypeSource =
  | { kind: "illustrative"; theme: "light" | "dark" }
  | { kind: "image"; src: string; width: number; height: number }
  | { kind: "url"; src: string };

export type Prototype = {
  id: ModelId;
  name: string;
  direction: string;
  summary: string;
  source: PrototypeSource;
};

export const PROTOTYPES: readonly Prototype[] = [
  {
    id: "A",
    name: "النموذج A",
    direction: "فاتح · منظم",
    summary: "مساحات بيضاء واسعة، وأقسام واضحة الترتيب، ولمسات زمردية هادئة.",
    source: { kind: "illustrative", theme: "light" },
  },
  {
    id: "B",
    name: "النموذج B",
    direction: "داكن · تقني · فاخر",
    summary:
      "خلفية داكنة عميقة، وإضاءة ليمونية للعناصر المهمة، وطابع تقني راقٍ.",
    source: { kind: "illustrative", theme: "dark" },
  },
];

export const modelName = (id: ModelId) =>
  PROTOTYPES.find((p) => p.id === id)?.name ?? id;
