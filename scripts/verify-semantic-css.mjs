import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve, relative, sep } from 'node:path';

import {
  CANONICAL_TOKENS as canonicalTokens,
  assertCanonicalTokenValues,
  cssBlocks as blocks,
  cssDeclarations as declarations,
  parseTokenRoot,
  selectorArms,
} from './css-token-contract.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourcePath = resolve(repositoryRoot, 'src/web/styles.css');
const prototypePath = resolve(repositoryRoot, 'src/web/prototypes/MonacoStabilityPrototype.vue');
const phase6PrototypePath = resolve(repositoryRoot, 'src/web/prototypes/Phase6DiffSemanticsPrototype.vue');
const outputRoot = resolve(repositoryRoot, 'dist/web');
const indexPath = resolve(outputRoot, 'index.html');

function fail(message) {
  throw new Error(`Semantic CSS audit failed: ${message}`);
}


function isKeyframes(selector) {
  return /^@(?:-[\w]+-)?keyframes\b/i.test(selector);
}

function leafRules(css, context = []) {
  const rules = [];
  for (const { selector, body } of blocks(css)) {
    if (selector.startsWith('@')) {
      if (!isKeyframes(selector)) rules.push(...leafRules(body, [...context, selector]));
    } else {
      rules.push({ selector, body, declarations: declarations(body), context });
    }
  }
  return rules;
}

function declarationRules(css, context = []) {
  const rules = [];
  for (const { selector, body } of blocks(css)) {
    const nested = blocks(body);
    if (selector.startsWith('@')) {
      if (nested.length === 0) {
        const directDeclarations = declarations(body);
        if (directDeclarations.length !== 0) {
          rules.push({ selector, body, declarations: directDeclarations, context });
        }
      }
      rules.push(...declarationRules(body, [...context, selector]));
    } else {
      rules.push({ selector, body, declarations: declarations(body), context });
    }
  }
  return rules;
}

function rootRule(css, label, tokenBearing = false) {
  const roots = leafRules(css).filter((rule) => selectorArms(rule.selector).includes(':root'));
  const contextualRoot = roots.find((rule) => rule.context.length !== 0);
  if (contextualRoot !== undefined) {
    fail(`${label} :root must be context-free; found ${contextualRoot.context.join(' > ')}`);
  }
  const candidates = tokenBearing
    ? roots.filter((rule) => rule.declarations.some(({ property }) => property === '--surface-canvas'))
    : roots;
  if (candidates.length !== 1) {
    fail(`${label} must contain exactly one ${tokenBearing ? 'canonical token-bearing ' : ''}:root rule; found ${candidates.length}`);
  }
  return candidates[0];
}

function assertTokenRoot(rule, label, exact) {
  const tokenDeclarations = rule.declarations.filter(({ property }) => property.startsWith('--'));
  const names = tokenDeclarations.map(({ property }) => property);
  const uniqueNames = new Set(names);
  if (uniqueNames.size !== names.length) fail(`${label} token root declares a token more than once`);
  for (const token of canonicalTokens) {
    if (!uniqueNames.has(token)) fail(`${label} token root is missing ${token}`);
  }
  if (exact && (uniqueNames.size !== canonicalTokens.length || names.some((name) => !canonicalTokens.includes(name)))) {
    fail(`${label} token root contains a non-canonical custom property`);
  }
  if (names.filter((name) => name === '--text-muted').length !== 1) {
    fail(`${label} token root must declare --text-muted exactly once`);
  }
}

function assertDeclaredTokensConsumed(rule, sources) {
  const declared = new Set(rule.declarations
    .filter(({ property }) => property.startsWith('--'))
    .map(({ property }) => property));
  const referenced = new Set(sources.flatMap((source) => [
    ...source.matchAll(/var\(\s*(--[\w-]+)/g),
    ...source.matchAll(/\bcolor\(\s*['"](--[\w-]+)['"]\s*\)/g),
  ].map(([, name]) => name)));
  const dependencies = new Map(rule.declarations
    .filter(({ property }) => property.startsWith('--'))
    .map(({ property, value }) => [property, [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name)]));
  for (const token of referenced) {
    for (const dependency of dependencies.get(token) ?? []) referenced.add(dependency);
  }
  const unused = [...declared].filter((name) => !referenced.has(name));
  if (unused.length !== 0) fail(`canonical tokens have no consumer: ${unused.join(', ')}`);
}

function assertTokenValueShapes(rule, label) {
  try {
    assertCanonicalTokenValues(parseTokenRoot(rule.body));
  } catch (error) {
    fail(`${label} ${error.message}`);
  }
}

function assertNoLegacy(css, label) {
  const legacy = /(?<![\w-])--(?:canvas|panel|accent|destructive|surface|text|rule|addition-(?:bg|fg)|deletion-(?:bg|fg)|warning-(?:bg|fg)|info-(?:bg|fg)|error-(?:bg|fg)|surface-inset|text-secondary|border-muted|border-strong|control-boundary|font-size-section-heading|line-height-section-heading|radius-compact|space-(?:xs|sm|md|lg|xl|2xl|3xl))(?![\w-])|(?<![\w-])--color-[\w-]+/g;
  const match = css.match(legacy);
  if (match !== null) fail(`${label} still references retired token ${match[0]}`);
}

const allowedForcedColorKeywords = new Set([
  'canvas', 'canvastext', 'buttonface', 'buttontext', 'buttonborder',
  'linktext', 'highlight', 'highlighttext', 'graytext',
]);
const systemColorKeywords = new Set([
  ...allowedForcedColorKeywords,
  'accentcolor', 'accentcolortext', 'activetext', 'field', 'fieldtext',
  'mark', 'marktext', 'selecteditem', 'selecteditemtext', 'visitedtext',
]);
const namedColorKeywords = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
  blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue
  cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey
  darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
  darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
  deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
  fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
  lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey
  lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey
  lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
  mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
  mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite
  navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise
  palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
  rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise
  violet wheat white whitesmoke yellow yellowgreen
`.trim().split(/\s+/));
const nonPaletteColorProperties = new Set([
  'background', 'background-color', 'border', 'border-color', 'border-top', 'border-right',
  'border-bottom', 'border-left', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'outline', 'outline-color',
  'text-decoration', 'text-decoration-color', 'fill', 'stroke',
]);

function isPaintBearingProperty(property) {
  return property.startsWith('--')
    || /^(?:background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|color|caret-color|accent-color|column-rule(?:-color)?|text-(?:decoration|emphasis)(?:-color)?|(?:-webkit-)?text-(?:fill|stroke)(?:-color)?|fill|stroke|stop-color|flood-color|lighting-color)$/.test(property);
}

function directColorSyntaxes(value) {
  const inspected = value
    .replace(/(["'])(?:\\.|(?!\1)[\s\S])*\1/g, '')
    .replace(/url\([^)]*\)/gi, '');
  const syntaxes = [];
  if (/#[0-9a-f]{3,8}\b/i.test(inspected)) syntaxes.push('hex color');
  if (/\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|device-cmyk|light-dark|color-contrast|contrast-color)\s*\(/i.test(inspected)) {
    syntaxes.push('color function');
  }
  for (const word of inspected.matchAll(/\b[a-z][\w-]*\b/gi)) {
    const normalized = word[0].toLowerCase();
    if (systemColorKeywords.has(normalized)) syntaxes.push(`system color ${word[0]}`);
    if (namedColorKeywords.has(normalized)) syntaxes.push(`named color ${word[0]}`);
    if (normalized === 'currentcolor') syntaxes.push('currentColor');
    if (normalized === 'transparent') syntaxes.push('transparent');
  }
  return syntaxes;
}

function isNonPaletteColor(property, syntax) {
  return (nonPaletteColorProperties.has(property) || property === 'box-shadow')
    && (syntax === 'currentColor' || syntax === 'transparent');
}

function isForcedColorsContext(context) {
  return context.some((item) => /^@media\s*\(\s*forced-colors\s*:\s*active\s*\)$/i.test(item));
}

const decorativeColorAllowlist = new Map([
  // 21-UI-SPEC.md "## Filter (TREE-03)": documented decorative highlight overlay for
  // filter-match <mark> text, locked to this exact selector/property/value — not a
  // general direct-color bypass.
  ['.file-tree-pane mark::background', 'rgb(210 153 34 / 35%)'],
]);

function assertDirectColorConfinement(source) {
  for (const rule of declarationRules(source)) {
    const isTokenRoot = rule.selector === ':root' && rule.context.length === 0;
    const inForcedColors = isForcedColorsContext(rule.context);
    for (const declaration of rule.declarations) {
      if (!isPaintBearingProperty(declaration.property)) continue;
      const syntaxes = directColorSyntaxes(declaration.value);
      for (const syntax of syntaxes) {
        if (isTokenRoot || isNonPaletteColor(declaration.property, syntax)) continue;
        if (decorativeColorAllowlist.get(`${rule.selector}::${declaration.property}`) === declaration.value) continue;
        if (inForcedColors && syntax.startsWith('system color ')
          && allowedForcedColorKeywords.has(syntax.slice('system color '.length).toLowerCase())) continue;
        fail(`direct ${syntax} outside the permitted token root or forced-colors repair in ${rule.selector}`);
      }
    }
  }
}

function assertAuthorStyle(source, { enforceShadowAllowlist = true } = {}) {
  if (/@import\b|url\(\s*(?:['"]?https?:|['"]?\/\/)|(?:repeating-)?(?:linear|radial|conic)-gradient\(|backdrop-filter\s*:|text-shadow\s*:|filter\s*:\s*drop-shadow\(/i.test(source)) {
    fail('source contains an import, remote URL, gradient, glow, glass, or drop shadow');
  }
  const forcedStart = source.indexOf('@media (forced-colors: active)');
  if (forcedStart === -1 || forcedStart < source.lastIndexOf('@media (prefers-reduced-motion: reduce)')) {
    fail('forced-colors repair must be one terminal media block');
  }
  const ordinary = source.slice(0, forcedStart);
  const systemKeyword = /\b(?:AccentColor|AccentColorText|ActiveText|ButtonBorder|ButtonFace|ButtonText|Canvas|CanvasText|Field|FieldText|GrayText|Highlight|HighlightText|LinkText|Mark|MarkText|SelectedItem|SelectedItemText|VisitedText)\b/;
  if (systemKeyword.test(ordinary)) fail('system colors are only allowed in the forced-colors repair block');

  assertDirectColorConfinement(source);
  if (!enforceShadowAllowlist) return;


  const insetAllowlist = new Map([
    ['.tree-row--selected', 'inset var(--selected-rail-width) 0 var(--selection-border)'],
    ['.view-tab[aria-selected="true"]', 'inset 0 calc(var(--selected-rail-width) * -1) var(--selection-border)'],
    ['.monaco-editor .monaco-anchor-line', 'inset var(--selected-rail-width) 0 var(--interactive-accent)'],
  ]);
  const overlayAllowlist = new Set([
    '.ui-tooltip__content', '.diff-workspace__gutter-action::after',
    '.comments-rail--open', '.support-dialog', '.modal-dialog', '.view-options-menu',
  ]);

  for (const rule of declarationRules(ordinary)) {
    const shadows = rule.declarations.filter(({ property }) => property === 'box-shadow');
    if (shadows.length > 1) fail(`rule ${rule.selector} declares box-shadow more than once`);
    const [shadow] = shadows;
    const arms = selectorArms(rule.selector);
    const isPressed = arms.some((selector) => selector.includes(':active') || selector.includes('[aria-pressed="true"]'));
    if (isPressed && shadow?.value !== 'none') fail(`pressed control rule ${rule.selector} must explicitly set box-shadow: none`);
    if (shadow === undefined) continue;
    for (const selector of arms) {
      if (shadow.value.includes('inset')) {
        if (insetAllowlist.get(selector) !== shadow.value) fail(`inset shadow is not allowlisted for ${selector}`);
      } else if (shadow.value === 'var(--shadow-overlay)') {
        if (!overlayAllowlist.has(selector)) fail(`overlay shadow is not allowlisted for ${selector}`);
      } else if (shadow.value !== 'none') {
        fail(`box-shadow value ${shadow.value} is not permitted for ${selector}`);
      }
    }
  }
}

function assertVueStyleBlocks(source, label) {
  const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  if (styles.length === 0) fail(`${label} has no authored style block to audit`);
  for (const style of styles) {
    assertNoLegacy(style, label);
    assertAuthorStyle(`:root { --surface-canvas: #0d1117; } ${style} @media (forced-colors: active) {
      body { background: Canvas; color: CanvasText; }
    }`, { enforceShadowAllowlist: false });
  }
}

function expectAuditFailure(assertion, name) {
  try {
    assertion();
  } catch {
    return;
  }
  fail(`self-check did not reject ${name}`);
}

function assertAuditSelfChecks() {
  const forcedColors = '@media (forced-colors: active) { body { color: CanvasText; } }';
  const canonicalRoot = ':root { --surface-canvas: #0d1117; }';
  const canonicalTokenRoot = (overrides = {}) => `:root { ${canonicalTokens.map((token) => {
    const colorToken = /^--(?:surface|text|border|interactive|focus|selection|scrollbar|destructive|status|diff|monaco|syntax)-/u.test(token);
    return `${token}: ${overrides[token] ?? (colorToken ? '#000000' : '1px')};`;
  }).join(' ')} }`;

  for (const [name, groupingRule] of [
    ['@supports', '@supports (display: grid)'],
    ['@layer', '@layer components'],
    ['@container', '@container (width > 0px)'],
    ['@scope', '@scope (.review-workspace)'],
  ]) {
    expectAuditFailure(
      () => rootRule(`${canonicalRoot} ${groupingRule} { :root { --surface-canvas: var(--surface-panel); } }`, `${name} nested-root fixture`),
      `a contextual :root inside ${name}`,
    );
  }

  expectAuditFailure(
    () => assertAuthorStyle(`${canonicalRoot} @container (width > 0px) { .ui-button:active { box-shadow: inset 1px 1px black; } } ${forcedColors}`),
    'a non-permitted pressed-control shadow inside @container',
  );
  expectAuditFailure(
    () => assertAuthorStyle(`${canonicalRoot} @scope (.review-workspace) { .review-heading { color: #e6edf3; } } ${forcedColors}`),
    'a raw color literal inside @scope',
  );
  expectAuditFailure(
    () => assertAuthorStyle(`${canonicalRoot} @keyframes theme-bypass { to { color: #ffffff; } } ${forcedColors}`),
    'a raw color literal inside a keyframe step',
  );
  expectAuditFailure(
    () => assertAuthorStyle(`${canonicalRoot} @keyframes theme-shadow { to { box-shadow: 0 0 1px white; } } ${forcedColors}`),
    'a non-allowlisted shadow inside a keyframe step',
  );
  for (const [name, declaration] of [
    ['white', 'background: white;'],
    ['rebeccapurple', 'color: rebeccapurple;'],
    ['oklch()', 'border-color: oklch(75% 0.1 250);'],
    ['color()', 'background: color(srgb 1 1 1);'],
    ['hwb()', 'color: hwb(0 0% 0%);'],
    ['device-cmyk()', 'border-color: device-cmyk(0% 100% 100% 0%);'],
    ['light-dark()', 'background: light-dark(white, black);'],
    ['contrast-color()', 'color: contrast-color(var(--surface-canvas));'],
  ]) {
    expectAuditFailure(
      () => assertAuthorStyle(`${canonicalRoot} .direct-color { ${declaration} } ${forcedColors}`),
      `a direct ${name} color outside the token root`,
    );
  }

  expectAuditFailure(
    () => assertAuthorStyle(`${canonicalRoot} @media (forced-colors: active) { .direct-color { background: AccentColor; } }`),
    'an unapproved forced-colors system color',
  );

  expectAuditFailure(
    () => assertVueStyleBlocks('<style scoped>.prototype { background: #f6f3ec; }</style>', 'raw Vue fixture'),
    'a direct palette literal in an authored Vue style block',
  );
  expectAuditFailure(
    () => assertVueStyleBlocks('<style scoped>.prototype { box-shadow: 0 0 1px #fff; }</style>', 'raw Vue shadow fixture'),
    'a direct box-shadow palette literal in an authored Vue style block',
  );

  for (const [name, overrides] of [
    ['uppercase hex', { '--surface-canvas': '#ABCDEF' }],
    ['unknown alias', { '--surface-canvas': 'var(--unknown-token)' }],
    ['unsupported color function', { '--surface-canvas': 'hsl(0 0% 0%)' }],
    ['out-of-range channel', { '--surface-canvas': 'rgb(256 0 0 / 45%)' }],
    ['fractional alpha', { '--surface-canvas': 'rgb(0 0 0 / 45.5%)' }],
    ['arbitrary value', { '--surface-canvas': 'canvas' }],
    ['alias cycle', { '--surface-canvas': 'var(--surface-panel)', '--surface-panel': 'var(--surface-canvas)' }],
  ]) {
    expectAuditFailure(
      () => assertTokenValueShapes(rootRule(canonicalTokenRoot(overrides), `${name} token fixture`), `${name} token fixture`),
      name,
    );
  }
  expectAuditFailure(
    () => assertNoLegacy(':root { --surface-canvas: var(--surface-inset); }', 'retired token fixture'),
    'retired token vocabulary',
  );

  const tokenFixture = rootRule(':root { --used: 1px; --unused: 2px; }', 'token fixture');
  expectAuditFailure(
    () => assertDeclaredTokensConsumed(tokenFixture, ['.consumer { width: var(--used); }']),
    'a canonical token without a consumer',
  );
  assertDeclaredTokensConsumed(tokenFixture, ['.consumer { width: var(--used); height: var(--unused); }']);

  assertAuthorStyle(`${canonicalRoot} .semantic-colors { color: var(--text-primary); border-color: currentColor; background: transparent; } @media (forced-colors: active) {
    body { background: Canvas; color: CanvasText; }
    button { background: ButtonFace; color: ButtonText; border-color: ButtonBorder; }
    a { color: LinkText; }
    .selected { background: Highlight; color: HighlightText; }
    :disabled { color: GrayText; }
  }`);
}

assertAuditSelfChecks();

const source = await readFile(sourcePath, 'utf8');
const prototypeSource = await readFile(prototypePath, 'utf8');
const phase6PrototypeSource = await readFile(phase6PrototypePath, 'utf8');
const index = await readFile(indexPath, 'utf8');
const cssHrefs = [...index.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1]);
if (cssHrefs.length === 0) fail('generated index has no application stylesheet link');

const generatedAssets = await Promise.all(cssHrefs.map(async (href) => {
  const assetPath = resolve(outputRoot, href);
  const assetRelativePath = relative(outputRoot, assetPath);
  if (assetRelativePath.startsWith(`..${sep}`) || assetRelativePath === '..') {
    fail(`generated stylesheet escapes dist/web: ${href}`);
  }
  try {
    return await readFile(assetPath, 'utf8');
  } catch {
    fail(`generated stylesheet linked by dist/web/index.html is missing: ${href}`);
  }
}));
const generated = generatedAssets.join('\n');

const sourceRoot = rootRule(source, 'source CSS');
const generatedRoot = rootRule(generated, 'generated CSS', true);
assertTokenRoot(sourceRoot, 'source CSS', true);
assertTokenRoot(generatedRoot, 'generated CSS', false);
assertTokenValueShapes(sourceRoot, 'source CSS');
const webSourceRoot = resolve(repositoryRoot, 'src/web');
const monacoThemeSource = await readFile(resolve(webSourceRoot, 'monaco/theme.ts'), 'utf8');
const webSources = await Promise.all(
  (await readdir(webSourceRoot, { recursive: true }))
    .filter((path) => extname(path) === '.css' || extname(path) === '.vue')
    .filter((path) => path !== 'styles.css')
    .map((path) => readFile(resolve(webSourceRoot, path), 'utf8')),
);
assertDeclaredTokensConsumed(sourceRoot, [source.replace(sourceRoot.body, ''), ...webSources, monacoThemeSource]);
assertNoLegacy(source, 'source CSS');
assertNoLegacy(generated, 'generated CSS');
assertAuthorStyle(source);
assertVueStyleBlocks(prototypeSource, 'Monaco stability prototype');
assertVueStyleBlocks(phase6PrototypeSource, 'Phase 6 diff semantics prototype');

console.log('Semantic CSS verified: canonical root, retired vocabulary, and author-style invariants pass.');
