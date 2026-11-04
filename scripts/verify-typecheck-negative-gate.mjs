import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const targetPath = resolve(repositoryRoot, 'src/web/components/PathDisplay.vue');
const originalBinding = ':display="file.oldPath.display"';
const mutatedBinding = ':display="42"';

function fail(message) {
  throw new Error(`Typecheck negative-gate proof failed: ${message}`);
}

function runTypecheck() {
  try {
    return execFileSync('npx', ['vue-tsc', '--noEmit', '--project', 'tsconfig.web.json'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
}

const original = await readFile(targetPath, 'utf8');
if (!original.includes(originalBinding)) fail(`expected binding not found in PathDisplay.vue: ${originalBinding}`);

try {
  await writeFile(targetPath, original.replace(originalBinding, mutatedBinding), 'utf8');
  const mutatedOutput = runTypecheck();
  const mutatedPathDisplayLines = mutatedOutput.split('\n').filter((line) => line.includes('PathDisplay.vue'));
  if (!mutatedPathDisplayLines.some((line) => line.includes('TS2322'))) {
    fail('injecting a numeric literal into the display prop did not produce a PathDisplay.vue TS2322 error — the typecheck gate is a no-op');
  }
} finally {
  await writeFile(targetPath, original, 'utf8');
}

const revertedOutput = runTypecheck();
const revertedPathDisplayLines = revertedOutput.split('\n').filter((line) => line.includes('PathDisplay.vue'));
if (revertedPathDisplayLines.length > 0) {
  fail(`reverting PathDisplay.vue did not return to zero errors — ${revertedPathDisplayLines.length} line(s) remain: ${revertedPathDisplayLines.join(' | ')}`);
}

console.log('Typecheck negative-gate verified: injected TS2322 is caught, and the revert returns PathDisplay.vue to zero errors.');
