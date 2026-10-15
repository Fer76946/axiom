import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { errorMessage, gradesService } from "../../services";
import type { StudentGrades } from "../../domain/types";
import GradeDisplay from "../../components/GradeDisplay/GradeDisplay";
import EmptyState from "../../components/EmptyState/EmptyState";
import TestQuizResults from "../../components/Assessments/TestQuizResults";
import "./Grades.css";

function Grades() {
  const { studentSession, logout } = useAuth();
  const [result, setResult] = useState<
    { token: string; data: StudentGrades } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const token = studentSession?.token;
  const data = result?.token === token ? result?.data : null;
  useEffect(() => {
    if (!token) return;
    let active = true;
    gradesService.getStudentGrades(token).then((result) => {
      if (active) {
        setResult({ token, data: result });
        setMessage("");
      }
    }).catch((error) => {
      if (active) setMessage(errorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [token, attempt]);
  if (!studentSession) return null;
  return (
    <section className="grades-page">
      <header className="grades-heading">
        <span className="student-avatar" aria-hidden="true">
          {(data?.student.name ?? studentSession.student.name).slice(0, 1)
            .toUpperCase()}
        </span>
        <div>
          <p className="eyebrow">Your classroom</p>
          <h1>My Grades</h1>
          <p>{data?.student.name ?? studentSession.student.name} · Student</p>
        </div>
      </header>
      {loading && (
        <p className="loading-state" role="status">Loading grades...</p>
      )}
      {message && (
        <div className="feedback feedback--error" role="alert">
          <p>{message}</p>
          <button
            onClick={() => {
              setLoading(true);
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </button>{" "}
          <button
            onClick={() => {
              void logout().catch(() => undefined);
            }}
          >
            Sign out
          </button>
        </div>
      )}
      {data && !message && (
        <div className="grades-grid">
          <article className="grade-card">
            <div className="grade-card__header">
              <span>Assigned class</span>
              <h2>
                {[data.student.subject, data.student.section].filter(Boolean)
                  .join(" - ") || "No class assigned"}
              </h2>
            </div>
            <div className="grade-card__current">
              <span>Overall grade</span>
              <GradeDisplay grade={data.overallGrade} />
            </div>
            <p className="grade-card__note">
              Your current overall grade, entered by your teacher.
            </p>
          </article>
          <article className="grade-card assessments-card">
            <div className="section-heading">
              <div>
                <h2>Tests &amp; Quizzes</h2>
                <p>Your scores and upcoming grading.</p>
              </div>
              <span className="count-badge">{data.assessments.length + data.testsQuizzes.length}</span>
            </div>
            {data.testsQuizzes.length > 0 && <TestQuizResults items={data.testsQuizzes} />}
            {data.assessments.length === 0 && data.testsQuizzes.length === 0
              ? (
                <EmptyState
                  title="Your learning record starts here"
                  description="Tests and quizzes will appear here when your teacher adds them."
                />
              )
              : (
                <ul className="assessment-list">
                  {data.assessments.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.date}</p>
                      </div>
                      <span className="assessment-score">
                        {Math.round(item.score / item.maxScore * 1000) / 10}%
                        {" "}
                        <small>({item.score}/{item.maxScore})</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </article>
        </div>
      )}
    </section>
  );
}
export default Grades;
