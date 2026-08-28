import "./Teacher.css";

function Teacher() {
  return (
    <section className="teacher-page">
      <div className="teacher-header">
        <div>
          <h1>Teacher Dashboard</h1>
          <p>Manage students and grades.</p>
        </div>

        <button type="button" className="create-student-button">
          + Create Student
        </button>
      </div>

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