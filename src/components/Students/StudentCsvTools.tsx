import { useRef, useState } from "react";
import type { Student, StudentImportResult } from "../../domain/types";
import { downloadCsv, MAX_IMPORT_ROWS, previewStudentNames, readStudentWorkbook, studentCsv, type CsvImportRow, type StudentNames, type StudentSheet, type RosterOptions } from "../../domain/studentCsv";
import { errorMessage, studentsService } from "../../services";
import type { NameMapping } from "../../domain/studentNameDetection";
import "./StudentCsvTools.css";

type PreviewRow = CsvImportRow & { result?: StudentImportResult };
type Props = {
  students: Student[];
  disabled: boolean;
  subject: string;
  section: string;
  onBusyChange: (busy: boolean) => void;
  onChanged: () => Promise<void>;
};

function columnLetter(index: number) {
  let label = "";
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + (value - 1) % 26) + label;
  return label;
}

function StudentCsvTools({ students, disabled, subject, section, onBusyChange, onChanged }: Props) {
  const [panel, setPanel] = useState<"import" | "export" | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [names, setNames] = useState<StudentNames[]>([]);
  const [sheets, setSheets] = useState<StudentSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState("");
  const [mapping, setMapping] = useState<NameMapping>({ englishColumn: null, chineseColumn: null, startRow: 1 });
  const [mappingDirty, setMappingDirty] = useState(false);
  const sourceFile = useRef<File | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [options, setOptions] = useState<RosterOptions>({ subject, section, includeChinese: true });
  const [processing, setProcessing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [started, setStarted] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [scope, setScope] = useState<"all" | "filtered">("all");
  const stop = useRef(false);
  const locked = disabled || processing || reading;
  const ready = (row: PreviewRow) => !row.error && (!row.warning || row.record.confirmDistinct) &&
    row.result?.status !== "created" && row.result?.status !== "existing";
  const eligible = rows.filter(ready);
  const selectedSheet = sheetIndex !== "" ? sheets[Number(sheetIndex)] : undefined;

  function resetImport() {
    setRows([]);
    setStarted(false);
    setNames([]);
    setSheets([]);
    setSheetIndex("");
    sourceFile.current = null;
    setMappingDirty(false);
    setMapping({ englishColumn: null, chineseColumn: null, startRow: 1 });
    setError("");
    setSummary("");
    setProgress({ done: 0, total: 0 });
    setStopping(false);
    stop.current = false;
    if (fileInput.current) fileInput.current.value = "";
  }

  function close() {
    resetImport();
    setPanel(null);
  }

  async function readFile(file: File) {
    setReading(true);
    setError("");
    setSummary("");
    setRows([]);
    setStarted(false);
    setNames([]);
    setSheets([]);
    setSheetIndex("");
    sourceFile.current = file;
    setMappingDirty(false);
    try {
      const extracted = await readStudentWorkbook(file);
      setSheets(extracted);
      if (extracted.length === 1) {
        setSheetIndex("0");
        setError(extracted[0].error);
        if (extracted[0].analysis) setMapping(extracted[0].analysis.mapping);
        updateNames(extracted[0].names);
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setReading(false); }
  }

  function updateOptions(next: RosterOptions) {
    setOptions(next);
    setRows(names.length ? previewStudentNames(names, students, next) : []);
  }

  function updateNames(next: StudentNames[]) {
    setNames(next);
    setRows(next.length ? previewStudentNames(next, students, options) : []);
  }

  function selectSheet(index: string) {
    setSheetIndex(index);
    const sheet = sheets[Number(index)];
    setError(index ? sheet.error : "");
    updateNames(index ? sheet.names : []);
    setMappingDirty(false);
    if (index && sheet.analysis) setMapping(sheet.analysis.mapping);
  }

  function changeMapping(next: NameMapping) {
    setMapping(next);
    setMappingDirty(true);
    // Never import a stale preview after changing the selected source fields.
    updateNames([]);
  }

  async function applyMapping() {
    if (!sourceFile.current || !selectedSheet || locked || started) return;
    setReading(true);
    setError("");
    try {
      const extracted = await readStudentWorkbook(sourceFile.current, { [selectedSheet.label]: mapping });
      const next = extracted[Number(sheetIndex)];
      setSheets(extracted);
      setError(next.error);
      updateNames(next.names);
      setMappingDirty(false);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setReading(false); }
  }

  function editName(id: string, field: "english" | "chinese", value: string) {
    updateNames(names.map(row => row.id === id ? { ...row, [field]: value, error: "" } : row));
  }

  const subjects = [...new Set(students.map(student => student.subject).filter((value): value is string => !!value))].sort();
  const sections = [...new Set(students.filter(student => !options.subject.trim() || student.subject === options.subject.trim()).map(student => student.section).filter((value): value is string => !!value))].sort();

  async function importRows() {
    if (!eligible.length || locked || mappingDirty) return;
    stop.current = false;
    setStopping(false);
    setStarted(true);
    setProcessing(true);
    onBusyChange(true);
    setError("");
    setSummary("");
    setProgress({ done: 0, total: eligible.length });
    let updated = [...rows];
    let completed = 0;
    try {
      for (let offset = 0; offset < eligible.length && !stop.current; offset += 25) {
        const batch = eligible.slice(offset, offset + 25);
        let results: StudentImportResult[];
        try {
          results = await studentsService.importStudents(batch.map(row => row.record));
          if (results.length !== batch.length || results.some((result, index) =>
            result.id !== batch[index].record.id || !['created', 'existing', 'error'].includes(result.status))) {
            throw new Error("Unexpected import response.");
          }
        } catch {
          // Keep row IDs and payloads frozen: an interrupted response may hide committed inserts.
          results = batch.map(row => ({ id: row.record.id, status: "error", message: "Result not confirmed. Retry this preview safely; existing imports will not be recreated." }));
          stop.current = true;
          setStopping(true);
          setError("The import response could not be confirmed. Retry the remaining rows from this preview.");
        }
        const byId = new Map(results.map(result => [result.id, result]));
        updated = updated.map(row => byId.has(row.record.id) ? { ...row, result: byId.get(row.record.id) } : row);
        setRows(updated);
        completed += batch.length;
        setProgress({ done: completed, total: eligible.length });
      }
      const count = (status: StudentImportResult['status']) => updated.filter(row => row.result?.status === status).length;
      const skipped = updated.filter(row => row.error || (row.warning && !row.record.confirmDistinct)).length;
      const pending = updated.filter(row => ready(row) && !row.result).length;
      setSummary(`${count('created')} students imported; ${count('existing')} already in roster; ${count('error')} failed or unconfirmed; ${skipped} invalid or unresolved rows skipped; ${pending} not processed.${stop.current ? ' Import stopped.' : ''}`);
      try { await onChanged(); }
      catch { setError("Import results are shown below, but the roster could not refresh. Refresh the page after reviewing the results."); }
    } finally {
      setProcessing(false);
      onBusyChange(false);
    }
  }

  async function exportRows() {
    setProcessing(true);
    onBusyChange(true);
    setError("");
    try {
      const roster = await studentsService.exportStudents(scope === "filtered" ? { subject, section } : {});
      downloadCsv(studentCsv(roster), scope === "filtered" ? "axiom-class-roster.csv" : "axiom-students.csv");
      setSummary(`Exported ${roster.length} students. Access codes and authentication details are excluded.`);
      setPanel(null);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setProcessing(false); onBusyChange(false); }
  }

  return (
    <div className="student-csv">
      <div className="student-csv__actions">
        <button disabled={locked} onClick={() => { setPanel("import"); setError(""); }}>Import Excel or CSV</button>
        <button disabled={locked} onClick={() => { setPanel("export"); setScope(subject || section ? "filtered" : "all"); setError(""); }}>Export Students</button>
      </div>
      {summary && <p className="feedback feedback--success" role="status">{summary}</p>}
      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {panel === "export" && (
        <section className="student-csv__panel" aria-labelledby="export-title">
          <h2 id="export-title">Export students</h2>
          <p>Download an Excel-compatible UTF-8 CSV with student IDs, names, subjects, and sections. No access codes are included.</p>
          <fieldset disabled={locked}>
            <legend>Students to export</legend>
            <label className="student-csv__choice"><input type="radio" name="export-scope" checked={scope === "all"} onChange={() => setScope("all")} />Entire roster</label>
            <label className="student-csv__choice"><input type="radio" name="export-scope" checked={scope === "filtered"} disabled={!subject && !section} onChange={() => setScope("filtered")} />Current filters{subject || section ? `: ${[subject, section].filter(Boolean).join(' / ')}` : " (select a subject or class first)"}</label>
          </fieldset>
          <div className="student-csv__actions">
            <button className="student-csv__primary" disabled={locked} onClick={() => void exportRows()}>{processing ? "Exporting…" : "Download CSV"}</button>
            <button disabled={locked} onClick={close}>Cancel</button>
          </div>
        </section>
      )}
      {panel === "import" && (
        <section className="student-csv__panel" aria-labelledby="import-title">
          <h2 id="import-title">Import Excel or CSV</h2>
          <p>Upload an .xlsx, .xls, or .csv roster directly. Name columns are detected from headers and contents, including rosters without headers. Only names are extracted locally; other columns are discarded. Up to {MAX_IMPORT_ROWS} students per worksheet and 2 MB per file.</p>
          <p>Choose a subject and class for the whole roster. Existing students, grades, and access codes are never overwritten. Rows with both names missing are ignored.</p>
          <fieldset className="student-csv__class-fields" disabled={locked || started}>
            <legend>Class for this roster</legend>
            <label>Subject<input type="text" list="import-subjects" maxLength={120} placeholder="Science" value={options.subject} onChange={event => updateOptions({ ...options, subject: event.target.value })} /></label>
            <datalist id="import-subjects">{subjects.map(value => <option key={value} value={value} />)}</datalist>
            <label>Class / Section<input type="text" list="import-sections" maxLength={120} placeholder="6C" value={options.section} onChange={event => updateOptions({ ...options, section: event.target.value })} /></label>
            <datalist id="import-sections">{sections.map(value => <option key={value} value={value} />)}</datalist>
            <label className="student-csv__choice"><input type="checkbox" checked={options.includeChinese} onChange={event => updateOptions({ ...options, includeChinese: event.target.checked })} />Include Chinese names</label>
          </fieldset>
          <div className="student-csv__actions">
            <button disabled={locked} onClick={() => downloadCsv("\uFEFFEnglish,姓名\r\n", "axiom-student-template.csv")}>Download CSV Template</button>
            <label className="student-csv__upload">Choose Excel or CSV file
              <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={locked || started} onClick={event => { event.currentTarget.value = ""; }} onChange={event => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }} />
            </label>
          </div>
          {sheets.length > 1 && <label className="student-csv__worksheet">Worksheet
            <select value={sheetIndex} disabled={locked || started} onChange={event => selectSheet(event.target.value)}>
              <option value="">Choose a worksheet</option>
              {sheets.map((sheet, index) => <option key={index} value={String(index)}>{sheet.label}</option>)}
            </select>
          </label>}
          {reading && <p role="status">Reading student names…</p>}
          {selectedSheet?.analysis && <details className="student-csv__mapping" key={`${sheetIndex}-${selectedSheet.analysis.confident}`} open={!selectedSheet.analysis.confident || undefined}>
            <summary>Check or change name columns and starting row</summary>
            <p>{selectedSheet.analysis.notice} Use the column letters in your spreadsheet; unrelated cell contents are never displayed.</p>
            <fieldset className="student-csv__class-fields" disabled={locked || started}>
              <legend>Name selection</legend>
              {(["englishColumn", "chineseColumn"] as const).map(field => <label key={field}>{field === "englishColumn" ? "English / combined name column" : "Chinese name column"}
                <select value={mapping[field] ?? ""} onChange={event => changeMapping({ ...mapping, [field]: event.target.value === "" ? null : Number(event.target.value) })}>
                  <option value="">None</option>
                  {selectedSheet.analysis!.columns.map(column => <option key={column.index} value={column.index} disabled={column.blocked}>Column {columnLetter(column.index)}{column.blocked ? " (not a name column)" : ""}</option>)}
                </select>
              </label>)}
              <label>Starting row<input type="number" min={1} max={selectedSheet.analysis.rowCount} value={mapping.startRow} onChange={event => changeMapping({ ...mapping, startRow: Number(event.target.value) })} /></label>
            </fieldset>
            <button disabled={locked || started} onClick={() => void applyMapping()}>Update preview</button>
          </details>}
          {rows.length > 0 && <>
            <p>{rows.length} students found; {eligible.length} ready to import. Invalid and unresolved rows will be skipped.</p>
            <p>Correct names or remove rows before importing. These edits affect only this preview. The preview is locked once import starts so retries cannot create extra records.</p>
            <p className="student-csv__scroll-hint">Scroll the preview sideways to review all columns.</p>
            <div className="student-csv__preview" tabIndex={0} aria-label="Student import preview">
              <table>
                <thead><tr><th>Student display name</th><th>Subject</th><th>Class / Section</th><th>Validation status</th></tr></thead>
                <tbody>{rows.map((row, index) => {
                  const editable = names.find(name => name.id === row.record.id)!;
                  return <tr key={row.record.id}>
                  <td><strong>{row.record.name || "—"}</strong>
                    <label className="student-csv__name-field">English name<input aria-label={`English name for student ${index + 1}`} value={editable.english} disabled={locked || started} onChange={event => editName(row.record.id, "english", event.target.value)} /></label>
                    {(options.includeChinese || !editable.english) && <label className="student-csv__name-field">Chinese name<input aria-label={`Chinese name for student ${index + 1}`} value={editable.chinese} disabled={locked || started} onChange={event => editName(row.record.id, "chinese", event.target.value)} /></label>}
                  </td><td>{row.record.subject || "—"}</td><td>{row.record.section || "—"}</td>
                  <td>{row.result ? <span className={row.result.status === "error" ? "student-csv__error" : ""}>{row.result.message}</span> : row.error ? <span className="student-csv__error">{row.error}</span> : row.warning ? <>
                    <p>{row.warning}</p>
                    <label className="student-csv__choice"><input type="checkbox" disabled={locked || started} checked={row.record.confirmDistinct} onChange={event => {
                      const confirmed = event.target.checked;
                      setRows(current => current.map(item => item.record.id === row.record.id ? { ...item, record: { ...item.record, confirmDistinct: confirmed } } : item));
                    }} />This is a different student</label>
                  </> : row.record.studentId ? "Existing student; will be left unchanged." : "Ready"}
                    <button className="student-csv__remove" aria-label={`Remove student ${index + 1} from preview`} disabled={locked || started} onClick={() => updateNames(names.filter(name => name.id !== row.record.id))}>Remove row</button>
                  </td>
                </tr>})}</tbody>
              </table>
            </div>
          </>}
          {processing && <div role="status"><p>Processed {progress.done} of {progress.total} rows. {stopping ? "Stopping after the current batch…" : ""}</p><progress value={progress.done} max={progress.total || 1} /></div>}
          <div className="student-csv__actions">
            {started && !eligible.length && !processing ? (
              <button className="student-csv__primary" disabled={locked} onClick={() => {
                resetImport();
                requestAnimationFrame(() => fileInput.current?.focus());
              }}>Import another file</button>
            ) : <button className="student-csv__primary" disabled={locked || mappingDirty || !eligible.length} onClick={() => void importRows()}>{started ? `Retry ${eligible.length} remaining rows` : `Import ${eligible.length} ready rows`}</button>}
            {processing ? <button disabled={stopping} onClick={() => { stop.current = true; setStopping(true); }}>Stop after current batch</button> : <button disabled={locked} onClick={close}>Close import</button>}
          </div>
        </section>
      )}
    </div>
  );
}

export default StudentCsvTools;
