import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readJsonl, writeJsonl, atomicWrite } from '../../src/utils/fs.js';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('readJsonl', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `sesh-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads a valid JSONL file', async () => {
    const filePath = join(tmpDir, 'test.jsonl');
    await writeFile(filePath, '{"a":1}\n{"a":2}\n');
    const result = await readJsonl<{ a: number }>(filePath);
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('returns empty array for missing file', async () => {
    const result = await readJsonl(join(tmpDir, 'nonexistent.jsonl'));
    expect(result).toEqual([]);
  });

  it('skips empty lines', async () => {
    const filePath = join(tmpDir, 'test.jsonl');
    await writeFile(filePath, '{"a":1}\n\n{"a":2}\n');
    const result = await readJsonl<{ a: number }>(filePath);
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('skips malformed lines with warning', async () => {
    const filePath = join(tmpDir, 'test.jsonl');
    await writeFile(filePath, '{"a":1}\nnot-json\n{"a":2}\n');
    const result = await readJsonl<{ a: number }>(filePath);
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe('writeJsonl', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `sesh-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes objects as JSONL', async () => {
    const filePath = join(tmpDir, 'test.jsonl');
    await writeJsonl(filePath, [{ a: 1 }, { a: 2 }]);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('{"a":1}\n{"a":2}\n');
  });

  it('writes empty array as empty file', async () => {
    const filePath = join(tmpDir, 'test.jsonl');
    await writeJsonl(filePath, []);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('');
  });

  it('creates parent directories if needed', async () => {
    const filePath = join(tmpDir, 'sub', 'test.jsonl');
    await writeJsonl(filePath, [{ a: 1 }]);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('{"a":1}\n');
  });
});

describe('atomicWrite', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `sesh-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes content atomically', async () => {
    const filePath = join(tmpDir, 'test.jsonl');
    await atomicWrite(filePath, 'hello');
    const content = await readFile(filePath, 'utf-8');
    expect(content).toBe('hello');
  });
});
