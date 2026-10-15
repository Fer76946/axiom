# Student management

Teachers manage a shared roster, import student names, and record individual or class assessment results. Students use the access code from their teacher to view their own grades.

## Find and edit students

The teacher dashboard supports these roster operations:

- **Search by name** matches partial English or Chinese names, ignores capitalization, and trims the query's surrounding whitespace. It searches the stored name even when Chinese name display is off. Subject/class filters still apply; codes and other fields are not searched.
- **Subject** and **Section / Class** narrow the roster. Changing subject clears the selected class.
- **Show overall grades** controls grade visibility in the roster.
- Click **No grade yet** or **Grade** to edit a student's overall grade. After a successful save, the page returns to its previous scroll position and focuses that student's Grade button. Failed saves keep the editor open.
- **Show Chinese names** defaults on and remembers the teacher's browser preference. It changes display only; Chinese-only names remain visible.
- **Edit Name** opens the full stored name, including hidden Chinese text. Names are required and limited to 120 characters. Saving preserves the student ID, access code, class, grades, and sessions; Cancel or Escape dismisses the editor.
- **Edit Subject / Class** changes the student's assignment. Each student has one subject/class pair.
- Access-code boxes start hidden, including the newly created student notice. Click a box to reveal its seven digits; click again to hide them. **Copy Code** works without revealing the code on screen.
- **Reset Code** asks for confirmation, then generates a new unique seven-digit code. The old code stops working for new sign-ins. The replacement starts hidden; click its box to read it. Resetting preserves the student's records, grades, class assignment, and existing sessions.

Teachers enter overall grades independently of assessment results. See [current scope](architecture.md#current-scope) for the classroom model's limits.

## Import Excel or CSV rosters

Choose **Import Excel or CSV** and select a supported file. The browser extracts names locally and shows an editable preview before any student creation request.

### File formats and limits

The parser accepts these formats and bounds:

| Setting | Limit or support |
| --- | --- |
| File formats | `.xlsx`, `.xls`, `.csv` |
| File size | 2 MB (2,097,152 bytes) |
| Workbook sheets | Up to 20; choose one visible sheet, with no automatic merging |
| Worksheet dimensions | Up to 10,000 source rows and 256 columns |
| Named students | Up to 1,000 per selected sheet |
| CSV encoding | UTF-8 or UTF-16 with byte-order-mark support |
| CSV delimiters | Comma, semicolon, or tab |
| Name, subject, and section length | 120 characters each |

Hidden sheets are excluded. Empty or unrecognized worksheets produce an error. Invalid files, mismatched file types, and unreadable or unsupported password-protected workbooks are rejected without displaying their contents. Excel parsing loads SheetJS Community Edition 0.20.3 from the official distribution, including legacy XLS codepage support, only when needed.

### Select name columns

Recognized headers include `English`, `English Name`, `姓名`, `Chinese Name`, and `Student Name` / `Name`. Headers may follow title rows. Repeated headers and blank-name rows are ignored, and one English or Chinese column is sufficient. A two-column CSV template is available in the interface.

Combined names split only at clear Latin/Han script boundaries, including either name order and matching parentheses. Ambiguous cells require correction or removal in the preview.

When headers are absent or incomplete, deterministic local analysis considers name patterns, distinct values, and the proportion of name-like cells. It excludes numeric IDs, dates, gender, contacts, and labeled parent/pinyin columns. Pinyin surname comparisons help avoid selecting pinyin as English names. Title, blank, repeated-header, and recognizable summary rows are skipped. No AI service or external analysis is involved.

Competing name-like columns and insufficient evidence require manual confirmation. Expand **Check or change name columns and starting row**, choose Excel column letters and the first student row, then select **Update preview**. You can also override an automatic selection. Known non-name columns are disabled; the controls show generic column letters instead of unrelated headers or cell contents.

Headerless student and parent names can have identical patterns, so review every selected name. Single-row headerless files require manual selection. Changing columns clears the preview until the file is re-read, preventing import from a stale selection.

### Review and import

Prepare the preview before confirming student creation:

1. Choose or enter **Subject** and **Class / Section** once for the selected roster. Suggestions use existing roster assignments.
2. Choose **Include Chinese names** to store `English 中文`. With it off, store the English name; missing English names fall back to Chinese in either mode. Rows with neither name are ignored.
3. Correct editable name fields or remove rows. These actions affect only the local preview.
4. Resolve repeated names and English/bilingual display variants. Leave existing students skipped. Confirm **This is a different student** only for a separate person sharing a name.
5. Start the import. Batches of 25 show progress and can stop after the current batch. Completed inserts remain; retry failed or unconfirmed rows from the same preview.

Names are not unique identifiers. The server also checks display-name variants so changing the Chinese-name option does not silently create another student. Imports preserve existing records, grades, and access codes; use the roster editor for assignment changes.

Once import starts, payloads and row IDs remain frozen. Editing, removing rows, and changing sheet/column selections are locked. Manual creation and imports share validation, cryptographic access-code generation, unique-code constraints, authorization, and collision retries. Deterministic retry IDs for matching records and frozen random IDs for explicitly distinct students prevent repeated requests from recreating completed inserts.

The import's **Include Chinese names** option controls stored text. The roster's **Show Chinese names** checkbox controls display only; it cannot recover a Chinese name omitted during import.

### Data handling

The original workbook or CSV is never uploaded. Raw cells exist temporarily during parsing; preview state retains extracted names and the chosen classroom fields. A local file reference remains while the preview is open so column changes can re-read it; closing releases the reference.

School IDs, roster numbers, pinyin, gender, birth dates, and parent contact fields are excluded from preview data and are not uploaded, logged, or exported. Outbound requests allow only generated Axiom row IDs, display names, chosen class fields, and identity confirmation. Displayed parser errors omit file contents.

## Export rosters

**Export Students** downloads the entire roster or the selected subject/class scope through authorized, paginated server reads. The name-search query does not change export scope.

Exports include Axiom UUIDs, stored display names, subjects, and sections. They exclude school IDs, ignored metadata, access codes, passwords, grades, and session tokens. CSV output includes a UTF-8 byte-order mark, CRLF line endings, field escaping, and Excel formula-injection protection.

## Record tests and quizzes

Use **Tests & Quizzes** above the roster for class assessments:

1. Select **Create test or quiz** and enter type, title, date, and maximum score.
2. Select the applicable subject/class pairs and save to open the score table.
3. Enter scores and choose **Save scores**. Blank means ungraded; zero is a graded score. Clearing a saved score returns it to ungraded.

New students in the selected classes appear automatically. Students with saved results remain in the score table after moving class or removal of a class from the assessment.

**Edit details / classes** updates the assessment. Reducing its maximum below a saved score is rejected; scores are not automatically scaled. Revision checks reject stale edits. Deleting a test or quiz requires confirmation and removes its associated scores.

Each student's roster-level **Tests & Quizzes** action opens their individual assessment results and class results. Add, edit, or delete individual results there; edit class assessment scores from the main score table. Students see their own individual and applicable class results, with **Not graded yet** for applicable ungraded work.
