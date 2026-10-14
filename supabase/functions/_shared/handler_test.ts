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
      if (url.includes(path)) data = typeof value === "function" ? value({ url, method, body: String(options?.body ?? "") }) : value;
    }
    if (data instanceof Response) return data;
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
        "importStudents",
        "exportStudents",
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

type DatabaseCall = { url: string; method: string; body: string };
async function withCsvDatabase(
  run: (rows: typeof row[], calls: DatabaseCall[]) => Promise<void>,
  options: { initial?: typeof row[]; collisions?: number; failName?: string } = {},
) {
  const rows = [...(options.initial ?? [])];
  let collisions = options.collisions ?? 0;
  await withDatabase(calls => run(rows, calls), {
    "/students": (call: DatabaseCall) => {
      const url = new URL(call.url);
      if (call.method === "POST") {
        const input = JSON.parse(call.body);
        if (input.name === options.failName) return new Response(JSON.stringify({ code: "XX000", message: "Private database failure" }), { status: 500 });
        if (collisions-- > 0 || rows.some(item => item.id === input.id || item.access_code === input.access_code)) {
          return new Response(JSON.stringify({ code: "23505", message: "Unique constraint" }), { status: 409 });
        }
        const created = { ...input, grades: [] };
        rows.push(created);
        return created;
      }
      const id = url.searchParams.get("id")?.slice(3);
      if (id) return rows.find(item => item.id === id) ?? null;
      const filtered = rows.filter(item => ["subject", "section"].every(key => {
        const value = url.searchParams.get(key);
        return !value || item[key as "subject" | "section"] === value.slice(3);
      }));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      return filtered.slice(offset, offset + limit);
    },
  });
}
const importRecord = (name: string, section = "6A") => ({
  id: crypto.randomUUID(), name, subject: "Science", section, confirmDistinct: false,
});
const importRequest = (records: object[]) => request({ action: "importStudents", records }, "teacher-jwt");

Deno.test("CSV import validates each row, preserves Unicode/classes, and reports partial failures", async () => {
  await withCsvDatabase(async (rows, calls) => {
    const records = [importRecord("王小明"), { ...importRecord("José García", "9B"), subject: "Algebra 2" }, importRecord(""), importRecord("Database failure")];
    const result = await createHandler()(importRequest(records));
    assert(result.status === 200);
    const results = await result.json();
    assert(results.map((item: { status: string }) => item.status).join() === "created,created,error,error");
    assert(rows.length === 2 && rows[0].name === "王小明" && rows[1].section === "9B");
    assert(rows[1].subject === "Algebra 2" && rows.every(item => /^\d{7}$/.test(item.access_code)));
    assert(!JSON.stringify(results).includes("Private database failure") && !JSON.stringify(results).includes("access_code"));
    assert(!calls.some(call => call.url.includes("/auth/v1/admin")));
  }, { failName: "Database failure" });
});

Deno.test("CSV retries, repeated records, and concurrent primary-key conflicts never recreate students", async () => {
  await withCsvDatabase(async rows => {
    const handler = createHandler();
    const first = importRecord("王小明");
    let result = await handler(importRequest([first, { ...first, id: crypto.randomUUID() }]));
    let results = await result.json();
    assert(results[0].status === "created" && results[1].status === "existing");
    const originalCode = rows[0].access_code;
    result = await handler(importRequest([{ ...first, id: crypto.randomUUID() }]));
    results = await result.json();
    assert(results[0].status === "existing" && rows.length === 1 && rows[0].access_code === originalCode);
    const concurrent = importRecord("Concurrent Student");
    const outcomes = await Promise.all([handler(importRequest([concurrent])), handler(importRequest([concurrent]))]);
    const statuses = await Promise.all(outcomes.map(async response => (await response.json())[0].status));
    assert(statuses.includes("created") && statuses.includes("existing") && Number(rows.length) === 2);
  });
});

Deno.test("CSV names are not identifiers: ambiguity requires review and distinct students are allowed", async () => {
  await withCsvDatabase(async rows => {
    const handler = createHandler();
    const ambiguous = importRecord("Yoyo", "6B");
    let result = await handler(importRequest([ambiguous]));
    assert((await result.json())[0].status === "error" && rows.length === 1);
    result = await handler(importRequest([{ ...ambiguous, confirmDistinct: true }]));
    assert((await result.json())[0].status === "created" && Number(rows.length) === 2);
    result = await handler(importRequest([{ ...ambiguous, confirmDistinct: true }]));
    assert((await result.json())[0].status === "existing" && Number(rows.length) === 2);
    result = await handler(importRequest([{ ...importRecord("Yoyo"), confirmDistinct: true }]));
    assert((await result.json())[0].status === "created" && Number(rows.length) === 3);
  }, { initial: [row] });
});

Deno.test("CSV existing student IDs never overwrite data or create additional class accounts", async () => {
  await withCsvDatabase(async (rows, calls) => {
    const records = [
      { ...importRecord("Yoyo"), studentId: studentA },
      { ...importRecord("Yoyo", "6B"), studentId: studentA },
      { ...importRecord("New"), studentId: studentB },
      { ...importRecord("New"), id: "forged" },
    ];
    const results = await (await createHandler()(importRequest(records))).json();
    assert(results.map((item: { status: string }) => item.status).join() === "existing,error,error,error");
    assert(rows.length === 1 && rows[0].section === "6A");
    assert(!calls.some(call => call.method !== "GET"));
  }, { initial: [row] });
});

Deno.test("CSV creation reuses secure access-code collision retries", async () => {
  await withCsvDatabase(async (rows, calls) => {
    const results = await (await createHandler()(importRequest([importRecord("New")]))).json();
    assert(results[0].status === "created" && rows.length === 1);
    const inserts = calls.filter(call => call.method === "POST");
    assert(inserts.length === 3);
    assert(inserts.every(call => /^\d{7}$/.test(JSON.parse(call.body).access_code)));
    assert(new Set(inserts.map(call => JSON.parse(call.body).id)).size === 1);
  }, { collisions: 2 });
  await withCsvDatabase(async rows => {
    const results = await (await createHandler()(importRequest([importRecord("No code"), importRecord("Next row")]))).json();
    assert(results[0].status === "error" && results[1].status === "created" && rows.length === 1);
    assert(results[0].message.includes("allocate an access code"));
  }, { collisions: 10 });
});

Deno.test("CSV batch bounds and malformed fields are enforced on the server", async () => {
  await withCsvDatabase(async (rows, calls) => {
    const handler = createHandler();
    for (const records of [[], Array.from({ length: 26 }, () => importRecord("A"))]) {
      assert((await handler(importRequest(records))).status === 400);
    }
    const results = await (await handler(importRequest([
      { ...importRecord("A"), section: "" }, { ...importRecord("A"), subject: 12 }, { ...importRecord("A"), name: "x".repeat(121) },
    ]))).json();
    assert(results.every((result: { status: string }) => result.status === "error"));
    assert(rows.length === 0 && !calls.some(call => call.method === "POST"));
  });
});

Deno.test("CSV import and export reject authenticated non-teachers before accessing the roster", async () => {
  await withDatabase(async calls => {
    for (const action of ["importStudents", "exportStudents"]) {
      assert((await createHandler()(request({ action, records: [importRecord("A")] }, "non-teacher-jwt"))).status === 403);
    }
    assert(!calls.some(call => call.url.includes("/students")));
  }, { "/profiles": { role: "student" } });
});

Deno.test("CSV export paginates the entire roster, supports class filters and excludes credentials", async () => {
  const initial = Array.from({ length: 1005 }, (_, index) => ({ ...row, id: `${index}`, name: `Student ${index}`, section: index < 3 ? "6B" : "6A" }));
  await withCsvDatabase(async (_rows, calls) => {
    const handler = createHandler();
    let result = await handler(request({ action: "exportStudents" }, "teacher-jwt"));
    let data = await result.json();
    assert(data.length === 1005 && Object.keys(data[0]).sort().join() === "id,name,section,subject");
    assert(calls.filter(call => call.url.includes("/students")).length === 2);
    assert(calls.filter(call => call.url.includes("/students")).every(call => !call.url.includes("access_code")));
    result = await handler(request({ action: "exportStudents", subject: "Science", section: "6B" }, "teacher-jwt"));
    data = await result.json();
    assert(data.length === 3 && data.every((item: { section: string }) => item.section === "6B"));
    assert((await handler(request({ action: "exportStudents", subject: 12 }, "teacher-jwt"))).status === 400);
  }, { initial });
});
