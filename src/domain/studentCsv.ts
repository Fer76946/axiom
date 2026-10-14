import type { StudentIdentity, StudentImportRecord } from "./types.ts";
import { studentInput, studentNameKey, uuid } from "../../supabase/functions/_shared/validation.ts";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export type CsvImportRow = {
  line: number;
  record: StudentImportRecord;
  error: string;
  warning: string;
};

// Strict CSV parsing: quoted commas/newlines and doubled quotes, including Excel BOM/CRLF.
function parseCsv(source: string) {
  const rows: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let start = 1;
  function finishField() {
    fields.push(field);
    field = "";
    closed = false;
  }
  function finishRow() {
    finishField();
    if (fields.some(value => value.trim())) rows.push({ line: start, fields });
    if (rows.length > MAX_IMPORT_ROWS + 1) throw new Error(`Use at most ${MAX_IMPORT_ROWS} students per file.`);
    fields = [];
    start = line + 1;
  }
  const input = source.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        field += char;
        if (char === "\n") line++;
      }
    } else if (char === ",") finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      finishRow();
      line++;
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error(`Malformed CSV near line ${line}. Check quotation marks.`);
      field += char;
    }
  }
  if (quoted) throw new Error(`Unclosed quotation mark near line ${start}.`);
  if (field || fields.length || closed) finishRow();
  return rows;
}

export function previewStudentCsv(
  source: string,
  existing: StudentIdentity[],
  makeId: () => string = () => crypto.randomUUID(),
): CsvImportRow[] {
  if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) throw new Error("Choose a CSV file smaller than 2 MB.");
  const [header, ...data] = parseCsv(source);
  const columns = header?.fields.map(value => value.trim().toLowerCase()) ?? [];
  if (!['name', 'subject', 'section'].every(key => columns.includes(key)) ||
    new Set(columns).size !== columns.length ||
    columns.some(key => !['student_id', 'name', 'subject', 'section'].includes(key))) {
    throw new Error("Use the template headers: student_id,name,subject,section. Student ID is optional.");
  }
  if (!data.length) throw new Error("The CSV has no students. Add rows below the headers.");
  const seenIds = new Set<string>();
  const rows = data.map(({ line, fields }): CsvImportRow => {
    const values = Object.fromEntries(columns.map((key, index) => [key, fields[index]?.trim() ?? ""]));
    const record: StudentImportRecord = {
      id: makeId(), name: values.name, subject: values.subject, section: values.section, confirmDistinct: false,
    };
    let error = "";
    try {
      if (fields.length !== columns.length) throw new Error("The number of fields does not match the headers.");
      Object.assign(record, studentInput(values));
      if (values.student_id) {
        record.studentId = uuid(values.student_id);
        if (seenIds.has(record.studentId)) throw new Error("Repeated student ID. Each student can have only one class assignment.");
        seenIds.add(record.studentId);
        const student = existing.find(item => item.id === record.studentId);
        if (!student) throw new Error("Student ID not found. Leave it blank for a new student.");
        if (student.name !== record.name || student.subject !== record.subject || student.section !== record.section) {
          throw new Error("Existing student differs. Use Edit Class in the roster; imports never overwrite records.");
        }
      }
    } catch (cause) { error = cause instanceof Error ? cause.message : "Invalid row."; }
    return { line, record, error, warning: "" };
  });
  for (const row of rows) {
    if (row.error || row.record.studentId) continue;
    const key = studentNameKey(row.record.name);
    if (existing.some(item => studentNameKey(item.name) === key) ||
      rows.some(other => other !== row && !other.error && studentNameKey(other.record.name) === key)) {
      row.warning = "This name appears elsewhere. Use the existing student ID for the same person. Confirm only if this is a different student.";
    }
  }
  return rows;
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
