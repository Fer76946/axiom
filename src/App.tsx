import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout/MainLayout";
import Axiom from "./pages/Axiom/Axiom";
import Grades from "./pages/Grades/Grades";
import Home from "./pages/Home/Home";

function App() {

  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/grades" element={<Grades />} />
          <Route path="/axiom" element={<Axiom />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}
export default App;