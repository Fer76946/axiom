import "./ThemeToggle.css";

type ThemeToggleProps = {
  isDarkMode: boolean;
  onToggle: () => void;
};

function ThemeToggle({
  isDarkMode,
  onToggle,
}: ThemeToggleProps) {
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={
        isDarkMode
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
    >
      {isDarkMode ? "☀️" : "🌙"}
    </button>
  );
}

export default ThemeToggle;