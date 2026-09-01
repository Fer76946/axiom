import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Teacher.css";

type Student = {
  id: string;
  name: string;
  username: string;
};

function Teacher() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [message, setMessage] = useState("");
  const [students, setStudents] = useState<Student[]>([]);

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
      profiles (
        username
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
                <span>{student.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default Teacher;