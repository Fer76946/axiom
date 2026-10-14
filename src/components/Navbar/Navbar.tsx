import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import ThemeToggle from "../ThemeToggle/ThemeToggle";
import { useAuth } from "../../contexts/useAuth";
import "./Navbar.css";
import { errorMessage } from "../../services";

type NavbarProps = {
  isDarkMode: boolean;
  onThemeToggle: () => void;
};

function Navbar({ isDarkMode, onThemeToggle }: NavbarProps) {
  const {
    user, profile, studentSession, loading, logout, error: authError,
  } = useAuth();
  const hasSession = !!studentSession || (!!user && profile?.role === "teacher");
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function handleLogout() {
    setBusy(true);
    setError("");
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
      if (studentSession) navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="navbar">
      <div className="navbar__content">
        <NavLink className="navbar__brand" to="/" aria-label="Axiom home">
          <span className="navbar__logo">A</span>
          <span>AXIOM</span>
        </NavLink>

        <nav className="navbar__links" aria-label="Main navigation">
          <NavLink
            className={({ isActive }) =>
              `navbar__link ${isActive ? "navbar__link--active" : ""}`}
            to="/grades"
          >
            Grades
          </NavLink>

          {profile?.role === "teacher" && (
            <NavLink
              className={({ isActive }) =>
                `navbar__link ${isActive ? "navbar__link--active" : ""}`}
              to="/teacher"
            >
              Teacher
            </NavLink>
          )}
        </nav>

        <div className="navbar__actions">
          <ThemeToggle
            isDarkMode={isDarkMode}
            onToggle={onThemeToggle}
          />

          {!loading && hasSession
            ? (
              <>
                <span className="navbar__status">
                  {studentSession
                    ? `Student - ${studentSession.student.name}`
                    : "Teacher"}
                </span>

                <button
                  type="button"
                  className="login-button"
                  onClick={() => void handleLogout()}
                  disabled={busy}
                >
                  Log Out
                </button>
              </>
            )
            : (
              <NavLink
                to="/"
                className="login-button"
              >
                Log In
              </NavLink>
            )}
        </div>
      </div>
      {(error || authError) && (
        <p className="navbar__error" role="alert">{error || authError}</p>
      )}
    </header>
  );
}

export default Navbar;
