import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar/Navbar";
import "./MainLayout.css";

type MainLayoutProps = {
  children: React.ReactNode;
};

function MainLayout({ children }: MainLayoutProps) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("axiom-theme") === "dark";
  });

  useEffect(() => {
    const theme = isDarkMode ? "dark" : "light";

    document.documentElement.dataset.theme = theme;
    localStorage.setItem("axiom-theme", theme);
  }, [isDarkMode]);

  function toggleTheme() {
    setIsDarkMode((currentMode) => !currentMode);
  }

  return (
    <div className="main-layout">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar
        isDarkMode={isDarkMode}
        onThemeToggle={toggleTheme}
      />

      <main className="main-layout__content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export default MainLayout;
