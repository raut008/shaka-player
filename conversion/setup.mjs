import fs from 'node:fs/promises';
import { cmd, rewrite } from './utils.mjs';

export async function setup() {
  // setup
  await cmd('npm i fast-glob -D');

  // ignore the conversion folder
  await rewrite('.eslintignore', txt => {
    if (txt.includes('conversion')) {
      return txt;
    }
    txt + 'conversion/**/*\n';
  });

  // copy editor config
  await fs.cp('./conversion/.editorconfig', './.editorconfig', { recursive: true });

  // copy goog
  await fs.cp('./conversion/goog', './lib/goog', { recursive: true });

  // Update build script to allow ES6 input
  await rewrite('build/build.py', txt => {
    if (txt.includes('UNSTABLE')) {
      return txt;
    }

    const opts = 'common_closure_opts = [\n';
    return txt.replace(opts, opts + `    '--language_in', 'UNSTABLE',\n`);
  });

  // Update eslint
  await rewrite('.eslintrc.js', txt => {
    if (txt.includes('sourceType')) {
      return txt;
    }

    const parserOptions = `'ecmaVersion': 2017,\n`;
    return txt.replace(parserOptions, parserOptions + `    'sourceType': 'module',\n`);
  });
}
