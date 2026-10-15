import { useEffect, useRef, useState } from "react";
import type { Student, TestQuiz, TestQuizClass, TestQuizDetails, TestQuizInput } from "../../domain/types";
import { classKey, scoreChanges } from "../../domain/testsQuizzes";
import { rosterStudentName } from "../../domain/rosterNames";
import { errorMessage, gradesService } from "../../services";
import "./TestsQuizzesManager.css";

function newForm(): TestQuizInput {
  const now = new Date();
  return {
    kind: "test", title: "", maxScore: 100, classes: [],
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  };
}

export default function TestsQuizzesManager({ students, showChineseNames, disabled, onBusyChange, onClose }: {
  students: Student[];
  showChineseNames: boolean;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const activePanel = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<TestQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<TestQuizDetails | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<{ id: string; revision: number | null; input: TestQuizInput; original: string } | null>(null);
  const locked = disabled || busy || loading;
  const scoresDirty = details?.students.some(student => (drafts[student.id] ?? "") !== (student.score === null ? "" : String(student.score))) ?? false;
  const formDirty = editor !== null && JSON.stringify(editor.input) !== editor.original;
  const mayDiscard = () => !(scoresDirty || formDirty) || window.confirm("Discard your unsaved changes?");

  useEffect(() => {
    panel.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    panel.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    let active = true;
    gradesService.getTestsQuizzes().then(data => {
      if (active) setItems(data);
    }).catch(cause => {
      if (active) setError(errorMessage(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const activeId = editor?.id ?? details?.item.id;
  const editingDetails = editor !== null;
  useEffect(() => {
    if (!activeId) return;
    activePanel.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    activePanel.current?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select")?.focus({ preventScroll: true });
  }, [activeId, editingDetails]);

  function showDetails(value: TestQuizDetails) {
    setDetails(value);
    setDrafts(Object.fromEntries(value.students.map(student => [student.id, student.score === null ? "" : String(student.score)])));
    setItems(current => current.map(item => item.id === value.item.id ? value.item : item));
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    onBusyChange(true);
    setError("");
    setMessage("");
    try { await work(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function open(item: TestQuiz) {
    if (!mayDiscard()) return;
    void run(async () => {
      const value = await gradesService.getTestQuiz(item.id);
      setEditor(null);
      showDetails(value);
    });
  }
  function create() {
    if (!mayDiscard()) return;
    const input = newForm();
    setDetails(null);
    setDrafts({});
    setError("");
    setMessage("");
    setEditor({ id: crypto.randomUUID(), revision: null, input, original: JSON.stringify(input) });
  }
  function edit() {
    if (!details || !mayDiscard()) return;
    const { id, revision, ...input } = details.item;
    // Reset discarded score drafts so cancelling details edits returns to saved scores.
    showDetails(details);
    setEditor({ id, revision, input, original: JSON.stringify(input) });
  }
  function saveDetails(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (!editor.input.classes.length) { setError("Select at least one class."); return; }
    void run(async () => {
      const item = await gradesService.saveTestQuiz(editor.id, editor.revision, editor.input);
      setItems(current => [...current.filter(value => value.id !== item.id), item].sort((a, b) => b.date.localeCompare(a.date)));
      setEditor(null);
      setDetails(null);
      setDrafts({});
      setMessage(`${item.kind === "test" ? "Test" : "Quiz"} saved.`);
      showDetails(await gradesService.getTestQuiz(item.id));
    });
  }
  function saveScores(event: React.FormEvent) {
    event.preventDefault();
    if (!details) return;
    let changes;
    try { changes = scoreChanges(drafts, details.students, details.item.maxScore); }
    catch (cause) { setError(errorMessage(cause)); return; }
    if (!changes.length) { setMessage("No scores changed."); return; }
    if (changes.length > 1000) { setError("Save up to 1,000 changed scores at a time."); return; }
    void run(async () => {
      await gradesService.saveTestQuizScores(details.item.id, details.item.revision, changes);
      showDetails(await gradesService.getTestQuiz(details.item.id));
      setMessage("Scores saved.");
    });
  }
  function remove() {
    if (!details || !mayDiscard() || !window.confirm(`Delete "${details.item.title}" and all its student scores?`)) return;
    void run(async () => {
      await gradesService.deleteTestQuiz(details.item.id, details.item.revision);
      setItems(current => current.filter(value => value.id !== details.item.id));
      setDetails(null);
      setDrafts({});
      setMessage("Test or quiz deleted.");
    });
  }
  const classes = [...new Map<string, TestQuizClass>([
    ...students.filter(student => student.subject && student.section).map(student => {
      const value = { subject: student.subject!, section: student.section! };
      return [classKey(value), value] as const;
    }),
    ...(editor?.input.classes ?? []).map(value => [classKey(value), value] as const),
  ]).values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.section.localeCompare(b.section, undefined, { numeric: true }));

  return <section className="students-card tests-quizzes" ref={panel} tabIndex={-1} aria-labelledby="tests-quizzes-title">
    <div className="teacher-header">
      <h2 id="tests-quizzes-title">Tests &amp; Quizzes</h2>
      <div className="student-actions">
        <button disabled={locked} onClick={create}>Create test or quiz</button>
        <button disabled={busy || disabled} onClick={() => { if (mayDiscard()) onClose(); }}>Close Tests &amp; Quizzes</button>
      </div>
    </div>
    <p>Create once for one or more classes, then enter each student's score. Blank scores mean not graded yet. Overall grades are entered separately.</p>
    {error && <p className="feedback feedback--error" role="alert">{error} <button disabled={locked} onClick={() => {
      if (details) open(details.item);
      else if (mayDiscard()) { setEditor(null); setError(""); setLoading(true); setAttempt(value => value + 1); }
    }}>Reload</button></p>}
    {message && <p className="feedback feedback--success" role="status">{message}</p>}
    {loading ? <p role="status">Loading tests and quizzes…</p> : <>
      {items.length === 0 ? <p>No tests or quizzes yet. Create one to start entering scores.</p> :
        <ul className="tests-quizzes__list">{items.map(item => <li key={item.id}>
          <button disabled={locked} aria-pressed={details?.item.id === item.id || editor?.id === item.id} onClick={() => open(item)}>
            <strong>{item.title}</strong>
            <span>{item.kind === "test" ? "Test" : "Quiz"} · {item.date} · Out of {item.maxScore}</span>
            <span>{item.classes.map(value => `${value.subject} / ${value.section}`).join(", ")}</span>
          </button>
        </li>)}</ul>}
    </>}
    <div ref={activePanel} className="tests-quizzes__active">
    {editor && <form className="create-student-form tests-quizzes__form" onSubmit={saveDetails}>
      <h3>{editor.revision === null ? "Create test or quiz" : "Edit test or quiz"}</h3>
      <fieldset disabled={locked}>
        <label>Type<select value={editor.input.kind} onChange={event => setEditor({ ...editor, input: { ...editor.input, kind: event.target.value as "test" | "quiz" } })}>
          <option value="test">Test</option><option value="quiz">Quiz</option>
        </select></label>
        <label>Title<input required maxLength={120} value={editor.input.title} onChange={event => setEditor({ ...editor, input: { ...editor.input, title: event.target.value } })} /></label>
        <label>Date<input required type="date" value={editor.input.date} onChange={event => setEditor({ ...editor, input: { ...editor.input, date: event.target.value } })} /></label>
        <label>Maximum score<input required type="number" min="0.01" step="0.01" value={editor.input.maxScore} onChange={event => setEditor({ ...editor, input: { ...editor.input, maxScore: Number(event.target.value) } })} /></label>
      </fieldset>
      <fieldset className="tests-quizzes__classes" disabled={locked}>
        <legend>Applicable classes</legend>
        {!classes.length && <p>Create or import students with a subject and class first.</p>}
        {classes.map(value => <label key={classKey(value)}>
          <input type="checkbox" checked={editor.input.classes.some(item => classKey(item) === classKey(value))} onChange={event => setEditor({
            ...editor, input: { ...editor.input, classes: event.target.checked ? [...editor.input.classes, value] : editor.input.classes.filter(item => classKey(item) !== classKey(value)) },
          })} />{value.subject} / {value.section}
        </label>)}
      </fieldset>
      {editor.revision !== null && <p>Existing student scores are kept if you remove a class. The maximum score cannot be lower than a saved score.</p>}
      <div className="student-actions">
        <button type="submit" disabled={locked || !editor.input.classes.length}>{busy ? "Saving…" : "Save test or quiz"}</button>
        <button type="button" disabled={locked} onClick={() => { if (mayDiscard()) setEditor(null); }}>Cancel</button>
      </div>
    </form>}
    {details && !editor && <div className="tests-quizzes__details">
      <div className="teacher-header">
        <h3>{details.item.title} — {details.item.kind === "test" ? "Test" : "Quiz"}</h3>
        <div className="student-actions">
          <button disabled={locked} onClick={edit}>Edit details / classes</button>
          <button className="delete-student-button" disabled={locked} onClick={remove}>Delete</button>
        </div>
      </div>
      <p>{details.item.date} · Maximum score: {details.item.maxScore} · {details.students.filter(student => student.score !== null).length} of {details.students.length} graded</p>
      {scoresDirty && <p role="status">You have unsaved scores. Results below show the last saved scores.</p>}
      {!details.students.length ? <p>No students are currently in the selected classes. Choose Edit details / classes to change them.</p> :
        <form onSubmit={saveScores}>
          <fieldset disabled={locked}>
            <legend>Student scores</legend>
            <div className="tests-quizzes__scores" tabIndex={0} role="region" aria-label="Test or quiz score table">
              <table>
                <thead><tr><th scope="col">Student</th><th scope="col">Subject / Class</th><th scope="col">Score / {details.item.maxScore}</th><th scope="col">Result</th></tr></thead>
                <tbody>{[...details.students].sort((a, b) => (a.section ?? "").localeCompare(b.section ?? "", undefined, { numeric: true }) || a.name.localeCompare(b.name)).map(student => <tr key={student.id}>
                  <th scope="row">{rosterStudentName(student.name, showChineseNames)}{!student.applicable && <small>Saved result from a previous class</small>}</th>
                  <td>{student.subject || "Unassigned"} / {student.section || "Unassigned"}</td>
                  <td><input type="number" min="0" max={details.item.maxScore} step="0.01" placeholder="Ungraded" aria-label={`Score for ${rosterStudentName(student.name, showChineseNames)}`} value={drafts[student.id] ?? ""} onChange={event => setDrafts({ ...drafts, [student.id]: event.target.value })} /></td>
                  <td>{student.score === null ? "Not graded yet" : `${Math.round(student.score / details.item.maxScore * 1000) / 10}%`}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="student-actions"><button type="submit" disabled={!scoresDirty}>{busy ? "Saving…" : "Save scores"}</button>
              <button type="button" disabled={!scoresDirty} onClick={() => { if (mayDiscard()) showDetails(details); }}>Discard score changes</button>
            </div>
          </fieldset>
        </form>}
    </div>}
    </div>
  </section>;
}
