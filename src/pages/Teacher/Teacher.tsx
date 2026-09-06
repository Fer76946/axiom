import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Teacher.css";

type Student = {
  id: string;
  name: string;
  username: string;
  subject: string | null;
  section: string | null;
  grade: number | null;
};

function Teacher() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [message, setMessage] = useState("");
  const [students, setStudents] = useState<Student[]>([]);

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [section, setSection] = useState("");

  const [createdStudent, setCreatedStudent] = useState<{
    studentName: string;
    username: string;
    password: string;
} | null>(null);

  const loadStudents = useCallback(async () => {
  const { data, error } = await supabase
  .from("students")
  .select(`
    id,
    name,
    subject,
    section,
    profiles (
      username
    ),
    grades (
      grade
    )
  `);

  if (error) {
    console.error("Error loading students:", error);
    return [];
  }

  return (
    data?.map((student) => ({
      id: student.id,
      name: student.name,
      username: student.profiles?.[0]?.username ?? "",
      subject: student.subject,
      section: student.section,
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
    createdStudent.username,
    createdStudent.password,
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
  setMessage("Student created successfully.");

  const loadedStudents = await loadStudents();
  setStudents(loadedStudents);
}

  async function saveGradeForStudent(studentId: string) {
  const numericGrade = Number(grade);

  if (Number.isNaN(numericGrade)) return;

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
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="Alice Chen"
                required
              />
            </label>

            <label>
              Subject
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Science"
                required
              />
            </label>

            <label>
              Section
              <input
                type="text"
                value={section}
                onChange={(event) => setSection(event.target.value)}
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
            <strong>Name:</strong> {createdStudent.studentName}
          </p>
          <p>
            <strong>Username:</strong> {createdStudent.username}
          </p>
          <p>
            <strong>Password:</strong> {createdStudent.password}
          </p>
          <button
            type="button"
            onClick={copyStudentInfo}
            className="copy-student-button"
          >
            Copy Student Info
          </button>
          <p>
            Save these credentials now. The password cannot be viewed later.
          </p>
        </div>
      )}  

      <div className="students-card">
        <h2>Students</h2>

        {students.length === 0 ? (
          <div className="empty-students">
            <p>No students yet.</p>
            <span>Create your first student to get started.</span>
          </div>
        ) : (
          <div className="student-list">
            {students.map((student) => (
              <div key={student.id} className="student-row">
                <span>{student.name}</span>

                <span>
                  {student.subject && student.section
                    ? `${student.subject} - ${student.section}`
                    : "No class assigned"}
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
                      onChange={(event) => setGrade(event.target.value)}
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
                      onClick={() => void saveGradeForStudent(student.id)}
                    >
                      Save
                    </button>
                  </div>
                ) : (
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