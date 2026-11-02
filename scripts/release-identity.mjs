import { readFileSync } from 'node:fs';
import renameMap from './rename-map.json' with { type: 'json' };

function fail(message) {
  throw new Error(message);
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const name = manifest.name;

if (name !== renameMap.npmPackage) fail('invalid package name');

export const version = manifest.version;

if (typeof version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) fail('invalid package version');

export const packageLabel = `${name}@${version}`;
export const archiveBasename = `shipwithai-${renameMap.slug}-${version}.tgz`;
export const registryTarballUrl = `https://registry.npmjs.org/${renameMap.npmPackage}/-/${renameMap.slug}-${version}.tgz`;
export const packumentUrl = `https://registry.npmjs.org/${renameMap.npmPackage.replace('/', '%2f')}/${version}`;
export const provenanceSubject = `pkg:npm/%40shipwithai/${renameMap.slug}@${version}`;
export const bootstrapVersion = `${version}-bootstrap.0`;

function main(argv) {
  if (argv.length !== 1) fail('invalid release identity command');

  const [argument] = argv;
  if (argument === '--github-env') {
    process.stdout.write(`${renameMap.envPrefix}RELEASE_VERSION=${version}\n${renameMap.envPrefix}RELEASE_ARCHIVE_BASENAME=${archiveBasename}\n`);
    return;
  }
  if (argument === '--github-output') {
    process.stdout.write(`version=${version}\narchive-basename=${archiveBasename}\n`);
    return;
  }

  const fields = { version, packageLabel, archiveBasename, registryTarballUrl, packumentUrl, provenanceSubject, bootstrapVersion };
  if (Object.hasOwn(fields, argument)) {
    process.stdout.write(fields[argument]);
    return;
  }
  fail('invalid release identity command');
}

if (import.meta.main) main(process.argv.slice(2));
