import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  username: string;
  role: "teacher" | "student";
  created_at: string;
};

export type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);