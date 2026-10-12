import { useCallback, useEffect, useRef, useState } from "react";
import type { Student, StudentInput } from "../../domain/types";
import GradeDisplay from "../../components/GradeDisplay/GradeDisplay";
import EmptyState from "../../components/EmptyState/EmptyState";
import { errorMessage, gradesService, studentsService } from "../../services";
import AssessmentManager from "../../components/Assessments/AssessmentManager";
import "./Teacher.css";
const blankStudent: StudentInput = { name: "", subject: "", section: "" };
function Teacher() {
  const editorPanel = useRef<HTMLElement>(null);
  const createPanel = useRef<HTMLElement>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(blankStudent);
  const [createdStudent, setCreatedStudent] = useState<Student | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [editor, setEditor] = useState<
    {
      studentId: string;
      kind: "grade" | "class";
      grade: string;
      subject: string;
      section: string;
    } | null
  >(null);
  const [assessmentStudent, setAssessmentStudent] = useState<Student | null>(
    null,
  );
  const reload = useCallback(async () => {
    setStudents(await studentsService.getStudents());
  }, []);
  useEffect(() => {
    let active = true;
    studentsService.getStudents().then((data) => {
      if (active) setStudents(data);
    }).catch((cause) => {
      if (active) setError(errorMessage(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);
  async function mutate(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await reload();
      setMessage(success);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function copyCode(student: Student) {
    try {
      await navigator.clipboard.writeText(student.accessCode);
      setMessage(`Code copied for ${student.name}.`);
      setError("");
    } catch {
      setError(
        "Could not copy automatically. Select the access code and copy it manually.",
      );
    }
  }
  function create(event: React.FormEvent) {
    event.preventDefault();
    void mutate(async () => {
      const student = await studentsService.createStudent(form);
      setCreatedStudent(student);
      setForm(blankStudent);
      setShowCreateForm(false);
    }, "Student created.");
  }
  function saveEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    const value = editor;
    if (
      value.kind === "grade" &&
      (value.grade.trim() === "" || !Number.isFinite(Number(value.grade)) ||
        Number(value.grade) < 0 || Number(value.grade) > 100)
    ) {
      setError("Enter a grade between 0 and 100.");
      return;
    }
    void mutate(async () => {
      if (value.kind === "grade") {
        await gradesService.updateOverallGrade(
          value.studentId,
          Number(value.grade),
        );
      } else {await studentsService.updateStudentClass(
          value.studentId,
          value.subject,
          value.section,
        );}
      setEditor(null);
    }, value.kind === "grade" ? "Grade saved." : "Class saved.");
  }
  useEffect(() => {
    if (showCreateForm) {
      createPanel.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, [showCreateForm]);
  const editingId = editor?.studentId;
  const editingKind = editor?.kind;
  useEffect(() => {
    if (!editingId) return;
    editorPanel.current?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    editorPanel.current?.querySelector<HTMLInputElement>("input")?.focus({
      preventScroll: true,
    });
  }, [editingId, editingKind]);
  const subjects = [
    ...new Set(
      students.map((student) => student.subject).filter((
        value,
      ): value is string => !!value),
    ),
  ].sort();
  const sections = [
    ...new Set(
      students.filter((student) =>
        !subjectFilter || student.subject === subjectFilter
      ).map((student) => student.section).filter((value): value is string =>
        !!value
      ),
    ),
  ].sort();
  const visible = students.filter((student) =>
    (!subjectFilter || student.subject === subjectFilter) &&
    (!sectionFilter || student.section === sectionFilter)
  ).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="teacher-page">
      <div className="teacher-header">
        <div>
          <p className="eyebrow">Classroom workspace</p>
          <h1>Teacher Dashboard</h1>
          <p>A clear view of your students, classes, and progress.</p>
        </div>
        <button
          className="create-student-button"
          disabled={busy}
          onClick={() => setShowCreateForm(true)}
        >
          + Create Student
        </button>
      </div>
      {message && (
        <p className="feedback feedback--success" role="status">{message}</p>
      )}
      {error && (
        <p className="feedback feedback--error" role="alert">
          {error}{" "}
          <button
            disabled={busy}
            onClick={() => void mutate(reload, "Students refreshed.")}
          >
            Retry loading
          </button>
        </p>
      )}
      {showCreateForm && (
        <section className="create-student-card" ref={createPanel}>
          <div className="create-student-card__header">
            <h2>Create Student</h2>
            <button
              disabled={busy}
              className="close-button"
              aria-label="Close create student form"
              onClick={() =>
                setShowCreateForm(false)}
            >
              ×
            </button>
          </div>
          <form className="create-student-form" onSubmit={create}>
            <fieldset disabled={busy}>
              {(["name", "subject", "section"] as const).map((key) => (
                <label key={key}>
                  {key === "name"
                    ? "Student Name"
                    : key === "subject"
                    ? "Subject"
                    : "Section / Class"}
                  <input
                    required
                    maxLength={120}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
              <button type="submit">
                {busy ? "Creating…" : "Create Student"}
              </button>
            </fieldset>
          </form>
        </section>
      )}
      {createdStudent && (
        <div className="created-student-result">
          <strong>{createdStudent.name}</strong> — Access Code:{" "}
          <code>{createdStudent.accessCode}</code>{" "}
          <button onClick={() => void copyCode(createdStudent)}>
            Copy Code
          </button>
        </div>
      )}
      <section className="students-card">
        <div className="section-heading">
          <div>
            <h2>Student roster</h2>
            <p>Manage access, class assignments, and grades.</p>
          </div>
          <span className="count-badge">
            {loading
              ? "Loading…"
              : error && students.length === 0
              ? "Unavailable"
              : `${students.length} total`}
          </span>
        </div>
        <div className="student-filters">
          <label>
            Subject<select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setSectionFilter("");
              }}
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </select>
          </label>
          <label>
            Section / Class<select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
            >
              <option value="">All classes</option>
              {sections.map((section) => (
                <option key={section}>{section}</option>
              ))}
            </select>
          </label>
          <span>{visible.length} student{visible.length === 1 ? "" : "s"}</span>
        </div>
        {loading
          ? <p className="loading-state" role="status">Loading students...</p>
          : visible.length === 0
          ? (
            <EmptyState
              title={students.length
                ? "No matching students"
                : error
                ? "Student list unavailable"
                : "Your classroom starts here"}
              description={students.length
                ? "Try another subject or class to find your students."
                : error
                ? "Use Retry loading above to reconnect to your roster."
                : "Create your first student to share an access code and start recording grades."}
            />
          )
          : (
            <div
              className="student-table-wrapper"
              tabIndex={0}
              role="region"
              aria-label="Student roster"
            >
              <table className="student-table" role="table">
                <caption className="sr-only">
                  Students with class assignments, access codes, grades, and
                  management actions
                </caption>
                <thead>
                  <tr role="row">
                    <th scope="col" role="columnheader">Student</th>
                    <th scope="col" role="columnheader">Subject</th>
                    <th scope="col" role="columnheader">Class</th>
                    <th scope="col" role="columnheader">Access Code</th>
                    <th scope="col" role="columnheader">Overall Grade</th>
                    <th scope="col" role="columnheader">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((student) => (
                    <tr key={student.id} role="row">
                      <th scope="row" role="rowheader">{student.name}</th>
                      <td data-label="Subject" role="cell">
                        {student.subject || "Unassigned"}
                      </td>
                      <td data-label="Class" role="cell">
                        {student.section || "Unassigned"}
                      </td>
                      <td data-label="Access code" role="cell">
                        <code>{student.accessCode}</code>
                      </td>
                      <td data-label="Overall grade" role="cell">
                        <GradeDisplay grade={student.overallGrade} />
                      </td>
                      <td data-label="Actions" role="cell">
                        <div className="student-actions">
                          <button
                            disabled={busy}
                            onClick={() => void copyCode(student)}
                          >
                            Copy Code
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              setEditor({
                                studentId: student.id,
                                kind: "class",
                                grade: "",
                                subject: student.subject ?? "",
                                section: student.section ?? "",
                              })}
                          >
                            Edit Class
                          </button>
                          <button
                            disabled={busy}
                            className="grade-action"
                            aria-label={`Add or update grade for ${student.name}`}
                            onClick={() =>
                              setEditor({
                                studentId: student.id,
                                kind: "grade",
                                grade: student.overallGrade === null
                                  ? ""
                                  : String(student.overallGrade),
                                subject: "",
                                section: "",
                              })}
                          >
                            Grade
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => setAssessmentStudent(student)}
                          >
                            Assessments
                          </button>
                          <button
                            disabled={busy}
                            className="delete-student-button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete ${student.name} and their grades?`,
                                )
                              ) {
                                void mutate(async () => {
                                  await studentsService.deleteStudent(
                                    student.id,
                                  );
                                  if (
                                    assessmentStudent?.id === student.id
                                  ) setAssessmentStudent(null);
                                  if (
                                    createdStudent?.id === student.id
                                  ) setCreatedStudent(null);
                                  if (
                                    editor?.studentId === student.id
                                  ) setEditor(null);
                                }, "Student deleted.");
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
      {editor && (
        <section className="create-student-card" ref={editorPanel}>
          <h2>
            {editor.kind === "grade" ? "Overall Grade" : "Edit Class"} —{" "}
            {students.find((student) => student.id === editor.studentId)?.name}
          </h2>
          <form className="create-student-form" onSubmit={saveEditor}>
            <fieldset disabled={busy}>
              {editor.kind === "grade"
                ? (
                  <label>
                    Percentage<input
                      required
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={editor.grade}
                      onChange={(e) =>
                        setEditor({ ...editor, grade: e.target.value })}
                    />
                  </label>
                )
                : (
                  <>
                    <label>
                      Subject<input
                        required
                        maxLength={120}
                        value={editor.subject}
                        onChange={(e) =>
                          setEditor({ ...editor, subject: e.target.value })}
                      />
                    </label>
                    <label>
                      Section / Class<input
                        required
                        maxLength={120}
                        value={editor.section}
                        onChange={(e) =>
                          setEditor({ ...editor, section: e.target.value })}
                      />
                    </label>
                  </>
                )}
              <div className="student-actions">
                <button type="submit">{busy ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditor(null)}>
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      {assessmentStudent && (
        <AssessmentManager
          key={assessmentStudent.id}
          student={assessmentStudent}
          onClose={() => setAssessmentStudent(null)}
        />
      )}
    </section>
  );
}
export default Teacher;
