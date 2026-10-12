import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  clearStudentSession,
  readStudentSession,
  saveStudentSession,
} from "../src/services/studentSession.ts";
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
});
beforeEach(() => storage.clear());
const session = () => ({
  token: "a".repeat(64),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  student: { id: "student-a", name: "Yoyo", subject: "Science", section: "6A" },
});
test("valid session survives reload and logout removes all student state", () => {
  const value = session();
  saveStudentSession(value);
  assert.deepEqual(readStudentSession(), value);
  storage.set("axiomStudent", JSON.stringify({ studentId: "student-b" }));
  clearStudentSession();
  assert.equal(readStudentSession(), null);
  assert.equal(storage.size, 0);
});
test("legacy ID-only session cannot authorize access", () => {
  storage.set("axiomStudent", JSON.stringify({ studentId: "student-b" }));
  assert.equal(readStudentSession(), null);
  assert.equal(storage.size, 0);
});
test("corrupt, expired, and malformed sessions are discarded", () => {
  for (
    const value of [
      "{",
      JSON.stringify({ ...session(), expiresAt: "invalid" }),
      JSON.stringify({ ...session(), expiresAt: "2020-01-01" }),
      JSON.stringify({ ...session(), token: "forged-id" }),
    ]
  ) {
    storage.set("axiomStudentSession", value);
    assert.equal(readStudentSession(), null);
    assert.equal(storage.size, 0);
  }
});
