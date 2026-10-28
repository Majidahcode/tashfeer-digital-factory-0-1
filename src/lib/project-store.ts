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
export type Attachment = { id: string; kind: AttachmentKind; name: string; type: string; size: number };

export type Project = {
  idea: string;
  attachments: Attachment[];
  /** null until the visitor (or «اختيار المقترحين») chooses: the agents screen then starts from the suggestions */
  team: string[] | null;
  confirmed: boolean;
};

const KEY = "tashfeer.project.v1";
const EMPTY: Project = { idea: "", attachments: [], team: null, confirmed: false };
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
        team: Array.isArray(p.team) ? p.team.filter((x): x is string => typeof x === "string") : null,
        confirmed: p.confirmed === true,
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

export function updateProject(change: Partial<Project> | ((p: Project) => Partial<Project>)) {
  const current = load();
  state = { ...current, ...(typeof change === "function" ? change(current) : change) };
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
  updateProject((p) => ({ attachments: [...p.attachments.filter((a) => !added.some((n) => n.id === a.id)), ...added] }));
}

export function removeAttachment(id: string) {
  FILES.delete(id);
  updateProject((p) => ({ attachments: p.attachments.filter((a) => a.id !== id) }));
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
