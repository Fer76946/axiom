import { useRef, useState } from "react";
import type { Student, StudentImportResult } from "../../domain/types";
import { downloadCsv, MAX_CSV_BYTES, MAX_IMPORT_ROWS, previewStudentCsv, studentCsv, type CsvImportRow } from "../../domain/studentCsv";
import { errorMessage, studentsService } from "../../services";
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

function StudentCsvTools({ students, disabled, subject, section, onBusyChange, onChanged }: Props) {
  const [panel, setPanel] = useState<"import" | "export" | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
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

  function close() {
    setPanel(null);
    setRows([]);
    setStarted(false);
    setFileName("");
  }

  async function readFile(file: File) {
    setReading(true);
    setError("");
    setSummary("");
    setRows([]);
    setStarted(false);
    setFileName(file.name);
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error("Choose a CSV file smaller than 2 MB.");
      const source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      setRows(previewStudentCsv(source, students));
    } catch (cause) {
      setError(cause instanceof TypeError ? "Save the file as CSV UTF-8 in Excel, then try again." : errorMessage(cause));
    } finally { setReading(false); }
  }

  async function importRows() {
    if (!eligible.length || locked) return;
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
        <button disabled={locked} onClick={() => { setPanel("import"); setError(""); }}>Import Students</button>
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
          <h2 id="import-title">Import students</h2>
          <p>Use one row per student, with a name, subject, and section. Save as <strong>CSV UTF-8</strong> in Excel. Up to {MAX_IMPORT_ROWS} students and 2 MB per file.</p>
          <p>Leave student_id blank for new students. To identify an existing student, copy its ID from a roster export. Existing records are never overwritten. Each student has one class assignment; use Edit Class to change it.</p>
          <div className="student-csv__actions">
            <button disabled={locked} onClick={() => downloadCsv("\uFEFFstudent_id,name,subject,section\r\n", "axiom-student-template.csv")}>Download CSV Template</button>
            <label className="student-csv__upload">Choose CSV file
              <input type="file" accept=".csv,text/csv" disabled={locked || started} onClick={event => { event.currentTarget.value = ""; }} onChange={event => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }} />
            </label>
          </div>
          {reading && <p role="status">Reading CSV…</p>}
          {rows.length > 0 && <>
            <p>{fileName}: {rows.length} rows; {eligible.length} ready to import. Invalid and unresolved rows will be skipped.</p>
            <p className="student-csv__scroll-hint">Scroll the preview sideways to review all columns.</p>
            <div className="student-csv__preview" tabIndex={0} aria-label="Student import preview">
              <table>
                <thead><tr><th>CSV line</th><th>Student</th><th>Subject</th><th>Section</th><th>Review / result</th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.record.id}>
                  <td>{row.line}</td><td>{row.record.name || "—"}</td><td>{row.record.subject || "—"}</td><td>{row.record.section || "—"}</td>
                  <td>{row.result ? <span className={row.result.status === "error" ? "student-csv__error" : ""}>{row.result.message}</span> : row.error ? <span className="student-csv__error">{row.error}</span> : row.warning ? <>
                    <p>{row.warning}</p>
                    <label className="student-csv__choice"><input type="checkbox" disabled={locked || started} checked={row.record.confirmDistinct} onChange={event => {
                      const confirmed = event.target.checked;
                      setRows(current => current.map(item => item.record.id === row.record.id ? { ...item, record: { ...item.record, confirmDistinct: confirmed } } : item));
                    }} />This is a different student</label>
                  </> : row.record.studentId ? "Existing student; will be left unchanged." : "Ready"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
          {processing && <div role="status"><p>Processed {progress.done} of {progress.total} rows. {stopping ? "Stopping after the current batch…" : ""}</p><progress value={progress.done} max={progress.total || 1} /></div>}
          <div className="student-csv__actions">
            <button className="student-csv__primary" disabled={locked || !eligible.length} onClick={() => void importRows()}>{started ? `Retry ${eligible.length} remaining rows` : `Import ${eligible.length} ready rows`}</button>
            {processing ? <button disabled={stopping} onClick={() => { stop.current = true; setStopping(true); }}>Stop after current batch</button> : <button disabled={reading} onClick={close}>{started ? "Close preview" : "Cancel"}</button>}
          </div>
        </section>
      )}
    </div>
  );
}

export default StudentCsvTools;
