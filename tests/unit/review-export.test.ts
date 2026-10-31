import { describe, expect, test } from 'vitest';
import type { RangeReviewScope } from '../../src/contracts/comparison.js';


import {
  ReviewExportV1Schema,
  ReviewExportV2Schema,
  ReviewExportV3Schema,
  ReviewExportV4Schema,
} from '../../src/contracts/draft.js';
import {
  buildReviewExportV1,
  buildReviewExportV2,
  buildReviewExportV3,
  buildReviewExportV4,
  canonicalizeReviewExport,
  hashExportBytes,
  parseCanonicalReviewExport,
} from '../../src/export/review-export.js';
import { renderReviewMarkdown } from '../../src/export/render-review-markdown.js';

const oid = 'a'.repeat(40);
const commentId = 'comment_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function path(utf8: string) {
  return {
    bytesBase64url: btoa(utf8).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, ''),
    display: utf8,
    utf8,
  };
}

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: commentId,
    state: 'open' as const,
    body: 'Please make this explicit.',
    createdAt: '2026-07-23T08:00:00.000Z',
    updatedAt: '2026-07-23T08:00:00.000Z',
    anchor: {
      version: 'durable-anchor-v1' as const,
      path: path('src/a.ts'),
      safeDisplayPath: 'src/a.ts',
      side: 'head' as const,
      line: 7,
      blobOid: oid,
      selectedText: 'const answer = 41;',
      context: {
        before: [{ line: 6, text: 'export function answer() {' }],
        target: { line: 7, text: 'const answer = 41;' },
        after: [{ line: 8, text: 'return answer;' }],
      },
      contextHash: { algorithm: 'sha256-v1' as const, value: 'b'.repeat(64) },
      uniqueKey: 'c'.repeat(64),
    },
    ...overrides,
  };
}

function snapshot(comments = [comment()]) {
  return {
    acceptedDraft: {
      schemaVersion: 1 as const,
      comparison: { baseCommitOid: oid, headCommitOid: oid, mergeBaseOid: oid },
      revision: 4,
      summary: '',
      comments,
    },
    commentVerification: Object.fromEntries(
      comments.map((item) => [item.id, { state: 'verified' as const, reason: 'exact-match' as const }]),
    ),
    comparison: {
      selectedBase: { label: 'main', launchOid: oid },
      selectedHead: { label: 'topic', launchOid: oid },
      mergeBaseOid: oid,
      comparisonKey: 'd'.repeat(64),
    },
    drift: {
      observedAt: '2026-07-23T08:01:00.000Z',
      acknowledged: false,
      base: { launchOid: oid, currentOid: oid, status: 'unchanged' as const },
      head: { launchOid: oid, currentOid: oid, status: 'unchanged' as const },
    },
  };
}
function rangeSnapshot(range: RangeReviewScope) {
  const base = snapshot();
  return {
    ...base,
    acceptedDraft: {
      ...base.acceptedDraft,
      comparison: {
        ...base.acceptedDraft.comparison,
        range,
      },
    },
    comparison: {
      selectedBase: { label: range.requestedBase, launchOid: range.baseOid },
      selectedHead: { label: range.requestedHead, launchOid: range.headOid },
      mergeBaseOid: range.baseOid,
      comparisonKey: range.reviewKey,
    },
  };
}


describe('ReviewExportV1 canonical contract', () => {
  test('maps the accepted draft once, preserves every identity, and rejects unknown or invalid data', () => {
    const document = buildReviewExportV1(snapshot(), '2026-07-23T08:02:00.000Z');

    expect(document).toMatchObject({
      schemaVersion: 1,
      kind: 'cumpa/export',
      acceptedDraftRevision: 4,
      summary: { markdown: null },
      counts: { all: 1, openActionable: 1, openNeedsAttention: 0, resolved: 0 },
    });
    expect(document.files[0]?.comments[0]?.anchor.selectedText).toBe('const answer = 41;');
    expect(() => ReviewExportV1Schema.parse({ ...document, extra: true })).toThrow();
    expect(() =>
      ReviewExportV1Schema.parse({
        ...document,
        files: [{ ...document.files[0], path: path('/private/source.ts') }],
      }),
    ).toThrow();
    expect(() =>
      ReviewExportV1Schema.parse({
        ...document,
        files: [{
          ...document.files[0]!,
          path: { bytesBase64url: path('/private/source.ts').bytesBase64url, display: 'safe-name', utf8: undefined },
        }],
      }),
    ).toThrow();
    expect(() => ReviewExportV1Schema.parse({ ...document, counts: { ...document.counts, all: 9 } })).toThrow();
  });

  test('orders lossless paths and anchors independently of insertion order or display text', () => {
    const base = comment({
      id: 'comment_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      anchor: { ...comment().anchor, path: { ...path('Z.ts'), display: 'z-display' }, side: 'base', line: 9, contextHash: { algorithm: 'sha256-v1', value: 'd'.repeat(64) }, uniqueKey: 'd'.repeat(64) },
    });
    const head = comment({
      id: 'comment_cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      anchor: { ...comment().anchor, path: { ...path('a.ts'), display: 'A-display' }, side: 'head', line: 1, contextHash: { algorithm: 'sha256-v1', value: 'e'.repeat(64) }, uniqueKey: 'e'.repeat(64) },
    });
    const document = buildReviewExportV1(snapshot([head, base]), '2026-07-23T08:02:00.000Z');

    expect(document.files.map((file) => file.path.utf8)).toEqual(['Z.ts', 'a.ts']);
    expect(document.files.flatMap((file) => file.comments.map((item) => item.anchor.side))).toEqual(['base', 'head']);
  });

  test('emits RFC 8785-compatible JSON without whitespace or a trailing newline', () => {
    const bytes = canonicalizeReviewExport(buildReviewExportV1(snapshot(), '2026-07-23T08:02:00.000Z'));
    const text = new TextDecoder().decode(bytes);

    expect(text).not.toMatch(/\n$/u);
    expect(text).not.toContain(', ');
    expect(new TextDecoder().decode(canonicalizeReviewExport({ z: 1, '\u{1f600}': 2, '\ufb33': 3, a: ['\u20ac'] } as never))).toBe('{"a":["€"],"z":1,"😀":2,"דּ":3}');
  });

  test('is byte-identical for one snapshot and changes only exportedAt when time changes', () => {
    const first = canonicalizeReviewExport(buildReviewExportV1(snapshot(), '2026-07-23T08:02:00.000Z'));
    const second = canonicalizeReviewExport(buildReviewExportV1(snapshot(), '2026-07-23T08:02:00.000Z'));
    const changed = canonicalizeReviewExport(buildReviewExportV1(snapshot(), '2026-07-23T08:03:00.000Z'));

    expect(second).toEqual(first);
    expect(new TextDecoder().decode(changed).replace('08:03', '08:02')).toBe(new TextDecoder().decode(first));
    expect(parseCanonicalReviewExport(first)).toEqual(JSON.parse(new TextDecoder().decode(first)));
  });

  test('hashes the exact final buffer with a lowercase SHA-256 digest and byte length', () => {
    const bytes = canonicalizeReviewExport(buildReviewExportV1(snapshot(), '2026-07-23T08:02:00.000Z'));
    const hash = hashExportBytes(bytes);

    expect(hash).toEqual({ algorithm: 'sha256', sha256: expect.stringMatching(/^[0-9a-f]{64}$/u), bytes: bytes.length });
    expect(hashExportBytes(new Uint8Array([...bytes, 0x20])).sha256).not.toBe(hash.sha256);
  });

  test('rejects malformed timestamps, lone surrogates, invalid resolved state, and noncanonical bytes', () => {
    const document = buildReviewExportV1(snapshot(), '2026-07-23T08:02:00.000Z');
    const exportedComment = document.files[0]?.comments[0];
    if (exportedComment === undefined) throw new Error('Fixture must contain one comment.');

    expect(() => ReviewExportV1Schema.parse({ ...document, exportedAt: 'tomorrow' })).toThrow();
    expect(() => ReviewExportV1Schema.parse({ ...document, summary: { markdown: '\uD800' } })).toThrow();
    expect(() => ReviewExportV1Schema.parse({ ...document, summary: { markdown: '' } })).toThrow();
    expect(() => ReviewExportV1Schema.parse({
      ...document,
      files: [{ ...document.files[0]!, comments: [{ ...exportedComment, body: '\uD800' }] }],
    })).toThrow();
    expect(() => ReviewExportV1Schema.parse({
      ...document,
      files: [{ ...document.files[0]!, comments: [{ ...exportedComment, resolvedAt: '2026-07-23T08:04:00.000Z' }] }],
    })).toThrow();
    expect(() => canonicalizeReviewExport({ number: Number.NaN })).toThrow();

    const canonical = canonicalizeReviewExport(document);
    expect(() => parseCanonicalReviewExport(new TextEncoder().encode(`${new TextDecoder().decode(canonical)}\n`))).toThrow();
  });

  test('rejects incoherent or non-deterministically ordered file groups from canonical bytes', () => {
    const document = buildReviewExportV1(snapshot(), '2026-07-23T08:02:00.000Z');
    const file = document.files[0];
    const first = file?.comments[0];
    if (file === undefined || first === undefined) throw new Error('Fixture must contain one file and comment.');

    const second = {
      ...first,
      id: 'comment_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      anchor: { ...first.anchor, uniqueKey: 'd'.repeat(64) },
    };
    const zPath = path('Z.ts');
    const zComment = { ...second, anchor: { ...second.anchor, path: zPath, safeDisplayPath: 'Z.ts', uniqueKey: 'e'.repeat(64) } };
    const twoCommentCounts = { ...document.counts, all: 2, openActionable: 2 };
    const candidates = [
      { files: [{ ...file, comments: [] }], counts: { ...document.counts, all: 0, openActionable: 0 } },
      { files: [{ ...file }, { ...file, comments: [second] }], counts: twoCommentCounts },
      { files: [{ ...file, path: zPath }], counts: document.counts },
      { files: [{ ...file, comments: [second, first] }], counts: twoCommentCounts },
      { files: [{ ...file }, { path: zPath, comments: [zComment] }], counts: twoCommentCounts },
    ];

    for (const candidate of candidates) {
      expect(() => parseCanonicalReviewExport(canonicalizeReviewExport({ ...document, ...candidate }))).toThrow();
    }
  });
});

describe('ReviewExportV2 range contract', () => {
  test('binds canonical bytes Markdown one exact frozen range scope', () => {
    const range = {
      kind: 'revisions' as const,
      requestedBase: 'main',
      requestedHead: 'topic',
      baseOid: oid,
      headOid: oid,
      pathspecs: ['src', ':(exclude)src/generated'],
      reviewKey: 'd'.repeat(64),
    };
    const document = buildReviewExportV2(rangeSnapshot(range), range, '2026-07-23T08:02:00.000Z');
    const bytes = canonicalizeReviewExport(document);
    expect(bytes.at(-1)).not.toBe(0x0a);
    expect(parseCanonicalReviewExport(bytes)).toEqual(document);
    const parsed = parseCanonicalReviewExport(bytes);
    expect(parsed).toEqual(document);
    expect(document).toMatchObject({ schemaVersion: 2, range });
    expect(renderReviewMarkdown(bytes)).toContain('main');
    expect(renderReviewMarkdown(bytes)).toContain(':(exclude)src/generated');
    expect(() => ReviewExportV1Schema.parse(document)).toThrow();
    expect(() => ReviewExportV2Schema.parse({ ...document, range: { ...range, reviewKey: 'C'.repeat(64) } })).toThrow();
    expect(() => ReviewExportV2Schema.parse({ ...document, extra: true })).toThrow();
    expect(() => buildReviewExportV2(rangeSnapshot(range), { ...range, pathspecs: [...range.pathspecs].reverse() }, '2026-07-23T08:02:00.000Z')).toThrow();
  });
});

describe('ReviewExportV3 exact patch contract', () => {
  test('binds accepted feedback to frozen patch provenance and rejects spoofed identity', () => {
    const base = snapshot();
    const patch = {
      digest: 'e'.repeat(64),
      validationTarget: { kind: 'repository' as const },
      reviewKey: 'f'.repeat(64),
      snapshot: {
        status: 'drifted' as const,
        files: [],
      },
    };
    const document = buildReviewExportV3(
      {
        acceptedDraft: {
          ...base.acceptedDraft,
          comparison: {
            kind: 'exact-patch',
            digest: patch.digest,
            validationTarget: patch.validationTarget,
            reviewKey: patch.reviewKey,
          },
        },
        commentVerification: base.commentVerification,
      },
      patch,
      '2026-07-23T08:02:00.000Z',
    );
    const bytes = canonicalizeReviewExport(document);
    expect(bytes.at(-1)).not.toBe(0x0a);

    expect(parseCanonicalReviewExport(bytes)).toEqual(document);
    expect(document).toMatchObject({ schemaVersion: 3, patch });
    expect(function () {
      return buildReviewExportV3(
        {
          acceptedDraft: {
            ...base.acceptedDraft,
            comparison: {
              kind: 'exact-patch',
              digest: patch.digest,
              validationTarget: patch.validationTarget,
              reviewKey: patch.reviewKey,
            },
          },
          commentVerification: base.commentVerification,
        },
        { ...patch, digest: 'a'.repeat(64) },
        '2026-07-23T08:02:00.000Z',
      );
    }).toThrow();
    expect(function () {
      return ReviewExportV3Schema.parse({ ...document, extra: true });
    }).toThrow();
  });
});

describe('ReviewExportV4 standalone contract', () => {
  test('binds accepted feedback to standalone provenance and rejects spoofed identity', () => {
    const base = snapshot();
    const standalone = {
      originalArguments: ['src/a.ts', 'src/b.ts'],
      resolvedPaths: [path('src/a.ts'), path('src/b.ts')],
      fileDigests: [
        { path: path('src/a.ts'), sha256: 'e'.repeat(64) },
        { path: path('src/b.ts'), sha256: 'f'.repeat(64) },
      ],
      snapshotChain: ['a'.repeat(64)],
      reviewKey: 'f'.repeat(64),
    };
    const draftComparison = {
      kind: 'uncommitted' as const,
      sourceKind: 'standalone' as const,
      reviewKey: standalone.reviewKey,
      snapshotChain: standalone.snapshotChain,
    };
    const document = buildReviewExportV4(
      {
        acceptedDraft: { ...base.acceptedDraft, comparison: draftComparison },
        commentVerification: base.commentVerification,
      },
      standalone,
      '2026-07-23T08:02:00.000Z',
    );
    const bytes = canonicalizeReviewExport(document);
    expect(bytes.at(-1)).not.toBe(0x0a);

    expect(parseCanonicalReviewExport(bytes)).toEqual(document);
    expect(document).toMatchObject({ schemaVersion: 4, standalone });
    expect(document).not.toHaveProperty('comparison');
    expect(document).not.toHaveProperty('drift');
    expect(document.files[0]?.comments[0]?.anchor.selectedText).toBe('const answer = 41;');
    expect(function () {
      return buildReviewExportV4(
        {
          acceptedDraft: { ...base.acceptedDraft, comparison: draftComparison },
          commentVerification: base.commentVerification,
        },
        { ...standalone, reviewKey: 'a'.repeat(64) },
        '2026-07-23T08:02:00.000Z',
      );
    }).toThrow(TypeError);
    expect(function () {
      return buildReviewExportV4(
        {
          acceptedDraft: {
            ...base.acceptedDraft,
            comparison: { ...draftComparison, sourceKind: 'worktree' as const, baseCommitOid: oid },
          },
          commentVerification: base.commentVerification,
        },
        standalone,
        '2026-07-23T08:02:00.000Z',
      );
    }).toThrow(TypeError);
    expect(function () {
      return ReviewExportV4Schema.parse({ ...document, extra: true });
    }).toThrow();
  });

  test('rejects a schemaVersion 4 document missing standalone.reviewKey from canonical bytes', () => {
    const base = snapshot();
    const standalone = {
      originalArguments: ['src/a.ts'],
      resolvedPaths: [path('src/a.ts')],
      fileDigests: [{ path: path('src/a.ts'), sha256: 'e'.repeat(64) }],
      snapshotChain: ['a'.repeat(64)],
      reviewKey: 'f'.repeat(64),
    };
    const document = buildReviewExportV4(
      {
        acceptedDraft: {
          ...base.acceptedDraft,
          comparison: {
            kind: 'uncommitted' as const,
            sourceKind: 'standalone' as const,
            reviewKey: standalone.reviewKey,
            snapshotChain: standalone.snapshotChain,
          },
        },
        commentVerification: base.commentVerification,
      },
      standalone,
      '2026-07-23T08:02:00.000Z',
    );
    const { standalone: validStandalone, ...rest } = document as unknown as Record<string, unknown>;
    const { reviewKey: _reviewKey, ...standaloneWithoutKey } = validStandalone as Record<string, unknown>;
    const malformedBytes = new TextEncoder().encode(JSON.stringify({ ...rest, standalone: standaloneWithoutKey }));

    expect(() => parseCanonicalReviewExport(malformedBytes)).toThrow();
    expect(() => parseCanonicalReviewExport(canonicalizeReviewExport(document))).not.toThrow();
  });
});
