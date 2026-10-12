import { createContext } from "react";
import type {
  Profile,
  StudentSession,
  TeacherSession,
  TeacherUser,
} from "../domain/types";
export type AuthContextType = {
  user: TeacherUser | null;
  profile: Profile | null;
  studentSession: StudentSession | null;
  loading: boolean;
  error: string;
  teacherLogin: (email: string, password: string) => Promise<TeacherSession>;
  studentLogin: (code: string) => Promise<void>;
  logout: () => Promise<void>;
};
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);
