import { NavLink } from "react-router-dom";
import ThemeToggle from "../ThemeToggle/ThemeToggle";
import { useAuth } from "../../contexts/useAuth";
import "./Navbar.css";

type NavbarProps = {
  isDarkMode: boolean;
  onThemeToggle: () => void;
};

function Navbar({ isDarkMode, onThemeToggle }: NavbarProps) {
  const { profile } = useAuth();  
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

          <NavLink
            to="/login"
            className="login-button"
          >
            Log In
          </NavLink>

          
        </div>
      </div>
    </header>
  );
}

export default Navbar;