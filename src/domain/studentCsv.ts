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
function* parseCsv(source: string, delimiter = ","): Generator<string[]> {
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
    } else if (char === delimiter) finishField();
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

const headerKey = (cell: unknown) => typeof cell === "string"
  ? cell.trim().replace(/^\uFEFF/, "").normalize("NFC").toLowerCase().replace(/[\s/_()（）-]+/g, "") : "";
const englishHeaders = new Set(["english", "englishname", "英文名", "英文姓名"]);
const chineseHeaders = new Set(["姓名", "chinese", "chinesename", "中文名", "中文姓名"]);
const combinedHeaders = new Set(["name", "studentname", "fullname", "学生姓名", "englishchinese", "englishandchinese", "englishchinesename", "englishnamechinesename", "english中文", "英文中文姓名", "name姓名"]);

// A single column is split only at clear Latin/Han script boundaries.
export function splitStudentName(value: string): Pick<StudentNames, "english" | "chinese" | "error"> {
  const name = value.trim().normalize("NFC");
  if (!name) return { english: "", chinese: "", error: "" };
  const latin = "[\\p{Script=Latin}\\p{M} .,'’\\-]+";
  const han = "[\\p{Script=Han}·]+";
  const pair = (first: string, second: string) => [
    `^(${first})\\s*(${second})$`,
    `^(${first})\\s*\\((${second})\\)$`,
    `^(${first})\\s*（(${second})）$`,
  ].map(pattern => new RegExp(pattern, "u").exec(name)).find(Boolean);
  const forward = pair(latin, han);
  const reverse = pair(han, latin);
  if (forward) return { english: forward[1].trim(), chinese: forward[2].trim(), error: "" };
  if (reverse) return { english: reverse[2].trim(), chinese: reverse[1].trim(), error: "" };
  if (new RegExp(`^${han}$`, "u").test(name)) return { english: "", chinese: name, error: "" };
  if (new RegExp(`^${latin}$`, "u").test(name) && /\p{Script=Latin}/u.test(name)) return { english: name, chinese: "", error: "" };
  return { english: name, chinese: "", error: "Names could not be reliably separated. Correct the name fields or remove this row." };
}

export function extractStudentNames(
  rows: Iterable<readonly unknown[]>,
  makeId: () => string = () => crypto.randomUUID(),
): StudentNames[] {
  let columns: { english: number; chinese: number; combined: number } | undefined;
  let paired = false;
  let headerStrength = 0;
  let names: StudentNames[] = [];
  for (const row of rows) {
    const headers = row.map(headerKey);
    const english = headers.flatMap((header, index) => englishHeaders.has(header) ? [index] : []);
    const chinese = headers.flatMap((header, index) => chineseHeaders.has(header) ? [index] : []);
    const combined = headers.flatMap((header, index) => combinedHeaders.has(header) ? [index] : []);
    // Prefer a clear two-column header over a possible title saying "Name".
    const strength = english.length && chinese.length ? 3 : english.length || chinese.length ? 2 : combined.length ? 1 : 0;
    if (!columns || strength > headerStrength) {
      if (!english.length && !chinese.length && !combined.length) continue;
      if (english.length > 1 || chinese.length > 1 || (!english.length && !chinese.length && combined.length > 1)) {
        throw new Error("Name columns are ambiguous. Use one English and one Chinese name column, or one Student Name column.");
      }
      paired = !!english.length && !!chinese.length;
      headerStrength = strength;
      columns = { english: english[0] ?? -1, chinese: chinese[0] ?? -1, combined: !english.length && !chinese.length ? combined[0] : -1 };
      names = [];
      continue;
    }
    if ((columns.english >= 0 && englishHeaders.has(headers[columns.english])) ||
      (columns.chinese >= 0 && chineseHeaders.has(headers[columns.chinese])) ||
      (columns.combined >= 0 && combinedHeaders.has(headers[columns.combined]))) continue;
    const name = (cell: unknown) => typeof cell === "string" ? cell.trim().normalize("NFC") : "";
    const selected = columns.combined >= 0 ? [row[columns.combined]] : [row[columns.english], row[columns.chinese]];
    let fields = { english: name(row[columns.english]), chinese: name(row[columns.chinese]), error: "" };
    if (columns.combined >= 0) fields = splitStudentName(name(row[columns.combined]));
    else if (!paired && selected.some(cell => typeof cell === "string" && /\p{Script=Han}/u.test(cell) && /\p{Script=Latin}/u.test(cell))) {
      fields = splitStudentName(name(selected.find(cell => typeof cell === "string" && cell.trim())));
    }
    const invalid = selected.some(cell => cell != null && typeof cell !== "string");
    if (!fields.english && !fields.chinese && !invalid) continue;
    names.push({ id: makeId(), ...fields, error: invalid ? "Student names must be text. Correct the name fields or remove this row." : fields.error });
    if (names.length > MAX_IMPORT_ROWS) throw new Error(`Use at most ${MAX_IMPORT_ROWS} students per worksheet.`);
  }
  if (!columns) throw new Error("No recognized student name columns found. Use English, 姓名, or Student Name headers; title rows above the headers are allowed.");
  if (!names.length) throw new Error("No student names found below the headers.");
  return names;
}

export function extractStudentNamesCsv(source: string): StudentNames[] {
  if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) throw new Error("Choose a file smaller than 2 MB.");
  let error: unknown;
  for (const delimiter of [",", ";", "\t"]) {
    try { return extractStudentNames(parseCsv(source, delimiter)); }
    catch (cause) { error ??= cause; }
  }
  throw error;
}

export type StudentSheet = { label: string; names: StudentNames[]; error: string };
export async function readStudentWorkbook(file: File): Promise<StudentSheet[]> {
  if (file.size > MAX_CSV_BYTES) throw new Error("Choose a file smaller than 2 MB.");
  const buffer = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) {
    let source: string;
    try {
      const bytes = new Uint8Array(buffer);
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
      source = new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch { throw new Error("Could not decode this CSV file. Try uploading the original Excel workbook instead."); }
    return [{ label: "CSV", names: extractStudentNamesCsv(source), error: "" }];
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Choose an .xlsx, .xls, or .csv file.");
  const bytes = new Uint8Array(buffer);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  const cfb = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  const biff = bytes[0] === 9 && [0, 2, 4, 8].includes(bytes[1]);
  const prefix = new TextDecoder().decode(bytes.slice(0, 4096));
  const xmlSpreadsheet = /<(?:\w+:)?Workbook[\s>]/.test(prefix) && prefix.includes("urn:schemas-microsoft-com:office:spreadsheet");
  if (/\.xlsx$/i.test(file.name) ? !zip : !(cfb || biff || xmlSpreadsheet)) throw new Error("This file is not a valid Excel workbook.");
  // Use the official current SheetJS package; only extracted names leave parser memory.
  const { read, utils, set_cptable } = await import("xlsx");
  if (/\.xls$/i.test(file.name)) set_cptable(await import("xlsx/dist/cpexcel.full.mjs"));
  let workbook;
  // Read actual ranges before applying limits; a parser row cutoff can hide later students.
  try { workbook = read(buffer, { type: "array", cellHTML: false, cellFormula: false, cellText: false, bookVBA: false, nodim: true }); }
  catch { throw new Error("Could not read this Excel workbook. Check that it is valid and not password-protected."); }
  if (!workbook.SheetNames.length || workbook.SheetNames.length > 20) throw new Error("Choose a workbook containing 1 to 20 worksheets.");
  const visible = workbook.SheetNames.filter((_label, index) => !workbook.Workbook?.Sheets?.[index]?.Hidden);
  if (!visible.length) throw new Error("This workbook has no visible worksheets.");
  return visible.map(label => {
    let cells: unknown[][];
    try {
      const sheet = workbook.Sheets[label];
      const range = sheet?.['!ref'] ? utils.decode_range(sheet['!ref']) : undefined;
      const fullRange = sheet?.['!fullref'] ? utils.decode_range(sheet['!fullref']) : range;
      if (!range) return { label, names: [], error: "This worksheet is empty." };
      if (fullRange && (fullRange.e.r >= 10000 || fullRange.e.c >= 256)) return { label, names: [], error: "This worksheet is too large to preview safely (maximum 10,000 rows and 256 columns)." };
      cells = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
    } catch {
      // Third-party exceptions may contain cell contents; never display those messages.
      return { label, names: [], error: "Could not read this worksheet safely." };
    }
    try {
      return { label, names: extractStudentNames(cells), error: "" };
    } catch (cause) {
      return { label, names: [], error: cause instanceof Error ? cause.message : "Could not extract names from this worksheet." };
    }
  });
}

export async function readStudentNames(file: File): Promise<StudentNames[]> {
  const sheets = await readStudentWorkbook(file);
  if (sheets.length !== 1) throw new Error("Choose a worksheet before importing students.");
  if (sheets[0].error) throw new Error(sheets[0].error);
  return sheets[0].names;
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
