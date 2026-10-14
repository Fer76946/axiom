import type { StudentIdentity, StudentImportRecord } from "./types.ts";
import { studentInput, studentNamesMayMatch } from "../../supabase/functions/_shared/validation.ts";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export type CsvImportRow = {
  line: number;
  record: StudentImportRecord;
  error: string;
  warning: string;
};

export type StudentNames = { id: string; english: string; chinese: string; error: string };
export type RosterOptions = { subject: string; section: string; includeChinese: boolean };

// Yield one row at a time so ignored CSV columns are never retained in preview state.
function* parseCsv(source: string): Generator<string[]> {
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const finishField = () => { fields.push(field); field = ""; closed = false; };
  const input = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === ",") finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      finishField();
      yield fields;
      fields = [];
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error("Malformed CSV. Check quotation marks.");
      field += char;
    }
  }
  if (quoted) throw new Error("Unclosed quotation mark in CSV.");
  if (field || fields.length || closed) { finishField(); yield fields; }
}

export function extractStudentNames(
  rows: Iterable<readonly unknown[]>,
  makeId: () => string = () => crypto.randomUUID(),
): StudentNames[] {
  let englishColumn = -1;
  let chineseColumn = -1;
  const names: StudentNames[] = [];
  const headerKey = (cell: unknown) => typeof cell === "string" ? cell.trim().replace(/^\uFEFF/, "").normalize("NFC").toLowerCase() : "";
  for (const row of rows) {
    if (englishColumn < 0) {
      const headers = row.map(headerKey);
      if (!headers.includes("english") || !headers.includes("姓名")) continue;
      if (headers.filter(header => header === "english").length !== 1 || headers.filter(header => header === "姓名").length !== 1) {
        throw new Error("The English and 姓名 headers must each appear once.");
      }
      englishColumn = headers.indexOf("english");
      chineseColumn = headers.indexOf("姓名");
      continue;
    }
    const englishCell = row[englishColumn];
    const chineseCell = row[chineseColumn];
    if (headerKey(englishCell) === "english" && headerKey(chineseCell) === "姓名") continue;
    const name = (cell: unknown) => typeof cell === "string" ? cell.trim().normalize("NFC") : "";
    const english = name(englishCell);
    const chinese = name(chineseCell);
    const invalid = [englishCell, chineseCell].some(cell => cell != null && typeof cell !== "string");
    if (!english && !chinese && !invalid) continue;
    names.push({ id: makeId(), english, chinese, error: invalid ? "Student names must be text." : "" });
    if (names.length > MAX_IMPORT_ROWS) throw new Error(`Use at most ${MAX_IMPORT_ROWS} students per file.`);
  }
  if (englishColumn < 0) throw new Error("Could not find English and 姓名 column headers. Title rows above the headers are allowed.");
  if (!names.length) throw new Error("No student names found below the headers.");
  return names;
}

export function extractStudentNamesCsv(source: string): StudentNames[] {
  if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) throw new Error("Choose a file smaller than 2 MB.");
  return extractStudentNames(parseCsv(source));
}

export async function readStudentNames(file: File): Promise<StudentNames[]> {
  if (file.size > MAX_CSV_BYTES) throw new Error("Choose a file smaller than 2 MB.");
  if (/\.csv$/i.test(file.name)) {
    let source: string;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error("Save the file as CSV UTF-8 in Excel, then try again."); }
    return extractStudentNamesCsv(source);
  }
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    let cells: unknown[][];
    try { cells = await readSheet(file, 1); }
    catch { throw new Error("Could not read this Excel file. Use an unencrypted .xlsx file or save as CSV UTF-8."); }
    // Workbook cells are temporary parser memory; only the two name fields leave this function.
    return extractStudentNames(cells);
  }
  throw new Error("Choose a .csv or .xlsx file. Older .xls files must be saved as .xlsx or CSV UTF-8.");
}

export function previewStudentNames(names: StudentNames[], existing: StudentIdentity[], options: RosterOptions): CsvImportRow[] {
  const displayName = (row: StudentNames) => row.english
    ? [row.english, options.includeChinese ? row.chinese : ""].filter(Boolean).join(" ")
    : row.chinese;
  const sameName = (name: string, row: StudentNames) => {
    return [displayName(row), row.english, row.chinese].some(alias => alias && studentNamesMayMatch(name, alias));
  };
  return names.map((row, index) => {
    const record: StudentImportRecord = { id: row.id, name: displayName(row), subject: options.subject, section: options.section, confirmDistinct: false };
    let error = row.error;
    try { Object.assign(record, studentInput(record)); }
    catch (cause) { error ||= cause instanceof Error ? cause.message : "Invalid student row."; }
    const warning = !error && (existing.some(student => sameName(student.name, row)) ||
      names.some(other => other !== row && sameName(displayName(other), row)))
      ? "This name may already be in the roster or file. Leave this row skipped for an existing student. Confirm only if this is a different student."
      : "";
    return { line: index + 1, record, error, warning };
  });
}

export function studentCsv(students: StudentIdentity[]) {
  const cell = (value: string | null) => {
    let text = value ?? "";
    // Quoting alone does not prevent Excel from evaluating a formula.
    const firstVisible = [...text].find(char => char.charCodeAt(0) > 32 && !/\s/.test(char));
    if ((firstVisible && "=+-@".includes(firstVisible)) || text.charCodeAt(0) < 32) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return "\uFEFFstudent_id,name,subject,section\r\n" + students.map(student =>
    [student.id, student.name, student.subject, student.section].map(cell).join(",") + "\r\n"
  ).join("");
}

export function downloadCsv(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
