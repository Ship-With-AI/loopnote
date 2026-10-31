import MarkdownIt from 'markdown-it';
import { escapeHtml } from 'markdown-it/lib/common/utils.mjs';
import defaultImageRule from 'markdown-it/lib/rules_inline/image.mjs';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import type { RenderRule } from 'markdown-it/lib/renderer.mjs';

const renderer = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});

renderer.validateLink = (url) => /^(?:https?:|mailto:)/iu.test(url.trim());
renderer.renderer.rules.link_open = (tokens, index, options, environment, self) => {
  const token = tokens[index];
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, index, options);
};

// --- Block source-map stamping (MDV-02, D-05) ----------------------------
// Anchors the row/item/block itself, never the enclosing table/list/quote.

function stampSourceMap(token: Token): void {
  if (token.map === null) return;
  token.attrSet('data-source-start', String(token.map[0] + 1));
  token.attrSet('data-source-end', String(token.map[1]));
}

const stampAndRenderToken: RenderRule = (tokens, index, options, environment, self) => {
  stampSourceMap(tokens[index]);
  return self.renderToken(tokens, index, options);
};

renderer.renderer.rules.paragraph_open = stampAndRenderToken;
renderer.renderer.rules.heading_open = stampAndRenderToken;
renderer.renderer.rules.tr_open = stampAndRenderToken;

renderer.renderer.rules.list_item_open = (tokens, index, options, environment, self) => {
  const token = tokens[index];
  stampSourceMap(token);
  const rendered = self.renderToken(tokens, index, options);
  const taskChecked: unknown = token.meta?.taskChecked;
  if (typeof taskChecked === 'boolean') {
    return `${rendered}<input type="checkbox" disabled${taskChecked ? ' checked' : ''}>`;
  }
  return rendered;
};

const defaultFenceRule = renderer.renderer.rules.fence;
renderer.renderer.rules.fence = (tokens, index, options, environment, self) => {
  stampSourceMap(tokens[index]);
  return defaultFenceRule
    ? defaultFenceRule(tokens, index, options, environment, self)
    : self.renderToken(tokens, index, options);
};

// --- Front matter (D-11): leading ---\n…\n--- renders as fenced YAML -----
// Gated strictly on startLine === 0 so a --- later in the document keeps
// its normal hr/setext-heading meaning (see RESEARCH.md Priority 3).

function getRawLine(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line], state.eMarks[line]);
}

renderer.block.ruler.before('table', 'front_matter', (state, startLine, _endLine, silent) => {
  if (startLine !== 0) return false;
  if (getRawLine(state, startLine) !== '---') return false;

  let closingLine = -1;
  for (let line = startLine + 1; line < state.lineMax; line += 1) {
    if (getRawLine(state, line) === '---') {
      closingLine = line;
      break;
    }
  }
  if (closingLine === -1) return false;
  if (silent) return true;

  const contentLines: string[] = [];
  for (let line = startLine + 1; line < closingLine; line += 1) {
    contentLines.push(getRawLine(state, line));
  }

  const token = state.push('fence', 'code', 0);
  token.info = 'yaml';
  token.content = contentLines.length > 0 ? `${contentLines.join('\n')}\n` : '';
  token.map = [0, closingLine + 1];
  token.markup = '---';

  state.line = closingLine + 1;
  return true;
});

// --- Task lists (D-11, GFM): [ ]/[x] prefix becomes a disabled checkbox --

const taskListItemPattern = /^\[([ xX])\]\s+/u;

renderer.core.ruler.after('inline', 'task_list', (state) => {
  const { tokens } = state;
  for (let index = 0; index < tokens.length; index += 1) {
    const listItemToken = tokens[index];
    if (listItemToken.type !== 'list_item_open') continue;

    const paragraphToken = tokens[index + 1];
    if (!paragraphToken || paragraphToken.type !== 'paragraph_open') continue;

    const inlineToken = tokens[index + 2];
    if (!inlineToken || inlineToken.type !== 'inline' || !inlineToken.children) continue;

    const firstChild = inlineToken.children[0];
    if (!firstChild || firstChild.type !== 'text') continue;

    const match = taskListItemPattern.exec(firstChild.content);
    if (!match) continue;

    firstChild.content = firstChild.content.slice(match[0].length);
    listItemToken.meta = { ...listItemToken.meta, taskChecked: match[1] !== ' ' };
  }
});

// --- Image hardening (D-09, MDV-04) ---------------------------------------
// A renderer-rule-only override cannot fix relative images: the shared
// validateLink already blanks their href during parsing, before any
// `image` token exists (RESEARCH.md Pitfall 1). Replace the inline rule
// itself, swapping in a local image-only validator for the duration of
// the delegated parse call, then restore the shared validator immediately
// so link_open/D-10 behavior is never affected.

export function validateImageHref(href: string): boolean {
  const normalized = href.replace(/[\t\r\n]/gu, '').trim();
  if (/^https?:/iu.test(normalized)) return true;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(normalized)) return false;
  if (normalized.startsWith('//')) return false;
  return true;
}

renderer.inline.ruler.at('image', (state, silent) => {
  const original = state.md.validateLink;
  state.md.validateLink = validateImageHref;
  try {
    return defaultImageRule(state, silent);
  } finally {
    state.md.validateLink = original;
  }
});

renderer.renderer.rules.image = (tokens, index, options, environment, self) => {
  const token = tokens[index];
  const src = token.attrGet('src') ?? '';
  const altText = self.renderInlineAsText(token.children ?? [], options, environment).trim();

  if (/^https?:/iu.test(src.trim())) {
    const escapedSrc = escapeHtml(src);
    const body =
      altText === ''
        ? `Remote image not loaded (no alt text) — ${escapedSrc}`
        : `Remote image not loaded: "${escapeHtml(altText)}" — ${escapedSrc}`;
    return `<span class="rendered-markdown__remote-image">${body}</span>`;
  }

  token.attrSet('alt', altText);
  return self.renderToken(tokens, index, options);
};

export function renderMarkdownPreview(markdown: string): string {
  return markdown === '' ? '<p>No summary yet</p>' : renderer.render(markdown);
}
