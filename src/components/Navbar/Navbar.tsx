import ThemeToggle from "../ThemeToggle/ThemeToggle";
import "./Navbar.css";

type NavbarProps = {
  isDarkMode: boolean;
  onThemeToggle: () => void;
};

function Navbar({
  isDarkMode,
  onThemeToggle,
}: NavbarProps) {
  return (
    <header className="navbar">
      <div className="navbar__content">
        <a className="navbar__brand" href="/">
          <span className="navbar__logo">A</span>
          <span>AXIOM</span>
        </a>

        <nav className="navbar__links" aria-label="Main navigation">
          <a className="navbar__link navbar__link--active" href="/">
            Home
          </a>

          <a className="navbar__link" href="#grades">
            Grades
          </a>

          <a className="navbar__link" href="#axiom">
            Axiom
          </a>
        </nav>

        <div className="navbar__actions">
          <button
            className="profile-button"
            type="button"
            aria-label="Open profile"
          >
            ●
          </button>

          <ThemeToggle
            isDarkMode={isDarkMode}
            onToggle={onThemeToggle}
          />
        </div>
      </div>
    </header>
  );
}

export default Navbar;