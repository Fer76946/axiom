// Provider boundary: components consume Axiom types and services only.
import { provider } from "./providers/supabaseProvider";
export const authService = {
  getTeacherSession: () => provider.getTeacherSession(),
  subscribe: (callback: () => void) =>
    provider.onTeacherSessionChange(callback),
  teacherLogin: (email: string, password: string) =>
    provider.teacherLogin(email, password),
  teacherLogout: () => provider.teacherLogout(),
  studentLogin: provider.studentLogin,
  studentLogout: provider.studentLogout,
};
export const studentsService = {
  getStudents: provider.getStudents,
  getStudentById: provider.getStudentById,
  createStudent: provider.createStudent,
  deleteStudent: provider.deleteStudent,
  updateStudentClass: provider.updateStudentClass,
};
export const gradesService = {
  getStudentGrades: provider.getStudentGrades,
  updateOverallGrade: provider.updateOverallGrade,
  getAssessments: provider.getAssessments,
  createAssessment: provider.createAssessment,
  updateAssessment: provider.updateAssessment,
  deleteAssessment: provider.deleteAssessment,
};
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
