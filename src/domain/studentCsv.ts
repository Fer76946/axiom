import type { StudentIdentity, StudentImportRecord } from "./types.ts";
import { analyzeNameColumns, extractMappedNames, type NameMapping, type NameAnalysis, type StudentNames } from "./studentNameDetection.ts";
export { splitStudentName, type StudentNames } from "./studentNameDetection.ts";
import { studentInput, studentNamesMayMatch } from "../../supabase/functions/_shared/validation.ts";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export type CsvImportRow = {
  line: number;
  record: StudentImportRecord;
  error: string;
  warning: string;
};

export type RosterOptions = { subject: string; section: string; includeChinese: boolean };

// Raw cells are temporary local parser data, never retained in preview state.
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

export function extractStudentNames(rows: Iterable<readonly unknown[]>, makeId: () => string = () => crypto.randomUUID()): StudentNames[] {
  const source = collectCells(rows);
  const analysis = analyzeNameColumns(source);
  if (!analysis.confident) throw new Error(analysis.notice);
  return extractMappedNames(source, analysis.mapping, analysis, makeId);
}

function collectCells<T extends readonly unknown[]>(rows: Iterable<T>): T[] {
  const cells: T[] = [];
  for (const row of rows) {
    if (cells.length >= 10000 || row.length > 256) throw new Error("This worksheet is too large to analyze safely (maximum 10,000 rows and 256 columns).");
    cells.push(row);
  }
  return cells;
}

export function extractStudentNamesCsv(source: string): StudentNames[] {
  if (new TextEncoder().encode(source).length > MAX_CSV_BYTES) throw new Error("Choose a file smaller than 2 MB.");
  return extractStudentNames(parseCsv(source, csvDelimiter(source)));
}

function csvDelimiter(source: string) {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  let lines = 0;
  for (let index = 0; index < source.length && lines < 50; index++) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n") lines++;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

export type StudentSheet = { label: string; names: StudentNames[]; error: string; analysis?: NameAnalysis };
function prepareSheet(label: string, cells: unknown[][], mapping?: NameMapping): StudentSheet {
  const analysis = analyzeNameColumns(cells);
  if (mapping) analysis.mapping = mapping;
  if (!mapping && !analysis.confident) return { label, names: [], error: analysis.notice, analysis };
  try {
    const names = extractMappedNames(cells, analysis.mapping, analysis);
    if (mapping) analysis.notice = "Selected name columns applied locally. Review the preview before importing.";
    return { label, names, error: "", analysis };
  }
  catch (cause) { return { label, names: [], error: cause instanceof Error ? cause.message : "Could not extract student names.", analysis }; }
}
export async function readStudentWorkbook(file: File, mappings: Record<string, NameMapping> = {}): Promise<StudentSheet[]> {
  if (file.size > MAX_CSV_BYTES) throw new Error("Choose a file smaller than 2 MB.");
  const buffer = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) {
    let source: string;
    try {
      const bytes = new Uint8Array(buffer);
      const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
      source = new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch { throw new Error("Could not decode this CSV file. Try uploading the original Excel workbook instead."); }
    const cells = collectCells(parseCsv(source, csvDelimiter(source)));
    return [prepareSheet("CSV", cells, mappings.CSV)];
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
      cells = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true, range: { s: { r: 0, c: 0 }, e: range.e } });
    } catch {
      // Third-party exceptions may contain cell contents; never display those messages.
      return { label, names: [], error: "Could not read this worksheet safely." };
    }
    try {
      return prepareSheet(label, cells, Object.hasOwn(mappings, label) ? mappings[label] : undefined);
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
