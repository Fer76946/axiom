import type { StudentTestQuiz } from "../../domain/types";

export default function TestQuizResults({ items }: { items: StudentTestQuiz[] }) {
  return <ul className="assessment-list">{items.map(item => <li key={item.id}>
    <div><strong>{item.title}</strong><p>{item.kind === "test" ? "Test" : "Quiz"} · {item.date}</p></div>
    <span className="assessment-score">{item.score === null ? "Not graded yet" : <>
      {Math.round(item.score / item.maxScore * 1000) / 10}%
      <small>({item.score}/{item.maxScore})</small>
    </>}</span>
  </li>)}</ul>;
}
