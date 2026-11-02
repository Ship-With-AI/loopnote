import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { captureOmpProfileDigest, changedOmpProfileEntries } from '../helpers/omp-profile.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';

const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function temporaryHome(): string {
  const home = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-omp-digest-`));
  homes.push(home);
  return home;
}

describe('real OMP profile digest', () => {
  it('does not conflate unrelated XDG sibling changes with OMP contamination', () => {
    const home = temporaryHome();
    const sibling = join(home, '.local', 'share', 'unrelated', 'state');
    mkdirSync(join(sibling, '..'), { recursive: true });
    writeFileSync(sibling, 'before');
    const before = captureOmpProfileDigest(home);
    writeFileSync(sibling, 'after');

    expect(captureOmpProfileDigest(home)).toEqual(before);
  });

it('ignores volatile live-agent databases and sessions', () => {
  const home = temporaryHome();
  const agent = join(home, '.omp', 'agent');
  mkdirSync(join(agent, 'sessions'), { recursive: true });
  writeFileSync(join(agent, 'agent.db'), 'before');
  writeFileSync(join(agent, 'history.db'), 'before');
  writeFileSync(join(agent, 'models.db'), 'before');
  writeFileSync(join(agent, 'sessions', 'live.json'), 'before');
  const before = captureOmpProfileDigest(home);

  writeFileSync(join(agent, 'agent.db'), 'after');
  writeFileSync(join(agent, 'agent.db-wal'), 'after');
  writeFileSync(join(agent, 'history.db'), 'after');
  writeFileSync(join(agent, 'models.db-shm'), 'after');
  writeFileSync(join(agent, 'sessions', 'live.json'), 'after');

  expect(captureOmpProfileDigest(home)).toEqual(before);
});

it('detects an OMP agent configuration change', () => {
  const home = temporaryHome();
  const configuration = join(home, '.omp', 'agent', 'config.yml');
  mkdirSync(join(configuration, '..'), { recursive: true });
  writeFileSync(configuration, 'before');
  const before = captureOmpProfileDigest(home);
  writeFileSync(configuration, 'after');

  expect(changedOmpProfileEntries(before, captureOmpProfileDigest(home))).toEqual(['agentConfiguration:.']);
});

  it('detects a change to an OMP-owned XDG directory', () => {
    const home = temporaryHome();
    const state = join(home, '.local', 'state', 'omp', 'state.json');
    mkdirSync(join(state, '..'), { recursive: true });
    writeFileSync(state, 'before');
    const before = captureOmpProfileDigest(home);
    writeFileSync(state, 'after');

    expect(captureOmpProfileDigest(home)).not.toEqual(before);
  });

  it('attributes changed OMP state to its guarded path', () => {
    const home = temporaryHome();
    const state = join(home, '.local', 'state', 'omp', 'state.json');
    mkdirSync(join(state, '..'), { recursive: true });
    writeFileSync(state, 'before');
    const before = captureOmpProfileDigest(home);
    writeFileSync(state, 'after');

    expect(changedOmpProfileEntries(before, captureOmpProfileDigest(home))).toEqual(['xdgState:state.json']);
  });
});
