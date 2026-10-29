/**
 * The visitor's project as it moves between screens: the idea typed in the portal's chat, the attachments picked
 * there, and the team chosen on the agents screen. Nothing is sent anywhere — there is no backend yet.
 *
 * Kept in sessionStorage (this tab only; it survives navigation and a reload, and is gone when the tab closes). An
 * attachment is remembered by its name, kind, type and size; the file itself stays in this page's memory (FILES) and
 * is lost on a reload — browsers cannot keep a picked file in storage.
 */
import { useSyncExternalStore } from "react";

export type AttachmentKind = "description" | "file" | "video" | "image";
export type Attachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  type: string;
  size: number;
};

export type Project = {
  idea: string;
  attachments: Attachment[];
  /** null until the visitor (or «اختيار المقترحين») chooses: the agents screen then starts from the suggestions */
  team: string[] | null;
  confirmed: boolean;
  /** the team as it was approved on the team screen; a different current team means the approval no longer holds */
  approvedTeam: string[] | null;
  /** the prototypes review: the model chosen, the change requests recorded, and the approved design */
  chosenModel: ModelId | null;
  notes: DesignNote[];
  approvedDesign: ApprovedDesign | null;
};

export type ModelId = "A" | "B";
/** A change request, kept in this browser only — no agent acts on it yet. */
export type DesignNote = {
  id: string;
  model: ModelId;
  text: string;
  file: Attachment | null;
  at: number;
};
/** What was approved, with the idea and the team it was approved for (to know when it needs another look). */
export type ApprovedDesign = {
  model: ModelId;
  idea: string;
  team: string[];
  at: number;
};

const KEY = "tashfeer.project.v1";
const EMPTY: Project = {
  idea: "",
  attachments: [],
  team: null,
  confirmed: false,
  approvedTeam: null,
  chosenModel: null,
  notes: [],
  approvedDesign: null,
};
const FILES = new Map<string, File>();
const listeners = new Set<() => void>();
let state: Project = EMPTY;
let loaded = false;

function load(): Project {
  if (loaded || typeof window === "undefined") return state;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Project>;
      state = {
        idea: typeof p.idea === "string" ? p.idea : "",
        attachments: Array.isArray(p.attachments) ? p.attachments : [],
        team: Array.isArray(p.team)
          ? p.team.filter((x): x is string => typeof x === "string")
          : null,
        confirmed: p.confirmed === true,
        approvedTeam: Array.isArray(p.approvedTeam)
          ? p.approvedTeam.filter((x): x is string => typeof x === "string")
          : null,
        chosenModel:
          p.chosenModel === "A" || p.chosenModel === "B" ? p.chosenModel : null,
        notes: Array.isArray(p.notes) ? p.notes : [],
        approvedDesign:
          p.approvedDesign && typeof p.approvedDesign === "object"
            ? p.approvedDesign
            : null,
      };
    }
  } catch {
    // storage unavailable (private mode, blocked): the project lives in memory for this page only
  }
  return state;
}

function save() {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // see load()
  }
}

export function getProject(): Project {
  return load();
}

export function updateProject(
  change: Partial<Project> | ((p: Project) => Partial<Project>),
) {
  const current = load();
  state = {
    ...current,
    ...(typeof change === "function" ? change(current) : change),
  };
  save();
  for (const l of listeners) l();
}

export function addAttachments(kind: AttachmentKind, files: Iterable<File>) {
  const added: Attachment[] = [];
  for (const f of files) {
    const id = `${kind}-${f.name}-${f.size}-${f.lastModified}`;
    FILES.set(id, f);
    added.push({ id, kind, name: f.name, type: f.type, size: f.size });
  }
  updateProject((p) => ({
    attachments: [
      ...p.attachments.filter((a) => !added.some((n) => n.id === a.id)),
      ...added,
    ],
  }));
}

export function removeAttachment(id: string) {
  FILES.delete(id);
  updateProject((p) => ({
    attachments: p.attachments.filter((a) => a.id !== id),
  }));
}

/** Keep a reference file for a change request: in memory like the intake's attachments, its name in the note. */
export function keepNoteFile(f: File): Attachment {
  const id = `note-${f.name}-${f.size}-${f.lastModified}`;
  FILES.set(id, f);
  return { id, kind: "file", name: f.name, type: f.type, size: f.size };
}

export function addNote(model: ModelId, text: string, file: Attachment | null) {
  const note: DesignNote = {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    model,
    text,
    file,
    at: Date.now(),
  };
  updateProject((p) => ({ notes: [...p.notes, note] }));
}

export function removeNote(id: string) {
  updateProject((p) => {
    const n = p.notes.find((x) => x.id === id);
    if (n?.file) FILES.delete(n.file.id);
    return { notes: p.notes.filter((x) => x.id !== id) };
  });
}

/** Whether the file behind an attachment is still in this page's memory (false after a reload). */
export function hasFile(id: string): boolean {
  return FILES.has(id);
}

export function resetProject() {
  FILES.clear();
  state = EMPTY;
  save();
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The project, re-rendering on change; the server render (and the first client render) sees the empty project. */
export function useProject(): Project {
  return useSyncExternalStore(subscribe, getProject, () => EMPTY);
}

/** Links typed into the idea (the chat's «روابط» asks for them there). */
export function linksIn(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s،,]+/g) ?? [])];
}

/** The approval of the team: none yet, valid for the current team, or given to a team that has changed since. */
export function approvalOf(p: Project): "none" | "approved" | "changed" {
  if (!p.approvedTeam) return "none";
  const team = p.team ?? [];
  const same =
    team.length === p.approvedTeam.length &&
    team.every((id) => p.approvedTeam!.includes(id));
  return same ? "approved" : "changed";
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * The design approval: none yet; valid; or needing another look because the idea, the team or the chosen model has
 * changed since it was given.
 */
export function designApprovalOf(p: Project): "none" | "approved" | "review" {
  const d = p.approvedDesign;
  if (!d) return "none";
  const same =
    d.idea === p.idea &&
    sameSet(d.team, p.team ?? []) &&
    d.model === p.chosenModel;
  return same ? "approved" : "review";
}
