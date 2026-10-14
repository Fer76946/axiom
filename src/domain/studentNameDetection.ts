export type StudentNames = { id: string; english: string; chinese: string; error: string };

export const headerKey = (cell: unknown) => typeof cell === "string"
  ? cell.trim().replace(/^\uFEFF/, "").normalize("NFC").toLowerCase().replace(/[\s/_()（）-]+/g, "") : "";
export const englishHeaders = new Set(["english", "englishname", "英文名", "英文姓名"]);
export const chineseHeaders = new Set(["姓名", "chinese", "chinesename", "中文名", "中文姓名"]);
export const combinedHeaders = new Set(["name", "studentname", "fullname", "学生姓名", "englishchinese", "englishandchinese", "englishchinesename", "englishnamechinesename", "english中文", "英文中文姓名", "name姓名"]);

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

export type NameMapping = { englishColumn: number | null; chineseColumn: number | null; startRow: number };
export type NameAnalysis = {
  mapping: NameMapping;
  columns: { index: number; blocked: boolean }[];
  rowCount: number;
  confident: boolean;
  notice: string;
};

const ignoredHeader = /studentid|studentnumber|schoolid|rosternumber|学号|序号|编号|pinyin|拼音|gender|sex|性别|birthday|birthdate|dateofbirth|dob|出生|phone|mobile|telephone|电话|手机|email|邮箱|邮件|parent|mother|father|guardian|家长|父亲|母亲|爸爸|妈妈|监护|grade|成绩|subject|科目|section|class|班级/i;
const nonNames = new Set(["m", "f", "male", "female", "boy", "girl", "男", "女", "男生", "女生", "science", "algebra", "mathematics", "biology", "chemistry", "physics", "unassigned", "n/a", "na", "none", "unknown"]);
const titleText = /\b(?:roster|student\s*list|school|class\s*(?:list|roster)|grade\s*\d|total|summary|notes?|remarks?|teacher)\b|学生名单|花名册|班级|总计|合计|备注|名单|班主任/i;
const surnames: Record<string, string[]> = { 张: ["zhang"], 李: ["li"], 王: ["wang"], 陈: ["chen"], 刘: ["liu"], 赵: ["zhao"], 黄: ["huang"], 周: ["zhou"], 吴: ["wu"], 徐: ["xu"], 孙: ["sun"], 胡: ["hu"], 朱: ["zhu"], 高: ["gao"], 林: ["lin"], 郑: ["zheng"], 梁: ["liang"], 谢: ["xie"], 宋: ["song"], 唐: ["tang"], 许: ["xu"], 何: ["he"] };
const valueText = (cell: unknown) => typeof cell === "string" ? cell.trim().normalize("NFC") : "";
function isNonStudentRow(row: readonly unknown[]) {
  const values = row.map(valueText).filter(Boolean);
  // Notes in unrelated columns must never discard an otherwise valid student.
  return !values.length || values.length === 1 && titleText.test(values[0]);
}
function nameKind(cell: unknown): "english" | "chinese" | "combined" | null {
  const value = valueText(cell);
  if (!value || value.length > 80 || nonNames.has(value.toLowerCase()) || titleText.test(value) || /[\d@:/\\]/u.test(value)) return null;
  const key = headerKey(value);
  if (englishHeaders.has(key) || chineseHeaders.has(key) || combinedHeaders.has(key)) return null;
  const parts = splitStudentName(value);
  if (parts.error) return null;
  if (parts.english.split(/\s+/).filter(Boolean).length > 4 || parts.chinese.length > 6) return null;
  return parts.english && parts.chinese ? "combined" : parts.english ? "english" : parts.chinese.length >= 2 ? "chinese" : null;
}

export function analyzeNameColumns(rows: readonly (readonly unknown[])[]): NameAnalysis {
  if (rows.length > 10000) throw new Error("This worksheet is too large to analyze safely (maximum 10,000 rows and 256 columns).");
  const width = Math.max(0, ...rows.map(row => row.length));
  if (width > 256) throw new Error("This worksheet is too large to analyze safely (maximum 10,000 rows and 256 columns).");
  const headerRows = rows.slice(0, 50).map((row, index) => {
    const keys = row.map(headerKey);
    const english = keys.flatMap((key, col) => englishHeaders.has(key) ? [col] : []);
    const chinese = keys.flatMap((key, col) => chineseHeaders.has(key) ? [col] : []);
    const combined = keys.flatMap((key, col) => combinedHeaders.has(key) ? [col] : []);
    const ignored = keys.flatMap((key, col) => ignoredHeader.test(key) ? [col] : []);
    return { index, english, chinese, combined, ignored, strength: english.length && chinese.length ? 3 : english.length || chinese.length ? 2 : combined.length ? 1 : 0 };
  });
  const header = headerRows.filter(row => row.strength).sort((a, b) => b.strength - a.strength || a.index - b.index)[0];
  const blocked = new Set<number>();
  // A title mentioning parents must not classify an entire column; require a table-like header row.
  for (const row of headerRows) if (row.strength || row.ignored.length && rows[row.index].filter(cell => headerKey(cell)).length >= 2) for (const col of row.ignored) blocked.add(col);
  const start = header ? header.index + 1 : 0;
  const sample = rows.slice(start, start + 500).filter(row => !isNonStudentRow(row));
  const stats = Array.from({ length: width }, (_unused, index) => {
    const populated = sample.filter(row => row[index] != null && String(row[index]).trim());
    const counts = { english: 0, chinese: 0, combined: 0 };
    const distinct = new Set<string>();
    for (const row of populated) {
      const kind = nameKind(row[index]);
      if (kind) { counts[kind]++; distinct.add(valueText(row[index])); }
    }
    const count = counts.english + counts.chinese + counts.combined;
    const nonNameCount = populated.filter(row => typeof row[index] !== "string" ||
      /[\d@:]/u.test(valueText(row[index])) || nonNames.has(valueText(row[index]).toLowerCase())).length;
    if (populated.length >= 2 && !count && nonNameCount / populated.length >= 0.7 &&
      !header?.english.includes(index) && !header?.chinese.includes(index) && !header?.combined.includes(index)) blocked.add(index);
    return { index, populated: populated.length, distinct: distinct.size, ...counts };
  });
  const candidates = (kind: "english" | "chinese" | "combined") => stats.filter(stat =>
    !blocked.has(stat.index) && stat[kind] >= 2 && stat.distinct >= 2 && stat[kind] / stat.populated >= 0.7);
  const combinedCandidates = stats.filter(stat => !blocked.has(stat.index) && stat.distinct >= 2 &&
    (stat.combined > 0 || stat.english > 0 && stat.chinese > 0) &&
    (stat.english + stat.chinese + stat.combined) / stat.populated >= 0.7);
  const combinedColumns = new Set(combinedCandidates.map(stat => stat.index));
  const chineseCandidates = candidates("chinese").filter(stat => !combinedColumns.has(stat.index));
  // Correlate common surname spellings with Chinese names; never use pinyin as the English name.
  const likelyPinyin = new Set<number>();
  for (const stat of candidates("english")) {
    for (const chinese of chineseCandidates) {
      let matched = 0;
      let compared = 0;
      for (const row of sample) {
        const latin = valueText(row[stat.index]);
        const han = valueText(row[chinese.index]);
        if (!latin || !han) continue;
        compared++;
        const spellings = surnames[han[0]] ?? [];
        if (spellings.some(surname => {
          const compact = latin.toLowerCase().replace(/\s+/g, "");
          return compact.startsWith(surname) && compact.length > surname.length &&
            (/\s/.test(latin) || latin === latin.toLowerCase() || surname.length >= 3 || /[A-Z]/.test(latin[surname.length] ?? ""));
        })) matched++;
      }
      if (compared >= 2 && matched / compared >= 0.7) likelyPinyin.add(stat.index);
    }
  }
  const englishCandidates = candidates("english").filter(stat => !likelyPinyin.has(stat.index) && !combinedColumns.has(stat.index));
  for (const index of likelyPinyin) blocked.add(index);
  // Without a Chinese column, consistent romanized surnames are uncertain,
  // rather than automatically treating a pinyin-only roster as English names.
  const possiblePinyinOnly = !chineseCandidates.length && englishCandidates.some(stat => {
    const values = sample.map(row => valueText(row[stat.index])).filter(value => nameKind(value) === "english");
    return values.length >= 2 && values.filter(value => {
      const words = value.toLowerCase().split(/\s+/);
      return words.length >= 2 && Object.values(surnames).some(spellings => spellings.includes(words[0]));
    }).length / values.length >= 0.7;
  });
  const mapping: NameMapping = { englishColumn: null, chineseColumn: null, startRow: start + 1 };
  const duplicatedHeaders = !!header && (header.english.length > 1 || header.chinese.length > 1 || header.combined.length > 1 && !header.english.length && !header.chinese.length);
  let confident = false;
  if (header && !duplicatedHeaders) {
    mapping.englishColumn = header.english[0] ?? header.combined[0] ?? null;
    mapping.chineseColumn = header.chinese[0] ?? null;
    if (mapping.englishColumn === null && englishCandidates.length === 1) mapping.englishColumn = englishCandidates[0].index;
    if (mapping.chineseColumn === null && !header.combined.length && chineseCandidates.length === 1) mapping.chineseColumn = chineseCandidates[0].index;
    const selected = [mapping.englishColumn, mapping.chineseColumn].filter((col): col is number => col !== null);
    confident = selected.length > 0 && selected.every(col => !blocked.has(col)) && selected.some(col => stats[col].english + stats[col].chinese + stats[col].combined > 0);
  } else if (!header && !possiblePinyinOnly) {
    if (combinedCandidates.length === 1 && !englishCandidates.length && !chineseCandidates.length) {
      mapping.englishColumn = combinedCandidates[0].index;
      confident = true;
    } else {
      mapping.englishColumn = englishCandidates.length === 1 ? englishCandidates[0].index : null;
      mapping.chineseColumn = chineseCandidates.length === 1 ? chineseCandidates[0].index : null;
      confident = (mapping.englishColumn !== null || mapping.chineseColumn !== null) && englishCandidates.length <= 1 && chineseCandidates.length <= 1 && !combinedCandidates.length;
    }
    if (confident) {
      const first = rows.findIndex(row => !isNonStudentRow(row) &&
        [mapping.englishColumn, mapping.chineseColumn].some(col => col !== null && nameKind(row[col])));
      mapping.startRow = first + 1;
    }
  }
  return {
    mapping, columns: stats.map(stat => ({ index: stat.index, blocked: blocked.has(stat.index) })), rowCount: rows.length, confident,
    notice: confident ? "Name columns detected locally. Review the preview before importing." : "No recognized student name columns found with sufficient confidence. Choose the name columns and starting row below; parent names and pinyin can look like student names.",
  };
}

export function extractMappedNames(
  rows: readonly (readonly unknown[])[], mapping: NameMapping, analysis: NameAnalysis,
  makeId: () => string = () => crypto.randomUUID(),
): StudentNames[] {
  if (!Number.isInteger(mapping.startRow) || mapping.startRow < 1 || mapping.startRow > rows.length) throw new Error("Choose a starting row within this worksheet.");
  const selected = [mapping.englishColumn, mapping.chineseColumn].filter((col): col is number => col !== null);
  if (!selected.length || selected.some(col => !Number.isInteger(col) || !analysis.columns.some(column => column.index === col && !column.blocked))) {
    throw new Error("Choose at least one name column. ID, contact, and other non-name columns cannot be selected.");
  }
  const names: StudentNames[] = [];
  for (const row of rows.slice(mapping.startRow - 1)) {
    if (isNonStudentRow(row)) continue;
    const englishCell = mapping.englishColumn !== null ? row[mapping.englishColumn] : undefined;
    const chineseCell = mapping.chineseColumn !== null ? row[mapping.chineseColumn] : undefined;
    if ([englishCell, chineseCell].some(cell => englishHeaders.has(headerKey(cell)) || chineseHeaders.has(headerKey(cell)) || combinedHeaders.has(headerKey(cell)))) continue;
    const english = valueText(englishCell);
    const chinese = valueText(chineseCell);
    if ([english, chinese].some(value => titleText.test(value))) continue;
    // Do not expose IDs/contact cells even when a manually chosen column contains mixed data.
    const usable = (value: string) => value && !/[\d@:]/u.test(value) && /[\p{Script=Latin}\p{Script=Han}]/u.test(value) && !nonNames.has(value.toLowerCase());
    let fields = { english: usable(english) ? english : "", chinese: usable(chinese) ? chinese : "", error: "" };
    if (!fields.english && !fields.chinese) continue;
    if (mapping.englishColumn === mapping.chineseColumn || mapping.chineseColumn === null || mapping.englishColumn === null) {
      fields = splitStudentName(fields.english || fields.chinese);
    }
    const invalid = [englishCell, chineseCell].some(cell => cell != null && typeof cell !== "string");
    names.push({ id: makeId(), ...fields, error: invalid ? "Student names must be text. Correct the name fields or remove this row." : fields.error });
    if (names.length > 1000) throw new Error("Use at most 1000 students per worksheet.");
  }
  if (!names.length) throw new Error("No student names found in the selected columns and rows.");
  return names;
}

