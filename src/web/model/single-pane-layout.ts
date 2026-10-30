import type {
  Availability,
  ChangedFileStatusKind,
} from '../../contracts/comparison.js';
import type { DiffSide } from '../monaco/line-mapping.js';

const singlePaneStatusSides: Readonly<
  Partial<Record<ChangedFileStatusKind, DiffSide>>
> = Object.freeze({
  added: 'head',
  deleted: 'base',
  'type-changed': 'head',
});

/**
 * D-05/D-08: a file renders single-pane only when its status kind is one of
 * `added`/`deleted`/`type-changed` AND its content is reviewable text.
 * Returns the `DiffSide` anchoring its comments, or `undefined` when the
 * file stays side-by-side (or isn't reviewable at all).
 */
export function singlePaneSideFor(
  kind: ChangedFileStatusKind,
  availability: Availability,
): DiffSide | undefined {
  if (availability.kind !== 'text') {
    return undefined;
  }
  return singlePaneStatusSides[kind];
}

/**
 * D-09: whether a status kind renders single-pane, independent of content
 * availability. Shared with `StatusBadge.vue`'s accessibility label so the
 * "single pane" announcement can never drift from the routing table above.
 */
export function isSinglePaneStatusKind(kind: ChangedFileStatusKind): boolean {
  return kind in singlePaneStatusSides;
}

const wasModeLabels: Readonly<Record<string, string>> = Object.freeze({
  '120000': 'symlink',
  '160000': 'submodule',
});

/**
 * D-06: derives the human-readable "was `<kind>`" label for a type-changed
 * file's old git mode, falling back to the raw old mode when it maps to
 * neither special case.
 */
export function wasModeKind(oldMode: string): string {
  return wasModeLabels[oldMode] ?? oldMode;
}
