import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import renameMap from './rename-map.json' with { type: 'json' };

const requiredRequirements = new Set(['ACC-01', 'ACC-02', 'ACC-03', 'ACC-04']);
const requiredSources = ['global', 'npx', 'marketplace'];
const requiredStates = ['unverified', 'dismissed', 'verified'];
const allowedHttpsUrls = new Set([
  'https://registry.npmjs.org/@shipwithai/cumpa/-/cumpa-1.5.0.tgz',
  'https://github.com/Ship-With-AI/skills.git',
]);
const hostFields = ['platform', 'arch', 'osRelease', 'node', 'npm', 'git', 'playwright', 'browser'];
const observedRestoreLinkageFinding = Object.freeze({
  observed: true,
  path: 'public-global',
  window: 'post-restore',
  description: 'The hosted flow reported a successful Restore while installation status remained unverified and the in-product modal reached no terminal state.',
  regenerationNote: 'The report-only regeneration did not reproduce this observation because the single authorized Restore sign-in was already consumed.',
});

function fail(message) {
  throw new Error(`acceptance evidence: ${message}`);
}

function blockedRow(row) {
  if (row.status !== 'blocked') return;
  if (typeof row.reason !== 'string' || row.reason.length === 0) fail('blocked row requires a named reason');
  if (row.substituted !== false) fail('blocked row requires substituted: false');
}

function supportRows(row) {
  return Array.isArray(row.supportStates) ? row.supportStates : [];
}

export function deriveAcceptanceStatus(rows) {
  if (!Array.isArray(rows)) fail('rows must be an array');
  const requirements = new Set(rows.map((row) => row?.requirement));
  if (requirements.size !== requiredRequirements.size || [...requiredRequirements].some((requirement) => !requirements.has(requirement))) {
    fail('requirement coverage must include ACC-01 through ACC-04');
  }
  for (const row of rows) {
    if (!row || !['passed', 'blocked', 'partially-blocked'].includes(row.status)) fail('row status must be passed, blocked, or partially-blocked');
    if (row.status === 'partially-blocked' && row.requirement !== 'ACC-04') fail('only ACC-04 may be partially blocked');
    blockedRow(row);
    for (const nested of supportRows(row)) {
      if (!nested || !['passed', 'blocked'].includes(nested.status)) fail('support-state row status must be passed or blocked');
      blockedRow(nested);
    }
  }
  const acc04 = rows.find((row) => row.requirement === 'ACC-04');
  const states = supportRows(acc04);
  for (const source of requiredSources) {
    const sourceRows = states.filter((row) => row.installSource === source);
    if (sourceRows.length === 0) fail(`ACC-04 support-state rows missing for ${source}`);
    for (const state of requiredStates) {
      if (!sourceRows.some((row) => row.state === state)) return 'partially-blocked';
    }
  }
  return rows.some((row) => row.status !== 'passed' || supportRows(row).some((nested) => nested.status === 'blocked'))
    ? 'partially-blocked'
    : 'passed';
}

function isAbsoluteFilesystemPath(value) {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\(?:\?\\)?/u.test(value);
}

function hasCredentialShape(value) {
  return /(?:^|[^A-Za-z0-9_-])(?:gh[pousr]_[A-Za-z0-9_-]{20,}|(?:sk|pk|api)[_-][A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16})(?:$|[^A-Za-z0-9_-])/u.test(value)
    || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(value);
}

function hasInstallationIdShape(value) {
  return /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?:$|[^A-Za-z0-9_-])/u.test(value);
}

export function assertNoPrivateValues(record, extraForbiddenValues = []) {
  const serialized = JSON.stringify(record);
  const inspect = (value) => {
    if (typeof value === 'string') {
      if (isAbsoluteFilesystemPath(value)) fail('absolute private path found');
      if (hasCredentialShape(value)) fail('credential shaped value found');
      if (hasInstallationIdShape(value)) fail('installation id shaped value found');
      for (const url of value.match(/https:\/\/[^"\s]+/gu) ?? []) {
        if (!allowedHttpsUrls.has(url.replace(/[),.]+$/u, ''))) fail('unapproved https url found');
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if (/(?:credential|token|secret|origin|email)/iu.test(key)) fail('private key name found');
        inspect(nested);
      }
    }
  };
  inspect(record);
  for (const value of extraForbiddenValues) {
    if (typeof value === 'string' && value.length > 0 && serialized.includes(value)) fail('supplied forbidden value found');
  }
}

function exactIdentity(identity) {
  const required = ['tarballUrl', 'byteLength', 'sha256', 'npmShasumSha1', 'npmIntegritySha512'];
  if (!identity || required.some((key) => identity[key] === undefined)) fail('artifact identity is incomplete');
  return Object.freeze({
    tarballUrl: identity.tarballUrl,
    byteLength: identity.byteLength,
    sha256: identity.sha256,
    npmShasumSha1: identity.npmShasumSha1,
    npmIntegritySha512: identity.npmIntegritySha512,
  });
}

function sharedIdentity(path) {
  return path.sharedSupportIdentity?.shared === true || path.sharedSupportIdentity === true;
}

function limitationText(paths, restoreFinding) {
  const limitations = [
    'Local process isolation is not fresh-machine proof.',
    'One macOS host platform and one browser were exercised; no operating-system or browser compatibility matrix is claimed.',
    'OMP is the only agent runtime exercised; Claude Code, Codex, and Pi remain unexercised and the Phase 6 four-agent waiver remains intact.',
    'The Phase 4 and Phase 5 local-archive acceptance record is separate and unchanged.',
    'The local-archive path requires operator-held custody inputs and the protected CUMPA_RELEASE_SUPPORT_SERVICE_URL; its full execution was not available.',
  ];
  if (paths.some(sharedIdentity)) limitations.push('One shared voluntary-support identity was used across all three installation paths; three distinct identities would have required three protected sign-ins. This operator-confirmed narrowing left npm cache, npm configuration, install prefix, browser profile state, checkout separation, and sanitized PATH isolated per path.');
  if (paths.some((path) => path.providerAuthenticationReused)) limitations.push('The isolated OMP profile reused a temporary read-only copy of the operator provider credential and was not independently authenticated.');
  if (restoreFinding) limitations.push('The public-global Restore linkage finding was observed and remains a product defect outside Phase 7 scope under D-09.');
  for (const reason of new Set(paths.flatMap((path) => supportRows(path).filter((state) => state.status === 'blocked').map((state) => state.reason)).filter(Boolean))) limitations.push(`Blocked support-state reason: ${reason}.`);
  return limitations;
}

function completeInstallProof(proof, identity) {
  return proof?.packageLabel === '@shipwithai/cumpa@1.5.0'
    && proof.resolvedTarball === identity.tarballUrl
    && proof.resolvedIntegrity === identity.npmIntegritySha512
    && proof.resolvedVersion === '1.5.0'
    && proof.binaryContainedInIsolatedPrefix === true
    && proof.npmInstallAttempts >= 1;
}

function completeBrowserReview(evidence) {
  return evidence?.assetGraph?.assets === true
    && evidence.assetGraph.workers === true
    && evidence.assetGraph.codicon === true
    && evidence.reviewExport?.relaunch === true
    && evidence.reviewExport.canonicalV2 === true
    && evidence.reviewExport.isolatedDrafts === true
    && evidence.reviewExport.reExport === 'exported'
    && evidence.reviewExport.exactPatch?.canonicalV3 === true
    && evidence.reviewExport.exactPatch.grounded === true
    && evidence.finish?.finish === true;
}

function completeMarketplaceReview(evidence) {
  return evidence?.collection === 'ship-with-ai'
    && evidence.lifecycle?.terminalExit === 0
    && evidence.canonical?.nonEmpty === true
    && evidence.canonical.parseable === true
    && evidence.canonical.kind === `${renameMap.kindPrefix}/export`
    && evidence.canonical.summaryMatchesBrowser === true
    && evidence.canonical.commentMatchesBrowser === true;
}

function installationOutcome(path, identity) {
  if (completeInstallProof(path.installProof, identity)
    && (completeBrowserReview(path.evidence) || path.installSource === 'marketplace' && completeMarketplaceReview(path.evidence))) {
    return { status: 'passed' };
  }
  return {
    status: 'blocked',
    reason: path.reason && path.reason !== 'live-entitlement-unavailable' ? path.reason : 'install-review-evidence-incomplete',
    substituted: false,
  };
}

function normalizeRestoreFinding(finding) {
  if (!finding) return;
  if (!finding || finding.observed !== true || finding.path !== 'public-global' || finding.window !== 'post-restore'
    || typeof finding.description !== 'string' || finding.description.length === 0
    || typeof finding.regenerationNote !== 'string' || finding.regenerationNote.length === 0) {
    fail('restore linkage finding is invalid');
  }
  return {
    observed: true,
    path: 'public-global',
    window: 'post-restore',
    description: finding.description,
    regenerationNote: finding.regenerationNote,
  };
}

export function buildAcceptanceEvidence(inputs) {
  const identity = exactIdentity(inputs?.artifactIdentity);
  const paths = inputs?.paths;
  if (!Array.isArray(paths) || paths.length !== 3) fail('three installation paths are required');
  const sources = new Set(paths.map((path) => path.installSource));
  if (sources.size !== 3 || requiredSources.some((source) => !sources.has(source))) fail('global, npx, and marketplace paths are required');
  for (const path of paths) {
    if (path?.installProof?.resolvedIntegrity !== undefined && path.installProof.resolvedIntegrity !== identity.npmIntegritySha512) fail('install proof integrity differs from pinned identity');
    for (const state of supportRows(path)) blockedRow(state);
  }
  const installations = paths.map((path) => {
    const outcome = installationOutcome(path, identity);
    if (outcome.status === 'blocked') return { ...path, ...outcome };
    const { reason, substituted, ...installation } = path;
    return { ...installation, ...outcome };
  });
  const allStates = installations.flatMap((path) => supportRows(path));
  const blockedStates = allStates.filter((state) => state.status === 'blocked');
  const requirements = [
    ...installations.map((path) => ({ requirement: path.requirement, status: path.status, installSource: path.installSource, ...(path.status === 'blocked' ? { reason: path.reason, substituted: false } : {}) })),
    { requirement: 'ACC-04', status: blockedStates.length > 0 ? 'partially-blocked' : 'passed', supportStates: allStates },
  ];
  const status = deriveAcceptanceStatus(requirements);
  const restoreFinding = normalizeRestoreFinding(inputs.restoreReportedCompleteWithoutLinkage);
  const record = {
    kind: `${renameMap.kindPrefix}.public-artifact-acceptance/v1`,
    status,
    acceptedAt: inputs.acceptedAt,
    host: inputs.host,
    isolationBoundary: {
      type: 'isolated-local-environments',
      freshMachine: false,
      ranOutsideCheckout: true,
      preservedUserState: true,
      isolatedDimensions: ['npm-cache', 'npm-configuration', 'install-prefix', 'browser-profile-state', 'checkout-separation', 'sanitized-path'],
      sharedSupportHome: installations.some(sharedIdentity),
    },
    artifactIdentity: identity,
    marketplaceIdentity: inputs.marketplaceIdentity,
    requirements,
    installations,
    ...(restoreFinding ? { restoreReportedCompleteWithoutLinkage: restoreFinding } : {}),
    localArchivePrerequisite: inputs.localArchivePrerequisite === true,
    limitations: limitationText(installations, restoreFinding),
  };
  assertNoPrivateValues(record, inputs.extraForbiddenValues ?? []);
  return record;
}

function normalizedSource(path) {
  return path === 'public-global' ? 'global' : path === 'public-npx' ? 'npx' : path;
}

function expectedRequirement(source) {
  return source === 'global' ? 'ACC-01' : source === 'npx' ? 'ACC-02' : 'ACC-03';
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('input report is not valid JSON');
  }
}

function validateHost(host) {
  if (!host || typeof host !== 'object' || hostFields.some((field) => typeof host[field] !== 'string' || host[field].length === 0)) fail('report host facts are incomplete');
}

function validateReport(report) {
  if (!report || typeof report !== 'object') fail('input report must be an object');
  const source = normalizedSource(report.path);
  if (!requiredSources.includes(source)) fail('report has an unsupported installation path');
  if (report.requirement !== expectedRequirement(source)) fail('report requirement does not match installation path');
  if (!['pre-restore', 'post-restore'].includes(report.window)) fail('report has an unsupported support-state window');
  if (report.host !== undefined) validateHost(report.host);
  if (!report.installProof || typeof report.installProof !== 'object') fail('report install proof is required');
  if (!report.sharedSupportIdentity || typeof report.sharedSupportIdentity !== 'object') fail('report shared support identity is required');
  for (const field of ['shared', 'restoreCompleted', 'restoreObservedFromSharedIdentity']) {
    if (typeof report.sharedSupportIdentity[field] !== 'boolean') fail('report shared support identity is incomplete');
  }
  if (!report.sourceControlUnchanged || typeof report.sourceControlUnchanged !== 'object' || typeof report.sourceControlUnchanged.asserted !== 'boolean' || !Array.isArray(report.sourceControlUnchanged.scenarios)) fail('report source-control observations are required');
  for (const scenario of report.sourceControlUnchanged.scenarios) {
    if (!scenario || typeof scenario.name !== 'string' || typeof scenario.unchanged !== 'boolean') fail('report source-control scenario is invalid');
  }
  if (!report.cleanup || typeof report.cleanup !== 'object' || typeof report.cleanup.removedOwnedRoots !== 'boolean') fail('report cleanup observations are required');
  if (!Array.isArray(report.supportStates)) fail('report support-state observations are required');
  for (const state of report.supportStates) {
    if (!state || !requiredStates.includes(state.state) || state.window !== report.window || state.observed !== true || !['passed', 'blocked'].includes(state.status)) fail('report support-state observation is invalid');
    blockedRow(state);
  }
  if (report.status !== undefined && !['passed', 'blocked'].includes(report.status)) fail('report status is invalid');
  if (report.status === 'blocked') blockedRow(report);
  if (report.restoreReportedCompleteWithoutLinkage !== undefined) {
    if (source !== 'global') fail('restore linkage observation is only valid for public-global');
    normalizeRestoreFinding(report.restoreReportedCompleteWithoutLinkage);
  }
  return source;
}

function aggregateSourceControl(observation) {
  return observation.asserted === true && observation.scenarios.length > 0 && observation.scenarios.every((scenario) => scenario.unchanged === true);
}

function syntheticState(source, state) {
  return { installSource: source, state, status: 'blocked', reason: 'state-not-observed', substituted: false, observed: false };
}

function missingPath(source, requirement) {
  const reason = source === 'marketplace' ? 'marketplace-run-not-performed' : 'public-run-not-performed';
  return {
    installSource: source,
    requirement,
    status: 'blocked',
    reason,
    substituted: false,
    supportStates: requiredStates.map((state) => syntheticState(source, state)),
    sourceControlUnchanged: false,
    cleanup: { removedOwnedRoots: false },
  };
}

function mergeReports(reports, source, requirement, identity) {
  if (reports.length === 0) return missingPath(source, requirement);
  const [first] = reports;
  for (const report of reports.slice(1)) {
    if (!isDeepStrictEqual(report.installProof, first.installProof)) fail(`conflicting install proof for ${source}`);
    if (!isDeepStrictEqual(report.sharedSupportIdentity, first.sharedSupportIdentity)) fail(`conflicting shared support identity for ${source}`);
  }
  const observed = new Map();
  for (const report of reports) {
    for (const state of report.supportStates) {
      const existing = observed.get(state.state);
      if (existing && !isDeepStrictEqual(existing, state)) fail(`conflicting support-state observation for ${source}/${state.state}`);
      observed.set(state.state, state);
    }
  }
  const blockedReport = reports.find((report) => report.status === 'blocked');
  const supportStates = requiredStates.map((state) => observed.has(state)
    ? { ...observed.get(state), installSource: source }
    : syntheticState(source, state));
  return {
    installSource: source,
    requirement,
    status: blockedReport ? 'blocked' : 'passed',
    ...(blockedReport ? { reason: blockedReport.reason, substituted: false } : {}),
    installProof: first.installProof,
    sharedSupportIdentity: first.sharedSupportIdentity,
    sourceControlUnchanged: reports.every((report) => aggregateSourceControl(report.sourceControlUnchanged)),
    supportStates,
    cleanup: { removedOwnedRoots: reports.every((report) => report.cleanup?.removedOwnedRoots === true) },
    ...(source === 'global' && reports.some((report) => report.restoreReportedCompleteWithoutLinkage) ? { restoreReportedCompleteWithoutLinkage: normalizeRestoreFinding(reports.find((report) => report.restoreReportedCompleteWithoutLinkage).restoreReportedCompleteWithoutLinkage) } : {}),
    evidence: source === 'marketplace'
      ? { collection: first.marketplace?.collection, lifecycle: first.lifecycle, canonical: first.canonical }
      : { assetGraph: first.assetGraph, reviewExport: first.reviewExport, finish: first.finish },
  };
}

const root = resolve(import.meta.dirname, '..');
// Read from the v1.5 milestone archive, not `.planning/phases/`: phase directories are
// deleted by GSD cleanup after a milestone closes, while the archive is their permanent home.
const releaseEvidencePath = join(root, '.planning/milestones/v1.5-phases/05-bootstrap-trusted-stable-publication/05-RELEASE-EVIDENCE.json');
const marketplaceEvidencePath = join(root, '.planning/milestones/v1.5-phases/06-independent-mit-marketplace-skill/06-PUBLICATION-EVIDENCE.json');

function readPinnedIdentity() {
  const releaseEvidence = JSON.parse(readFileSync(releaseEvidencePath, 'utf8'));
  return Object.freeze({
    tarballUrl: 'https://registry.npmjs.org/@shipwithai/cumpa/-/cumpa-1.5.0.tgz',
    byteLength: releaseEvidence.candidate.archive.byteLength,
    sha256: releaseEvidence.candidate.archive.sha256,
    npmShasumSha1: releaseEvidence.candidate.archive.npmShasumSha1,
    npmIntegritySha512: releaseEvidence.candidate.archive.npmIntegritySha512,
  });
}

function readMarketplaceIdentity() {
  const evidence = JSON.parse(readFileSync(marketplaceEvidencePath, 'utf8'));
  return {
    collectionVersion: evidence.collectionVersion.to,
    commit: evidence.candidateOid,
    skillDigest: evidence.reviewedFileHashes['skills/cumpa/SKILL.md'],
    repository: evidence.repository,
  };
}

/**
 * @param {{
 *   publicReportPaths?: string[];
 *   marketplaceReportPaths?: string[];
 *   outputPath: string;
 *   acceptedAt: string;
 *   extraForbiddenValues?: string[];
 * }} options
 */
export function writeAcceptanceEvidence({
  publicReportPaths = [],
  marketplaceReportPaths = [],
  outputPath,
  acceptedAt,
  extraForbiddenValues = [],
}) {
  if (!isAbsolute(outputPath)) fail('output path must be absolute');
  if (existsSync(outputPath)) fail('output path already exists');
  const identity = readPinnedIdentity();
  const allReports = [...publicReportPaths, ...marketplaceReportPaths].map(readJson);
  const hosts = allReports.filter((report) => report.host !== undefined).map((report) => report.host);
  if (hosts.length === 0) fail('reports must contain observed host facts');
  validateHost(hosts[0]);
  for (const host of hosts.slice(1)) {
    validateHost(host);
    if (!isDeepStrictEqual(host, hosts[0])) fail('reports contain disagreeing host facts');
  }
  const bySource = new Map(requiredSources.map((source) => [source, []]));
  for (const report of allReports) {
    const source = validateReport(report);
    bySource.get(source).push(report);
  }
  const paths = [
    mergeReports(bySource.get('global'), 'global', 'ACC-01', identity),
    mergeReports(bySource.get('npx'), 'npx', 'ACC-02', identity),
    mergeReports(bySource.get('marketplace'), 'marketplace', 'ACC-03', identity),
  ];
  const record = buildAcceptanceEvidence({
    acceptedAt,
    host: hosts[0],
    artifactIdentity: identity,
    marketplaceIdentity: readMarketplaceIdentity(),
    paths,
    restoreReportedCompleteWithoutLinkage: observedRestoreLinkageFinding,
    localArchivePrerequisite: true,
    extraForbiddenValues,
  });
  mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(outputPath), `.${basename(outputPath)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    linkSync(temporary, outputPath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return record;
}

function parseArguments(argv) {
  const options = { publicReportPaths: [], marketplaceReportPaths: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const [name, value] = [argv[index], argv[index + 1]];
    if (typeof value !== 'string' || value === '') fail('invalid writer arguments');
    if (name === '--public-report') options.publicReportPaths.push(value);
    else if (name === '--marketplace-report') options.marketplaceReportPaths.push(value);
    else if (name === '--output') options.outputPath = value;
    else if (name === '--accepted-at') options.acceptedAt = value;
    else fail('invalid writer arguments');
  }
  if (!options.outputPath || !options.acceptedAt) fail('output and accepted-at are required');
  return options;
}

if (import.meta.main) {
  try {
    process.stdout.write(`${JSON.stringify(writeAcceptanceEvidence(parseArguments(process.argv.slice(2))))}\n`);
  } catch {
    process.stderr.write('acceptance evidence writer failed\n');
    process.exitCode = 1;
  }
}
