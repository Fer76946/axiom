import type { TestQuizClass, TestQuizScore } from "./types.ts";

export const classKey = ({ subject, section }: TestQuizClass) => JSON.stringify([subject, section]);

// Empty inputs are ungraded; zero is a real score. Reject coercible non-numbers.
export function scoreChanges(
  drafts: Record<string, string>,
  original: { id: string; score: number | null }[],
  maxScore: number,
): TestQuizScore[] {
  return original.flatMap(student => {
    const value = drafts[student.id]?.trim() ?? "";
    if (value && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error("Enter a numeric score or leave it blank.");
    const score = value === "" ? null : Number(value);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > maxScore)) {
      throw new Error(`Scores must be between 0 and ${maxScore}, or blank for not graded yet.`);
    }
    return score === student.score ? [] : [{ studentId: student.id, score }];
  });
}
