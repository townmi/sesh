import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const results: T[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;
      try {
        results.push(JSON.parse(line) as T);
      } catch {
        process.stderr.write(`warning: skipping malformed JSONL at line ${i + 1}\n`);
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeJsonl<T>(filePath: string, items: T[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const lines = items.map((item) => JSON.stringify(item)).join('\n');
  const content = items.length > 0 ? lines + '\n' : '';
  await atomicWrite(filePath, content);
}

export async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, filePath);
}
