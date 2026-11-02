import { RENAME_MAP } from './product-identity.js';

export type LaunchErrorKind =
  | 'bare-repository'
  | 'empty-repository'
  | 'endpoint-unavailable'
  | 'equal-commits'
  | 'git-missing'
  | 'git-unsupported'
  | 'multiple-merge-bases'
  | 'not-worktree'
  | 'object-unavailable'
  | 'invalid-pathspec'
  | 'non-ancestor-range'
  | 'unrelated-histories';

export type SelectionRole = 'base' | 'head';

export interface ExitRecovery {
  readonly kind: 'exit';
}

export interface PickerRecovery {
  readonly kind: 'return';
  readonly role: SelectionRole;
  readonly preserve: SelectionRole;
  readonly focus: 'previous-row' | 'search-input';
}

export type LaunchRecovery = ExitRecovery | PickerRecovery;

export interface LaunchErrorOptions extends ErrorOptions {
  readonly recovery: LaunchRecovery;
}

export class LaunchError extends Error {
  readonly kind: LaunchErrorKind;
  readonly recovery: LaunchRecovery;

  constructor(
    kind: LaunchErrorKind,
    message: string,
    options: LaunchErrorOptions,
  ) {
    super(message, options);
    this.name = 'LaunchError';
    this.kind = kind;
    this.recovery = options.recovery;
  }
}

export function isLaunchError(error: unknown): error is LaunchError {
  if (error instanceof LaunchError) {
    return true;
  }
  if (
    !(error instanceof Error) ||
    error.name !== 'LaunchError' ||
    typeof (error as Partial<LaunchError>).kind !== 'string'
  ) {
    return false;
  }
  const recovery = (error as Partial<LaunchError>).recovery;
  return (
    recovery !== undefined &&
    (recovery.kind === 'exit' || recovery.kind === 'return')
  );
}

export const FATAL_LAUNCH_MESSAGES = Object.freeze({
  gitMissing:
    `Git is required but was not found. Install Git, then run ${RENAME_MAP.displayName} again.`,
  gitUnsupported:
    `Git 2.43.0 or newer with the required machine protocols is required. Upgrade Git, then run ${RENAME_MAP.displayName} again.`,
  notWorktree:
    `This directory is not inside a Git worktree. Run ${RENAME_MAP.displayName} from a Git worktree.`,
  bareRepository:
    `Bare repositories are not supported. Run ${RENAME_MAP.displayName} from a non-bare Git worktree.`,
  emptyRepository:
    `This repository has no commits yet. Create the first commit, then run ${RENAME_MAP.displayName} again.`,
});

export const HEAD_RECOVERY = Object.freeze({
  kind: 'return',
  role: 'head',
  preserve: 'base',
  focus: 'previous-row',
} as const);

export const BASE_RECOVERY = Object.freeze({
  kind: 'return',
  role: 'base',
  preserve: 'head',
  focus: 'previous-row',
} as const);
