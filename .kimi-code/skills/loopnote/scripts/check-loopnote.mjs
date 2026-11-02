import { spawnSync } from 'node:child_process';

let acceptedVersion;

try {
  const result = spawnSync('loopnote', ['--version'], {
    encoding: 'utf8',
    shell: false,
    timeout: 10_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4_096,
  });

  if (!result.error && !result.signal && result.status === 0) {
    const version = result.stdout.replace(/\r?\n$/, '');
    const match = /^2\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    if (match && match[0] === version) {
      acceptedVersion = version;
    }
  }
} catch {
  // Probe exceptions use the same recovery path without exposing process details.
}

if (acceptedVersion === undefined) {
  process.stderr.write(
    'npm install --global @shipwithai/loopnote@2.0.0\n' +
      'Requires Node.js 24+ and Git 2.43.0+.\n',
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`${acceptedVersion}\n`);
}
