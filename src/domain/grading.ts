export function formatOverallGrade(grade: number | null): string {
  if (grade === null) return "No grade yet";
  const letter = grade >= 90
    ? "A"
    : grade >= 80
    ? "B"
    : grade >= 70
    ? "C"
    : grade >= 60
    ? "D"
    : "F";
  return `${grade}% (${letter})`;
}
