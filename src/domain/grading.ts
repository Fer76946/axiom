export function getLetterGrade(grade: number): string {
  return grade >= 90
    ? "A"
    : grade >= 80
    ? "B"
    : grade >= 70
    ? "C"
    : grade >= 60
    ? "D"
    : "F";
}
export function formatOverallGrade(grade: number | null): string {
  return grade === null
    ? "No grade yet"
    : `${grade}% (${getLetterGrade(grade)})`;
}
