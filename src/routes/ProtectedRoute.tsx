import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

type ProtectedRouteProps = {
  children: ReactNode;
  requiredRole?: "teacher" | "student";
};

function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const { user, profile, studentSession, loading } = useAuth();

  if (loading) {
    return <p>Loading...</p>;
  }

  if (requiredRole === "student") {
    return studentSession ? children : <Navigate to="/" replace />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole && profile?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
