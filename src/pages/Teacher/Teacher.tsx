import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Teacher.css";

type Student = {
  id: string;
  name: string;
  subject: string | null;
  section: string | null;
  access_code: string | null;
  grade: number | null;
};

function Teacher() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [message, setMessage] = useState("");
  const [students, setStudents] = useState<Student[]>([]);

  const [selectedStudentId, setSelectedStudentId] =
    useState<string | null>(null);

  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [section, setSection] = useState("");

  const [createdStudent, setCreatedStudent] = useState<{
    studentId: string;
    studentName: string;
    accessCode: string;
  } | null>(null);

  const loadStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from("students")
      .select(`
        id,
        name,
        subject,
        section,
        access_code,
        grades (
          grade
        )
      `)
      .order("name");

    if (error) {
      console.error("Error loading students:", error);
      return [];
    }

    return (
      data?.map((student) => ({
        id: student.id,
        name: student.name,
        subject: student.subject,
        section: student.section,
        access_code: student.access_code,
        grade: student.grades?.[0]?.grade ?? null,
      })) ?? []
    );
  }, []);

  useEffect(() => {
    void loadStudents().then((loadedStudents) => {
      setStudents(loadedStudents);
    });
  }, [loadStudents]);

  async function copyStudentInfo() {
    if (!createdStudent) return;

    const text = [
      createdStudent.studentName,
      createdStudent.accessCode,
    ].join("\t");

    await navigator.clipboard.writeText(text);

    setMessage("Student info copied.");
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const { data, error } = await supabase.functions.invoke(
      "create-student",
      {
        body: {
          studentName,
          subject,
          section,
        },
      },
    );

    if (error) {
      console.error("Create student error:", error);
      setMessage(`Error: ${error.message}`);
      return;
    }

    setCreatedStudent(data);

    setStudentName("");
    setSubject("");
    setSection("");

    setMessage("Student created successfully.");

    const loadedStudents = await loadStudents();
    setStudents(loadedStudents);
  }

  async function saveGradeForStudent(studentId: string) {
    const numericGrade = Number(grade);

    if (Number.isNaN(numericGrade)) {
      return;
    }

    const { error } = await supabase
      .from("grades")
      .upsert({
        student_id: studentId,
        grade: numericGrade,
      });

    if (error) {
      console.error("Error saving grade:", error);
      return;
    }

    const loadedStudents = await loadStudents();
    setStudents(loadedStudents);

    setSelectedStudentId(null);
    setGrade("");
  }
  // here we will delete students
  async function deleteStudent(studentId: string) {
  const confirmed = window.confirm(
    "Are you sure you want to delete this student?",
  );

  if (!confirmed) return;

  const { error } = await supabase.functions.invoke(
    "delete-student",
    {
      body: {
        studentId,
      },
    },
  );

  if (error) {
    console.error("Delete student error:", error);
    setMessage(`Error: ${error.message}`);
    return;
  }

  const loadedStudents = await loadStudents();
  setStudents(loadedStudents);

  setMessage("Student deleted.");
}

  return (
    <section className="teacher-page">
      <div className="teacher-header">
        <div>
          <h1>Teacher Dashboard</h1>
          <p>Manage students and grades.</p>
        </div>

        <button
          type="button"
          className="create-student-button"
          onClick={() => setShowCreateForm(true)}
        >
          + Create Student
        </button>
      </div>

      {showCreateForm && (
        <div className="create-student-card">
          <div className="create-student-card__header">
            <h2>Create Student</h2>

            <button
              type="button"
              className="close-button"
              onClick={() => setShowCreateForm(false)}
            >
              ×
            </button>
          </div>

          <form
            className="create-student-form"
            onSubmit={handleSubmit}
          >
            <label>
              Student Name

              <input
                type="text"
                value={studentName}
                onChange={(event) =>
                  setStudentName(event.target.value)
                }
                placeholder="Alice Chen"
                required
              />
            </label>

            <label>
              Subject

              <input
                type="text"
                value={subject}
                onChange={(event) =>
                  setSubject(event.target.value)
                }
                placeholder="Science"
                required
              />
            </label>

            <label>
              Section

              <input
                type="text"
                value={section}
                onChange={(event) =>
                  setSection(event.target.value)
                }
                placeholder="6A"
                required
              />
            </label>

            <button type="submit">
              Create Student
            </button>
          </form>

          {message && <p>{message}</p>}
        </div>
      )}

      {createdStudent && (
        <div className="created-student-result">
          <h3>Student Created</h3>

          <p>
            <strong>Name:</strong>{" "}
            {createdStudent.studentName}
          </p>

          <p>
            <strong>Access Code:</strong>{" "}
            {createdStudent.accessCode}
          </p>

          <button
            type="button"
            onClick={copyStudentInfo}
            className="copy-student-button"
          >
            Copy Student Info
          </button>
        </div>
      )}

      <div className="students-card">
        <h2>Students</h2>

        {students.length === 0 ? (
          <div className="empty-students">
            <p>No students yet.</p>
            <span>
              Create your first student to get started.
            </span>
          </div>
        ) : (
          <div className="student-list">
            {students.map((student) => (
              <div
                key={student.id}
                className="student-row"
              >
                <span>{student.name}</span>

                <span>
                  {student.subject && student.section
                    ? `${student.subject} - ${student.section}`
                    : "No class assigned"}
                </span>

                <span>
                  {student.access_code ??
                    "No access code"}
                </span>

                <span>
                  {student.grade !== null
                    ? `${student.grade}`
                    : "No grade"}
                </span>

                {selectedStudentId === student.id ? (
                  <div className="inline-grade-editor">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={grade}
                      onChange={(event) =>
                        setGrade(event.target.value)
                      }
                    />

                    <button
                      type="button"
                      className="cancel-grade-button"
                      onClick={() => {
                        setSelectedStudentId(null);
                        setGrade("");
                      }}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className="save-grade-button"
                      onClick={() =>
                        void saveGradeForStudent(
                          student.id,
                        )
                      }
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="student-actions">
                    <button
                      type="button"
                      className="add-grade-button"
                      onClick={() => {
                        setSelectedStudentId(student.id);

                        setGrade(
                          student.grade !== null
                            ? String(student.grade)
                            : "",
                        );
                      }}
                    >
                      Add/Update Grade
                    </button>

                    <button
                      type="button"
                      className="delete-student-button"
                      onClick={() => void deleteStudent(student.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Teacher;