import { describe, expect, it } from 'vitest';
import { extOf, formatBytes, isAllowedName, parseKey, sanitizeName, uniqueName, MAX_FILE_BYTES } from '@/lib/manage-config';

describe('manage: file names', () => {
  it('renames duplicates to "name (1)", "name (2)" and ignores case', () => {
    const taken = new Set(['photo.jpg', 'photo (1).jpg', 'readme']);
    expect(uniqueName('new.png', taken)).toBe('new.png');
    expect(uniqueName('photo.jpg', taken)).toBe('photo (2).jpg');
    expect(uniqueName('PHOTO.JPG', taken)).toBe('PHOTO (2).JPG');
    expect(uniqueName('readme', taken)).toBe('readme (1)');
  });
  it('sanitizes path tricks and control characters', () => {
    expect(sanitizeName('../../etc/passwd')).not.toContain('/');
    expect(sanitizeName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(sanitizeName('a/b\\c.txt')).toBe('a_b_c.txt');
    expect(sanitizeName('  \u0000x\u0007y.png ')).toBe('xy.png');
    expect(sanitizeName('')).toBe('file');
    expect(sanitizeName('x'.repeat(300) + '.mp4').length).toBeLessThanOrEqual(200);
    expect(sanitizeName('x'.repeat(300) + '.mp4').endsWith('.mp4')).toBe(true);
  });
  it('extensions', () => {
    expect(extOf('a.PNG')).toBe('png');
    expect(extOf('archive.tar.gz')).toBe('gz');
    expect(extOf('.hidden')).toBe('');
    expect(extOf('noext')).toBe('');
  });
});

describe('manage: allowed file types', () => {
  it('an empty list allows every type', () => expect(isAllowedName('x.exe', [])).toBe(true));
  it('a list restricts by extension, with or without a dot', () => {
    expect(isAllowedName('x.JPG', ['jpg', '.png'])).toBe(true);
    expect(isAllowedName('x.png', ['jpg', '.png'])).toBe(true);
    expect(isAllowedName('x.mp4', ['jpg', 'png'])).toBe(false);
    expect(isAllowedName('noext', ['jpg'])).toBe(false);
  });
});

describe('manage: keys', () => {
  it('accepts files directly inside a known folder only', () => {
    expect(parseKey('Automation-Folder/Linkedin/a.png')).toEqual({ folder: 'Linkedin', name: 'a.png' });
    expect(parseKey('Automation-Folder/Linkedin/')).toBeNull();
    expect(parseKey('Automation-Folder/Linkedin/sub/a.png')).toBeNull();
    expect(parseKey('Automation-Folder/Other/a.png')).toBeNull();
    expect(parseKey('Automation-Folder/a.png')).toBeNull();
    expect(parseKey('Elsewhere/Linkedin/a.png')).toBeNull();
    expect(parseKey('Automation-Folder/Linkedin/..')).toBeNull();
  });
  it('limits and formatting', () => {
    expect(MAX_FILE_BYTES).toBe(5 * 1024 ** 3);
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
  });
});
