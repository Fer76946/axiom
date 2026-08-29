import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { AuthProvider } from "./contexts/AuthProvider";


const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}



createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);