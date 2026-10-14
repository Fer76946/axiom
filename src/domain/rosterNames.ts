import { splitStudentName } from "./studentNameDetection.ts";

export const CHINESE_NAMES_PREFERENCE = "axiom-show-chinese-names";

// Existing bilingual names share one stored field. Visibility never edits it.
export function rosterStudentName(name: string, showChinese: boolean): string {
  const parts = splitStudentName(name);
  if (parts.error) {
    if (showChinese || !/\p{Script=Latin}/u.test(name)) return name;
    // Imported English fields may contain nicknames/quotes that the strict
    // import splitter flags. Hide only Han text, preserving the stored name.
    return name.replace(/[（(][\p{Script=Han}·\s]+[）)]/gu, "")
      .replace(/[\p{Script=Han}·]+/gu, "").replace(/\s+/gu, " ").trim();
  }
  return parts.english
    ? [parts.english, showChinese ? parts.chinese : ""].filter(Boolean).join(" ")
    : parts.chinese;
}

export function readChineseNamesPreference(storage?: Pick<Storage, "getItem">): boolean {
  try { return (storage ?? window.localStorage).getItem(CHINESE_NAMES_PREFERENCE) !== "false"; }
  catch { return true; }
}

export function saveChineseNamesPreference(showChinese: boolean, storage?: Pick<Storage, "setItem">): void {
  try { (storage ?? window.localStorage).setItem(CHINESE_NAMES_PREFERENCE, String(showChinese)); }
  catch { /* Keep the toggle usable when browser storage is unavailable. */ }
}
