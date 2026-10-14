import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_IMPORT_ROWS, previewStudentCsv, studentCsv } from "../src/domain/studentCsv.ts";

const studentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const existing = [{ id: studentId, name: "Yoyo", subject: "Science", section: "6A" }];
const header = "student_id,name,subject,section\r\n";
test("UTF-8 BOM, Chinese/accented names, and different classes parse correctly", () => {
  const rows = previewStudentCsv("\uFEFF" + header + ",王小明,Science,6A\r\n,José García,Algebra 2,9B\r\n", []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].record.name, "王小明");
  assert.equal(rows[1].record.name, "José García");
  assert.equal(rows[1].record.subject, "Algebra 2");
  assert.ok(rows.every(row => !row.error && !row.warning));
  assert.notEqual(rows[0].record.id, rows[1].record.id);
});
test("CSV supports quoted commas, doubled quotes, and embedded newlines", () => {
  const [row] = previewStudentCsv(header + ',"García, ""José""","Science\nLab",6B\r\n', []);
  assert.equal(row.record.name, 'García, "José"');
  assert.equal(row.record.subject, "Science\nLab");
  assert.equal(row.error, "");
});
test("invalid fields are identified by CSV line without losing valid rows", () => {
  const rows = previewStudentCsv(header + ",,Science,6A\r\n,Valid,Science,6B\r\n,No class,Science\r\n,bad,Science,6A,extra\r\n", []);
  assert.equal(rows[0].line, 2);
  assert.match(rows[0].error, /Student name is required/);
  assert.equal(rows[1].error, "");
  assert.match(rows[2].error, /fields/);
  assert.match(rows[3].error, /fields/);
});
test("malformed CSV, invalid headers, empty files and limits are rejected", () => {
  for (const value of ["", "name,subject\nA,B", "name,name,subject,section\nA,A,B,C", header, header + ',"Unclosed,Science,6A', header + ',"Closed"extra,Science,6A']) {
    assert.throws(() => previewStudentCsv(value, []));
  }
  assert.throws(() => previewStudentCsv(header + ",A,Science,6A\n".repeat(MAX_IMPORT_ROWS + 1), []), /at most/);
  assert.throws(() => previewStudentCsv("a".repeat(2 * 1024 * 1024 + 1), []), /2 MB/);
});
test("same-name rows require identity review without treating names as IDs", () => {
  const rows = previewStudentCsv(header + ",Yoyo,Algebra 2,9A\n,Sam,Science,6A\n,Sam,Science,6B\n,Sam,Science,6B", existing);
  assert.ok(rows.every(row => row.warning && !row.error && !row.record.confirmDistinct));
  assert.equal(new Set(rows.map(row => row.record.id)).size, 4);
});
test("existing IDs are unchanged; unknown, repeated and conflicting IDs are flagged", () => {
  const rows = previewStudentCsv(header + `${studentId},Yoyo,Science,6A\n${studentId},Yoyo,Algebra 2,9A\nnot-an-id,New,Science,6B`, existing);
  assert.equal(rows[0].error, "");
  assert.equal(rows[0].record.studentId, studentId);
  assert.match(rows[1].error, /Repeated student ID/);
  assert.match(rows[2].error, /Invalid record ID/);
  assert.match(previewStudentCsv(header + `${studentId},Yoyo,Science,6B`, existing)[0].error, /never overwrite/);
  assert.match(previewStudentCsv(header + "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,New,Science,6B", existing)[0].error, /not found/);
});
test("Excel export is UTF-8/BOM/CRLF, quotes correctly, and excludes secrets", () => {
  const csv = studentCsv([{ ...existing[0], name: '王小明, "José"', accessCode: "0123456", token: "secret" } as typeof existing[0]]);
  assert.ok(csv.startsWith("\uFEFFstudent_id,name,subject,section\r\n"));
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(!csv.includes("0123456") && !csv.includes("secret"));
  const [row] = previewStudentCsv(csv, [{ ...existing[0], name: '王小明, "José"' }]);
  assert.equal(row.record.name, '王小明, "José"');
  assert.equal(row.error, "");
});
test("Excel formula injection is neutralized even with leading whitespace", () => {
  for (const name of ["=HYPERLINK(\"https://example.com\")", "+1", "-1", "@SUM(A1)", "  =1", "\ttext", "\ntext"]) {
    const csv = studentCsv([{ ...existing[0], name }]);
    assert.ok(csv.includes('"\'' + name.replace(/"/g, '""')));
  }
});
