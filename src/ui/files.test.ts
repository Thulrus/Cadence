import { describe, expect, it } from 'vitest';
import {
  FILE_LIMITS,
  checkFile,
  classifyFile,
  deriveTitle,
  looksBinary,
  safeFilename,
  titleFromFilename,
} from './files';

const f = (name: string, size = 10, type = '') => ({ name, size, type });

describe('classifyFile / checkFile', () => {
  it('classifies by extension or MIME type', () => {
    expect(classifyFile(f('a.txt'))).toBe('script');
    expect(classifyFile(f('a.MD'))).toBe('script');
    expect(classifyFile(f('notes', 1, 'text/plain'))).toBe('script');
    expect(classifyFile(f('backup.json'))).toBe('backup');
    expect(classifyFile(f('photo.jpg', 1, 'image/jpeg'))).toBeNull();
    expect(classifyFile(f('doc.docx'))).toBeNull();
  });

  it('rejects wrong kind and oversized files', () => {
    expect(checkFile(f('a.txt'), 'script')).toBeNull();
    expect(checkFile(f('a.pdf'), 'script')).toMatch(/isn't a text file/);
    expect(checkFile(f('a.txt'), 'backup')).toMatch(/isn't a Cadence backup/);
    expect(checkFile(f('a.txt', FILE_LIMITS.maxScriptBytes + 1), 'script')).toMatch(/too large/);
    expect(checkFile(f('a.txt', FILE_LIMITS.maxScriptBytes), 'script')).toBeNull();
  });

  it('detects binary content', () => {
    expect(looksBinary('hello')).toBe(false);
    expect(looksBinary('PK\u0003\u0004\u0000')).toBe(true);
  });
});

describe('titles and filenames', () => {
  it('titleFromFilename strips extension and underscores', () => {
    expect(titleFromFilename('Easter_talk-2026.md')).toBe('Easter talk-2026');
    expect(titleFromFilename('README')).toBe('README');
    expect(titleFromFilename('.hidden')).toBe('.hidden');
  });

  it('deriveTitle uses the first non-empty line', () => {
    expect(deriveTitle('\n\n# **Welcome** home\nBody')).toBe('Welcome home');
    expect(deriveTitle('   \n')).toBe('');
    const long = deriveTitle('x'.repeat(200));
    expect(long).toHaveLength(FILE_LIMITS.maxTitleChars);
    expect(long.endsWith('…')).toBe(true);
  });

  it('safeFilename removes path and reserved characters', () => {
    expect(safeFilename('My: talk / "draft"?')).toBe('My talk draft');
    expect(safeFilename('...')).toBe('script');
    expect(safeFilename('', 'cadence')).toBe('cadence');
  });
});
