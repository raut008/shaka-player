import { setup } from './setup.mjs';
// import { teardown } from './teardown.mjs';
import { cmd } from './utils.mjs';

// setup
await setup();

// convert source code to ES6
const { toEs6 } = await import('./toEs6.mjs');
await toEs6('./lib/**/*.js');
await cmd(`npx eslint ./lib/**/*.js --fix --ignore-pattern=lib/goog/** --rule 'require-jsdoc: [off]'`);

// teardown
// await teardown();
