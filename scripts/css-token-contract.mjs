export const CANONICAL_TOKENS = [
  '--border-control', '--border-default', '--border-gap', '--border-hunk', '--border-overlay', '--border-width-default', '--breadcrumb-height',
  '--control-height-compact', '--control-height-icon', '--control-height-standard', '--destructive-emphasis', '--destructive-foreground',
  '--dialog-max-height', '--dialog-width', '--diff-addition-background', '--diff-addition-foreground', '--diff-addition-intraline-background',
  '--diff-deletion-background', '--diff-deletion-foreground', '--diff-deletion-intraline-background',
  '--diff-empty-background', '--diff-hunk-background', '--diff-hunk-foreground', '--diff-region-border',
  '--diff-unchanged-background', '--editor-title-height', '--file-row-min-height', '--focus-offset', '--focus-outline-width', '--focus-ring', '--font-mono',
  '--font-size-body', '--font-size-chrome', '--font-size-code', '--font-size-display', '--font-size-label', '--font-size-metadata', '--font-size-page-heading',
  '--font-ui', '--font-weight-regular', '--font-weight-semibold', '--icon-size', '--interactive-accent',
  '--interactive-accent-emphasis', '--interactive-accent-emphasis-hover', '--letter-spacing-label', '--line-height-body', '--line-height-chrome', '--line-height-code',
  '--line-height-display', '--line-height-metadata', '--line-height-page-heading', '--monaco-inactive-selection-background',
  '--monaco-scrollbar-active-background', '--monaco-scrollbar-hover-background', '--monaco-whitespace-foreground',
  '--panel-height-default', '--panel-height-max', '--panel-height-min',
  '--radius-control', '--radius-file-row', '--radius-overlay', '--radius-pill', '--radius-scrollbar', '--scrollbar-thumb', '--selected-rail-width',
  '--selection-background', '--selection-border', '--shadow-overlay', '--sidebar-width',
  '--sidebar-width-default', '--sidebar-width-max', '--sidebar-width-min', '--space-1', '--space-2', '--space-3', '--space-4',
  '--space-5', '--space-6', '--space-8', '--status-added-background', '--status-added-border', '--status-added-foreground',
  '--status-deleted-background', '--status-deleted-border', '--status-deleted-foreground', '--status-disabled-background',
  '--status-disabled-foreground', '--status-error-background', '--status-error-foreground', '--status-information-background',
  '--status-information-foreground', '--status-modified-background', '--status-modified-border', '--status-modified-foreground',
  '--status-pending-background', '--status-pending-foreground', '--status-resolved-background', '--status-resolved-foreground',
  '--status-success-background', '--status-success-foreground', '--status-warning-background', '--status-warning-foreground', '--statusbar-height',
  '--surface-canvas', '--surface-empty', '--surface-gap', '--surface-hunk', '--surface-interactive', '--surface-interactive-active',
  '--surface-interactive-hover', '--surface-panel', '--surface-raised', '--surface-scrim', '--surface-sidebar',
  '--syntax-comment-foreground', '--syntax-default-foreground', '--syntax-invalid-foreground',
  '--syntax-keyword-foreground', '--syntax-number-foreground', '--syntax-string-foreground',
  '--syntax-type-foreground', '--text-hunk', '--text-line-number', '--text-muted', '--text-on-emphasis',
  '--text-primary', '--text-selection-background', '--titlebar-height', '--tree-indent', '--view-header-height',
];
const COLOR_TOKEN = /^(?!--(?:border-width-default|focus-offset|focus-outline-width)$)--(?:surface|text|border|interactive|focus|selection|scrollbar|destructive|status|diff|monaco|syntax)-/u;
const HEX_COLOR = /^#([\da-fA-F]{6}(?:[\da-fA-F]{2})?)$/u;
const RGB_COLOR = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d+)%\)$/u;
const CANONICAL_RGB_COLOR = /^rgb\((?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])\s+(?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])\s+(?:0|[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])\s*\/\s*(?:0|[1-9]\d?|100)%\)$/u;
const COLOR_IN_DECLARATION = /#[\da-f]{6}(?:[\da-f]{2})?\b|rgb\(\d+\s+\d+\s+\d+\s*\/\s*\d+%\)/giu;

export function skipCssStringOrComment(css, cursor) {
  if (css.startsWith('/*', cursor)) {
    const closing = css.indexOf('*/', cursor + 2);
    if (closing === -1) throw new Error('unterminated CSS comment');
    return closing + 2;
  }
  if (css[cursor] !== '"' && css[cursor] !== "'") return cursor;

  const quote = css[cursor];
  for (cursor += 1; cursor < css.length; cursor += 1) {
    if (css[cursor] === '\\') cursor += 1;
    else if (css[cursor] === quote) return cursor + 1;
  }
  throw new Error('unterminated CSS string');
}

function closingBrace(css, opening, selector) {
  let depth = 1;
  for (let cursor = opening + 1; cursor < css.length; cursor += 1) {
    const next = skipCssStringOrComment(css, cursor);
    if (next !== cursor) {
      cursor = next - 1;
      continue;
    }
    if (css[cursor] === '{') depth += 1;
    if (css[cursor] === '}' && --depth === 0) return cursor;
  }
  throw new Error(`unbalanced rule near ${selector}`);
}

function withoutComments(css) {
  let result = '';
  for (let cursor = 0; cursor < css.length; cursor += 1) {
    const next = skipCssStringOrComment(css, cursor);
    if (css.startsWith('/*', cursor)) {
      cursor = next - 1;
    } else if (next !== cursor) {
      result += css.slice(cursor, next);
      cursor = next - 1;
    } else {
      result += css[cursor];
    }
  }
  return result;
}

export function cssBlocks(css) {
  const rules = [];
  let preludeStart = 0;
  let groupingDepth = 0;
  for (let cursor = 0; cursor < css.length; cursor += 1) {
    const next = skipCssStringOrComment(css, cursor);
    if (next !== cursor) {
      cursor = next - 1;
      continue;
    }
    if (css[cursor] === '(' || css[cursor] === '[') groupingDepth += 1;
    if (css[cursor] === ')' || css[cursor] === ']') groupingDepth -= 1;
    if (groupingDepth !== 0) continue;
    if (css[cursor] === ';') {
      preludeStart = cursor + 1;
      continue;
    }
    if (css[cursor] !== '{') continue;
    const selector = withoutComments(css.slice(preludeStart, cursor)).trim();
    const closing = closingBrace(css, cursor, selector);
    rules.push({ selector, body: css.slice(cursor + 1, closing) });
    preludeStart = closing + 1;
    cursor = closing;
  }
  return rules;
}

export function selectorArms(selector) {
  return selector.split(',').map((arm) => arm.trim());
}

function declarationParts(body) {
  const parts = [];
  let start = 0;
  let groupingDepth = 0;
  for (let cursor = 0; cursor < body.length; cursor += 1) {
    const next = skipCssStringOrComment(body, cursor);
    if (next !== cursor) {
      cursor = next - 1;
      continue;
    }
    if (body[cursor] === '(' || body[cursor] === '[') groupingDepth += 1;
    if (body[cursor] === ')' || body[cursor] === ']') groupingDepth -= 1;
    if (body[cursor] === ';' && groupingDepth === 0) {
      parts.push(body.slice(start, cursor));
      start = cursor + 1;
    }
  }
  return parts;
}

export function cssDeclarations(body) {
  return declarationParts(body).flatMap((part) => {
    const uncommented = withoutComments(part).trim();
    let groupingDepth = 0;
    for (let cursor = 0; cursor < uncommented.length; cursor += 1) {
      const next = skipCssStringOrComment(uncommented, cursor);
      if (next !== cursor) {
        cursor = next - 1;
        continue;
      }
      if (uncommented[cursor] === '(' || uncommented[cursor] === '[') groupingDepth += 1;
      if (uncommented[cursor] === ')' || uncommented[cursor] === ']') groupingDepth -= 1;
      if (uncommented[cursor] !== ':' || groupingDepth !== 0) continue;
      const property = uncommented.slice(0, cursor).trim();
      const value = uncommented.slice(cursor + 1).trim();
      return /^[\w-]+$/u.test(property) && value !== '' ? [{ property, value }] : [];
    }
    return [];
  });
}

function rootRules(css, context = []) {
  return cssBlocks(css).flatMap((rule) => {
    if (rule.selector.startsWith('@')) return rootRules(rule.body, [...context, rule.selector]);
    return selectorArms(rule.selector).includes(':root') ? [{ ...rule, context }] : [];
  });
}

export function canonicalRootCss(css, label = 'CSS') {
  const roots = rootRules(css);
  const contextual = roots.find((rule) => rule.context.length !== 0);
  if (contextual !== undefined) throw new Error(`${label} :root must be context-free; found ${contextual.context.join(' > ')}`);
  if (roots.length !== 1) throw new Error(`${label} must contain exactly one context-free :root rule; found ${roots.length}`);
  return roots[0].body;
}

export function parseTokenRoot(rootCss) {
  const entries = cssDeclarations(rootCss)
    .filter(({ property }) => property.startsWith('--'))
    .map(({ property, value }) => [property, value]);
  const tokens = new Map(entries);
  if (tokens.size !== entries.length) {
    const names = new Set();
    const duplicate = entries.find(([name]) => names.has(name) || !names.add(name))?.[0];
    throw new Error(`canonical root declares duplicate token ${duplicate}`);
  }
  return tokens;
}

export function resolveToken(tokens, token, resolving = new Set()) {
  const value = tokens.get(token);
  if (value === undefined) throw new Error(`canonical root is missing ${token}`);
  if (resolving.has(token)) throw new Error(`canonical root contains an alias cycle at ${token}`);
  const alias = value.match(/^var\(\s*(--[\w-]+)\s*\)$/u)?.[1];
  if (alias === undefined) return value;
  resolving.add(token);
  try {
    return resolveToken(tokens, alias, resolving);
  } finally {
    resolving.delete(token);
  }
}

export function normalizeColor(value) {
  const hex = value.match(HEX_COLOR)?.[1];
  if (hex !== undefined) return `#${hex.toLowerCase()}`;
  const rgb = value.match(RGB_COLOR);
  if (rgb === null || !CANONICAL_RGB_COLOR.test(value)) return null;
  const [red, green, blue, alpha] = rgb.slice(1).map(Number);
  if ([red, green, blue].some((channel) => channel > 255) || alpha > 100) return null;
  return `#${[red, green, blue, Math.round((alpha / 100) * 255)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function normalizeDeclaration(value) {
  return value.replace(COLOR_IN_DECLARATION, (color) => normalizeColor(color) ?? color);
}

export function assertCanonicalTokenSet(tokens) {
  for (const token of CANONICAL_TOKENS) {
    if (!tokens.has(token)) throw new Error(`canonical root is missing ${token}`);
  }
  for (const token of tokens.keys()) {
    if (!CANONICAL_TOKENS.includes(token)) throw new Error(`canonical root contains non-canonical token ${token}`);
  }
}

export function assertCanonicalTokenValues(tokens) {
  for (const token of tokens.keys()) resolveToken(tokens, token);
  for (const token of CANONICAL_TOKENS.filter((token) => COLOR_TOKEN.test(token))) {
    const value = resolveToken(tokens, token);
    if (normalizeColor(value) === null || (value.startsWith('#') && value !== value.toLowerCase())) {
      throw new Error(`token ${token} must resolve to lowercase #rrggbb/#rrggbbaa or rgb(r g b / n%), got ${value}`);
    }
  }
}
