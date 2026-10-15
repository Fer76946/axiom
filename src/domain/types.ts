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
export type StudentImportRecord = StudentInput & {
  id: string;
  studentId?: string;
  confirmDistinct: boolean;
};
export type StudentImportResult = {
  id: string;
  status: "created" | "existing" | "error";
  message: string;
};
export type Assessment = {
  id: string;
  studentId: string;
  title: string;
  score: number;
  maxScore: number;
  date: string;
};
export type AssessmentInput = Omit<Assessment, "id" | "studentId">;
export type TestQuizClass = { subject: string; section: string };
export type TestQuizInput = {
  kind: "test" | "quiz";
  title: string;
  maxScore: number;
  date: string;
  classes: TestQuizClass[];
};
export type TestQuiz = TestQuizInput & { id: string; revision: number };
export type TestQuizScore = { studentId: string; score: number | null };
export type TestQuizDetails = {
  item: TestQuiz;
  students: (StudentIdentity & { score: number | null; applicable: boolean })[];
};
export type StudentTestQuiz = Omit<TestQuiz, "classes" | "revision"> & { score: number | null };
export type StudentGrades = {
  student: StudentIdentity;
  overallGrade: number | null;
  assessments: Assessment[];
  testsQuizzes: StudentTestQuiz[];
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
