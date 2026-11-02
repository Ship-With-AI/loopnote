export const DIRTY_ROW_LABEL = 'Dirty — committed HEAD only';
export const DIRTY_EXPLANATION =
  'This worktree has uncommitted changes. This comparison reviews its committed HEAD only — use --worktree, --staged, or --unstaged to review the uncommitted changes directly.';
export const PENDING_ROW_LABEL = 'Checking worktree state…';
export const UNAVAILABLE_WORKTREE_REASON =
  'Unavailable — this registered worktree cannot be resolved. Choose another entry or repair it with Git.';

export type CandidateAvailability =
  | 'clean'
  | 'dirty'
  | 'pending'
  | 'unavailable';

interface SourceCandidateBase {
  readonly id: string;
  readonly label: string;
}

export interface BranchCandidate extends SourceCandidateBase {
  readonly commitOid: string;
  readonly shortOid: string;
  readonly kind: 'branch';
  readonly refName: string;
}

export interface WorktreeCandidate extends SourceCandidateBase {
  readonly kind: 'worktree';
  readonly commitOid?: string;
  readonly shortOid?: string;
  readonly path: string;
  readonly branchRef?: string;
  readonly detached: boolean;
  readonly availability: CandidateAvailability;
  readonly unavailableReason?: string;
  readonly isCurrentCheckout: boolean;
}

export type SourceCandidate = BranchCandidate | WorktreeCandidate;

export interface OrderedSources {
  readonly base: SourceCandidate;
  readonly head: SourceCandidate;
}
