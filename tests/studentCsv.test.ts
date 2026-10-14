import { test } from "node:test";
import assert from "node:assert/strict";
import { readSheet } from "read-excel-file/node";
import { MAX_IMPORT_ROWS, extractStudentNames, extractStudentNamesCsv, previewStudentNames, readStudentNames, studentCsv } from "../src/domain/studentCsv.ts";

const options = { subject: "Science", section: "6C", includeChinese: true };
const existing = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Yoyo 张三", subject: "Science", section: "6C" }];
const header = "School ID,English,姓名,Parent phone,Date of birth,subject,section\r\n";
const csv = "\uFEFFSchool roster title\r\n" + header + "IGNORED-ID,Yoyo,张三,IGNORED-PHONE,IGNORED-DOB,IGNORED-SUBJECT,IGNORED-CLASS\r\nIGNORED-ID,José García,李四,,,,\r\nIGNORED-ID,,王小明,,,,\r\nIGNORED-ID,,,IGNORED-PHONE,,,\r\n";

test("school CSV headers after a title extract only English and Chinese names", () => {
  const names = extractStudentNamesCsv(csv);
  assert.equal(names.length, 3);
  assert.deepEqual(names.map(row => [row.english, row.chinese]), [["Yoyo", "张三"], ["José García", "李四"], ["", "王小明"]]);
  assert.ok(names.every(row => Object.keys(row).sort().join() === "chinese,english,error,id"));
  assert.ok(!JSON.stringify(names).includes("IGNORED"));
  const preview = previewStudentNames(names, [], options);
  assert.equal(preview[0].record.name, "Yoyo 张三");
  assert.ok(preview.every(row => row.record.subject === "Science" && row.record.section === "6C" && !row.error));
  assert.ok(!JSON.stringify(preview).includes("IGNORED"));
});
test("Chinese inclusion, English-only and Chinese fallback obey the selected display option", () => {
  const names = extractStudentNamesCsv(csv);
  const withChinese = previewStudentNames(names, [], options);
  const englishOnly = previewStudentNames(names, [], { ...options, includeChinese: false });
  assert.deepEqual(withChinese.map(row => row.record.name), ["Yoyo 张三", "José García 李四", "王小明"]);
  assert.deepEqual(englishOnly.map(row => row.record.name), ["Yoyo", "José García", "王小明"]);
  assert.deepEqual(withChinese.map(row => row.record.id), englishOnly.map(row => row.record.id));
});
test("actual XLSX file uses the same name-only extraction", async () => {
  const cells = await readSheet(new URL("./fixtures/school-roster.xlsx", import.meta.url).pathname, 1);
  const names = extractStudentNames(cells);
  assert.deepEqual(names.map(row => [row.english, row.chinese]), [["Yoyo", "张三"], ["José García", "李四"], ["", "王小明"]]);
  assert.ok(!JSON.stringify(names).includes("IGNORED"));
});
test("CSV supports quoted commas, quotes and multiline ignored fields without retaining them", () => {
  const names = extractStudentNamesCsv('English,姓名,Parent notes\r\n"García, ""José""",张三,"IGNORED\nPRIVATE"\r\n');
  assert.equal(names[0].english, 'García, "José"');
  assert.ok(!JSON.stringify(names).includes("IGNORED"));
});
test("only recognized headers are used; duplicate names headers and malformed CSV are rejected", () => {
  for (const value of ["", "name,subject,section\nA,B,C", "English,English,姓名\nA,A,B", "English,姓名", 'English,姓名\n"Unclosed,A', 'English,姓名\n"Closed"extra,A']) {
    assert.throws(() => extractStudentNamesCsv(value));
  }
  const names = extractStudentNamesCsv("  ENGLISH  , 姓名 ,School ID,School ID\n Alice , 李四 ,one,two");
  assert.equal(names[0].english, "Alice");
  assert.equal(names[0].chinese, "李四");
});
test("blank-name rows and repeated headers are ignored; extra/missing ignored cells do not affect names", () => {
  const names = extractStudentNamesCsv("English,姓名,Other\n,,IGNORED\nEnglish,姓名,Other\nAlice,,extra,more\n,王小明");
  assert.equal(names.length, 2);
  assert.deepEqual(names.map(row => [row.english, row.chinese]), [["Alice", ""], ["", "王小明"]]);
});
test("required shared class and name limits are validated without echoing cell contents", () => {
  const names = extractStudentNames([["English", "姓名"], ["Alice", "张三"], ["x".repeat(121), ""], [12, ""]]);
  assert.match(previewStudentNames(names, [], { ...options, subject: "" })[0].error, /Subject is required/);
  assert.match(previewStudentNames(names, [], { ...options, section: "" })[0].error, /Class is required/);
  assert.match(previewStudentNames(names, [], options)[1].error, /maximum 120/);
  assert.equal(previewStudentNames(names, [], options)[2].error, "Student names must be text.");
});
test("repeated and English/bilingual name variants are flagged, not assumed to be unique identities", () => {
  const names = extractStudentNamesCsv("English,姓名\nYoyo,张三\nSam,李四\nSam,王五");
  const preview = previewStudentNames(names, existing, { ...options, includeChinese: false });
  assert.ok(preview.every(row => row.warning && !row.record.confirmDistinct));
  assert.equal(new Set(preview.map(row => row.record.id)).size, 3);
});
test("file and row limits apply after stripping nameless rows", () => {
  assert.throws(() => extractStudentNamesCsv("English,姓名\n" + "A,张三\n".repeat(MAX_IMPORT_ROWS + 1)), /at most/);
  assert.throws(() => extractStudentNamesCsv("a".repeat(2 * 1024 * 1024 + 1)), /2 MB/);
});
test("CSV file reader handles UTF-8, rejects invalid encoding and unsupported extensions safely", async () => {
  const file = new File([csv], "school.csv", { type: "text/csv" });
  assert.equal((await readStudentNames(file)).length, 3);
  await assert.rejects(readStudentNames(new File([new Uint8Array([0xff])], "bad.csv")), /CSV UTF-8/);
  await assert.rejects(readStudentNames(new File([csv], "school.xls")), /Older .xls/);
});
test("Excel export quotes Unicode names, excludes ignored fields and preserves formula protection", () => {
  const preview = previewStudentNames(extractStudentNamesCsv(csv), [], options);
  const exported = studentCsv(preview.map(row => ({ ...row.record, id: row.record.id, schoolId: "IGNORED-ID", parentPhone: "IGNORED-PHONE" })));
  assert.ok(exported.startsWith("\uFEFFstudent_id,name,subject,section\r\n"));
  assert.ok(exported.includes("José García 李四") && !exported.includes("IGNORED"));
  for (const name of ['=HYPERLINK("https://example.com")', "+1", "-1", "@SUM(A1)", "  =1", "\ttext", "\ntext"]) {
    assert.ok(studentCsv([{ ...existing[0], name }]).includes('"\'' + name.replace(/"/g, '""')));
  }
});
