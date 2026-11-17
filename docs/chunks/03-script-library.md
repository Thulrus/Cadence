# Chunk 03 — Script library & import/export

**Milestone:** M1 · **Depends on:** 01, 02

## Goal

Users can create, paste, load, edit, rename, duplicate, delete, export, and import scripts, stored on-device in IndexedDB.

## Read first

- SPEC §6 "Import" bullet, §10
- `src/ui/router.ts`, `src/app.ts`, placeholder views for `library` and `editor`

## Tasks

1. **`src/storage/scripts.ts`**: `ScriptRecord { id, title, text, createdAt, updatedAt, lastOpenedAt? }` and `ScriptStore` with `list()`, `get(id)`, `create({title, text})`, `update(id, patch)`, `duplicate(id)`, `delete(id)`, `exportAll(): string` (JSON backup with a format version), `importBackup(json)` (merge; on id collision keep the newer `updatedAt`). Raw IndexedDB with a small promise wrapper is fine; a tiny dependency (e.g. `idb`) is acceptable if recorded. Emit `change`.
   - Tests with `fake-indexeddb` (dev dependency).
   - Handle IndexedDB being unavailable (private mode on some browsers): fall back to an in-memory store and show a non-blocking warning that scripts won't persist.
2. **Library view**: list scripts (title, updated date, word count from `parseScript`), sorted by last opened/updated. Actions: New, Open (→ prompter), Edit, Rename, Duplicate, Delete (with in-page confirm, not `window.confirm`), Export backup, Import backup. Empty state explains paste/upload. Large touch targets.
3. **Editor view**: title field + large textarea, autosave (debounced) to the store, "Start prompter" button. Show a short markup cheat-sheet (`# Heading`, `[stage direction]`, blank line = paragraph). Show live word count and estimated duration at the current timed WPM setting.
4. **Import paths**: paste into editor; "Load file" (`.txt`, `.md`) creates a new script titled from the filename; drag-and-drop a file onto the library or editor. Read files with `File.text()`; reject anything over ~2 MB or non-text.
5. Export a single script as `.txt` and the whole library as `.json`. Use a Blob + temporary `<a download>`.

## Done when

- `npm run check` passes; ScriptStore unit-tested including backup round-trip and collision rule.
- Manual run in `npm run dev`: create → edit → reload page → still there; duplicate/rename/delete work; file load and drag-drop create scripts.

## Out of scope

The prompter display itself (04). Cloud sync, Google Docs API (non-goals).
