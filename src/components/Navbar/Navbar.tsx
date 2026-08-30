import { NavLink } from "react-router-dom";
import ThemeToggle from "../ThemeToggle/ThemeToggle";
import { useAuth } from "../../contexts/useAuth";
import "./Navbar.css";
import { supabase } from "../../lib/supabase";

type NavbarProps = {
  isDarkMode: boolean;
  onThemeToggle: () => void;
};

function Navbar({ isDarkMode, onThemeToggle }: NavbarProps) {
  const { user, profile } = useAuth();  
  return (
    
    <header className="navbar">
      <div className="navbar__content">
        <NavLink className="navbar__brand" to="/">
          <span className="navbar__logo">A</span>
          <span>AXIOM</span>
        </NavLink>

        <nav className="navbar__links" aria-label="Main navigation">
          <NavLink
            className={({ isActive }) =>
              `navbar__link ${isActive ? "navbar__link--active" : ""}`
            }
            to="/"
            end
          >
            Home
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              `navbar__link ${isActive ? "navbar__link--active" : ""}`
            }
            to="/grades"
          >
            Grades
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              `navbar__link ${isActive ? "navbar__link--active" : ""}`
            }
            to="/axiom"
          >
            Axiom
          </NavLink>
          {profile?.role === "teacher" && (
            <NavLink
              className={({ isActive }) =>
                `navbar__link ${isActive ? "navbar__link--active" : ""}`
              }
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

          {user ? (
            <>
              <span className="navbar__status">
                {profile?.role === "teacher" ? "Teacher" : "Student"}
              </span>

              <button
                type="button"
                className="login-button"
                onClick={() => supabase.auth.signOut()}
              >
                Log Out
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              className="login-button"
            >
              Log In
            </NavLink>
          )}

          
        </div>
      </div>
    </header>
  );
}

export default Navbar;