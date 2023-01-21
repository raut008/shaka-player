import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

export function cmd(cmd, args, options) {
  const opts = Object.assign({
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: true,
  }, options);

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, opts);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      }
      else {
        reject(new Error(`Exit with error code: ${code}`));
      }
    });
  });
}

export async function rewrite(file, transform) {
  const txt = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, await transform(txt));
}
