import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [accessCode, setAccessCode] = useState("");

  const [teacherMessage, setTeacherMessage] = useState("");
  const [studentMessage, setStudentMessage] = useState("");

  const navigate = useNavigate();

  async function handleTeacherLogin(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setTeacherMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setTeacherMessage(error.message);
      return;
    }

    navigate("/");
  }

  async function handleStudentLogin(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setStudentMessage("");

    const trimmedCode = accessCode.trim();

    if (!/^\d{7}$/.test(trimmedCode)) {
      setStudentMessage(
        "Please enter a valid 7-digit access code.",
      );
      return;
    }

    const { data, error } = await supabase.functions.invoke(
      "student-login",
      {
        body: {
          accessCode: trimmedCode,
        },
      },
    );

    if (error) {
      console.error("Student login error:", error);

      setStudentMessage(
        "Invalid access code. Please try again.",
      );

      return;
    }

    sessionStorage.setItem(
      "axiomStudent",
      JSON.stringify({
        studentId: data.studentId,
        studentName: data.studentName,
        subject: data.subject,
        section: data.section,
      }),
    );

    navigate("/grades");
  }

  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-logo">A</div>

        <h1>Welcome to Axiom</h1>
        <p>Choose how you want to sign in.</p>

        <div className="login-options">
          <div className="login-panel teacher-panel">
            <h2>Teacher</h2>
            <p>Sign in with your teacher account.</p>

            <form
              className="login-form"
              onSubmit={handleTeacherLogin}
            >
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  required
                />
              </label>

              <button type="submit">
                Teacher Sign In
              </button>
            </form>

            {teacherMessage && (
              <p className="login-message">
                {teacherMessage}
              </p>
            )}
          </div>

          <div className="login-panel student-panel">
            <h2>Student</h2>
            <p>Enter your 7-digit access code.</p>

            <form
              className="login-form"
              onSubmit={handleStudentLogin}
            >
              <label>
                Access Code
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={7}
                  value={accessCode}
                  onChange={(event) => {
                    const numbersOnly =
                      event.target.value.replace(/\D/g, "");

                    setAccessCode(numbersOnly);
                  }}
                  placeholder="1234567"
                  required
                />
              </label>

              <button type="submit">
                Student Sign In
              </button>
            </form>

            {studentMessage && (
              <p className="login-message">
                {studentMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Login;