import { createHandler } from "./handler.ts";
import { hashToken } from "./validation.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const studentA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const studentB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = {
  id: studentA,
  name: "Yoyo",
  subject: "Science",
  section: "6A",
  access_code: "0123456",
  grades: [{ grade: 89 }],
};
const token = "a".repeat(64);
const request = (body: object, bearer?: string) =>
  new Request("http://localhost/axiom-api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
async function withDatabase(
  run: (
    calls: { url: string; method: string; body: string }[],
  ) => Promise<void>,
  overrides: Record<string, unknown> = {},
) {
  const previous = globalThis.fetch;
  const oldUrl = Deno.env.get("SUPABASE_URL");
  const oldKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.set("SUPABASE_URL", "http://axiom-test.invalid");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "server-test-key");
  const calls: { url: string; method: string; body: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const options = init as { method?: string; body?: unknown } | undefined;
    const method = options?.method ?? "GET";
    calls.push({ url, method, body: String(options?.body ?? "") });
    let data: unknown = null;
    if (url.includes("/auth/v1/user")) {
      data = {
        id: "teacher-id",
        aud: "authenticated",
        role: "authenticated",
        email: "teacher@example.com",
      };
    } else if (url.includes("/profiles")) data = { role: "teacher" };
    else if (url.includes("/rpc/axiom_allow_student_login")) data = true;
    else if (url.includes("/student_sessions")) {
      data = method === "GET" ? { student_id: studentA } : null;
    } else if (url.includes("/students")) data = row;
    else if (url.includes("/assessments")) data = [];
    for (const [path, value] of Object.entries(overrides)) {
      if (url.includes(path)) data = value;
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = previous;
    if (oldUrl) Deno.env.set("SUPABASE_URL", oldUrl);
    else Deno.env.delete("SUPABASE_URL");
    if (oldKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", oldKey);
    else Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
}
Deno.test("student token resolves rightful identity despite forged browser student ID", async () => {
  await withDatabase(async (calls) => {
    const result = await createHandler()(
      request({
        action: "getStudentGrades",
        studentToken: token,
        studentId: studentB,
      }),
    );
    assert(result.status === 200);
    const data = await result.json();
    assert(data.student.id === studentA && data.overallGrade === 89);
    assert(!("accessCode" in data.student));
    assert(
      !calls.some((call) =>
        call.url.includes(studentB) || call.body.includes(studentB)
      ),
    );
    assert(
      calls.filter((call) =>
        call.url.includes("/students") || call.url.includes("/assessments")
      ).every((call) => call.url.includes(studentA)),
    );
  });
});
Deno.test("unknown or expired student session cannot read grades", async () => {
  await withDatabase(async (calls) => {
    const result = await createHandler()(
      request({ action: "getStudentGrades", studentToken: token }),
    );
    assert(result.status === 401);
    assert(
      !calls.some((call) =>
        call.url.includes("/students") || call.url.includes("/assessments")
      ),
    );
    assert(calls[0].url.includes("expires_at=gt."));
  }, { "/student_sessions": null });
});
Deno.test("student ID alone cannot read grades", async () => {
  await withDatabase(async (calls) => {
    assert(
      (await createHandler()(
        request({ action: "getStudentGrades", studentId: studentB }),
      )).status === 401,
    );
    assert(calls.length === 0);
  });
});
Deno.test("all teacher actions reject unauthenticated student sessions", async () => {
  await withDatabase(async (calls) => {
    for (
      const action of [
        "getStudents",
        "getStudentById",
        "createStudent",
        "deleteStudent",
        "updateStudentClass",
        "updateOverallGrade",
        "getAssessments",
        "createAssessment",
        "updateAssessment",
        "deleteAssessment",
      ]
    ) {
      assert(
        (await createHandler()(
          request({ action, studentToken: token, studentId: studentA }),
        )).status === 401,
        action,
      );
    }
    assert(calls.length === 0);
  });
});
Deno.test("authenticated non-teacher cannot mutate student data", async () => {
  await withDatabase(async (calls) => {
    assert(
      (await createHandler()(
        request({ action: "deleteStudent", studentId: studentA }, "user-jwt"),
      )).status === 403,
    );
    assert(!calls.some((call) => call.url.includes("axiom_delete_student")));
  }, { "/profiles": { role: "student" } });
});
Deno.test("invalid overall grade does not reach a write query", async () => {
  await withDatabase(async (calls) => {
    assert(
      (await createHandler()(
        request({
          action: "updateOverallGrade",
          studentId: studentA,
          grade: 101,
        }, "teacher-jwt"),
      )).status === 400,
    );
    assert(!calls.some((call) => call.url.includes("/grades")));
  });
});
Deno.test("student logout revokes only the hashed token and is idempotent", async () => {
  await withDatabase(async (calls) => {
    for (let i = 0; i < 2; i++) {
      assert(
        (await createHandler()(
          request({ action: "studentLogout", studentToken: token }),
        )).status === 200,
      );
    }
    const hash = await hashToken(token);
    assert(
      calls.length === 2 &&
        calls.every((call) =>
          call.method === "DELETE" && call.url.includes(hash) &&
          !call.url.includes(token)
        ),
    );
  });
});
Deno.test("valid code login returns identity and token without creating Auth users", async () => {
  await withDatabase(async (calls) => {
    const result = await createHandler("studentLogin")(
      request({ accessCode: "0123456" }),
    );
    assert(result.status === 200);
    const data = await result.json();
    assert(data.student.id === studentA && /^[a-f0-9]{64}$/.test(data.token));
    assert(Date.parse(data.expiresAt) > Date.now());
    assert(!calls.some((call) => call.url.includes("/auth/")));
    const insert = calls.find((call) =>
      call.url.includes("/student_sessions") && call.method === "POST"
    );
    assert(
      insert && !insert.body.includes(data.token) &&
        insert.body.includes(await hashToken(data.token)),
    );
  });
});
Deno.test("invalid code and rate limit do not create a student session", async () => {
  await withDatabase(async (calls) => {
    assert(
      (await createHandler("studentLogin")(request({ accessCode: "9999999" })))
        .status === 401,
    );
    assert(!calls.some((call) => call.url.includes("/student_sessions")));
  }, { "/students": null });
  await withDatabase(async (calls) => {
    assert(
      (await createHandler("studentLogin")(request({ accessCode: "9999999" })))
        .status === 429,
    );
    assert(!calls.some((call) => call.url.includes("/students")));
  }, { "/rpc/axiom_allow_student_login": false });
});
Deno.test("teacher creates student with numeric code and no Auth/profile account", async () => {
  await withDatabase(async (calls) => {
    assert(
      (await createHandler("createStudent")(
        request(
          { name: "Yoyo", subject: "Science", section: "6A" },
          "teacher-jwt",
        ),
      )).status === 200,
    );
    const insert = calls.find((call) =>
      call.url.includes("/students") && call.method === "POST"
    );
    assert(insert);
    const payload = JSON.parse(insert.body);
    assert(/^\d{7}$/.test(payload.access_code));
    assert(
      !calls.some((call) =>
        call.url.includes("/auth/v1/admin") ||
        call.url.includes("/profiles") && call.method !== "GET"
      ),
    );
  });
});

Deno.test("overall grade save sets its timestamp and uses student_id conflict key", async () => {
  await withDatabase(async (calls) => {
    const result = await createHandler()(
      request(
        { action: "updateOverallGrade", studentId: studentA, grade: 89 },
        "teacher-jwt",
      ),
    );
    assert(result.status === 200);
    const write = calls.find((call) =>
      call.url.includes("/grades") && call.method === "POST"
    );
    assert(write && write.url.includes("on_conflict=student_id"));
    const body = JSON.parse(write.body);
    assert(body.student_id === studentA && body.grade === 89);
    assert(Number.isFinite(Date.parse(body.updated_at)));
  });
});
