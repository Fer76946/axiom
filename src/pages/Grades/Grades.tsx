import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import "./Grades.css";

type StudentSession = {
  studentId: string;
  studentName: string;
  subject: string | null;
  section: string | null;
};

type GradeRecord = {
  grade: number | null;
};

function Grades() {
  const navigate = useNavigate();

  const storedStudent = sessionStorage.getItem("axiomStudent");

  const student: StudentSession | null = storedStudent
    ? (JSON.parse(storedStudent) as StudentSession)
    : null;

  const [grade, setGrade] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!student) {
      navigate("/login");
      return;
    }

    const studentId = student.studentId;

    async function loadGrade() {
      const { data, error } = await supabase
        .from("grades")
        .select("grade")
        .eq("student_id", studentId)
        .maybeSingle();

      if (error) {
        console.error("Error loading grade:", error);
        setMessage("Could not load your grade.");
        setLoading(false);
        return;
      }

      const gradeRecord = data as GradeRecord | null;

      setGrade(gradeRecord?.grade ?? null);
      setLoading(false);
    }

    void loadGrade();
  }, [navigate, student]);

  if (!student) {
    return null;
  }

  if (loading) {
    return (
      <section className="grades-page">
        <p>Loading grades...</p>
      </section>
    );
  }

  return (
    <section className="grades-page">
      <header className="grades-heading">
        <h1>My Grades</h1>

        <p>
          Welcome, {student.studentName}. View your current class and grade.
        </p>
      </header>

      {message && <p>{message}</p>}

      <article className="grade-card">
        <div className="grade-card__header">
          <span>Class</span>

          <h2>
            {student.subject && student.section
              ? `${student.subject} - ${student.section}`
              : "No class assigned"}
          </h2>
        </div>

        <div className="grade-card__current">
          <span>Current Grade:</span>

          <strong>
            {grade !== null ? `${grade}%` : "No grade yet"}
          </strong>
        </div>
      </article>
    </section>
  );
}

export default Grades;