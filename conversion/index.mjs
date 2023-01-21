import { setup } from './setup.mjs';
// import { teardown } from './teardown.mjs';

// setup
await setup();

// convert source code to ES6
const { toEs6 } = await import('./toEs6.mjs');
await toEs6('lib/**/*.js');

// teardown
// await teardown();
