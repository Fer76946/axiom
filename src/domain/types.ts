export type TeacherUser = { id: string; email?: string };
export type Profile = { id: string; role: string };
export type StudentIdentity = {
  id: string;
  name: string;
  subject: string | null;
  section: string | null;
};
export type Student = StudentIdentity & {
  accessCode: string;
  overallGrade: number | null;
};
export type StudentInput = { name: string; subject: string; section: string };
export type Assessment = {
  id: string;
  studentId: string;
  title: string;
  score: number;
  maxScore: number;
  date: string;
};
export type AssessmentInput = Omit<Assessment, "id" | "studentId">;
export type StudentGrades = {
  student: StudentIdentity;
  overallGrade: number | null;
  assessments: Assessment[];
};
export type StudentSession = {
  token: string;
  expiresAt: string;
  student: StudentIdentity;
};
export type TeacherSession = {
  user: TeacherUser | null;
  profile: Profile | null;
};
