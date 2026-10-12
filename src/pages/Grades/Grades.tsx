import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { errorMessage, gradesService } from "../../services";
import type { StudentGrades } from "../../domain/types";
import { formatOverallGrade } from "../../domain/grading";
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
        <h1>My Grades</h1>
        <p>Student - {data?.student.name ?? studentSession.student.name}</p>
      </header>
      {loading && <p role="status">Loading grades...</p>}
      {message && (
        <div role="alert">
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
        <>
          <article className="grade-card">
            <div className="grade-card__header">
              <span>Class</span>
              <h2>
                {[data.student.subject, data.student.section].filter(Boolean)
                  .join(" - ") || "No class assigned"}
              </h2>
            </div>
            <div className="grade-card__current">
              <span>Overall Grade:</span>
              <strong>
                {formatOverallGrade(data.overallGrade)}
              </strong>
            </div>
          </article>
          <article className="grade-card">
            <h2>Assessments</h2>
            {data.assessments.length === 0
              ? <p>No assessments yet.</p>
              : (
                <ul className="assessment-list">
                  {data.assessments.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.date}</p>
                      </div>
                      <span>
                        {Math.round(item.score / item.maxScore * 1000) / 10}%
                        {" "}
                        <small>({item.score}/{item.maxScore})</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </article>
        </>
      )}
    </section>
  );
}
export default Grades;
