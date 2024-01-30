import closureCompiler from 'google-closure-compiler';
const { compiler } = closureCompiler;

const comp = new compiler({
  // js: 'lib/**/*.js',
  language_in: 'UNSTABLE',
  compilation_level: 'ADVANCED',
  // dependency_mode: 'node',
  module_resolution: 'NODE',
  entry_point: 'lib/player.js',
});

const proc = comp.run((exitCode, stdOut, stdErr) => {
  console.log(exitCode, stdOut, stdErr);
});
