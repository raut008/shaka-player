import glob from 'fast-glob';
import fs from 'node:fs/promises';
import path from 'node:path';

function camelToSnake(str) {
  return (str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
}

function relative(from, to) {
  const fromDir = path.dirname(from);
  const toDir = path.dirname(to);
  const fileName = path.basename(to);
  const relativePath = path.join(path.relative(fromDir, toDir), fileName);
  return /^\./.test(relativePath) ? relativePath : './' + relativePath;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function convertImport(file, txt, match, parts, name) {
  if (name === 'asserts') {
    name = 'assert';
  }

  let fileName = camelToSnake(name[0].toLowerCase() + name.slice(1)) + '.js';

  if (parts[0] === 'shaka') {
    parts.shift();
  }

  // special cases
  switch (name) {
    case 'Deprecate':
      parts.unshift('deprecate');
      break;

    case 'log':
      parts.unshift('debug');
      break;

    case 'Dil':
      fileName = 'lcevc_' + fileName;
      break;
  }

  parts.push(fileName);
  const importPath = relative(file, path.join('lib', ...parts));

  return txt.replace(match, `import {${name}} from '${importPath}'`);
}

function convertReferences(txt, module, name) {
  const safeModule = escapeRegExp(module);
  return txt
    // instantiation
    .replaceAll(`new ${module}`, `new ${name}`)
    // extends
    .replaceAll(`extends ${module}`, `extends ${name}`)
    // instanceof
    .replaceAll(`instanceof ${module}`, `instanceof ${name}`)
    // destructure
    .replace(new RegExp(`.*const ${name} = ${safeModule};\n+`, 'g'), '')
    // object reference
    .replace(new RegExp(`(?<!@event |'|{|{!)${safeModule}(\\.|\\))`, 'g'), `${name}$1`)
    // goog assert
    .replace(/goog\.asserts\.assert/g, 'assert');
}

function convertImports(file, txt) {
  const matches = Array.from(txt.matchAll(/goog\.require\('([^)]+)'\)/g));
  return matches.reduce((acc, item) => {
    const [match, module] = item;
    const parts = module.split('.');
    const name = parts.pop();

    acc = acc.replace(/goog\.require.*(\.[A-Z][a-zA-Z]+){2,}.*\n/, '');
    acc = convertImport(file, acc, match, parts, name);
    acc = convertReferences(acc, module, name);

    return acc;
  }, txt);
}

function convertExport(txt) {
  const matches = Array.from(txt.matchAll(/goog\.provide\('([^)]+)'\);\n+/g));
  return matches.reduce((acc, item) => {
    const [match, module] = item;
    const parts = module.split('.');
    const name = parts.pop();

    acc = acc.replaceAll(match, '');
    acc = acc.replace(new RegExp(`${escapeRegExp(module)}\\s*=\\s* class\\s*`), `export class ${name} `);
    acc = acc.replace(new RegExp(`${escapeRegExp(module)}\\s*=\\s*{`), `export const ${name} = {`);
    acc = convertReferences(acc, module, name);

    return acc;
  }, txt);
}

async function convert(file) {
  let txt = await fs.readFile(file, 'utf8');

  txt = convertExport(txt);
  txt = convertImports(file, txt);

  await fs.writeFile(file, txt);
}

export async function toEs6(pattern, options) {
  const processes = [];

  for await (const file of glob.stream(pattern, options)) {
    const process = convert(file);
    processes.push(process);
  }

  return await Promise.all(processes);
}
