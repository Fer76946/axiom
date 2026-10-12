import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  assessmentInput,
  generateAccessCode,
  hashToken,
  HttpError,
  number,
  randomHex,
  text,
  uuid,
  validAccessCode,
  validToken,
} from "./validation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
// Database snake_case never reaches the UI.
type StudentRow = {
  id: string;
  name: string;
  subject: string | null;
  section: string | null;
  access_code: string;
  grades?: { grade: number | null }[];
};
type AssessmentRow = {
  id: string;
  student_id: string;
  title: string;
  score: number;
  max_score: number;
  date: string;
};
const identity = (row: StudentRow) => ({
  id: row.id,
  name: row.name,
  subject: row.subject,
  section: row.section,
});
const student = (row: StudentRow) => ({
  ...identity(row),
  accessCode: row.access_code,
  overallGrade: row.grades?.[0]?.grade ?? null,
});
const assessment = (row: AssessmentRow) => ({
  id: row.id,
  studentId: row.student_id,
  title: row.title,
  score: row.score,
  maxScore: row.max_score,
  date: row.date,
});

export function createHandler(fixedAction?: string) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return response({ error: "Method not allowed." }, 405);
    }
    try {
      const body = await request.json().catch(() => {
        throw new HttpError(400, "Invalid request body.");
      });
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "Invalid request body.");
      }
      const action = fixedAction ?? body.action;
      const url = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !key) throw new Error("Missing server configuration.");
      // This privileged client exists only inside server functions.
      const db = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const check = (error: { message: string } | null) => {
        if (error) throw new Error(error.message);
      };

      if (action === "studentLogin") {
        const code = validAccessCode(body.accessCode);
        // The gateway supplies the client address. Shared database buckets work across isolates.
        const address =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            "unknown";
        const bucket = await hashToken(`student-login:${address}`);
        const { data: allowed, error: limitError } = await db.rpc(
          "axiom_allow_student_login",
          { bucket_key: bucket },
        );
        check(limitError);
        if (!allowed) {
          throw new HttpError(
            429,
            "Too many attempts. Please wait a few minutes and try again.",
          );
        }
        const { data: row, error } = await db.from("students").select(
          "id, name, subject, section, access_code",
        ).eq("access_code", code).maybeSingle();
        check(error);
        if (!row) {
          throw new HttpError(401, "Invalid access code. Please try again.");
        }
        const token = randomHex();
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
          .toISOString();
        const { error: sessionError } = await db.from("student_sessions")
          .insert({
            token_hash: await hashToken(token),
            student_id: row.id,
            expires_at: expiresAt,
          });
        check(sessionError);
        return response({ token, expiresAt, student: identity(row) });
      }

      if (action === "getStudentGrades" || action === "studentLogout") {
        const tokenHash = await hashToken(validToken(body.studentToken));
        if (action === "studentLogout") {
          const { error } = await db.from("student_sessions").delete().eq(
            "token_hash",
            tokenHash,
          );
          check(error);
          return response({ success: true });
        }
        const { data: session, error: sessionError } = await db.from(
          "student_sessions",
        ).select("student_id").eq("token_hash", tokenHash).gt(
          "expires_at",
          new Date().toISOString(),
        ).maybeSingle();
        check(sessionError);
        if (!session) {
          throw new HttpError(
            401,
            "Your student session has expired. Please sign in again.",
          );
        }
        // Always resolve the student ID from the server-side token, never from the request body.
        const { data: row, error } = await db.from("students").select(
          "id, name, subject, section, access_code, grades(grade)",
        ).eq("id", session.student_id).maybeSingle();
        check(error);
        if (!row) {
          throw new HttpError(401, "Student session is no longer available.");
        }
        const { data: items, error: itemsError } = await db.from("assessments")
          .select("*").eq("student_id", session.student_id).order("date", {
            ascending: false,
          }).order("created_at", { ascending: false });
        check(itemsError);
        return response({
          student: identity(row),
          overallGrade: row.grades?.[0]?.grade ?? null,
          assessments: (items ?? []).map(assessment),
        });
      }

      // Every remaining operation requires a verified Supabase teacher, even when JWT gateway checking is disabled.
      const bearer = request.headers.get("Authorization")?.match(
        /^Bearer (.+)$/i,
      )?.[1];
      if (!bearer) throw new HttpError(401, "Please sign in as a teacher.");
      const { data: { user }, error: authError } = await db.auth.getUser(
        bearer,
      );
      if (authError || !user) {
        throw new HttpError(401, "Please sign in as a teacher.");
      }
      const { data: profile, error: profileError } = await db.from("profiles")
        .select("role").eq("id", user.id).maybeSingle();
      check(profileError);
      if (profile?.role !== "teacher") {
        throw new HttpError(403, "Teacher access required.");
      }

      if (action === "getStudents" || action === "getStudentById") {
        let query = db.from("students").select(
          "id, name, subject, section, access_code, grades(grade)",
        ).order("name");
        if (action === "getStudentById") {
          query = query.eq("id", uuid(body.studentId));
        }
        const { data, error } = await query;
        check(error);
        if (action === "getStudentById") {
          if (!data?.[0]) throw new HttpError(404, "Student not found.");
          return response(student(data[0]));
        }
        return response((data ?? []).map(student));
      }
      if (action === "createStudent") {
        const input = {
          name: text(body.name, "Student name"),
          subject: text(body.subject, "Subject"),
          section: text(body.section, "Class"),
        };
        for (let attempt = 0; attempt < 10; attempt++) {
          const { data, error } = await db.from("students").insert({
            ...input,
            id: crypto.randomUUID(),
            access_code: generateAccessCode(),
          }).select("id, name, subject, section, access_code").single();
          if (!error) return response(student(data));
          if (error.code !== "23505") check(error);
        }
        throw new HttpError(
          503,
          "Could not allocate an access code. Please try again.",
        );
      }
      if (action === "deleteStudent") {
        // Delete grades, assessments and sessions atomically while preserving unknown existing FK behavior.
        const { data: deleted, error } = await db.rpc("axiom_delete_student", {
          target_student_id: uuid(body.studentId),
        });
        check(error);
        if (!deleted) throw new HttpError(404, "Student not found.");
        return response({ success: true });
      }
      if (action === "updateStudentClass") {
        const { data, error } = await db.from("students").update({
          subject: text(body.subject, "Subject"),
          section: text(body.section, "Class"),
        }).eq("id", uuid(body.studentId)).select(
          "id, name, subject, section, access_code, grades(grade)",
        ).maybeSingle();
        check(error);
        if (!data) throw new HttpError(404, "Student not found.");
        return response(student(data));
      }
      if (action === "updateOverallGrade") {
        const { error } = await db.from("grades").upsert({
          student_id: uuid(body.studentId),
          grade: number(body.grade, "Grade", 0, 100),
          updated_at: new Date().toISOString(),
        }, { onConflict: "student_id" });
        check(error);
        return response({ success: true });
      }
      if (action === "getAssessments") {
        const { data, error } = await db.from("assessments").select("*").eq(
          "student_id",
          uuid(body.studentId),
        ).order("date", { ascending: false }).order("created_at", {
          ascending: false,
        });
        check(error);
        return response((data ?? []).map(assessment));
      }
      if (action === "createAssessment" || action === "updateAssessment") {
        const input = assessmentInput(body);
        const query = action === "createAssessment"
          ? db.from("assessments").insert({
            ...input,
            student_id: uuid(body.studentId),
          })
          : db.from("assessments").update(input).eq(
            "id",
            uuid(body.assessmentId),
          );
        const { data, error } = await query.select("*").maybeSingle();
        check(error);
        if (!data) throw new HttpError(404, "Assessment not found.");
        return response(assessment(data));
      }
      if (action === "deleteAssessment") {
        const { data, error } = await db.from("assessments").delete().eq(
          "id",
          uuid(body.assessmentId),
        ).select("id");
        check(error);
        if (!data?.length) throw new HttpError(404, "Assessment not found.");
        return response({ success: true });
      }
      throw new HttpError(400, "Unknown operation.");
    } catch (error) {
      if (error instanceof HttpError) {
        return response({ error: error.message }, error.status);
      }
      // Do not expose database internals, access codes, or credentials in responses/logs.
      console.error(
        "Axiom server operation failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      return response({
        error: "Could not complete this operation. Please try again.",
      }, 500);
    }
  };
}
