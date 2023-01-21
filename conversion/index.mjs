import fs from 'node:fs/promises';
import { cmd } from './utils.mjs';

// setup
await cmd('npm i fast-glob -D');

// copy editor config
await fs.cp('./conversion/.editorconfig', './.editorconfig', { recursive: true });

// copy goog
await fs.cp('./conversion/goog', './lib/goog', { recursive: true });

// convert source code to ES6
const { toEs6 } = await import('./toEs6.mjs');
await toEs6('lib/**/*.js');

// Update build script to allow ES6 input
const build = await fs.readFile('build/build.py', 'utf8');
const opts = 'common_closure_opts = [\n';
build.replace(opts, opts + `    '--language_in', 'UNSTABLE',\n`);
await fs.writeFile('build/build.py', build);

// teardown
await cmd('npm uninstall fast-glob -D');
