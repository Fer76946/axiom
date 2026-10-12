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
  const { user, profile, studentSession, logout, error: authError } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function handleLogout() {
    setBusy(true);
    setError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (cause) {
      setError(errorMessage(cause));
      if (studentSession) navigate("/login", { replace: true });
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
            to="/"
            end
          >
            Home
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              `navbar__link ${isActive ? "navbar__link--active" : ""}`}
            to="/grades"
          >
            Grades
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              `navbar__link ${isActive ? "navbar__link--active" : ""}`}
            to="/axiom"
          >
            Axiom
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

          {user || studentSession
            ? (
              <>
                <span className="navbar__status">
                  {studentSession
                    ? `Student - ${studentSession.student.name}`
                    : profile?.role === "teacher"
                    ? "Teacher"
                    : "Account"}
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
                to="/login"
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
