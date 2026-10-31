import { controlSafeDisplay } from '../domain/path-bytes.js';
import { parseCanonicalReviewExport, type ReviewExport } from './review-export.js';

function fenceFor(value: string): string {
  const runs = value.match(/`+/gu) ?? [];
  const longest = runs.reduce((length, run) => Math.max(length, run.length), 2);
  return '`'.repeat(longest + 1);
}

function appendFencedData(lines: string[], label: string, value: string): void {
  const fence = fenceFor(value);
  lines.push(label, `${fence}text`, value, fence);
}

function appendAnchor(
  lines: string[],
  comment: ReviewExport['files'][number]['comments'][number],
  exactPatch: boolean,
): void {
  const { anchor } = comment;
  lines.push(
    `Side: \`${exactPatch ? (anchor.side === 'base' ? 'preimage' : 'postimage') : anchor.side}\``,
    `Recorded line: ${anchor.line} (hint only)`,
    `Blob: \`${anchor.blobOid}\``,
    `Context hash: \`${anchor.contextHash.algorithm}:${anchor.contextHash.value}\``,
  );
  appendFencedData(lines, 'Repository-relative path:', anchor.path.utf8 ?? anchor.path.bytesBase64url);
  appendFencedData(lines, 'Selected text:', anchor.selectedText);
  const context: string[] = [];
  for (const line of anchor.context.before) context.push(`${line.line}: ${line.text}`);
  context.push(`${anchor.context.target.line}: ${anchor.context.target.text}`);
  for (const line of anchor.context.after) context.push(`${line.line}: ${line.text}`);
  appendFencedData(lines, 'Nearby context:', context.join('\n'));
}

function appendComment(
  lines: string[],
  comment: ReviewExport['files'][number]['comments'][number],
  exactPatch: boolean,
): void {
  lines.push(`### ${comment.id}`);
  appendAnchor(lines, comment, exactPatch);
  appendFencedData(lines, 'Review feedback:', comment.body);
}

export function renderReviewMarkdown(canonicalBytes: Uint8Array): string {
  const document = parseCanonicalReviewExport(canonicalBytes);
  const exactPatch = document.schemaVersion === 3;
  const standalone = document.schemaVersion === 4;
  const lines: string[] = ['# Cumpa Export', ''];

  if (exactPatch) {
    lines.push(
      '## Exact patch',
      `Accepted draft revision: ${document.acceptedDraftRevision}`,
      `Exported at: ${document.exportedAt}`,
      `Patch digest: \`${document.patch.digest}\``,
      `Validation target: \`${document.patch.validationTarget.kind}\``,
      `Review key: \`${document.patch.reviewKey}\``,
      'Anchor sides: `Preimage` and `Postimage`.',
      '',
      '## Frozen patch files',
    );
    if (document.patch.snapshot.files.length === 0) {
      lines.push('No changed files were recorded.');
    } else {
      for (const file of document.patch.snapshot.files) {
        lines.push(
          '',
          `### ${file.id}`,
          `Status: \`${file.status.kind}\``,
          `Old mode: \`${file.oldMode}\``,
          `New mode: \`${file.newMode}\``,
          `Availability: \`${file.availability.kind}\``,
        );
        if (file.oldPath !== undefined) {
          appendFencedData(lines, 'Raw preimage path:', file.oldPath.utf8 ?? file.oldPath.bytesBase64url);
        }
        if (file.newPath !== undefined) {
          appendFencedData(lines, 'Raw postimage path:', file.newPath.utf8 ?? file.newPath.bytesBase64url);
        }
      }
    }
  } else if (standalone) {
    lines.push(
      '## Standalone review',
      `Accepted draft revision: ${document.acceptedDraftRevision}`,
      `Exported at: ${document.exportedAt}`,
      `Review key: \`${document.standalone.reviewKey}\``,
      'No Base/Head selection; files reviewed as current working-tree content.',
      '',
      '## Reviewed arguments',
    );
    if (document.standalone.originalArguments.length === 0) {
      lines.push('No arguments were recorded.');
    } else {
      let index = 0;
      for (const argument of document.standalone.originalArguments) {
        index += 1;
        appendFencedData(lines, `Argument ${index}:`, controlSafeDisplay(argument));
      }
    }
    lines.push('', '## Resolved paths');
    if (document.standalone.resolvedPaths.length === 0) {
      lines.push('No paths were resolved.');
    } else {
      for (const path of document.standalone.resolvedPaths) {
        appendFencedData(lines, 'Resolved path:', path.utf8 ?? path.display);
      }
    }
  } else {
    lines.push(
      '## Pinned comparison',
      `Accepted draft revision: ${document.acceptedDraftRevision}`,
      `Exported at: ${document.exportedAt}`,
      `Base commit: \`${document.comparison.selectedBase.launchOid}\``,
      `Head commit: \`${document.comparison.selectedHead.launchOid}\``,
      `Merge base: \`${document.comparison.mergeBaseOid}\``,
      `Comparison key: \`${document.comparison.comparisonKey}\``,
    );
    if (document.schemaVersion === 2) {
      lines.push(
        '## Review scope',
        `Base commit: \`${document.range.baseOid}\``,
        `Head commit: \`${document.range.headOid}\``,
        `Review key: \`${document.range.reviewKey}\``,
      );
      appendFencedData(lines, 'Requested base:', controlSafeDisplay(document.range.requestedBase));
      appendFencedData(lines, 'Requested head:', controlSafeDisplay(document.range.requestedHead));
      lines.push('Ordered Git pathspecs:');
      let index = 0;
      for (const pathspec of document.range.pathspecs) {
        index += 1;
        appendFencedData(lines, `Pathspec ${index}:`, controlSafeDisplay(pathspec));
      }
      lines.push('');
    }
    appendFencedData(lines, 'Base label:', document.comparison.selectedBase.label);
    appendFencedData(lines, 'Head label:', document.comparison.selectedHead.label);
    lines.push(
      '',
      '## Drift observation',
      `Observed at: ${document.drift.observedAt}`,
      `Acknowledged: ${document.drift.acknowledged ? 'yes' : 'no'}`,
      `Base selector: ${document.drift.base.status}; launch \`${document.drift.base.launchOid}\`; current \`${document.drift.base.currentOid ?? 'unavailable'}\``,
      `Head selector: ${document.drift.head.status}; launch \`${document.drift.head.launchOid}\`; current \`${document.drift.head.currentOid ?? 'unavailable'}\``,
    );
  }

  lines.push('', '## Summary');
  if (document.summary.markdown === null) {
    lines.push('No summary provided');
  } else {
    appendFencedData(lines, 'Review summary:', document.summary.markdown);
  }

  lines.push('', '## Open actionable requests');
  let actionable = 0;
  for (const file of document.files) {
    const verified = [];
    for (const comment of file.comments) {
      if (comment.state === 'open' && comment.verification.state === 'verified') verified.push(comment);
    }
    if (verified.length === 0) continue;
    actionable += verified.length;
    lines.push('', '### Path');
    appendFencedData(lines, 'Repository-relative path:', file.path.utf8 ?? file.path.bytesBase64url);
    for (const comment of verified) {
      lines.push('');
      appendComment(lines, comment, exactPatch);
    }
  }
  if (actionable === 0) lines.push('No open actionable requests.');

  lines.push('', '## Needs reviewer attention');
  const attention = [];
  for (const file of document.files) {
    for (const comment of file.comments) {
      if (comment.state === 'open' && comment.verification.state !== 'verified') attention.push(comment);
    }
  }
  if (attention.length === 0) {
    lines.push('No open comments need reviewer attention.');
  } else {
    for (const comment of attention) {
      lines.push('', `### ${comment.id}`, `Anchor state: \`${comment.verification.state}\` (${comment.verification.reason})`);
      appendAnchor(lines, comment, exactPatch);
      appendFencedData(lines, 'Review feedback:', comment.body);
    }
  }

  lines.push(
    '',
    `Resolved comments: ${document.counts.resolved}. Full history remains in canonical JSON.`,
    '',
    '## Applying-agent instructions',
    exactPatch
      ? 'Before editing, verify the exact patch digest, frozen snapshot facts, relevant blob, repository-relative path, preimage/postimage side, exact selected text, and context hash.'
      : 'Before editing, verify the pinned comparison commit, relevant blob, repository-relative path, base/head side, exact selected text, and context hash.',
    'Line number is a navigation hint, never editing authority.',
    'Do not guess, fuzzy-match, silently relocate, or apply resolved feedback.',
    'Do not apply stale, orphaned, missing, or ambiguous anchors.',
    'Report ambiguous, missing, stale, orphaned, blob, path, side, selected-text, and context-hash mismatches.',
    'Include the recorded comment ID and identity in every mismatch report.',
  );
  return `${lines.join('\n')}\n`;
}
