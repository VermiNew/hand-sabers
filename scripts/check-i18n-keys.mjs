import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { contestTranslations } from '../src/i18n/contest.ts';

const projectRoot = process.cwd();

function mergeTranslations(base, overrides) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    if (
      current && value
      && typeof current === 'object' && !Array.isArray(current)
      && typeof value === 'object' && !Array.isArray(value)
    ) {
      merged[key] = mergeTranslations(current, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function flattenKeys(tree, prefix = '', output = new Set()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenKeys(value, path, output);
    else output.add(path);
  }
  return output;
}

function collectFiles(directory, pattern, output = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(fullPath, pattern, output);
    else if (pattern.test(entry.name)) output.push(fullPath);
  }
  return output;
}

function recordUsage(usages, key, filePath) {
  let files = usages.get(key);
  if (!files) {
    files = new Set();
    usages.set(key, files);
  }
  files.add(relative(projectRoot, filePath).replaceAll('\\', '/'));
}

function collectTypeScriptUsages(usages) {
  for (const filePath of collectFiles(join(projectRoot, 'src'), /\.ts$/)) {
    const source = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
        const argument = node.arguments[0];
        if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
          recordUsage(usages, argument.text, filePath);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

function collectHtmlUsages(usages) {
  const htmlFiles = readdirSync(projectRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => join(projectRoot, entry.name));
  const attributePattern = /\bdata-i18n(?:-placeholder|-title|-aria-label)?\s*=\s*(["'])([^"']+)\1/g;

  for (const filePath of htmlFiles) {
    const source = readFileSync(filePath, 'utf8');
    for (const match of source.matchAll(attributePattern)) recordUsage(usages, match[2], filePath);
  }
}

const plBase = JSON.parse(readFileSync(join(projectRoot, 'src/i18n/pl.json'), 'utf8'));
const enBase = JSON.parse(readFileSync(join(projectRoot, 'src/i18n/en.json'), 'utf8'));
const plKeys = flattenKeys(mergeTranslations(plBase, contestTranslations.pl));
const enKeys = flattenKeys(mergeTranslations(enBase, contestTranslations.en));
const usages = new Map();
collectTypeScriptUsages(usages);
collectHtmlUsages(usages);

const onlyPolish = [...plKeys].filter(key => !enKeys.has(key)).sort();
const onlyEnglish = [...enKeys].filter(key => !plKeys.has(key)).sort();
const missingUsages = [...usages.keys()]
  .filter(key => !plKeys.has(key) || !enKeys.has(key))
  .sort();

let failed = false;
function report(title, keys, describe) {
  if (!keys.length) return;
  failed = true;
  console.error(`\n✗ ${title}`);
  for (const key of keys) console.error(`  ${key}${describe(key)}`);
}

report('Klucze dostępne tylko po polsku:', onlyPolish, () => '');
report('Klucze dostępne tylko po angielsku:', onlyEnglish, () => '');
report('Użyte statyczne klucze bez kompletnego tłumaczenia:', missingUsages, key => {
  const files = [...(usages.get(key) ?? [])].join(', ');
  return files ? ` (${files})` : '';
});

if (!failed) {
  console.log(`✓ i18n: ${plKeys.size} spójnych kluczy, ${usages.size} statycznych użyć`);
}

process.exit(failed ? 1 : 0);
