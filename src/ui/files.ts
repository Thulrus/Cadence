/** File import/export helpers. Validation and naming are pure (tested); I/O is thin. */

export const FILE_LIMITS = {
  /** Scripts are plain text; anything bigger is almost certainly the wrong file. */
  maxScriptBytes: 2 * 1024 * 1024,
  maxBackupBytes: 20 * 1024 * 1024,
  /** Max length of a title derived from a filename or the first line of text. */
  maxTitleChars: 60,
} as const;

export const SCRIPT_EXTENSIONS = ['.txt', '.md', '.markdown', '.text'] as const;
export const SCRIPT_ACCEPT = [...SCRIPT_EXTENSIONS, 'text/plain', 'text/markdown'].join(',');
export const BACKUP_ACCEPT = '.json,application/json';

export type FileKind = 'script' | 'backup';

interface FileLike {
  name: string;
  type: string;
  size: number;
}

const lowerExt = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
};

/** Which kind of import a dropped/selected file is, or null if unsupported. */
export function classifyFile(f: FileLike): FileKind | null {
  const ext = lowerExt(f.name);
  if (ext === '.json' || f.type === 'application/json') return 'backup';
  if ((SCRIPT_EXTENSIONS as readonly string[]).includes(ext)) return 'script';
  if (f.type.startsWith('text/')) return 'script';
  return null;
}

/** Human-readable reason a file can't be imported as `kind`, or null if it's acceptable. */
export function checkFile(f: FileLike, kind: FileKind): string | null {
  if (classifyFile(f) !== kind)
    return kind === 'script'
      ? `“${f.name}” isn't a text file. Use .txt or .md.`
      : `“${f.name}” isn't a Cadence backup (.json).`;
  const max = kind === 'script' ? FILE_LIMITS.maxScriptBytes : FILE_LIMITS.maxBackupBytes;
  if (f.size > max) return `“${f.name}” is too large (max ${Math.round(max / 1024 / 1024)} MB).`;
  return null;
}

/** True if decoded text looks binary (contains NUL characters). */
export function looksBinary(text: string): boolean {
  return text.includes('\u0000');
}

function clip(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > FILE_LIMITS.maxTitleChars
    ? t.slice(0, FILE_LIMITS.maxTitleChars - 1).trimEnd() + '…'
    : t;
}

/** "Easter_talk-2026.md" → "Easter talk-2026". */
export function titleFromFilename(name: string): string {
  const base = lowerExt(name) ? name.slice(0, name.lastIndexOf('.')) : name;
  return clip(base.replace(/_+/g, ' '));
}

/** Title from the first non-empty line of script text (heading markers stripped). */
export function deriveTitle(text: string): string {
  for (const line of text.split('\n')) {
    const t = line
      .replace(/^\s*#+\s*/, '')
      .replace(/[*_]/g, '')
      .trim();
    if (t) return clip(t);
  }
  return '';
}

/** Safe download filename stem from a title. */
export function safeFilename(title: string, fallback = 'script'): string {
  const s = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return s.slice(0, FILE_LIMITS.maxTitleChars) || fallback;
}

/** Read a script file after validating it. Throws an Error with a user-facing message. */
export async function readScriptFile(file: File): Promise<{ title: string; text: string }> {
  const err = checkFile(file, 'script');
  if (err) throw new Error(err);
  const text = await file.text();
  if (looksBinary(text)) throw new Error(`“${file.name}” doesn't look like a text file.`);
  return { title: titleFromFilename(file.name), text: text.replace(/\r\n?/g, '\n') };
}

/** Read a backup file after validating it. Throws an Error with a user-facing message. */
export async function readBackupFile(file: File): Promise<string> {
  const err = checkFile(file, 'backup');
  if (err) throw new Error(err);
  return file.text();
}

/** Trigger a download of `text` via a Blob and a temporary `<a download>`. */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke on a later task so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Open a file picker; resolves with the chosen files (empty if cancelled). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

/**
 * Make `el` a drop target for files. Adds `drop-active` while dragging files over it.
 * Returns a cleanup function.
 */
export function onFileDrop(el: HTMLElement, handler: (files: File[]) => void): () => void {
  let depth = 0;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  const over = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const enter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth++;
    el.classList.add('drop-active');
  };
  const leave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.classList.remove('drop-active');
  };
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    el.classList.remove('drop-active');
    handler([...(e.dataTransfer?.files ?? [])]);
  };
  el.addEventListener('dragenter', enter);
  el.addEventListener('dragover', over);
  el.addEventListener('dragleave', leave);
  el.addEventListener('drop', drop);
  return () => {
    el.removeEventListener('dragenter', enter);
    el.removeEventListener('dragover', over);
    el.removeEventListener('dragleave', leave);
    el.removeEventListener('drop', drop);
  };
}
