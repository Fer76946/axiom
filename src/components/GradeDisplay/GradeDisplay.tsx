import { formatOverallGrade, getLetterGrade } from "../../domain/grading";
export default function GradeDisplay({ grade }: { grade: number | null }) {
  if (grade === null) {
    return (
      <span className="grade-display grade-display--empty">No grade yet</span>
    );
  }
  return (
    <span className="grade-display">
      <span className="sr-only">{formatOverallGrade(grade)}</span>
      <span aria-hidden="true">{grade}%</span>
      <span className="grade-display__letter" aria-hidden="true">
        {getLetterGrade(grade)}
      </span>
    </span>
  );
}
