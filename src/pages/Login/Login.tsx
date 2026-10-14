import { useState } from "react";
import { useAuth } from "../../contexts/useAuth";
import { errorMessage } from "../../services";
import { Navigate, useNavigate } from "react-router-dom";
import "./Login.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [accessCode, setAccessCode] = useState("");

  const [teacherMessage, setTeacherMessage] = useState("");
  const [studentMessage, setStudentMessage] = useState("");

  const navigate = useNavigate();
  const {
    teacherLogin, studentLogin, user, profile, studentSession, loading,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [signingInAs, setSigningInAs] = useState<"teacher" | "student" | null>(
    null,
  );

  async function handleTeacherLogin(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setTeacherMessage("");
    setSigningInAs("teacher");

    setBusy(true);
    try {
      await teacherLogin(email.trim(), password);
      navigate("/teacher", { replace: true });
    } catch (error) {
      setTeacherMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStudentLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStudentMessage("");
    setSigningInAs("student");
    const trimmedCode = accessCode.trim();
    if (!/^\d{7}$/.test(trimmedCode)) {
      setStudentMessage("Please enter a valid 7-digit access code.");
      return;
    }
    setBusy(true);
    try {
      await studentLogin(trimmedCode);
      navigate("/grades", { replace: true });
    } catch (error) {
      setStudentMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // Wait for Supabase restoration before deciding which dashboard to show.
  if (loading) return <p>Loading...</p>;
  if (user && profile?.role === "teacher") {
    return <Navigate to="/teacher" replace />;
  }
  if (studentSession) return <Navigate to="/grades" replace />;

  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-logo">A</div>

        <p className="eyebrow">Your classroom, connected</p>
        <h1>Welcome to Axiom</h1>
        <p>Choose how you want to sign in.</p>

        <div className="login-options">
          <div className="login-panel student-panel">
            <p className="eyebrow">Your learning space</p>
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
                  name="accessCode"
                  autoComplete="off"
                  aria-describedby="access-code-hint"
                  maxLength={7}
                  value={accessCode}
                  onChange={(event) => {
                    const numbersOnly = event.target.value.replace(/\D/g, "");

                    setAccessCode(numbersOnly);
                  }}
                  placeholder="1234567"
                  required
                />
              </label>

              <button type="submit" disabled={busy}>
                {busy && signingInAs === "student"
                  ? "Signing in…"
                  : "Student Sign In"}
              </button>
            </form>

            <p className="login-hint" id="access-code-hint">
              Use the code shared by your teacher. No email or password needed.
            </p>

            {studentMessage && (
              <p className="login-message" role="alert">
                {studentMessage}
              </p>
            )}
          </div>

          <div className="login-panel teacher-panel">
            <p className="eyebrow">Manage your classroom</p>
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
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>

              <button type="submit" disabled={busy}>
                {busy && signingInAs === "teacher"
                  ? "Signing in…"
                  : "Teacher Sign In"}
              </button>
            </form>

            {teacherMessage && (
              <p className="login-message" role="alert">
                {teacherMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Login;
