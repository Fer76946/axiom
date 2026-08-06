import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar/Navbar";
import "./MainLayout.css";

type MainLayoutProps = {
  children: React.ReactNode;
};

function MainLayout({ children }: MainLayoutProps) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme =
      isDarkMode ? "dark" : "light";
  }, [isDarkMode]);

  function toggleTheme() {
    setIsDarkMode((currentMode) => !currentMode);
  }

  return (
    <div className="main-layout">
      <Navbar
        isDarkMode={isDarkMode}
        onThemeToggle={toggleTheme}
      />

      <main className="main-layout__content">
        {children}
      </main>
    </div>
  );
}

export default MainLayout;