import { type ReactNode, useEffect, useRef, useState } from "react";
import { AuthContext } from "./AuthContext";
import type { StudentSession, TeacherSession } from "../domain/types";
import { authService, errorMessage } from "../services";
import {
  clearStudentSession,
  readStudentSession,
  saveStudentSession,
} from "../services/studentSession";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherSession>({
    user: null,
    profile: null,
  });
  const [studentSession, setStudentSession] = useState<StudentSession | null>(
    readStudentSession,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const request = ++revision.current;
      try {
        const session = await authService.getTeacherSession();
        if (!active || request !== revision.current) return;
        setTeacher(session);
        setError("");
        if (session.user) {
          clearStudentSession();
          setStudentSession(null);
        }
      } catch (cause) {
        if (active && request === revision.current) {
          setTeacher({ user: null, profile: null });
          setError(errorMessage(cause));
        }
      } finally {
        if (active && request === revision.current) setLoading(false);
      }
    }
    const unsubscribe = authService.subscribe(() => {
      void refresh();
    });
    void refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!studentSession) return;
    const timer = window.setTimeout(() => {
      clearStudentSession();
      setStudentSession(null);
    }, Math.max(0, Date.parse(studentSession.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [studentSession]);

  async function logout() {
    if (studentSession) {
      // Clear the UI immediately even if the revocation request fails.
      const token = studentSession.token;
      clearStudentSession();
      setStudentSession(null);
      await authService.studentLogout(token);
    } else {
      await authService.teacherLogout();
      ++revision.current;
      setTeacher({ user: null, profile: null });
      clearStudentSession();
      setStudentSession(null);
    }
    setError("");
  }

  async function teacherLogin(email: string, password: string) {
    const session = await authService.teacherLogin(email, password);
    // Revoke any previously active student token before replacing that session.
    if (studentSession) await authService.studentLogout(studentSession.token);
    ++revision.current;
    clearStudentSession();
    setStudentSession(null);
    setTeacher(session);
    setError("");
    return session;
  }

  async function studentLogin(code: string) {
    const session = await authService.studentLogin(code);
    try {
      await authService.teacherLogout();
      if (studentSession) await authService.studentLogout(studentSession.token);
      saveStudentSession(session);
    } catch (cause) {
      await authService.studentLogout(session.token).catch(() => undefined);
      throw cause;
    }
    ++revision.current;
    setTeacher({ user: null, profile: null });
    setStudentSession(session);
    setError("");
  }

  return (
    <AuthContext.Provider
      value={{
        ...teacher,
        studentSession,
        loading,
        error,
        teacherLogin,
        studentLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
