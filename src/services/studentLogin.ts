const BROWSER_KEY = "axiom-student-login-browser";
const browserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Separate from student sessions: shared by tabs and retained across logout.
export function getStudentBrowserId(storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage): string {
  const existing = storage.getItem(BROWSER_KEY);
  if (existing && browserIdPattern.test(existing)) return existing.toLowerCase();
  const browserId = crypto.randomUUID();
  storage.setItem(BROWSER_KEY, browserId);
  return browserId;
}

export class StudentLoginCooldownError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "StudentLoginCooldownError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
