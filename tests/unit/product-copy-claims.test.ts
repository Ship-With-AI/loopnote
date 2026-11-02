import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const productMdPath = resolve(import.meta.dirname, '../../PRODUCT.md');
const readmePath = resolve(import.meta.dirname, '../../README.md');
const packageJsonPath = resolve(import.meta.dirname, '../../package.json');

/**
 * Locates PRODUCT.md's "## Deliberate non-capabilities" paragraph and splits it into
 * trimmed, lowercased banned phrases. This is the test's only source of banned phrases —
 * never a hardcoded duplicate list (D-06): a future edit to PRODUCT.md's non-capabilities
 * section is picked up automatically on the next test run, so the check can never drift
 * from the claims it is meant to enforce.
 */
function extractBannedPhrases(productMdText: string): string[] {
  const sectionMatch = productMdText.match(/## Deliberate non-capabilities\n+([\s\S]*?)(?:\n## |\n*$)/);
  if (!sectionMatch) {
    throw new Error('PRODUCT.md is missing a "## Deliberate non-capabilities" section');
  }

  const paragraph = sectionMatch[1].trim();
  const withoutOxfordOr = paragraph.replace(/,\s*or\s+/gi, ', ');
  const withoutTrailingPeriod = withoutOxfordOr.replace(/\.\s*$/, '');
  const withoutPreamble = withoutTrailingPeriod.replace(/^No claim is made for\s+/i, '');

  return withoutPreamble
    .split(/,\s*/)
    .map((phrase) => phrase.trim().toLowerCase())
    .filter((phrase) => phrase.length > 0);
}

/**
 * D-06 (18-CONTEXT.md:28) names the claim *forms* that must never ship — "hosted",
 * "cloud sync", "multi-user", "multi-reviewer", "approvals" — which are shorter and more
 * likely paraphrases than PRODUCT.md's full comma-separated non-capability phrases (e.g.
 * "remote hosting", "cloud synchronization", "multi-user collaboration"). The phrase-level
 * check above only catches the literal multi-word phrasing extracted from PRODUCT.md; these
 * stems close the substring gap so a paraphrase like "hosted review" or "multi-reviewer
 * workflow" still fails the guard even though it is not a verbatim PRODUCT.md phrase.
 * "approvals" is included for parity with D-06's list even though it already matches a
 * PRODUCT.md phrase verbatim.
 */
const BANNED_CLAIM_STEMS = ['hosted', 'cloud sync', 'multi-user', 'multi-reviewer', 'approvals'] as const;

/** Returns the first banned phrase or stem found in `text`, or `undefined` if none match. */
function findBannedClaim(text: string, bannedPhrases: readonly string[]): string | undefined {
  const lower = text.toLowerCase();
  for (const candidate of [...bannedPhrases, ...BANNED_CLAIM_STEMS]) {
    if (lower.includes(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

describe('product copy claims (D-06 automated claims check)', () => {
  const productMdText = readFileSync(productMdPath, 'utf8');
  const readmeText = readFileSync(readmePath, 'utf8');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    readonly description?: string;
    readonly keywords?: readonly string[];
  };

  it("README and npm copy contain none of PRODUCT.md's banned non-capability phrases or D-06's claim stems", () => {
    const bannedPhrases = extractBannedPhrases(productMdText);
    expect(bannedPhrases.length).toBeGreaterThan(0);

    const lowerReadme = readmeText.toLowerCase();
    const lowerNpmCopy = [packageJson.description ?? '', ...(packageJson.keywords ?? [])]
      .join(' ')
      .toLowerCase();

    for (const phrase of bannedPhrases) {
      expect(lowerReadme.includes(phrase), `README.md must not contain banned phrase "${phrase}"`).toBe(false);
      expect(
        lowerNpmCopy.includes(phrase),
        `package.json description/keywords must not contain banned phrase "${phrase}"`,
      ).toBe(false);
    }

    for (const stem of BANNED_CLAIM_STEMS) {
      expect(lowerReadme.includes(stem), `README.md must not contain banned claim stem "${stem}"`).toBe(false);
      expect(
        lowerNpmCopy.includes(stem),
        `package.json description/keywords must not contain banned claim stem "${stem}"`,
      ).toBe(false);
    }
  });

  it('findBannedClaim catches D-06 paraphrases that the phrase-only check would miss', () => {
    const bannedPhrases = extractBannedPhrases(productMdText);

    // Each fixture below paraphrases a non-capability using one of D-06's named claim
    // forms rather than PRODUCT.md's exact comma-separated wording, proving the stem
    // guard — not just the phrase guard — is what catches it.
    const paraphraseFixtures = [
      'Loopnote now offers a hosted review tier for teams.',
      'Comments sync instantly thanks to built-in cloud sync.',
      'Invite teammates for multi-user editing of the same review.',
      'Supports multi-reviewer sign-off before merging.',
    ];

    for (const fixture of paraphraseFixtures) {
      expect(
        findBannedClaim(fixture, bannedPhrases),
        `expected a banned claim stem to be detected in: "${fixture}"`,
      ).not.toBeUndefined();
    }

    // Clean, on-claims-boundary text must not trip the guard.
    expect(findBannedClaim('Local-first review for agent-produced artifacts.', bannedPhrases)).toBeUndefined();
  });

  it('the agent-artifact positioning claim is backed by PRODUCT.md', () => {
    const productSectionMatch = productMdText.match(/## Product\n+([\s\S]*?)(?:\n## |\n*$)/);
    if (!productSectionMatch) {
      throw new Error('PRODUCT.md is missing a "## Product" section');
    }
    const productParagraph = productSectionMatch[1];

    expect(readmeText.includes('agent-produced artifact')).toBe(true);
    expect(productParagraph.includes('agent-produced artifact')).toBe(true);
  });

  it('npm keywords are present', () => {
    expect(Array.isArray(packageJson.keywords)).toBe(true);
    expect((packageJson.keywords ?? []).length).toBeGreaterThan(0);
  });
});
