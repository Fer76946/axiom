import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile as readLocalFile } from "node:fs/promises";
import { utils, write } from "xlsx";
import { MAX_IMPORT_ROWS, extractStudentNames, extractStudentNamesCsv, previewStudentNames, readStudentNames, readStudentWorkbook, splitStudentName, studentCsv } from "../src/domain/studentCsv.ts";

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
  const file = new File([await readLocalFile(new URL("./fixtures/school-roster.xlsx", import.meta.url))], "school-roster.xlsx");
  const names = await readStudentNames(file);
  assert.deepEqual(names.map(row => [row.english, row.chinese]), [["Yoyo", "张三"], ["José García", "李四"], ["", "王小明"]]);
  assert.ok(!JSON.stringify(names).includes("IGNORED"));
});
test("CSV supports quoted commas, quotes and multiline ignored fields without retaining them", () => {
  const names = extractStudentNamesCsv('English,姓名,Parent notes\r\n"García, ""José""",张三,"IGNORED\nPRIVATE"\r\n');
  assert.equal(names[0].english, 'García, "José"');
  assert.ok(!JSON.stringify(names).includes("IGNORED"));
});
test("only recognized headers are used; duplicate names headers and malformed CSV are rejected", () => {
  for (const value of ["", "student_number,subject,section\nA,B,C", "English,English,姓名\nA,A,B", "English,姓名", 'English,姓名\n"Unclosed,A', 'English,姓名\n"Closed"extra,A']) {
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
  assert.match(previewStudentNames(names, [], options)[2].error, /Student names must be text/);
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
  await assert.rejects(readStudentNames(new File([new Uint8Array([0xff])], "bad.csv")), /decode/);
  await assert.rejects(readStudentNames(new File([csv], "school.xls")), /valid Excel/);
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

function workbookFile(type: "xlsx" | "xls", sheets: { label: string; rows: unknown[][]; hidden?: boolean }[]) {
  const book = utils.book_new();
  for (const sheet of sheets) utils.book_append_sheet(book, utils.aoa_to_sheet(sheet.rows), sheet.label);
  book.Workbook = { Sheets: sheets.map(sheet => ({ Hidden: sheet.hidden ? 1 : 0, name: sheet.label })) };
  return new File([write(book, { type: "buffer", bookType: type === "xls" ? "biff8" : "xlsx" })], `roster.${type}`);
}
const schoolRows = [["School roster title"], ["Number", "English", "姓名", "Grades", "Parent email"], ["IGNORED-ID", "José García", "李四", "IGNORED-GRADE", "IGNORED-EMAIL"]];

test("direct binary XLS uploads preserve Unicode and exclude unrelated fields", async () => {
  const names = await readStudentNames(workbookFile("xls", [{ label: "6C", rows: schoolRows }]));
  assert.deepEqual(names.map(row => [row.english, row.chinese]), [["José García", "李四"]]);
  assert.ok(!JSON.stringify(names).includes("IGNORED"));
});
test("single English or Chinese columns and recognized aliases are supported", () => {
  assert.equal(extractStudentNamesCsv("English Name,Grade\nAlice,IGNORED-GRADE")[0].english, "Alice");
  assert.equal(extractStudentNamesCsv("Chinese Name,Number\n王小明,IGNORED-ID")[0].chinese, "王小明");
  assert.equal(extractStudentNamesCsv("Name\nEnglish Name,Number\nAlice,IGNORED-ID")[0].english, "Alice");
});
test("combined names are split only when reliably identifiable, in either order", () => {
  for (const value of ["José García 李四", "José García(李四)", "José García（李四）", "李四 José García", "José García李四"]) {
    assert.deepEqual(splitStudentName(value), { english: "José García", chinese: "李四", error: "" });
  }
  const names = extractStudentNamesCsv("Student Name,Parent name\nAlice 张三,IGNORED-PARENT\n王小明,IGNORED-PARENT\nBob,IGNORED-PARENT");
  assert.deepEqual(names.map(row => [row.english, row.chinese]), [["Alice", "张三"], ["", "王小明"], ["Bob", ""]]);
  assert.ok(!JSON.stringify(names).includes("IGNORED"));
  for (const value of ["Alice / Bob 张三", "Alice (张三", "Alice 123", "Alice 张三 Bob", "Alice 张三 / 李四"]) {
    assert.match(splitStudentName(value).error, /reliably separated/);
  }
});
test("ambiguous names can be corrected locally and removed without changing API identities", () => {
  const names = extractStudentNamesCsv("Name\nAlice / Bob 张三\nAlice 张三");
  assert.ok(previewStudentNames(names, [], options)[0].error);
  const corrected = [{ ...names[0], english: "Alice", chinese: "张三", error: "" }, names[1]];
  assert.ok(previewStudentNames(corrected, [], options).every(row => row.warning));
  const remaining = previewStudentNames(corrected.slice(0, 1), [], options);
  assert.equal(remaining[0].error, "");
  assert.equal(remaining[0].warning, "");
  assert.equal(remaining[0].record.id, names[0].id);
});
test("multiple worksheets require a choice; hidden sheets and unrelated cells are excluded", async () => {
  const file = workbookFile("xlsx", [
    { label: "Instructions", rows: [["IGNORED-NOTES"]] },
    { label: "6C", rows: schoolRows },
    { label: "Hidden", rows: schoolRows, hidden: true },
  ]);
  const sheets = await readStudentWorkbook(file);
  assert.deepEqual(sheets.map(sheet => sheet.label), ["Instructions", "6C"]);
  assert.match(sheets[0].error, /No recognized/);
  assert.equal(sheets[1].names[0].chinese, "李四");
  assert.ok(!JSON.stringify(sheets).includes("IGNORED"));
  await assert.rejects(readStudentNames(file), /Choose a worksheet/);
});
test("invalid, renamed, excessive-sheet and all-hidden workbooks are rejected safely", async () => {
  for (const file of [new File([csv], "renamed.xlsx"), new File([new Uint8Array([0x50, 0x4b, 3, 4])], "broken.xlsx"), new File([csv], "file.pdf")]) {
    await assert.rejects(readStudentWorkbook(file));
  }
  await assert.rejects(readStudentWorkbook(workbookFile("xlsx", Array.from({ length: 21 }, (_, index) => ({ label: `Sheet${index}`, rows: schoolRows })))), /1 to 20/);
  await assert.rejects(readStudentWorkbook(workbookFile("xlsx", [{ label: "Hidden", rows: schoolRows, hidden: true }])), /no visible/);
});
test("UTF-16 CSV and common spreadsheet delimiters are detected without manual conversion", async () => {
  for (const delimiter of [";", "\t"]) {
    const names = extractStudentNamesCsv(`School title\nEnglish${delimiter}姓名${delimiter}Grade\nAlice${delimiter}王小明${delimiter}IGNORED-GRADE`);
    assert.equal(names[0].chinese, "王小明");
  }
  const source = "English,姓名\r\nAlice,王小明";
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, "utf16le")]);
  const names = await readStudentNames(new File([bytes], "roster.csv"));
  assert.equal(names[0].chinese, "王小明");
});

test("worksheet bounds reject oversized ranges instead of silently truncating students", async () => {
  const rows: unknown[][] = [["English", "姓名"], ["Alice", "张三"]];
  rows[15000] = ["Bob", "李四"];
  const [sheet] = await readStudentWorkbook(workbookFile("xlsx", [{ label: "Too large", rows }]));
  assert.equal(sheet.names.length, 0);
  assert.match(sheet.error, /too large/);
});
