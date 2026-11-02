import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import type { Browser, Locator, Page, TestInfo } from '@playwright/test';

import type {
  FileMetadataResponse,
  SessionFile,
  SessionResponse,
} from '../../src/contracts/api.js';
import { canonicalRoot } from '../helpers/canonical-root.js';
import { createGitFixture } from '../helpers/git-fixture.js';
import type { GitFixture } from '../helpers/git-fixture.js';
import { RENAME_MAP } from '../../src/domain/product-identity.js';
import {
  normalizeDeclaration,
  resolveToken,
  toCssRgb,
} from '../../src/web/theme/token-contract.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalTokens = canonicalRoot(repositoryRoot);
const toRootRgb = (token: string): string => toCssRgb(canonicalTokens, token);
const toCompiledDeclaration = (token: string): string => normalizeDeclaration(
  resolveToken(canonicalTokens, token),
)
  .replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/u, '#$1$2$3')
  .replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3([0-9a-f])\4$/u, '#$1$2$3$4');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packedRoot = mkdtempSync(join(tmpdir(), `${RENAME_MAP.slug}-responsive-pack-`));
const extractedPackageRoot = join(packedRoot, 'package');
const fakeBinRoot = join(packedRoot, 'fake-bin');
const executablePath = join(extractedPackageRoot, `dist/bin/${RENAME_MAP.binCommand}.mjs`);

interface PackResult {
  readonly filename: string;
}

interface RunningCli {
  readonly child: ChildProcess;
  readonly outputDescriptor: number;
  readonly outputPath: string;
}
const phase08Widths = [1440, 1051, 1050, 761, 760, 759, 640, 320] as const;

type Phase08Width = (typeof phase08Widths)[number];

interface Phase08Reflow {
  readonly canvas: { readonly clientWidth: number; readonly scrollWidth: number };
  readonly document: { readonly clientWidth: number; readonly scrollWidth: number };
  readonly toolbarGroups: readonly DOMRect[];
  readonly viewport: { readonly clientWidth: number; readonly scrollWidth: number };
}

function runPrerequisite(command: string, arguments_: readonly string[]): string {
  try {
    return execFileSync(command, [...arguments_], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[prerequisite] ${command} ${arguments_.join(' ')} failed before responsive package assertions: ${detail}`,
    );
  }
}

async function waitForText(
  path: string,
  predicate: (content: string) => boolean,
): Promise<string> {
  const { promise, resolve: resolveWait, reject } =
    Promise.withResolvers<string>();
  const deadline = Date.now() + 10_000;
  const interval = setInterval(() => {
    const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (predicate(content)) {
      clearInterval(interval);
      resolveWait(content);
      return;
    }
    if (Date.now() >= deadline) {
      clearInterval(interval);
      reject(
        new Error(`[behavioral] timed out waiting for generated CLI:\n${content}`),
      );
    }
  }, 25);
  return await promise;
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const { promise, resolve: resolveExit, reject } =
    Promise.withResolvers<void>();
  child.once('error', reject);
  child.once('exit', () => resolveExit());
  await promise;
}

function startGeneratedCli(repository: GitFixture): RunningCli {
  const outputPath = join(packedRoot, `terminal-${crypto.randomUUID()}.log`);
  const outputDescriptor = openSync(outputPath, 'w');
  const environment = { ...process.env };
  delete environment.CMUX_WORKSPACE_ID;
  const child = spawn(process.execPath, [executablePath], {
    cwd: repository.nestedCwd,
    env: {
      ...environment,
      PATH: `${fakeBinRoot}:${process.env.PATH ?? ''}`,
      [`${RENAME_MAP.envPrefix}LAUNCH_OPTIONS`]: JSON.stringify({
        cwd: repository.nestedCwd,
        base: { label: 'Base responsive fixture', revision: repository.baseRef },
        head: { label: 'Head responsive fixture', revision: repository.headRef },
      }),
      [`${RENAME_MAP.envPrefix}OPENER_LOG`]: join(
        packedRoot,
        `opener-${crypto.randomUUID()}.log`,
      ),
      [`${RENAME_MAP.envPrefix}TERMINAL_CAPTURE`]: outputPath,
    },
    stdio: ['ignore', outputDescriptor, outputDescriptor],
  });
  return { child, outputDescriptor, outputPath };
}

async function stopGeneratedCli(running: RunningCli): Promise<void> {
  if (running.child.exitCode === null && running.child.signalCode === null) {
    running.child.kill('SIGINT');
  }
  await waitForExit(running.child);
  closeSync(running.outputDescriptor);
}

async function waitForLoopbackUrl(running: RunningCli): Promise<string> {
  const output = await waitForText(running.outputPath, (content) =>
    /http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/.test(content),
  );
  const match = output.match(
    /http:\/\/127\.0\.0\.1:\d+\/#token=[A-Za-z0-9_-]{43,}/,
  );
  expect(match, `[behavioral] generated CLI did not print its URL:\n${output}`).toBeDefined();
  return match![0];
}

function assertChromiumPrerequisite(browser: Browser, testInfo: TestInfo): void {
  if (
    testInfo.project.name !== 'chromium' ||
    browser.browserType().name() !== 'chromium'
  ) {
    throw new Error(
      `[prerequisite] exact Chromium project required, received ${testInfo.project.name}/${browser.browserType().name()}`,
    );
  }
}

function opaqueFileId(index: number): string {
  return `file_${String(index).padStart(43, '0')}`;
}

function exactPath(utf8: string): {
  readonly bytesBase64url: string;
  readonly display: string;
  readonly utf8: string;
} {
  return {
    bytesBase64url: Buffer.from(utf8).toString('base64url'),
    display: utf8,
    utf8,
  };
}

function createFiles(): readonly SessionFile[] {
  return [
    {
      fileId: opaqueFileId(1),
      status: { kind: 'modified' },
      oldMode: '100644',
      newPath: exactPath('00-src/components/alpha.ts'),
      additions: 12,
      deletions: 4,
      availability: { kind: 'text' },
    },
    {
      fileId: opaqueFileId(2),
      status: { kind: 'renamed', similarity: 100 },
      oldMode: '100644',
      oldPath: exactPath('00-src/components/previous/deeply/nested/beta-before-a-very-long-rename.ts'),
      newPath: exactPath('00-src/components/current/deeply/nested/beta-after-a-very-long-rename.ts'),
      additions: 8,
      deletions: 3,
      availability: { kind: 'text' },
    },
    ...Array.from({ length: 16 }, (_, offset): SessionFile => {
      const index = offset + 3;
      return {
        fileId: opaqueFileId(index),
        status: { kind: offset % 2 === 0 ? 'added' : 'modified' },
        oldMode: offset % 2 === 0 ? '000000' : '100644',
        newPath: exactPath(
          `packages/feature-${String(offset).padStart(2, '0')}/deeply/nested/file-${offset}.ts`,
        ),
        additions: offset + 1,
        deletions: offset % 3,
        availability: { kind: 'text' },
      };
    }),
  ];
}

async function readStyles(locator: Locator): Promise<Record<string, string>> {
  return await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      caretColor: style.caretColor,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      opacity: style.opacity,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      padding: style.padding,
      transitionDuration: style.transitionDuration,
    };
  });
}


function srgbChannel(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

interface RgbaColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

function parseComputedColor(value: string): RgbaColor {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  expect(channels, `[accessibility] unable to parse computed color ${value}`).toBeDefined();
  const [red, green, blue, alpha = 1] = channels!;
  return { red, green, blue, alpha };
}

function compositeOver(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);
  if (alpha === 0) {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }
  const composite = (channel: keyof Pick<RgbaColor, 'red' | 'green' | 'blue'>): number =>
    (foreground[channel] * foreground.alpha
      + background[channel] * background.alpha * (1 - foreground.alpha)) / alpha;
  return {
    red: composite('red'),
    green: composite('green'),
    blue: composite('blue'),
    alpha,
  };
}

function renderedContrastRatio(foreground: RgbaColor, background: RgbaColor): number {
  const luminance = ({ blue, green, red }: RgbaColor): number =>
    0.2126 * srgbChannel(red) + 0.7152 * srgbChannel(green) + 0.0722 * srgbChannel(blue);
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

async function readRenderedContrast(
  locator: Locator,
  property: 'color' | 'borderColor' | 'outlineColor' = 'color',
): Promise<{
  readonly background: RgbaColor;
  readonly foreground: RgbaColor;
  readonly layers: readonly string[];
  readonly ratio: number;
}> {
  const measured = await locator.evaluate((element, measuredProperty) => {
    const ancestors: Element[] = [];
    const layers: { color: string; opacity: number; source: string }[] = [];
    for (let current: Element | null = element; current !== null; current = current.parentElement) {
      ancestors.push(current);
    }
    for (const current of ancestors.reverse()) {
      const style = getComputedStyle(current);
      layers.push({
        color: style.backgroundColor,
        opacity: Number(style.opacity),
        source: current === element ? 'target' : current.tagName.toLowerCase(),
      });
      for (const pseudo of ['::before', '::after']) {
        const pseudoStyle = getComputedStyle(current, pseudo);
        if (pseudoStyle.content !== 'none' && pseudoStyle.content !== 'normal') {
          layers.push({
            color: pseudoStyle.backgroundColor,
            opacity: Number(pseudoStyle.opacity),
            source: `${current.tagName.toLowerCase()}${pseudo}`,
          });
        }
      }
    }
    const style = getComputedStyle(element);
    return {
      foreground: style[measuredProperty],
      foregroundOpacity: Number(style.opacity),
      layers,
    };
  }, property);
  const withOpacity = (color: string, opacity: number): RgbaColor => {
    const parsed = parseComputedColor(color);
    return { ...parsed, alpha: parsed.alpha * opacity };
  };
  const background = measured.layers.reduce(
    (composite, layer) => compositeOver(withOpacity(layer.color, layer.opacity), composite),
    { red: 0, green: 0, blue: 0, alpha: 0 },
  );
  const foreground = withOpacity(measured.foreground, measured.foregroundOpacity);
  const renderedForeground = compositeOver(foreground, background);
  return {
    background,
    foreground: renderedForeground,
    layers: measured.layers.map((layer) => `${layer.source}: ${layer.color} × ${layer.opacity}`),
    ratio: renderedContrastRatio(renderedForeground, background),
  };
}

async function expectRenderedContrast(
  locator: Locator,
  label: string,
  minimum: number,
  property: 'color' | 'borderColor' | 'outlineColor' = 'color',
): Promise<void> {
  const measurement = await readRenderedContrast(locator, property);
  expect(
    measurement.ratio,
    `[accessibility] ${label}: ${measurement.ratio} ${property}; foreground ${JSON.stringify(measurement.foreground)}, background ${JSON.stringify(measurement.background)}, layers ${measurement.layers.join(' → ')}`,
  ).toBeGreaterThanOrEqual(minimum);
}

async function expectFocusIndicatorUnclipped(locator: Locator): Promise<void> {
  const geometry = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    const outlineOffset = Number.parseFloat(style.outlineOffset);
    const bounds = element.getBoundingClientRect();
    const perimeter = {
      bottom: bounds.bottom + Math.max(0, outlineWidth + outlineOffset),
      left: bounds.left - Math.max(0, outlineWidth + outlineOffset),
      right: bounds.right + Math.max(0, outlineWidth + outlineOffset),
      top: bounds.top - Math.max(0, outlineWidth + outlineOffset),
    };
    const clippingAncestors: {
      readonly bottom: number;
      readonly left: number;
      readonly right: number;
      readonly top: number;
    }[] = [];
    for (let current = element.parentElement; current !== null; current = current.parentElement) {
      const currentStyle = getComputedStyle(current);
      if (!/(auto|clip|hidden|scroll)/.test(`${currentStyle.overflowX} ${currentStyle.overflowY}`)) {
        continue;
      }
      const ancestor = current.getBoundingClientRect();
      clippingAncestors.push({
        bottom: ancestor.bottom,
        left: ancestor.left,
        right: ancestor.right,
        top: ancestor.top,
      });
    }
    return {
      clippingAncestors,
      focused: document.activeElement === element,
      outlineOffset,
      outlineStyle: style.outlineStyle,
      outlineWidth,
      perimeter,
    };
  });
  expect(geometry.focused, '[accessibility] focus must result from keyboard traversal').toBe(true);
  expect(geometry.outlineStyle).toBe('solid');
  expect(geometry.outlineWidth).toBeGreaterThanOrEqual(2);
  for (const ancestor of geometry.clippingAncestors) {
    const perimeterFits = geometry.perimeter.left >= ancestor.left
      && geometry.perimeter.right <= ancestor.right
      && geometry.perimeter.top >= ancestor.top
      && geometry.perimeter.bottom <= ancestor.bottom;
    expect(
      perimeterFits || geometry.outlineOffset <= -2,
      `[accessibility] focus perimeter ${JSON.stringify(geometry.perimeter)} clipped by ${JSON.stringify(ancestor)}`,
    ).toBe(true);
  }
}

async function assertNoPageOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
async function expectPhase08ReflowAtCurrentWidth(
  page: Page,
  width: Phase08Width,
): Promise<void> {
  const context = page.locator('.review-toolbar');
  await expect.poll(async () => await context.evaluate((element) => {
    const viewport = document.querySelector<HTMLElement>('.diff-workspace__viewport');
    const canvas = document.querySelector<HTMLElement>('.diff-workspace__canvas');
    return viewport !== null
      && canvas !== null
      && viewport.clientWidth > 0
      && canvas.clientWidth >= 640;
  })).toBe(true);

  const reflow: Phase08Reflow = await page.evaluate(() => {
    const element = (selector: string): HTMLElement => {
      const candidate = document.querySelector<HTMLElement>(selector);
      if (candidate === null) {
        throw new Error(`[accessibility] missing ${selector}`);
      }
      return candidate;
    };
    const viewport = element('.diff-workspace__viewport');
    const canvas = element('.diff-workspace__canvas');
    return {
      canvas: { clientWidth: canvas.clientWidth, scrollWidth: canvas.scrollWidth },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      },
      toolbarGroups: [...document.querySelectorAll<HTMLElement>('.review-toolbar__group')]
        .map((group) => group.getBoundingClientRect()),
      viewport: { clientWidth: viewport.clientWidth, scrollWidth: viewport.scrollWidth },
    };
  });
  expect(reflow.document.clientWidth, `[responsive] effective ${width}px viewport`).toBe(width);

  expect(reflow.document.scrollWidth, `[responsive] ${width}px document fit`).toBeLessThanOrEqual(
    reflow.document.clientWidth,
  );
  expect(reflow.toolbarGroups).toHaveLength(2);
  for (const [index, group] of reflow.toolbarGroups.entries()) {
    expect(group.width, `[responsive] ${width}px toolbar group ${index}`).toBeGreaterThan(0);
    expect(group.height, `[responsive] ${width}px toolbar group ${index}`).toBeGreaterThan(0);
  }
  expect(reflow.canvas.clientWidth).toBeGreaterThanOrEqual(640);
  if (width === 320) {
    expect(reflow.viewport.scrollWidth).toBeGreaterThan(reflow.viewport.clientWidth);
    const localScroll = await page.locator('.diff-workspace__viewport').evaluate((viewport) => {
      const element = viewport as HTMLElement;
      element.scrollLeft = 0;
      const atStart = element.scrollLeft;
      element.scrollLeft = element.scrollWidth;
      const atEnd = element.scrollLeft;
      return { atEnd, atStart, documentLeft: window.scrollX };
    });
    expect(localScroll.atStart).toBe(0);
    expect(localScroll.atEnd).toBeGreaterThan(0);
    expect(localScroll.documentLeft).toBe(0);
  }

}

async function expectPhase08ReflowAtWidth(page: Page, width: Phase08Width): Promise<void> {
  await page.setViewportSize({ width, height: 640 });
  await expectPhase08ReflowAtCurrentWidth(page, width);
}

async function expectTreeInteriorAtWidth(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 640 });
  const filesButton = page.getByRole('button', { name: width <= 760 ? 'Open files' : 'Hide files sidebar', exact: true });
  if (width <= 760) {
    await filesButton.click();
  }

  const filesPane = width <= 760
    ? page.getByRole('dialog', { name: 'Files', exact: true }).locator('.changed-files-dialog__results')
    : page.locator('.changed-files-sidebar');
  const selected = filesPane.locator('.tree-row--selected');
  const lineCounts = selected.locator('.line-counts');
  const levelOne = filesPane.locator('[role="treeitem"][aria-level="1"]').first();
  const nested = filesPane.locator('[role="treeitem"][aria-level="2"]').first();
  const directoryCount = filesPane.locator('.directory-row__count').first();

  await expect(filesPane).toBeVisible();
  await expect(selected).toBeVisible();
  await expect(directoryCount).toBeVisible();
  await expect(directoryCount).toHaveText(/\S+/);
  await expect(lineCounts).toBeVisible();
  await expect(lineCounts).toContainText(/\+.*−/u);

  const [selectedBox, filesBox, countsBox, levelOnePadding, nestedPadding] = await Promise.all([
    selected.boundingBox(),
    filesPane.boundingBox(),
    lineCounts.boundingBox(),
    levelOne.evaluate((element) => getComputedStyle(element).paddingInlineStart),
    nested.evaluate((element) => getComputedStyle(element).paddingInlineStart),
  ]);
  expect(selectedBox!.height).toBe(Number.parseFloat(resolveToken(
    canonicalTokens,
    '--file-row-min-height',
  )));
  expect(selectedBox!.x + selectedBox!.width).toBeLessThanOrEqual(filesBox!.x + filesBox!.width);
  expect(countsBox!.x + countsBox!.width).toBeLessThanOrEqual(filesBox!.x + filesBox!.width);
  expect(Number.parseFloat(nestedPadding)).toBeGreaterThan(Number.parseFloat(levelOnePadding));
  await assertNoPageOverflow(page);
}

async function expectNonColorStateCues(page: Page): Promise<void> {
  const selected = page.locator('.tree-row--selected').first();
  const filesPane = page.getByRole('dialog', { name: 'Files', exact: true }).locator('.changed-files-dialog__results');
  const baseBar = page.locator('.monaco-editor .monaco-diff-change-bar--base').first();
  const headBar = page.locator('.monaco-editor .monaco-diff-change-bar--head').first();
  const baseSign = page.locator('.monaco-editor .monaco-diff-change-sign--base').first();
  const headSign = page.locator('.monaco-editor .monaco-diff-change-sign--head').first();
  const sideLabels = page.locator('.diff-workspace__side-labels');
  const firstSideLabel = sideLabels.locator(':scope > span').first();
  const modifiedLines = page.locator('.monaco-diff-editor .modified .view-line');

  await expect(sideLabels).toHaveText(/BASE− REMOVEDHEAD\+ ADDED/);
  await expect(sideLabels.locator(':scope > span').first()).toHaveCSS('font-weight', '600');
  await expect(firstSideLabel).toHaveCSS('padding', '9px 18px');
  await expect(firstSideLabel).toHaveCSS('height', '36px');
  await expect(sideLabels).toHaveCSS('height', '37px');
  if (await filesPane.isVisible()) {
    await expect(selected).toBeVisible();
    expect(await selected.evaluate((element) => getComputedStyle(element, '::before').width)).toBe(
      resolveToken(canonicalTokens, '--selected-rail-width'),
    );
    await expect(selected.locator('.availability-marker--text')).toHaveClass(/visually-hidden/);
    const [selectedBox, filesBox, countsBox] = await Promise.all([
      selected.boundingBox(),
      filesPane.boundingBox(),
      selected.locator('.line-counts').boundingBox(),
    ]);
    expect(selectedBox?.height).toBeLessThanOrEqual(48);
    expect(selectedBox!.x + selectedBox!.width).toBeLessThanOrEqual(filesBox!.x + filesBox!.width);
    expect(countsBox!.x + countsBox!.width).toBeLessThanOrEqual(filesBox!.x + filesBox!.width);
  }
  const lineBoxes = await modifiedLines.evaluateAll((lines) =>
    lines.slice(0, 2).map((line) => {
      const box = line.getBoundingClientRect();
      return { height: box.height, y: box.y };
    }),
  );
  expect(lineBoxes[0]!.height).toBeGreaterThan(0);
  expect(lineBoxes[1]!.y).toBeGreaterThan(lineBoxes[0]!.y);
  await expect(baseBar).toHaveCSS('border-left-style', 'dashed');
  await expect(headBar).toHaveCSS('border-left-style', 'solid');
  expect(await baseSign.evaluate((element) => getComputedStyle(element, '::before').content)).toContain('−');
  expect(await headSign.evaluate((element) => getComputedStyle(element, '::before').content)).toContain('+');
}

async function hoverMonacoLine(page: Page, side: 'base' | 'head', text: string): Promise<void> {
  const editor = side === 'base' ? 'original' : 'modified';
  const editorSurface = page
    .locator(`.monaco-diff-editor .editor.${editor} .monaco-scrollable-element.editor-scrollable`)
    .first();
  await editorSurface.click({ position: { x: 16, y: 16 } });
  await page.keyboard.press('Meta+g');
  await page.keyboard.insertText('10');
  await page.keyboard.press('Enter');
  const line = page.locator(`.monaco-diff-editor .${editor} .view-line`).filter({ hasText: text });
  let bounds: { height: number; width: number; x: number; y: number } | undefined;
  await expect.poll(async () => {
    bounds = await line.evaluateAll((elements) => elements
      .map((element) => {
        const { height, width, x, y } = element.getBoundingClientRect();
        return { height, width, x, y };
      })
      .find(({ height, width }) => height > 0 && width > 0));
    return bounds !== undefined;
  }).toBe(true);
  await page.mouse.move(bounds!.x + 20, bounds!.y + 9);
}

async function rootShadow(container: Locator): Promise<string> {
  return container.evaluate((element) => {
    const probe = document.createElement('div');
    probe.style.boxShadow = getComputedStyle(document.documentElement)
      .getPropertyValue('--shadow-overlay')
      .trim();
    element.append(probe);
    const shadow = getComputedStyle(probe).boxShadow;
    probe.remove();
    return shadow;
  });
}


async function expectGutterLabelSurface(gutter: Locator): Promise<void> {
  const styles = await gutter.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      content: style.content,
      display: style.display,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
    };
  });
  expect(styles).toEqual({
    backgroundColor: toRootRgb('--surface-interactive'),
    borderColor: toRootRgb('--border-default'),
    borderRadius: resolveToken(canonicalTokens, '--radius-overlay'),
    boxShadow: await rootShadow(gutter),
    content: '"Add comment to head line 10"',
    display: 'block',
    fontSize: resolveToken(canonicalTokens, '--font-size-metadata'),
    lineHeight: resolveToken(canonicalTokens, '--line-height-metadata'),
  });
}

async function installPackagedSessionRoutes(
  page: Page,
  session: SessionResponse,
): Promise<{
  failNextDetail: (fileId: string) => void;
  releaseRetry: () => void;
}> {
  let failedFileId = '';
  let retryGate: PromiseWithResolvers<void> | undefined;

  await page.route('**/api/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.route('**/api/files/*', async (route) => {
    const fileId = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    const file = session.files.find((candidate) => candidate.fileId === fileId);
    expect(file, `[behavioral] unexpected file capability ${fileId}`).toBeDefined();
    if (fileId === failedFileId) {
      failedFileId = '';
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'file-unavailable', message: 'denied' }),
      });
      return;
    }
    if (retryGate !== undefined) {
      const gate = retryGate;
      await gate.promise;
      retryGate = undefined;
    }
    const response: FileMetadataResponse = {
      ...file!,
      oldMode: '100644',
      newMode: '100644',
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  await page.route('**/api/files/*/content', async (route) => {
    const fileId = new URL(route.request().url()).pathname.split('/').at(-2) ?? '';
    const file = session.files.find((candidate) => candidate.fileId === fileId);
    expect(file, `[behavioral] unexpected file content capability ${fileId}`).toBeDefined();
    const path = file!.newPath ?? exactPath('src/changed.ts');
    const context = Array.from(
      { length: 9 },
      (_, index) => `export const stableContext${index + 1} = ${index + 1};`,
    ).join('\n');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fileId,
        base: {
          exists: true,
          path,
          language: 'typescript',
          blobOid: 'a'.repeat(40),
          text: `${context}\nexport const changed = 2;\n`,
        },
        head: {
          exists: true,
          path,
          language: 'typescript',
          blobOid: 'b'.repeat(40),
          text: `${context}\nexport const changed = 3;\n`,
        },
      }),
    });
  });

  return {
    failNextDetail(fileId: string): void {
      failedFileId = fileId;
      retryGate = Promise.withResolvers<void>();
    },
    releaseRetry(): void {
      retryGate?.resolve();
    },
  };
}

test.beforeAll(() => {
  runPrerequisite(npmCommand, ['run', 'build']);
  const packOutput = runPrerequisite(npmCommand, [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    packedRoot,
  ]);
  const [packResult] = JSON.parse(packOutput) as PackResult[];
  runPrerequisite('tar', [
    '-xzf',
    join(packedRoot, packResult.filename),
    '-C',
    packedRoot,
  ]);
  symlinkSync(
    join(repositoryRoot, 'node_modules'),
    join(extractedPackageRoot, 'node_modules'),
    'dir',
  );
  writeFileSync(
    join(packedRoot, 'fake-open.mjs'),
    `#!/usr/bin/env node\nprocess.exitCode = 1;\n`,
    'utf8',
  );
  mkdirSync(fakeBinRoot, { recursive: true });
  copyFileSync(join(packedRoot, 'fake-open.mjs'), join(fakeBinRoot, 'open'));
  chmodSync(join(fakeBinRoot, 'open'), 0o755);
});

test.afterAll(() => {
  rmSync(packedRoot, { force: true, recursive: true });
});

test('responsive keyboard and accessibility contract', async ({
  browser,
  context,
  page,
}, testInfo) => {
  assertChromiumPrerequisite(browser, testInfo);
  const repository = await createGitFixture();
  const running = startGeneratedCli(repository);
  const files = createFiles();
  const expectedBase = repository
    .git(['rev-parse', '--verify', repository.baseRef])
    .toString('ascii')
    .trim();
  const expectedHead = repository
    .git(['rev-parse', '--verify', repository.headRef])
    .toString('ascii')
    .trim();
  const expectedMergeBase = repository
    .git(['merge-base', '--all', expectedBase, expectedHead])
    .toString('ascii')
    .trim();
  const session = {
    base: { label: 'Base responsive fixture', oid: expectedBase },
    head: { label: 'Head responsive fixture', oid: expectedHead },
    mergeBaseOid: expectedMergeBase,
    files,
  } as const satisfies SessionResponse;

  try {
    const url = await waitForLoopbackUrl(running);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(url).origin,
    });
    const routeControls = await installPackagedSessionRoutes(page, session);

    await page.setViewportSize({ width: 1440, height: 560 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.session-header__comparison')).toContainText(
      'BASEBase responsive fixture',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('alpha.ts');
    await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toHaveAttribute('title', '00-src/components/alpha.ts');
    await expect(page.locator('.shell-footer__local-status')).toHaveText('Local review · pinned commits');
    await expect(page.locator('.shell-footer__draft-status')).toHaveText('Draft stays local · export is explicit');

    await test.step('rendered real workspace contrast contract', async () => {
      await expectRenderedContrast(
        page.locator(`#${RENAME_MAP.cssPrefix}heading`),
        'active file heading',
        4.5,
      );
  });

    await test.step('exact semantic palette, typography, control, and motion contract', async () => {
      const canonical = Object.fromEntries(
        [...canonicalTokens].map(([name]) => [
          name,
          toCompiledDeclaration(name),
        ]),
      );
      expect(Object.keys(canonical)).not.toHaveLength(0);
      const retired = [
        '--canvas', '--panel', '--accent', '--destructive', '--surface', '--text', '--rule',
        '--addition-bg', '--addition-fg', '--deletion-bg', '--deletion-fg', '--warning-bg',
        '--warning-fg', '--info-bg', '--info-fg', '--error-bg', '--error-fg', '--color-dominant',
        '--color-secondary', '--color-accent', '--color-destructive', '--color-text-primary',
        '--color-text-secondary', '--color-border', '--color-hover', '--color-added',
        '--color-modified', '--color-renamed', '--color-focus', '--surface-inset',
        '--text-secondary', '--border-muted', '--border-strong', '--control-boundary',
        '--font-size-section-heading', '--line-height-section-heading', '--radius-compact',
        '--space-xs', '--space-sm', '--space-md', '--space-lg', '--space-xl',
        '--space-2xl', '--space-3xl',
      ];
      const rootTokens = await page.locator(':root').evaluate((element, names) => {
        const style = getComputedStyle(element);
        return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
      }, Object.keys(canonical));
      expect(rootTokens).toEqual(canonical);
      expect(await page.locator(':root').evaluate((element) => getComputedStyle(element).colorScheme)).toBe('dark');
      await expect(page.locator('body')).toHaveCSS('background-color', toRootRgb('--surface-canvas'));
      await expect(page.locator('body')).toHaveCSS('color', toRootRgb('--text-primary'));

      await page.evaluate(() => {
        const fixture = document.createElement('div');
        fixture.dataset.semanticContract = 'true';
        fixture.innerHTML = [
          '<aside class="inline-notice inline-notice--warning">Warning</aside>',
          '<aside class="inline-notice inline-notice--error">Error</aside>',
          '<aside class="inline-notice inline-notice--information draft-recovery__notice">Information</aside>',
          '<button class="ui-button">Neutral</button>',
          '<button class="ui-button ui-button--primary">Primary</button>',
          '<button class="ui-button ui-button--destructive">Delete</button>',
          '<button class="ui-button" disabled>Disabled</button>',
          '<textarea aria-label="Semantic textarea" placeholder="Write a comment"></textarea>',
          '<input type="checkbox" aria-label="Semantic checkbox" />',
          '<div class="tree-row file-row" data-normal-file>normal.ts</div>',
          '<div data-gutter-targets style="position: relative; height: 32px">',
          '<button class="diff-workspace__gutter-action" aria-label="Add comment to head line 10">+</button>',
          '<button aria-label="Second semantic target" style="position: absolute; right: 48px">Second</button></div>',
        ].join('');
        document.body.append(fixture);
      });
      const fixture = page.locator('[data-semantic-contract]');
      const semanticValues = await fixture.evaluate((element, names) => {
        const all = [element, ...Array.from(element.children)];
        return all.map((child) => Object.fromEntries(names.map((name) => [
          name,
          getComputedStyle(child).getPropertyValue(name).trim(),
        ])));
      }, retired);
      for (const values of semanticValues) {
        expect(values).toEqual(Object.fromEntries(retired.map((name) => [name, ''])));
      }
      await expect(fixture.locator('.inline-notice--warning')).toHaveCSS('border-left-color', toRootRgb('--status-warning-foreground'));
      await expect(fixture.locator('.inline-notice--error')).toHaveCSS('border-left-color', toRootRgb('--status-error-foreground'));
      await expect(fixture.locator('.draft-recovery__notice')).toHaveCSS('border-left-color', toRootRgb('--status-information-foreground'));
      await expect(fixture.locator('.ui-button').first()).toHaveCSS('background-color', toRootRgb('--surface-interactive'));
      await expect(fixture.locator('.ui-button--primary')).toHaveCSS('background-color', toRootRgb('--interactive-accent-emphasis'));
      await expect(fixture.locator('.ui-button--primary')).toHaveCSS('color', toRootRgb('--text-on-emphasis'));
      await expect(fixture.locator('.ui-button--destructive')).toHaveCSS('color', toRootRgb('--destructive-foreground'));
      await expect(fixture.getByRole('button', { name: 'Disabled' })).toHaveCSS('opacity', '1');
      await expect(fixture.getByRole('button', { name: 'Disabled' })).toHaveCSS('color', toRootRgb('--status-disabled-foreground'));
      await expect(fixture.getByLabel('Semantic textarea')).toHaveCSS('caret-color', toRootRgb('--text-primary'));

      const headingSelector = `#${RENAME_MAP.cssPrefix}heading`;
      const typography = await page.evaluate((heading) => [
        heading, '[data-normal-file]', '.availability-marker', '.pin-cue',
      ].map((selector) => {
        const style = getComputedStyle(document.querySelector(selector)!);
        return [selector, style.fontSize, style.fontWeight, style.lineHeight, style.fontFamily];
      }), headingSelector);
      const pageHeading = resolveToken(canonicalTokens, '--font-size-page-heading');
      const pageHeadingLineHeight = resolveToken(canonicalTokens, '--line-height-page-heading');
      const bodySize = resolveToken(canonicalTokens, '--font-size-body');
      const bodyLineHeight = resolveToken(canonicalTokens, '--line-height-body');
      const metadataSize = resolveToken(canonicalTokens, '--font-size-metadata');
      const metadataLineHeight = resolveToken(canonicalTokens, '--line-height-metadata');
      const computedUiFont = expect.stringMatching(/^-apple-system, (?:BlinkMacSystemFont|"system-ui"), "Segoe UI", sans-serif$/);
      expect(typography).toEqual([
        [headingSelector, pageHeading, '600', pageHeadingLineHeight, computedUiFont],
        ['[data-normal-file]', bodySize, '400', bodyLineHeight, computedUiFont],
        ['.availability-marker', metadataSize, '600', metadataLineHeight, computedUiFont],
        ['.pin-cue', metadataSize, '600', metadataLineHeight, computedUiFont],
      ]);
      await expect(page.locator('.path-display').first()).toHaveCSS('font-family', /monospace/);

      const gutterTarget = fixture.locator('.diff-workspace__gutter-action');
      const gutterBox = await gutterTarget.boundingBox();
      const secondTargetBox = await fixture.getByRole('button', { name: 'Second semantic target' }).boundingBox();
      expect(gutterBox!.width).toBeGreaterThanOrEqual(32);
      expect(gutterBox!.height).toBeGreaterThanOrEqual(32);
      expect(secondTargetBox!.x + secondTargetBox!.width + 8).toBeLessThanOrEqual(gutterBox!.x);
      await expect(gutterTarget).toHaveCSS('font-size', '16px');
      await expect(gutterTarget).toHaveCSS('line-height', '16px');
      await expect(gutterTarget).toHaveCSS('padding', '4px');

      const neutral = fixture.locator('.ui-button').first();
      await neutral.hover();
      await expect(neutral).toHaveCSS('background-color', toRootRgb('--surface-interactive-hover'));
      const neutralBox = await neutral.boundingBox();
      await page.mouse.move(neutralBox!.x + 1, neutralBox!.y + 1);
      await page.mouse.down();
      await expect(neutral).toHaveCSS('box-shadow', 'none');
      await page.mouse.up();
      await fixture.locator('.ui-button--destructive').hover();
      await expect(fixture.locator('.ui-button--destructive')).toHaveCSS('background-color', toRootRgb('--destructive-emphasis'));
      await fixture.evaluate((element) => element.remove());
      const motionDurations = await page.locator('button').evaluateAll((buttons) =>
        buttons.map((button) => getComputedStyle(button).transitionDuration),
      );
      expect(motionDurations.every((duration) => duration === '0s')).toBe(true);
    });

    await test.step('real gutter action remains independently accessible', async () => {
      const firstDirectory = page.getByRole('treeitem').first();
      await firstDirectory.focus();
      await page.keyboard.press('ArrowRight');
      await expect(firstDirectory).toHaveAttribute('aria-expanded', 'true');
      await page.locator('.file-tree .file-row').first().click();
      await expect(page.locator('.monaco-diff-editor')).toBeVisible();
      const monacoLine = page.locator('.monaco-diff-editor .modified .view-line').first();
      await expect(monacoLine).toHaveCSS('font-size', resolveToken(canonicalTokens, '--font-size-code'));
      await expect(monacoLine).toHaveCSS('line-height', resolveToken(canonicalTokens, '--line-height-code'));
      await page.setViewportSize({ width: 1650, height: 900 });
      await expect(monacoLine).toHaveCSS('font-size', '14px');
      await expect(monacoLine).toHaveCSS('line-height', '28px');
      await page.setViewportSize({ width: 720, height: 900 });
      await expect(monacoLine).toHaveCSS('font-size', '12px');
      await expect(monacoLine).toHaveCSS('line-height', '24px');
      await page.setViewportSize({ width: 1440, height: 560 });
      await hoverMonacoLine(page, 'head', 'export const changed = 3;');
      const gutter = page.getByRole('button', {
        name: 'Add comment to head line 10',
        exact: true,
      });
      const nextChange = page.getByRole('button', { name: 'Next change', exact: true });
      await expect(gutter).toBeVisible();
      await expect(gutter).toHaveAttribute('aria-label', 'Add comment to head line 10');

      await gutter.hover();
      await expectGutterLabelSurface(gutter);
      await page.mouse.move(0, 0);
      expect(await gutter.evaluate((element) => getComputedStyle(element, '::after').display)).toBe('none');

      await gutter.focus();
      await expectGutterLabelSurface(gutter);
      await nextChange.focus();
      expect(await gutter.evaluate((element) => getComputedStyle(element, '::after').display)).toBe('none');

      await expect(page.locator('.review-toolbar')).toHaveCSS('box-shadow', 'none');
    });
    await test.step('keyboard-only 320px journey keeps existing destinations and discard flow reachable', async () => {
      await page.setViewportSize({ width: 320, height: 640 });

      for (const [name, destination] of [
        ['Skip to diff', `${RENAME_MAP.cssPrefix}heading`],
      ] as const) {
        const skipLink = page.getByRole('link', { name, exact: true });
        await skipLink.focus();
        await expectFocusIndicatorUnclipped(skipLink);
        await page.keyboard.press('Enter');
        await expect.poll(() => new URL(page.url()).hash).toBe(`#${destination}`);
      }

      const files = page.getByRole('button', { name: 'Open files', exact: true });
      await files.focus();
      await expectFocusIndicatorUnclipped(files);
      await page.keyboard.press('Enter');
      const changedFiles = page.getByRole('dialog', { name: 'Files', exact: true });
      const filter = changedFiles.getByRole('searchbox', { name: 'Filter files', exact: true });
      await expect(changedFiles).toBeVisible();
      await expect(filter).toBeFocused();
      const firstFile = changedFiles.locator('.file-tree .file-row').first();
      await firstFile.focus();
      await expectFocusIndicatorUnclipped(firstFile);
      await page.keyboard.press('Enter');
      await expect(changedFiles).toHaveCount(0);
      await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toBeFocused();

      await page.keyboard.press('Alt+Shift+]');
      await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('beta-after-a-very-long-rename.ts');
      await page.keyboard.press('Alt+Shift+[');
      await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('alpha.ts');


      await page.keyboard.press('F7');
      await page.keyboard.press('Shift+F7');
      await expect(page.locator('.monaco-diff-editor')).toBeVisible();
      await assertNoPageOverflow(page);
    });

    await test.step('desktop review toolbar exposes four controls in sequential Tab order', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.keyboard.press('Alt+Shift+]');
      await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('beta-after-a-very-long-rename.ts');

      const previousFile = page.getByRole('button', { name: 'Previous file', exact: true });
      const nextFile = page.getByRole('button', { name: 'Next file', exact: true });
      const previousChange = page.getByRole('button', { name: 'Previous change', exact: true });
      const nextChange = page.getByRole('button', { name: 'Next change', exact: true });
      const controls = [previousFile, nextFile, previousChange, nextChange] as const;

      for (const control of [previousFile, nextFile, previousChange, nextChange]) {
        await expect(control).toBeEnabled();
      }

      await previousFile.focus();
      await expect(previousFile).toBeFocused();
      await expectFocusIndicatorUnclipped(previousFile);
      for (const control of controls.slice(1)) {
        await page.keyboard.press('Tab');
        await expect(control).toBeFocused();
        await expectFocusIndicatorUnclipped(control);
      }
      await assertNoPageOverflow(page);

      await page.keyboard.press('Alt+Shift+[');
      await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('alpha.ts');
    });

    await test.step('Phase 08 boundary matrix preserves local diff overflow and complete identities', async () => {
      for (const width of phase08Widths) {
        await expectPhase08ReflowAtWidth(page, width);
      }

      const files = page.getByRole('button', { name: 'Open files', exact: true });
      await files.focus();
      await page.keyboard.press('Enter');
      const changedFiles = page.getByRole('dialog', { name: 'Files', exact: true });
      const movedFile = changedFiles.locator('.file-tree .file-row').nth(1);
      await movedFile.click();
      const movedPath = page.locator(`#${RENAME_MAP.cssPrefix}heading .path-display`);
      await expect(movedPath).toContainText('beta-before-a-very-long-rename.ts');
      await expect(movedPath).toContainText('→');
      await expect(movedPath).toContainText('beta-after-a-very-long-rename.ts');
      expect(await page.locator(`#${RENAME_MAP.cssPrefix}heading`).evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(32);

      await page.setViewportSize({ width: 1440, height: 640 });
      // 31.5px heading line-height + 4px top padding + 4px bottom padding + 1px bottom border.
      expect(await page.locator('.review-toolbar').evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(41);
      await page.keyboard.press('Alt+Shift+[');
      await expect(page.locator(`#${RENAME_MAP.cssPrefix}heading`)).toContainText('alpha.ts');
      await page.setViewportSize({ width: 320, height: 640 });
      await expect(page.locator('.changed-files-sidebar')).not.toBeVisible();
      await files.focus();
      await page.keyboard.press('Enter');
      const filter = changedFiles.getByRole('searchbox', { name: 'Filter files', exact: true });
      await expect(changedFiles).toBeVisible();
      await expect(filter).toBeFocused();
      await expect(page.getByRole('navigation', { name: 'Files', exact: true })).toHaveCount(1);
      await expect(page.locator('.review-shell')).toHaveAttribute('inert', '');
      expect(await page.locator('.review-main').evaluate((main) => (
        [...main.querySelectorAll('input, textarea, select')]
          .filter((control) => control.closest('.diff-workspace') === null)
          .length
      ))).toBe(0);
      await assertNoPageOverflow(page);
      await page.keyboard.press('Escape');
      await expect(files).toBeFocused();

    });


    await test.step('tree interiors remain fluid at shipped hosts', async () => {
      await expectTreeInteriorAtWidth(page, phase08Widths[0]);
      await expectTreeInteriorAtWidth(page, phase08Widths[1]);
      await expectTreeInteriorAtWidth(page, 420);
      await page.getByRole('button', { name: 'Close files', exact: true }).click();
    });

    await test.step('achromatopsia preserves real non-color diff and focus cues', async () => {
      const cdp = await page.context().newCDPSession(page);
      const files = page.getByRole('button', { name: 'Open files', exact: true });
      const changedFiles = page.getByRole('dialog', { name: 'Files', exact: true });
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
      await files.focus();
      await page.keyboard.press('Enter');
      try {
        await expect(changedFiles.getByRole('searchbox', { name: 'Filter files', exact: true })).toBeFocused();
        await page.getByRole('button', { name: 'Close files', exact: true }).click();
      } finally {
        await cdp.detach();
      }
    });
    await test.step('forced colors preserve files dialog focus', async () => {
      await page.emulateMedia({ forcedColors: 'active' });
      const files = page.getByRole('button', { name: 'Open files', exact: true });
      const changedFiles = page.getByRole('dialog', { name: 'Files', exact: true });
      await files.focus();
      await page.keyboard.press('Enter');
      try {
        await expect(changedFiles).toBeVisible();
        await expect(changedFiles.getByRole('searchbox', { name: 'Filter files', exact: true })).toBeFocused();
        await page.getByRole('button', { name: 'Close files', exact: true }).click();
        await expect(files).toBeFocused();
      } finally {
        await page.emulateMedia({ forcedColors: 'none' });
      }
    });
    await page.setViewportSize({ width: 1440, height: 560 });


    await test.step('changed-files drawers honor locked responsive geometry', async () => {
      const treePane = page.locator('.changed-files-sidebar');
      const reviewMain = page.locator('.review-main');
      const stateCard = page.locator('[data-state-card-contract]');
      const reviewShell = page.locator('.review-shell');
      const sessionHeader = page.locator('.session-header');
      const headerFacts = page.locator('.header-facts');
      const overlayShadow = await rootShadow(headerFacts);
      const assertFilesCollapse = async (width: number): Promise<void> => {
        await page.setViewportSize({ width, height: 560 });
        const filesButton = page.getByRole('button', { name: 'Hide files sidebar', exact: true });
        await expect(filesButton).toHaveAttribute('aria-controls', 'changed-files');
        await expect(filesButton).toHaveAttribute('aria-expanded', 'true');
        const before = await reviewShell.evaluate((shell) => {
          const files = shell.querySelector<HTMLElement>('.changed-files-sidebar')!;
          const main = shell.querySelector<HTMLElement>('.review-main')!;
          const filesBox = files.getBoundingClientRect();
          const mainBox = main.getBoundingClientRect();
          return {
            files: { x: filesBox.x, width: filesBox.width },
            main: { x: mainBox.x, width: mainBox.width },
          };
        });
        expect(before.files.x + before.files.width).toBeCloseTo(before.main.x, 3);

        await filesButton.click();
        const showFilesButton = page.getByRole('button', { name: 'Show files sidebar', exact: true });
        await expect(showFilesButton).not.toHaveAttribute('aria-controls');
        await expect(page.locator('#changed-files')).not.toBeVisible();
        const collapsed = await reviewShell.evaluate((shell) => {
          const main = shell.querySelector<HTMLElement>('.review-main')!;
          const shellBox = shell.getBoundingClientRect();
          const mainBox = main.getBoundingClientRect();
          return {
            shellX: shellBox.x,
            main: { x: mainBox.x, width: mainBox.width },
          };
        });
        expect(collapsed.main.x).toBeCloseTo(collapsed.shellX, 3);
        expect(collapsed.main.width).toBeGreaterThan(before.main.width);
        await assertNoPageOverflow(page);

        await showFilesButton.click();
        await expect(filesButton).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#changed-files')).toBeVisible();
        await expect(page.locator('.changed-files-sidebar [role="treeitem"]').first()).toBeVisible();
        const restored = await reviewShell.evaluate((shell) => {
          const files = shell.querySelector<HTMLElement>('.changed-files-sidebar')!;
          const main = shell.querySelector<HTMLElement>('.review-main')!;
          const filesBox = files.getBoundingClientRect();
          const mainBox = main.getBoundingClientRect();
          return {
            files: { x: filesBox.x, width: filesBox.width },
            main: { x: mainBox.x, width: mainBox.width },
          };
        });
        expect(restored.files.x).toBeCloseTo(before.files.x, 3);
        expect(restored.files.width).toBeCloseTo(before.files.width, 3);
        expect(restored.main.x).toBeCloseTo(before.main.x, 3);
        expect(restored.main.width).toBeCloseTo(before.main.width, 3);
        await assertNoPageOverflow(page);
      };

      await page.evaluate(() => {
        const card = document.createElement('section');
        card.className = 'state-card';
        card.dataset.stateCardContract = 'true';
        document.body.append(card);
      });
      await expect(stateCard).toHaveCSS('padding', '24px');
      for (const staticSurface of [treePane, page.locator('.session-header'), reviewMain, stateCard]) {
        await expect(staticSurface).toHaveCSS('box-shadow', 'none');
      }
      await assertNoPageOverflow(page);
      await assertFilesCollapse(1440);

      const nextChange = page.getByRole('button', { name: 'Next change', exact: true });
      await nextChange.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(nextChange).toBeFocused();
      const focusStyle = await readStyles(nextChange);
      expect(focusStyle.outlineColor).toBe(toRootRgb('--focus-ring'));
      expect(focusStyle.outlineStyle).toBe('solid');
      expect(focusStyle.outlineWidth).toBe(resolveToken(canonicalTokens, '--focus-outline-width'));
      expect(focusStyle.outlineOffset).toBe(resolveToken(canonicalTokens, '--focus-offset'));
      await expectFocusIndicatorUnclipped(nextChange);

      await assertNoPageOverflow(page);

      await page.setViewportSize({ width: 1050, height: 560 });
      await expect(page.getByRole('button', { name: 'Hide files sidebar', exact: true })).toHaveAttribute('aria-expanded', 'true');
      await expect(sessionHeader).toHaveCSS('flex-wrap', 'wrap');
      await expect(headerFacts).toHaveCSS('flex-wrap', 'wrap');
      const desktopColumns = await reviewShell.evaluate((shell) => {
        const files = shell.querySelector<HTMLElement>('.changed-files-sidebar')!;
        const main = shell.querySelector<HTMLElement>('.review-main')!;
        const filesBox = files.getBoundingClientRect();
        const mainBox = main.getBoundingClientRect();
        return {
          filesPosition: getComputedStyle(files).position,
          mainPosition: getComputedStyle(main).position,
          filesBox: { x: filesBox.x, width: filesBox.width },
          mainBox: { x: mainBox.x, width: mainBox.width },
        };
      });
      expect(desktopColumns.filesPosition).toBe('static');
      expect(desktopColumns.mainPosition).toBe('static');
      expect(desktopColumns.filesBox.width).toBeGreaterThan(0);
      expect(desktopColumns.mainBox.width).toBeGreaterThan(0);
      expect(desktopColumns.filesBox.x + desktopColumns.filesBox.width).toBeCloseTo(desktopColumns.mainBox.x, 3);
      await assertNoPageOverflow(page);

      await page.setViewportSize({ width: 761, height: 560 });
      await expect(page.getByRole('button', { name: 'Hide files sidebar', exact: true })).toHaveAttribute('aria-expanded', 'true');
      await expect(sessionHeader).toHaveCSS('flex-wrap', 'wrap');
      await expect(headerFacts).toHaveCSS('flex-wrap', 'wrap');
      const wrappedHeaderGeometry = await sessionHeader.evaluate((header) => {
        const headerBox = header.getBoundingClientRect();
        const items = [
          header.querySelector<HTMLElement>('.session-header__brand')!,
          ...header.querySelectorAll<HTMLElement>('.header-facts > *'),
        ].map((element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        });
        return {
          header: {
            left: headerBox.left,
            top: headerBox.top,
            right: headerBox.right,
            bottom: headerBox.bottom,
          },
          items,
        };
      });
      for (const item of wrappedHeaderGeometry.items) {
        expect(item.width).toBeGreaterThan(0);
        expect(item.height).toBeGreaterThan(0);
        expect(item.left).toBeGreaterThanOrEqual(wrappedHeaderGeometry.header.left);
        expect(item.top).toBeGreaterThanOrEqual(wrappedHeaderGeometry.header.top);
        expect(item.right).toBeLessThanOrEqual(wrappedHeaderGeometry.header.right);
        expect(item.bottom).toBeLessThanOrEqual(wrappedHeaderGeometry.header.bottom);
      }
      for (const [index, item] of wrappedHeaderGeometry.items.entries()) {
        for (const other of wrappedHeaderGeometry.items.slice(index + 1)) {
          expect(item.right <= other.left || other.right <= item.left || item.bottom <= other.top || other.bottom <= item.top).toBe(true);
        }
      }
      const wrappedColumns = await reviewShell.evaluate((shell) => {
        const files = shell.querySelector<HTMLElement>('.changed-files-sidebar')!;
        const main = shell.querySelector<HTMLElement>('.review-main')!;
        const filesBox = files.getBoundingClientRect();
        const mainBox = main.getBoundingClientRect();
        return {
          filesPosition: getComputedStyle(files).position,
          mainPosition: getComputedStyle(main).position,
          filesBox: { x: filesBox.x, width: filesBox.width },
          mainBox: { x: mainBox.x, width: mainBox.width },
        };
      });
      expect(wrappedColumns.filesPosition).toBe('static');
      expect(wrappedColumns.mainPosition).toBe('static');
      expect(wrappedColumns.filesBox.width).toBeGreaterThan(0);
      expect(wrappedColumns.mainBox.width).toBeGreaterThan(0);
      expect(wrappedColumns.filesBox.x + wrappedColumns.filesBox.width).toBeCloseTo(wrappedColumns.mainBox.x, 3);
      await assertNoPageOverflow(page);

      await page.setViewportSize({ width: 1651, height: 560 });
      const wideSidebarWidth = Math.round((await treePane.boundingBox())!.width);
      await page.setViewportSize({ width: 1051, height: 560 });
      const compactSidebarWidth = Math.round((await treePane.boundingBox())!.width);
      expect(wideSidebarWidth).toBeGreaterThan(compactSidebarWidth);
      await page.setViewportSize({ width: 761, height: 560 });
      await assertFilesCollapse(761);
      await assertNoPageOverflow(page);

      await page.setViewportSize({ width: 760, height: 560 });
      const filesButton = page.getByRole('button', { name: 'Open files', exact: true });
      const changedFiles = page.getByRole('dialog', { name: 'Files', exact: true });
      await expect(filesButton).toBeVisible();
      await expect(filesButton).not.toHaveAttribute('aria-controls');
      await expect(filesButton).not.toHaveAttribute('aria-expanded');
      await expect(page.locator('.changed-files-sidebar')).not.toBeVisible();
      await filesButton.focus();
      await page.keyboard.press('Enter');
      await expect(changedFiles).toBeVisible();
      await expect(changedFiles).toHaveCSS('box-shadow', overlayShadow);
      await assertNoPageOverflow(page);
      await expect(page.getByRole('button', { name: 'Close files', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(changedFiles).toHaveCount(0);
      await expect(filesButton).toBeFocused();

      await page.setViewportSize({ width: 759, height: 560 });
      await assertNoPageOverflow(page);

      await page.setViewportSize({ width: 375, height: 640 });
      await expect(stateCard).toHaveCSS('padding', '16px');
      await assertNoPageOverflow(page);
      await stateCard.evaluate((element) => element.remove());

      await page.setViewportSize({ width: 320, height: 640 });
      await nextChange.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(nextChange).toBeFocused();
      await expectFocusIndicatorUnclipped(nextChange);
      await nextChange.evaluate((element) => element.blur());
      await assertNoPageOverflow(page);
    });

    await test.step('compact viewport preserves accessible review controls', async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await expect(page.getByRole('button', { name: 'Open files', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Open files', exact: true }).click();
      await expect(page.getByRole('tree', { name: /Files/ })).toBeVisible();
      await page.getByRole('button', { name: 'Close files' }).click();
    });

    if (process.env[`${RENAME_MAP.envPrefix}TRUE_ZOOM`] === '1') {
      test.setTimeout(90_000);
      await test.step('headed true 4× browser zoom preserves the effective 320px contract', async () => {
        await page.setViewportSize({ width: 1280, height: 640 });
        const nextChange = page.getByRole('button', { name: 'Next change', exact: true });
        await nextChange.focus();
        await expect(nextChange).toBeFocused();
        await page.bringToFront();
        console.log('[manual] Apply Chromium browser zoom to 4× with the browser zoom shortcut.');
        await expect.poll(
          () => page.evaluate(() => document.documentElement.clientWidth),
          { message: '[manual] waiting for true browser zoom to create a 320 CSS px viewport', timeout: 60_000 },
        ).toBe(320);
        await expectPhase08ReflowAtCurrentWidth(page, 320);
        console.log('[manual] true zoom observation', JSON.stringify(await page.evaluate(() => {
          const viewport = document.querySelector<HTMLElement>('.diff-workspace__viewport')!;
          const canvas = document.querySelector<HTMLElement>('.diff-workspace__canvas')!;
          const focused = document.activeElement as HTMLElement | null;
          return {
            canvas: { clientWidth: canvas.clientWidth, scrollWidth: canvas.scrollWidth },
            document: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            },
            focus: focused?.getAttribute('aria-label') ?? focused?.textContent?.trim() ?? null,
            viewport: { clientWidth: viewport.clientWidth, scrollWidth: viewport.scrollWidth },
          };
        })));
      });
    }
  } finally {
    await stopGeneratedCli(running);
    await repository.cleanup();
  }
});
