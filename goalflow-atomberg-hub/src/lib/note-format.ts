// The `QuarterUpdate.note` field stores BOTH the manager's check-in comment
// and the employee's own context for the quarter. We use a delimiter format
// inside the single text column so we don't need a schema migration mid-hackathon:
//
//   [Manager] <manager text>\n---\n<employee text>
//
// Either side may be empty. A legacy / employee-only note has no prefix.
// On save, each author replaces only their own portion via splitNote → joinNote.

export interface NoteParts {
  manager: string;
  employee: string;
}

const MANAGER_TAG = "[Manager]";
const SEP = "\n---\n";

export function splitNote(raw: string | null | undefined): NoteParts {
  if (!raw) return { manager: "", employee: "" };
  const text = String(raw);
  if (text.startsWith(MANAGER_TAG)) {
    const body = text.slice(MANAGER_TAG.length).replace(/^\s+/, "");
    const sepIdx = body.indexOf(SEP);
    if (sepIdx >= 0) {
      return {
        manager: body.slice(0, sepIdx).trim(),
        employee: body.slice(sepIdx + SEP.length).trim(),
      };
    }
    return { manager: body.trim(), employee: "" };
  }
  return { manager: "", employee: text.trim() };
}

export function joinNote(parts: NoteParts): string | null {
  const m = parts.manager.trim();
  const e = parts.employee.trim();
  if (!m && !e) return null;
  if (!m) return e;
  if (!e) return `${MANAGER_TAG} ${m}`;
  return `${MANAGER_TAG} ${m}${SEP}${e}`;
}

export function setManagerNote(raw: string | null | undefined, managerText: string): string | null {
  return joinNote({ ...splitNote(raw), manager: managerText });
}

export function setEmployeeNote(raw: string | null | undefined, employeeText: string): string | null {
  return joinNote({ ...splitNote(raw), employee: employeeText });
}
