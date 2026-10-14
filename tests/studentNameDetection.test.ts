import { test } from "node:test";
import assert from "node:assert/strict";
import { utils, write } from "xlsx";
import { analyzeNameColumns, extractMappedNames } from "../src/domain/studentNameDetection.ts";
import { readStudentWorkbook, previewStudentNames } from "../src/domain/studentCsv.ts";

const rows = [
  ["School student list"], [],
  [123456, "Alice", "张小明", "Zhang Xiaoming", "F", "2012-02-01", "15555555555", "parent@example.com"],
  [234567, "José García", "王小红", "Wang Xiaohong", "M", "2011-01-01", "16666666666", "other@example.com"],
  [345678, "Chloé", "李明", "Li Ming", "F", "2011-03-01", "17777777777", "another@example.com"],
  [], ["Total", 3],
];

test("headerless content analysis recognizes names and excludes identifiers, pinyin and contacts", () => {
  const analysis = analyzeNameColumns(rows);
  assert.equal(analysis.confident, true);
  assert.deepEqual(analysis.mapping, { englishColumn: 1, chineseColumn: 2, startRow: 3 });
  assert.equal(analysis.columns[3].blocked, true);
  const names = extractMappedNames(rows, analysis.mapping, analysis);
  assert.deepEqual(names.map(row => [row.english, row.chinese]), [["Alice", "张小明"], ["José García", "王小红"], ["Chloé", "李明"]]);
  const serialized = JSON.stringify({ analysis, names });
  for (const value of ["123456", "Zhang Xiaoming", "2012-02-01", "15555555555", "parent@example.com"]) assert.ok(!serialized.includes(value));
});

test("competing parent-like names require manual confirmation rather than guessing", () => {
  const ambiguous = rows.map((row, index) => index >= 2 && index <= 4 ? [...row, ["Mary Smith", "Peter Jones", "Jane Brown"][index - 2]] : row);
  const analysis = analyzeNameColumns(ambiguous);
  assert.equal(analysis.confident, false);
  assert.equal(analysis.mapping.englishColumn, null);
  const names = extractMappedNames(ambiguous, { englishColumn: 1, chineseColumn: 2, startRow: 3 }, analysis);
  assert.equal(names.length, 3);
  assert.ok(!JSON.stringify(names).includes("Mary Smith"));
});

test("known parent and pinyin headers cannot be manually selected; partial headers use content", () => {
  const source = [["ID", "Nickname", "姓名", "Pinyin", "Parent name", "Phone"],
    [1, "Alice", "张小明", "Zhang Xiaoming", "Mary Smith", "15555555555"],
    [2, "Bob", "李明", "Li Ming", "Peter Jones", "16666666666"]];
  const analysis = analyzeNameColumns(source);
  assert.deepEqual(analysis.mapping, { englishColumn: 1, chineseColumn: 2, startRow: 2 });
  for (const englishColumn of [0, 3, 4, 5, -1, 99]) assert.throws(() => extractMappedNames(source, { englishColumn, chineseColumn: null, startRow: 2 }, analysis), /cannot be selected/);
  for (const startRow of [0, 4, 1.5, NaN]) assert.throws(() => extractMappedNames(source, { englishColumn: 1, chineseColumn: 2, startRow }, analysis), /starting row/);
});

test("headerless combined and Chinese-only names are detected with Unicode preserved", () => {
  for (const source of [[["Class roster"], ["José García 李四"], ["Alice 张小明"], ["Bob"], ["王明"]], [["学生名单"], ["张小明"], ["李四"]]]) {
    const analysis = analyzeNameColumns(source);
    assert.equal(analysis.confident, true);
    assert.equal(analysis.mapping.startRow, 2);
    assert.equal(extractMappedNames(source, analysis.mapping, analysis).length, source.length - 1);
  }
});

test("titles, repeated headers, blanks and footer rows are skipped but unrelated notes do not drop students", () => {
  const source = [["English", "姓名", "Parent notes"], ["Alice", "张小明", "School notes"], [], ["English", "姓名"], ["Bob", "李四", "Teacher remarks"], ["Total", "Two"]];
  const analysis = analyzeNameColumns(source);
  assert.deepEqual(extractMappedNames(source, { ...analysis.mapping, startRow: 1 }, analysis).map(row => row.english), ["Alice", "Bob"]);
});

test("manual starting row resolves sparse or ambiguous files without exposing unrelated values", async () => {
  const file = new File(["School roster\n101,Alice,张小明,Mary Smith\n102,Bob,李四,Peter Jones"], "roster.csv");
  const [uncertain] = await readStudentWorkbook(file);
  assert.equal(uncertain.names.length, 0);
  assert.equal(uncertain.analysis!.confident, false);
  assert.ok(!JSON.stringify(uncertain).includes("Mary Smith"));
  const [selected] = await readStudentWorkbook(file, { CSV: { englishColumn: 1, chineseColumn: 2, startRow: 3 } });
  assert.deepEqual(selected.names.map(row => [row.english, row.chinese]), [["Bob", "李四"]]);
  const [invalid] = await readStudentWorkbook(file, { CSV: { englishColumn: 0, chineseColumn: null, startRow: 2 } });
  assert.equal(invalid.names.length, 0);
  assert.match(invalid.error, /cannot be selected/);
});

test("manual selection preserves actual Excel column letters and row numbers across blank leading cells", async () => {
  for (const bookType of ["xlsx", "biff8"] as const) {
    const book = utils.book_new();
    const source = [[], [], [null, null, "School roster"], [], [null, null, 101, "Alice", "张小明", "Mary Smith"], [null, null, 102, "Bob", "李四", "Peter Jones"]];
    utils.book_append_sheet(book, utils.aoa_to_sheet(source), "Roster");
    const file = new File([write(book, { type: "buffer", bookType })], bookType === "xlsx" ? "roster.xlsx" : "roster.xls");
    const [sheet] = await readStudentWorkbook(file, { Roster: { englishColumn: 3, chineseColumn: 4, startRow: 6 } });
    assert.equal(sheet.analysis!.rowCount, 6);
    assert.equal(sheet.analysis!.columns.length, 6);
    assert.deepEqual(sheet.names.map(row => [row.english, row.chinese]), [["Bob", "李四"]]);
    assert.ok(!JSON.stringify(sheet).includes("Peter Jones"));
  }
});

test("automatic extraction still flags repeated identities and preserves existing records", () => {
  const source = [[101, "Alice", "张小明"], [102, "Bob", "李四"], [103, "Alice", "张小明"]];
  const analysis = analyzeNameColumns(source);
  const names = extractMappedNames(source, analysis.mapping, analysis);
  const existing = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Bob 李四", subject: "Science", section: "6C" }];
  const preview = previewStudentNames(names, existing, { subject: "Science", section: "6C", includeChinese: true });
  assert.ok(preview.every(row => row.warning && !row.record.confirmDistinct));
  assert.deepEqual(existing[0], { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Bob 李四", subject: "Science", section: "6C" });
});

test("analysis is bounded and insufficient name evidence requires confirmation", () => {
  assert.equal(analyzeNameColumns([["Alice"]]).confident, false);
  assert.equal(analyzeNameColumns([[101, "M"], [102, "F"]]).confident, false);
  assert.equal(analyzeNameColumns([["Wang Xiaoming"], ["Zhang Xiaohong"]]).confident, false, "pinyin-only text cannot be assumed to be English names");
  assert.throws(() => analyzeNameColumns(Array.from({ length: 10001 }, () => [])), /too large/);
  assert.throws(() => analyzeNameColumns([Array(257).fill(null)]), /too large/);
});

test("ambiguous headerless combined names remain selectable for correction rather than being classified as private data", () => {
  const source = [["Alice / Bob 张三"], ["Chloé / Diana 李四"]];
  const analysis = analyzeNameColumns(source);
  assert.equal(analysis.confident, false);
  assert.equal(analysis.columns[0].blocked, false);
  assert.ok(extractMappedNames(source, { englishColumn: 0, chineseColumn: null, startRow: 1 }, analysis).every(row => row.error));
});
