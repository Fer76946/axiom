import type { StudentSession } from "../domain/types";
const KEY = "axiomStudentSession";
export function readStudentSession(): StudentSession | null {
  try {
    // Identity-only legacy sessions cannot authorize grade access.
    sessionStorage.removeItem("axiomStudent");
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (
      !value || typeof value.token !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.token) ||
      typeof value.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      Date.parse(value.expiresAt) <= Date.now() ||
      typeof value.student?.id !== "string" ||
      typeof value.student?.name !== "string"
    ) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}
export function saveStudentSession(session: StudentSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}
export function clearStudentSession() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem("axiomStudent");
}
