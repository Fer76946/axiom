import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessmentInput,
  generateAccessCode,
  hashToken,
  number,
  randomHex,
  validAccessCode,
  validToken,
} from "../supabase/functions/_shared/validation.ts";
test("access codes preserve leading zeroes and reject invalid inputs", () => {
  assert.equal(validAccessCode("0123456"), "0123456");
  for (const value of ["123456", "12345678", "abcdefg", 1234567]) {
    assert.throws(() => validAccessCode(value));
  }
  for (let i = 0; i < 1000; i++) assert.match(generateAccessCode(), /^\d{7}$/);
});
test("grades reject blank, coercible, non-finite and out-of-range values", () => {
  for (const value of ["", "89", null, NaN, Infinity, -1, 101]) {
    assert.throws(() => number(value, "Grade", 0, 100));
  }
  assert.equal(number(89.5, "Grade", 0, 100), 89.5);
});
test("assessment validation enforces scores and real calendar dates", () => {
  const value = {
    title: " Quiz ",
    score: 18,
    maxScore: 20,
    date: "2026-10-12",
  };
  assert.deepEqual(assessmentInput(value), {
    title: "Quiz",
    score: 18,
    max_score: 20,
    date: value.date,
  });
  for (
    const invalid of [{ ...value, score: 21 }, { ...value, maxScore: 0 }, {
      ...value,
      date: "2026-02-30",
    }, { ...value, title: "" }]
  ) assert.throws(() => assessmentInput(invalid));
});
test("session tokens are random and stored as one-way hashes", async () => {
  const token = randomHex();
  assert.equal(validToken(token), token);
  assert.notEqual(token, randomHex());
  const hash = await hashToken(token);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(token, hash);
  assert.equal(await hashToken(token), hash);
  assert.throws(() => validToken("student-id"));
});
