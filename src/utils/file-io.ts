import { readFile, writeFile } from 'node:fs/promises';

export async function writeTextFile(
  filePath: string,
  contents: string | ArrayBuffer,
): Promise<void> {
  await writeFile(
    filePath,
    contents instanceof ArrayBuffer ? Buffer.from(contents) : contents,
  );
}

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

export async function readTextFilePrefix(
  filePath: string,
  maxBytes: number,
): Promise<string> {
  const contents = await readFile(filePath);
  return contents.subarray(0, maxBytes).toString('utf8');
}
