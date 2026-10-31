import type * as monaco from 'monaco-editor';

import type { DiffSide } from '../monaco/diff-adapter.js';

// Matches a block-level opening tag carrying both `data-source-start`/`data-source-end`
// attributes (stamped by markdown-preview.ts's source-map rules), in either attribute order,
// via independent lookaheads so neither attribute's position within the tag matters.
const SOURCE_BLOCK_PATTERN =
  /<[a-z][a-z0-9]*(?=[^>]*\sdata-source-start="(\d+)")(?=[^>]*\sdata-source-end="(\d+)")[^>]*>/giu;

export type SourceBlockRange = Readonly<{ start: number; end: number }>;

/**
 * Scans rendered Markdown HTML for `data-source-start`/`data-source-end` attribute pairs and
 * returns them in document order. No DOM parsing is required: the attributes are
 * self-describing strings.
 *
 * `start` is the attribute value minus one (0-indexed, mirroring markdown-it's own token
 * `map[0]`); `end` is the attribute value as-is (already the block's 1-indexed inclusive last
 * source line). Callers recover the block's 1-indexed inclusive range as `[start + 1, end]`.
 */
export function extractSourceBlocks(html: string): SourceBlockRange[] {
  const blocks: SourceBlockRange[] = [];
  for (const match of html.matchAll(SOURCE_BLOCK_PATTERN)) {
    const startAttribute = Number(match[1]);
    const endAttribute = Number(match[2]);
    blocks.push({ start: startAttribute - 1, end: endAttribute });
  }
  return blocks;
}

/**
 * Builds the same-origin content-route URL (GET /api/files/:fileId/image, plan 16-02) a
 * relative image `src` is rewritten to before insertion into the DOM.
 */
export function buildImageRouteUrl(fileId: string, side: DiffSide, path: string): string {
  return `/api/files/${encodeURIComponent(fileId)}/image?path=${encodeURIComponent(path)}&side=${side}`;
}

/**
 * Classifies a rendered block against a side-by-side `changes` array (D-01/D-02).
 *
 * Reuses the exact side-to-field mapping convention `diff-semantics.ts` already uses for its
 * own glyph-margin markers: `side === 'base'` reads `original*LineNumber`, `side === 'head'`
 * reads `modified*LineNumber`. `blockStart`/`blockEnd` are the block's 1-indexed inclusive
 * source range (`[block.start + 1, block.end]`).
 */
export function classifyBlockChange(
  blockStart: number,
  blockEnd: number,
  side: DiffSide,
  changes: readonly monaco.editor.ILineChange[] | null,
): 'added' | 'removed' | 'changed' | undefined {
  if (changes === null) return undefined;

  for (const change of changes) {
    // A pure insertion/deletion where this side has no content at all: the block cannot be
    // classified against this side from this change.
    if (side === 'base' && change.originalEndLineNumber === 0) continue;
    if (side === 'head' && change.modifiedEndLineNumber === 0) continue;

    const relevantStart = side === 'base' ? change.originalStartLineNumber : change.modifiedStartLineNumber;
    const relevantEnd = side === 'base' ? change.originalEndLineNumber : change.modifiedEndLineNumber;
    if (relevantEnd < blockStart || relevantStart > blockEnd) continue;

    const otherSideEmpty = side === 'base'
      ? change.modifiedEndLineNumber === 0
      : change.originalEndLineNumber === 0;
    if (otherSideEmpty) {
      return side === 'head' ? 'added' : 'removed';
    }
    return 'changed';
  }

  return undefined;
}
