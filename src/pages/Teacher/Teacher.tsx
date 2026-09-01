import { useState } from "react";
import { supabase } from "../../lib/supabase";
import "./Teacher.css";

function Teacher() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [createdStudent, setCreatedStudent] = useState<{
  studentName: string;
  username: string;
  password: string;
} | null>(null);

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
    return;
  }

  setCreatedStudent(data);
  setStudentName("");
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
        </div>
      )}

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
          <p>
            Save these credentials now. The password cannot be viewed later.
          </p>
        </div>
      )}  

      <div className="students-card">
        <h2>Students</h2>

        <div className="empty-students">
          <p>No students yet.</p>
          <span>Create your first student to get started.</span>
        </div>
      </div>
    </section>
  );
}

export default Teacher;