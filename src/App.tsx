import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout/MainLayout";
import Grades from "./pages/Grades/Grades";
import Login from "./pages/Login/Login";
import Teacher from "./pages/Teacher/Teacher";
import ProtectedRoute from "./routes/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route
            path="/grades"
            element={
              <ProtectedRoute requiredRole="student">
                <Grades />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route
            path="/teacher"
            element={
              <ProtectedRoute requiredRole="teacher">
                <Teacher />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}
export default App;
