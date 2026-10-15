import { supabase } from "../../lib/supabase";
import type {
  Assessment,
  AssessmentInput,
  Student,
  StudentGrades,
  StudentInput,
  StudentIdentity,
  StudentImportRecord,
  StudentImportResult,
  StudentSession,
  TeacherSession,
  TestQuiz,
  TestQuizInput,
  TestQuizDetails,
  TestQuizScore,
  StudentTestQuiz,
} from "../../domain/types";

async function invoke<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = "Could not reach Axiom. Please try again.";
    if (error.context instanceof Response) {
      const detail = await error.context.json().catch(() => null);
      message = detail?.error ?? message;
    }
    throw new Error(message);
  }
  if (!data || data.error) {
    throw new Error(data?.error ?? "Axiom returned an empty response.");
  }
  return data as T;
}

const api = <T>(action: string, input: object = {}) =>
  invoke<T>("axiom-api", { action, ...input });

export const provider = {
  async getTeacherSession(): Promise<TeacherSession> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const user = data.session?.user;
    if (!user) return { user: null, profile: null };
    const { data: profile, error: profileError } = await supabase.from(
      "profiles",
    ).select("id, role").eq("id", user.id).single();
    if (profileError) {
      throw new Error(
        "Could not load your teacher profile. Please try signing in again.",
      );
    }
    return { user: { id: user.id, email: user.email }, profile };
  },
  onTeacherSessionChange(callback: () => void) {
    // Defer queries until the auth callback has released the Supabase auth lock.
    const { data } = supabase.auth.onAuthStateChange(() => {
      queueMicrotask(callback);
    });
    return () => data.subscription.unsubscribe();
  },
  async teacherLogin(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    const session = await this.getTeacherSession();
    if (session.profile?.role !== "teacher") {
      await this.teacherLogout();
      throw new Error("This account does not have teacher access.");
    }
    return session;
  },
  async teacherLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  async studentLogin(accessCode: string): Promise<StudentSession> {
    const session = await invoke<StudentSession>("student-login", {
      accessCode,
    });
    if (
      !/^[a-f0-9]{64}$/.test(session.token ?? "") ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now() ||
      typeof session.student?.id !== "string" ||
      typeof session.student?.name !== "string"
    ) {
      throw new Error(
        "Student sign-in is unavailable. The Axiom backend needs to be updated.",
      );
    }
    return session;
  },
  studentLogout: (studentToken: string) =>
    api<{ success: boolean }>("studentLogout", { studentToken }),
  getStudentGrades: (studentToken: string) =>
    api<StudentGrades>("getStudentGrades", { studentToken }),
  getStudents: () => api<Student[]>("getStudents"),
  importStudents: (records: StudentImportRecord[]) => api<StudentImportResult[]>("importStudents", {
    // Runtime allowlist: source spreadsheets and unrelated fields must never be uploaded.
    records: records.map(({ id, name, subject, section, studentId, confirmDistinct }) => ({
      id, name, subject, section, ...(studentId ? { studentId } : {}), confirmDistinct,
    })),
  }),
  exportStudents: (filters: { subject?: string; section?: string }) => api<StudentIdentity[]>("exportStudents", filters),
  getStudentById: (studentId: string) =>
    api<Student>("getStudentById", { studentId }),
  createStudent: (input: StudentInput) =>
    invoke<Student>("create-student", input),
  deleteStudent: (studentId: string) =>
    invoke<{ success: boolean }>("delete-student", { studentId }),
  updateStudentClass: (studentId: string, subject: string, section: string) =>
    api<Student>("updateStudentClass", { studentId, subject, section }),
  updateStudentName: (studentId: string, name: string) =>
    api<Student>("updateStudentName", { studentId, name }),
  updateOverallGrade: (studentId: string, grade: number) =>
    api<{ success: boolean }>("updateOverallGrade", { studentId, grade }),
  getAssessments: (studentId: string) =>
    api<Assessment[]>("getAssessments", { studentId }),
  createAssessment: (studentId: string, input: AssessmentInput) =>
    api<Assessment>("createAssessment", { studentId, ...input }),
  updateAssessment: (assessmentId: string, input: AssessmentInput) =>
    api<Assessment>("updateAssessment", { assessmentId, ...input }),
  deleteAssessment: (assessmentId: string) =>
    api<{ success: boolean }>("deleteAssessment", { assessmentId }),
  getTestsQuizzes: () => api<TestQuiz[]>("getTestsQuizzes"),
  getTestQuiz: (id: string) => api<TestQuizDetails>("getTestQuiz", { id }),
  saveTestQuiz: (id: string, revision: number | null, input: TestQuizInput) =>
    api<TestQuiz>("saveTestQuiz", { id, revision, ...input }),
  saveTestQuizScores: (id: string, revision: number, scores: TestQuizScore[]) =>
    api<{ success: boolean }>("saveTestQuizScores", { id, revision, scores }),
  deleteTestQuiz: (id: string, revision: number) =>
    api<{ success: boolean }>("deleteTestQuiz", { id, revision }),
  getStudentTestsQuizzes: (studentId: string) =>
    api<StudentTestQuiz[]>("getStudentTestsQuizzes", { studentId }),
};
