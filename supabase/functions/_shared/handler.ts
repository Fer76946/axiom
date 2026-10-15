import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  assessmentInput,
  generateAccessCode,
  hashToken,
  HttpError,
  number,
  randomHex,
  studentInput,
  studentNamesMayMatch,
  text,
  testQuizInput,
  testQuizRevision,
  testQuizScores,
  uuid,
  validToken,
} from "./validation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Retry-After",
};
function response(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
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
type StudentIdentityRow = Pick<StudentRow, "id" | "name" | "subject" | "section">;
type AssessmentRow = {
  id: string;
  student_id: string;
  title: string;
  score: number;
  max_score: number;
  date: string;
};
type TestQuizRow = {
  id: string;
  kind: "test" | "quiz";
  title: string;
  max_score: number;
  date: string;
  classes: { subject: string; section: string }[];
  revision: number;
};
const testQuiz = (row: TestQuizRow) => ({
  id: row.id, kind: row.kind, title: row.title, maxScore: row.max_score,
  date: row.date, classes: row.classes, revision: row.revision,
});
const identity = (row: StudentIdentityRow) => ({
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
      async function studentTestsQuizzes(studentId: string) {
        const results = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db.rpc("axiom_student_tests_quizzes", { target_student_id: studentId }).range(offset, offset + 999);
          check(error);
          results.push(...(data ?? []).map((item: Omit<TestQuizRow, "classes" | "revision"> & { score: number | null }) => ({
            id: item.id, kind: item.kind, title: item.title, maxScore: item.max_score, date: item.date, score: item.score,
          })));
          if ((data?.length ?? 0) < 1000) return results;
        }
      }

      if (action === "studentLogin") {
        if (typeof body.browserId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.browserId)) {
          return response({ error: "Unable to sign in. Please refresh and try again." }, 400);
        }
        const token = randomHex();
        const { data: result, error: loginError } = await db.rpc(
          "axiom_student_login",
          {
            p_browser_key: await hashToken(`student-login:${body.browserId.toLowerCase()}`),
            p_access_code: typeof body.accessCode === "string" && /^\d{7}$/.test(body.accessCode)
              ? body.accessCode : null,
            p_token_hash: await hashToken(token),
          },
        );
        if (loginError || !result) {
          // Never log the code, browser identifier, or database error details.
          console.error("Student sign-in database operation failed.");
          return response({ error: "Unable to sign in right now. Please try again later." }, 503);
        }
        if (result.status === "blocked") {
          const retryAfterSeconds = Math.max(1, Math.min(300, Math.ceil(Number(result.retryAfterSeconds) || 300)));
          return response({
            error: "Too many unsuccessful attempts. Please try again shortly.",
            retryAfterSeconds,
          }, 429, { "Retry-After": String(retryAfterSeconds) });
        }
        if (result.status === "invalid") {
          return response({ error: "Unable to sign in. Check your access code and try again." }, 401);
        }
        if (result.status !== "ok" || !result.student || !result.expiresAt) {
          return response({ error: "Unable to sign in right now. Please try again later." }, 503);
        }
        return response({ token, expiresAt: result.expiresAt, student: result.student });
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
          testsQuizzes: await studentTestsQuizzes(session.student_id),
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

      // Manual and CSV creation share validation, secure codes, and collision retries.
      async function createStudentRecord(
        input: ReturnType<typeof studentInput>,
        id: string = crypto.randomUUID(),
        idempotent = false,
      ) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const { data, error } = await db.from("students").insert({
            ...input, id, access_code: generateAccessCode(),
          }).select("id, name, subject, section, access_code").single();
          if (!error) return { row: data as StudentRow, created: true };
          if (error.code !== "23505") check(error);
          if (idempotent) {
            // The primary key makes retries/concurrent copies of a CSV row safe.
            const { data: existing, error: readError } = await db.from("students")
              .select("id, name, subject, section, access_code").eq("id", id).maybeSingle();
            check(readError);
            if (existing) {
              if (!matches(existing, input)) throw new HttpError(409, "Student ID already exists with different details. No changes made.");
              return { row: existing as StudentRow, created: false };
            }
          }
        }
        throw new HttpError(503, "Could not allocate an access code. Please try again.");
      }
      function matches(row: Pick<StudentRow, "name" | "subject" | "section">, input: ReturnType<typeof studentInput>) {
        return row.name === input.name && row.subject === input.subject && row.section === input.section;
      }
      async function readRoster(subject?: string, section?: string) {
        const roster: StudentIdentityRow[] = [];
        // Supabase caps responses; page explicitly so exports and duplicate checks include every student.
        for (let offset = 0; ; offset += 1000) {
          let query = db.from("students").select("id, name, subject, section").order("id").range(offset, offset + 999);
          if (subject) query = query.eq("subject", subject);
          if (section) query = query.eq("section", section);
          const { data, error } = await query;
          check(error);
          roster.push(...(data ?? []) as StudentIdentityRow[]);
          if ((data?.length ?? 0) < 1000) return roster;
        }
      }
      if (action === "exportStudents") {
        const subject = body.subject === undefined || body.subject === "" ? undefined : text(body.subject, "Subject");
        const section = body.section === undefined || body.section === "" ? undefined : text(body.section, "Class");
        // Export has its own teacher authorization and never selects credentials.
        return response((await readRoster(subject, section)).map(identity));
      }
      if (action === "getStudentTestsQuizzes") {
        return response(await studentTestsQuizzes(uuid(body.studentId)));
      }
      if (action === "getTestsQuizzes") {
        const results = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db.from("tests_quizzes").select("*").order("date", { ascending: false }).order("id").range(offset, offset + 999);
          check(error);
          results.push(...(data ?? []).map(testQuiz));
          if ((data?.length ?? 0) < 1000) return response(results);
        }
      }
      if (action === "getTestQuiz") {
        const id = uuid(body.id);
        const { data: item, error } = await db.from("tests_quizzes").select("*").eq("id", id).maybeSingle();
        check(error);
        if (!item) throw new HttpError(404, "Test or quiz not found.");
        const scores = new Map<string, number | null>();
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db.from("test_quiz_scores").select("student_id, score").eq("test_quiz_id", id).order("student_id").range(offset, offset + 999);
          check(error);
          for (const score of data ?? []) scores.set(score.student_id, score.score);
          if ((data?.length ?? 0) < 1000) break;
        }
        const classes = (item as TestQuizRow).classes;
        const students = (await readRoster()).map(row => ({
          ...identity(row), score: scores.get(row.id) ?? null,
          applicable: classes.some(value => value.subject === row.subject && value.section === row.section),
        })).filter(row => row.applicable || scores.has(row.id));
        return response({ item: testQuiz(item), students });
      }
      if (action === "saveTestQuiz" || action === "saveTestQuizScores") {
        const id = uuid(body.id);
        const args = action === "saveTestQuiz" ? {
          record_id: id, expected_revision: body.revision === null ? null : testQuizRevision(body.revision), details: testQuizInput(body),
        } : {
          record_id: id, expected_revision: testQuizRevision(body.revision), scores: testQuizScores(body.scores),
        };
        const query = db.rpc(action === "saveTestQuiz" ? "axiom_save_test_quiz" : "axiom_save_test_quiz_scores", args);
        const { data, error } = await (action === "saveTestQuiz" ? query.single() : query);
        if (error?.code === "40001") throw new HttpError(409, "This test or quiz changed. Reload it before saving.");
        if (error?.code === "P0002") throw new HttpError(404, "Test or quiz not found.");
        if (error?.code === "22023") throw new HttpError(400, error.message);
        check(error);
        return response(action === "saveTestQuiz" ? testQuiz(data as TestQuizRow) : { success: true });
      }
      if (action === "deleteTestQuiz") {
        const { data, error } = await db.from("tests_quizzes").delete().eq("id", uuid(body.id)).eq("revision", testQuizRevision(body.revision)).select("id");
        check(error);
        if (!data?.length) throw new HttpError(409, "This test or quiz changed or was deleted. Reload it before deleting.");
        return response({ success: true });
      }
      if (action === "importStudents") {
        if (!Array.isArray(body.records) || !body.records.length || body.records.length > 25) {
          throw new HttpError(400, "Import between 1 and 25 records per request.");
        }
        const roster = await readRoster();
        const results = [];
        for (const value of body.records) {
          const resultId = typeof value?.id === "string" ? value.id : "";
          try {
            if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Invalid student row.");
            const requestId = uuid(value.id);
            const input = studentInput(value);
            let targetId: string;
            if (value.studentId !== undefined) {
              targetId = uuid(value.studentId);
              const existing = roster.find(row => row.id === targetId);
              if (!existing) throw new HttpError(404, "Student ID not found. Leave it blank for a new student.");
              if (!matches(existing, input)) throw new HttpError(409, "Existing student differs. Use Edit Class in the roster; imports never overwrite records.");
              results.push({ id: resultId, status: "existing", message: "Already in roster; unchanged." });
              continue;
            }
            if (value.confirmDistinct === true) {
              // Explicit identity resolution permits different students who share a name.
              targetId = requestId;
            } else {
              // A full-record retry key, not a name-based identity or an access credential.
              const hash = await hashToken("axiom-csv-v1:" + JSON.stringify(input));
              targetId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
            }
            const existing = roster.find(row => row.id === targetId);
            if (existing) {
              if (!matches(existing, input)) throw new HttpError(409, "Student ID already exists with different details. No changes made.");
              results.push({ id: resultId, status: "existing", message: "Already imported; unchanged." });
              continue;
            }
            if (value.confirmDistinct !== true && roster.some(row => studentNamesMayMatch(row.name, input.name))) {
              throw new HttpError(409, "Name may already be in roster. Leave existing students skipped, or confirm this is a different student.");
            }
            const created = await createStudentRecord(input, targetId, true);
            roster.push(created.row);
            results.push({ id: resultId, status: created.created ? "created" : "existing", message: created.created ? "Imported." : "Already imported; unchanged." });
          } catch (cause) {
            results.push({ id: resultId, status: "error", message: cause instanceof HttpError ? cause.message : "Could not import this row. Retry the same preview safely." });
          }
        }
        return response(results);
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
        return response(student((await createStudentRecord(studentInput(body))).row));
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
      if (action === "updateStudentName") {
        const { data, error } = await db.from("students").update({
          name: text(body.name, "Student name").normalize("NFC"),
        }).eq("id", uuid(body.studentId)).select(
          "id, name, subject, section, access_code, grades(grade)",
        ).maybeSingle();
        check(error);
        if (!data) throw new HttpError(404, "Student not found.");
        return response(student(data));
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
