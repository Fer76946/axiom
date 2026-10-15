import { test } from "node:test";
import assert from "node:assert/strict";
import { classKey, scoreChanges } from "../src/domain/testsQuizzes.ts";

test("score entry keeps blank separate from zero and only saves changed students", () => {
  const students = [{ id: "one", score: null }, { id: "two", score: 0 }, { id: "three", score: 7.5 }];
  assert.deepEqual(scoreChanges({ one: "", two: "0", three: "7.5" }, students, 10), []);
  assert.deepEqual(scoreChanges({ one: "0", two: "", three: "10" }, students, 10), [
    { studentId: "one", score: 0 }, { studentId: "two", score: null }, { studentId: "three", score: 10 },
  ]);
});
test("score entry rejects invalid numbers and scores outside the maximum", () => {
  for (const score of ["-1", "11", "NaN", "Infinity", "0xA", "true", "2 marks"]) {
    assert.throws(() => scoreChanges({ one: score }, [{ id: "one", score: null }], 10));
  }
});
test("classes distinguish subject and section even with punctuation in their names", () => {
  assert.notEqual(classKey({ subject: "Science / 6A", section: "B" }), classKey({ subject: "Science", section: "6A / B" }));
  assert.notEqual(classKey({ subject: "Math", section: "6A" }), classKey({ subject: "Science", section: "6A" }));
});
