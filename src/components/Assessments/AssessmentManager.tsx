import { useEffect, useRef, useState } from "react";
import type { Assessment, AssessmentInput, Student } from "../../domain/types";
import { errorMessage, gradesService } from "../../services";
import EmptyState from "../EmptyState/EmptyState";
const emptyForm = (): AssessmentInput => {
  const today = new Date();
  const date = `${today.getFullYear()}-${
    String(today.getMonth() + 1).padStart(2, "0")
  }-${String(today.getDate()).padStart(2, "0")}`;
  return { title: "", score: 0, maxScore: 100, date };
};
export default function AssessmentManager(
  { student, onClose }: { student: Student; onClose: () => void },
) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    panel.current?.focus({ preventScroll: true });
  }, []);
  const [items, setItems] = useState<Assessment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    gradesService.getAssessments(student.id).then((data) => {
      if (active) setItems(data);
    }).catch((cause) => {
      if (active) setError(errorMessage(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [student.id, attempt]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing) await gradesService.updateAssessment(editing, form);
      else await gradesService.createAssessment(student.id, form);
      setItems(await gradesService.getAssessments(student.id));
      setEditing(null);
      setForm(emptyForm());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Assessment) {
    if (!window.confirm(`Delete assessment "${item.title}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await gradesService.deleteAssessment(item.id);
      setItems(items.filter((value) => value.id !== item.id));
      if (editing === item.id) {
        setEditing(null);
        setForm(emptyForm());
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="students-card assessment-manager"
      ref={panel}
      tabIndex={-1}
      aria-label={`Assessments for ${student.name}`}
      onKeyDown={event => {
        if (event.key === "Escape" && !event.nativeEvent.isComposing && editing && !busy) {
          event.preventDefault();
          event.stopPropagation();
          setEditing(null);
          setForm(emptyForm());
        }
      }}
    >
      <div className="teacher-header">
        <h2>Assessments — {student.name}</h2>
        <button disabled={busy} onClick={onClose}>Close</button>
      </div>
      {error && (
        <p className="feedback feedback--error" role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              setLoading(true);
              setAttempt(attempt + 1);
            }}
          >
            Reload
          </button>
        </p>
      )}
      {loading
        ? <p className="loading-state" role="status">Loading assessments...</p>
        : items.length === 0
        ? (
          <EmptyState
            title="No assessments yet"
            description="Add a test, quiz, or assignment below. Scores are shown individually to this student."
          />
        )
        : (
          <ul className="assessment-list">
            {items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.date} · {item.score}/{item.maxScore} ·{" "}
                    {Math.round(item.score / item.maxScore * 1000) / 10}%
                  </p>
                </div>
                <div className="student-actions">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditing(item.id);
                      setForm({
                        title: item.title,
                        score: item.score,
                        maxScore: item.maxScore,
                        date: item.date,
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    disabled={busy}
                    className="delete-student-button"
                    onClick={() => void remove(item)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      <form className="create-student-form assessment-form" onSubmit={save}>
        <h3>{editing ? "Edit Assessment" : "Add Assessment"}</h3>
        <fieldset disabled={busy || loading}>
          <label>
            Title<input
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Score<input
              required
              type="number"
              min="0"
              max={form.maxScore}
              step="0.01"
              value={form.score}
              onChange={(e) =>
                setForm({ ...form, score: Number(e.target.value) })}
            />
          </label>
          <label>
            Maximum score<input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={form.maxScore}
              onChange={(e) =>
                setForm({ ...form, maxScore: Number(e.target.value) })}
            />
          </label>
          <label>
            Date<input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
          <div className="student-actions">
            <button type="submit">
              {busy ? "Saving…" : "Save Assessment"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm());
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </section>
  );
}
