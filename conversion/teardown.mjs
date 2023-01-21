import fs from 'node:fs/promises';
import { cmd } from './utils.mjs';

export async function teardown() {
  await fs.rm('./.editorconfig');
  await cmd('git restore package.json package-lock.json .eslintignore');
}
