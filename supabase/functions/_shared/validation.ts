export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function text(value: unknown, label: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new HttpError(
      400,
      `${label} is required (maximum ${max} characters).`,
    );
  }
  return value.trim();
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) throw new HttpError(400, "Invalid record ID.");
  return value.toLowerCase();
}
export function studentInput(body: Record<string, unknown>) {
  return {
    name: text(body.name, "Student name").normalize("NFC"),
    subject: text(body.subject, "Subject").normalize("NFC"),
    section: text(body.section, "Class").normalize("NFC"),
  };
}
// A name collision is a warning to resolve identity, never a student identifier.
export function studentNameKey(name: string) {
  return name.trim().normalize("NFC").toLocaleLowerCase("en-US");
}
export function number(
  value: unknown,
  label: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < min ||
    value > max
  ) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return value;
}
export function assessmentInput(body: Record<string, unknown>) {
  const title = text(body.title, "Title");
  const maxScore = number(body.maxScore, "Maximum score", 0.01);
  const score = number(body.score, "Score", 0, maxScore);
  const date = text(body.date, "Date", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) throw new HttpError(400, "Invalid assessment date.");
  return { title, score, max_score: maxScore, date };
}
export function validAccessCode(value: unknown): string {
  if (typeof value !== "string" || !/^\d{7}$/.test(value)) {
    throw new HttpError(400, "Enter a valid 7-digit access code.");
  }
  return value;
}
export function validToken(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new HttpError(
      401,
      "Your student session has expired. Please sign in again.",
    );
  }
  return value;
}
export function randomHex(bytes = 32): string {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(bytes)),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hashToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(
    new Uint8Array(hash),
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}
// Rejection sampling avoids modulo bias when generating a seven-digit code.
export function generateAccessCode(): string {
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= 4290000000);
  return String(value % 10000000).padStart(7, "0");
}
