import { open, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  const json = JSON.stringify(data, null, 2);
  // write tmp -> fsync -> rename to guarantee atomicity within same dir/filesystem
  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(json, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmpPath, targetPath);
}
