#!/usr/bin/env node
/**
 * scripts/codegen.mjs
 *
 * Regenerate src/generated/*.ts from the nested blueberry-dictionary
 * submodule using blueberry-cli in the nested blueberry-compiler-eldin
 * submodule.
 *
 * Usage:
 *   npm run codegen
 *   npm run codegen:check
 *
 * Prerequisites:
 *   - Rust toolchain (cargo on PATH)
 *   - git submodules blueberry-dictionary and blueberry-compiler-eldin inited
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const DICTIONARY = resolve(REPO_ROOT, 'blueberry-dictionary/dictionary');
const COMPILER = resolve(REPO_ROOT, 'blueberry-compiler-eldin');
const OUTPUT = resolve(REPO_ROOT, 'src/generated');

function die(msg) {
  console.error(`codegen: ${msg}`);
  process.exit(1);
}

if (!existsSync(DICTIONARY)) {
  die(
    `dictionary not found at ${DICTIONARY}\n` +
      `Run: git submodule update --init blueberry-dictionary`,
  );
}
if (!existsSync(join(COMPILER, 'Cargo.toml'))) {
  die(
    `compiler not found at ${COMPILER}\n` +
      `Run: git submodule update --init blueberry-compiler-eldin`,
  );
}

console.log(`codegen: compiler   = ${COMPILER}`);
console.log(`codegen: dictionary = ${DICTIONARY}`);
console.log(`codegen: output     = ${OUTPUT}`);

const tmpRoot = mkdtempSync(join(tmpdir(), 'blueberry-codegen-'));

try {
  const cargo = spawnSync(
    'cargo',
    [
      'run',
      '--quiet',
      '-p',
      'blueberry-cli',
      '--',
      DICTIONARY,
      '--emit-typescript',
      '--output-dir',
      tmpRoot,
    ],
    {
      cwd: COMPILER,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
  if (cargo.status !== 0) {
    die(`cargo run exited with code ${cargo.status}`);
  }

  const generatedDir = join(tmpRoot, 'typescript');
  if (!existsSync(generatedDir)) {
    die(`expected ${generatedDir} after codegen, but it's missing`);
  }

  if (existsSync(OUTPUT)) {
    rmSync(OUTPUT, { recursive: true, force: true });
  }
  mkdirSync(OUTPUT, { recursive: true });

  const files = readdirSync(generatedDir).filter((f) => f.endsWith('.ts'));
  if (files.length === 0) {
    die(`no .ts files in ${generatedDir}`);
  }

  let rewritten = 0;
  for (const file of files) {
    const dest = join(OUTPUT, file);
    cpSync(join(generatedDir, file), dest);
    // ponytail: string-replace Eldin's hardcoded `blueberry-serde-ts` import
    // until the emitter grows a --runtime-import flag. Ceiling: atypical
    // quote/path forms are missed; upgrade by teaching Eldin the import path.
    const before = readFileSync(dest, 'utf8');
    const after = before.replace(
      /from ['"]blueberry-serde-ts['"]/g,
      "from '../runtime.js'",
    );
    if (after !== before) {
      writeFileSync(dest, after);
      rewritten += 1;
    }
  }

  if (rewritten === 0) {
    die(
      `no blueberry-serde-ts imports found to rewrite in ${OUTPUT} ` +
        `(Eldin emit may have changed)`,
    );
  }

  console.log(
    `codegen: wrote ${files.length} file(s) to ${OUTPUT} ` +
      `(rewrote imports in ${rewritten})`,
  );

  const prettier = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--no-install',
      'prettier',
      '--write',
      '--log-level',
      'warn',
      `${OUTPUT}/*.ts`,
    ],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );
  if (prettier.status !== 0) {
    console.warn(
      'codegen: prettier returned non-zero (generated files use ' +
        '/* prettier-ignore */, so this is usually fine)',
    );
  }

  console.log('codegen: done');
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
