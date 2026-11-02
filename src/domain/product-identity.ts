export type ProductIdentity = Readonly<{
  readonly displayName: string;
  readonly slug: string;
  readonly npmPackage: string;
  readonly binCommand: string;
  readonly repoStateDir: string;
  readonly xdgStateDirLower: string;
  readonly xdgStateDirTitleCase: string;
  readonly kindPrefix: string;
  readonly envPrefix: string;
  readonly cssPrefix: string;
  readonly tsIdentifierPrefix: string;
}>;

// Path traversal segments, slashes, NUL, and other ASCII control characters would
// land directly inside file-path segments (repoStateDir) if left unvalidated.
const UNSAFE_NAME_PATTERN = /[/\\\0-\x1f]|\.\./;
// npm-unscoped-name-safe, which is also CSS-class-safe and directory-segment-safe.
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ENV_PREFIX_PATTERN = /^[A-Z][A-Z0-9_]*_$/;
const NPM_SCOPE = '@shipwithai/';
const NPM_UNSCOPED_NAME_MAX_LENGTH = 214;

/**
 * Capitalizes each hyphen-separated slug segment and concatenates them. Shared by
 * `xdgStateDirTitleCase` and `tsIdentifierPrefix` so both forms are derived by the
 * exact same rule and can never drift into two different capitalization schemes.
 */
function capitalizeSlugSegments(slug: string): string {
  return slug
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

export function deriveProductIdentity(name: string): ProductIdentity {
  if (UNSAFE_NAME_PATTERN.test(name)) {
    throw new Error(
      `deriveProductIdentity: name ${JSON.stringify(name)} contains unsafe path-shaped characters ` +
        '(slash, NUL/control character, or "..") and cannot be used to derive a slug/path',
    );
  }

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug === '') {
    throw new Error(
      `deriveProductIdentity: name ${JSON.stringify(name)} produces an empty slug after slugification`,
    );
  }

  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `deriveProductIdentity: derived slug ${JSON.stringify(slug)} is not npm/CSS/path-safe ` +
        `(must match ${SLUG_PATTERN})`,
    );
  }

  const npmPackage = `${NPM_SCOPE}${slug}`;
  if (npmPackage.length > NPM_UNSCOPED_NAME_MAX_LENGTH) {
    throw new Error(
      `deriveProductIdentity: npm package name ${JSON.stringify(npmPackage)} exceeds npm's ` +
        `${NPM_UNSCOPED_NAME_MAX_LENGTH}-character unscoped-name budget`,
    );
  }

  const envPrefix = `${slug.toUpperCase().replace(/-/g, '_')}_`;
  if (!ENV_PREFIX_PATTERN.test(envPrefix)) {
    throw new Error(
      `deriveProductIdentity: derived envPrefix ${JSON.stringify(envPrefix)} is not a valid env var ` +
        `identifier (must match ${ENV_PREFIX_PATTERN})`,
    );
  }

  const titleCase = capitalizeSlugSegments(slug);

  return Object.freeze({
    displayName: name.trim(),
    slug,
    npmPackage,
    binCommand: slug,
    repoStateDir: `.${slug}/`,
    xdgStateDirLower: slug,
    xdgStateDirTitleCase: titleCase,
    kindPrefix: slug,
    envPrefix,
    cssPrefix: `${slug}-`,
    tsIdentifierPrefix: titleCase,
  });
}

// The display name supplied by the human at Task 1's blocking checkpoint (resolved
// 2026-11-02): "Loopnote". Every later plan in this phase imports this constant —
// not process.env, not a config file — so no form of the new name is re-derived or
// hardcoded independently.
export const RENAME_MAP: ProductIdentity = deriveProductIdentity('Loopnote');
