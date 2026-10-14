import { test } from "node:test";
import assert from "node:assert/strict";
import { CHINESE_NAMES_PREFERENCE, readChineseNamesPreference, rosterStudentName, saveChineseNamesPreference } from "../src/domain/rosterNames.ts";

test("bilingual roster names use the existing combined name without adding a field", () => {
  for (const name of ["Andrew Wang 王俊焱", "王俊焱 Andrew Wang", "Andrew Wang（王俊焱）", "Andrew Wang王俊焱"]) {
    assert.equal(rosterStudentName(name, true), "Andrew Wang 王俊焱");
    assert.equal(rosterStudentName(name, false), "Andrew Wang");
  }
  assert.equal(rosterStudentName("José García 李四", false), "José García");
});

test("English-only names have no added spacing and Chinese-only identities remain readable", () => {
  for (const showChinese of [true, false]) {
    assert.equal(rosterStudentName("  Andrew Wang  ", showChinese), "Andrew Wang");
    assert.equal(rosterStudentName("王俊焱", showChinese), "王俊焱");
    assert.equal(rosterStudentName("", showChinese), "");
  }
  assert.equal(rosterStudentName('Andrew "Andy" Wang 王俊焱', false), 'Andrew "Andy" Wang');
  assert.equal(rosterStudentName('Andrew "Andy" Wang（王俊焱）', false), 'Andrew "Andy" Wang');
  assert.equal(rosterStudentName("Alice / Bob 张三", false), "Alice / Bob");
  assert.equal(rosterStudentName('Andrew "Andy" Wang 王俊焱', true), 'Andrew "Andy" Wang 王俊焱');
});

test("Chinese-name preference defaults on and restores explicit saved choices", () => {
  for (const value of [null, "true", "invalid"]) assert.equal(readChineseNamesPreference({ getItem: key => { assert.equal(key, CHINESE_NAMES_PREFERENCE); return value; } }), true);
  assert.equal(readChineseNamesPreference({ getItem: () => "false" }), false);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  saveChineseNamesPreference(false, storage);
  assert.equal(readChineseNamesPreference(storage), false);
  saveChineseNamesPreference(true, storage);
  assert.equal(readChineseNamesPreference(storage), true);
});

test("unavailable browser storage does not break roster visibility", () => {
  assert.equal(readChineseNamesPreference({ getItem: () => { throw new Error("Storage unavailable"); } }), true);
  assert.doesNotThrow(() => saveChineseNamesPreference(false, { setItem: () => { throw new Error("Storage unavailable"); } }));
});
