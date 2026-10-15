import { test } from "node:test";
import assert from "node:assert/strict";
import { getStudentBrowserId } from "../src/services/studentLogin.ts";

test("browser identifier persists across calls and is independent of student sessions", () => {
  const values = new Map([["axiomStudentSession", "existing-session"]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const id = getStudentBrowserId(storage);
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(getStudentBrowserId(storage), id);
  values.delete("axiomStudentSession");
  assert.equal(getStudentBrowserId(storage), id);
  // Another tab reading the same storage uses the same bucket.
  assert.equal(getStudentBrowserId({ ...storage }), id);
});

test("malformed identifiers are replaced and valid uppercase identifiers are normalized", () => {
  let value = "invalid";
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
  const id = getStudentBrowserId(storage);
  assert.notEqual(id, "invalid");
  value = id.toUpperCase();
  assert.equal(getStudentBrowserId(storage), id);
});

test("unavailable storage fails rather than silently generating a fresh identifier on every attempt", () => {
  assert.throws(() => getStudentBrowserId({
    getItem: () => { throw new Error("Storage unavailable"); },
    setItem: () => {},
  }));
  assert.throws(() => getStudentBrowserId({
    getItem: () => null,
    setItem: () => { throw new Error("Storage unavailable"); },
  }));
});
