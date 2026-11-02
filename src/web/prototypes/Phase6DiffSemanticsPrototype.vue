<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { RENAME_MAP } from '../../domain/product-identity';

import '../styles.css';

type VariantId = 'quiet-rails' | 'signed-gutters' | 'layered-overlap';

type CoverageItem = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
};

type VariantDefinition = {
  readonly id: VariantId;
  readonly label: string;
  readonly strapline: string;
  readonly detail: string;
};

const VARIANTS: readonly VariantDefinition[] = [
  {
    id: 'quiet-rails',
    label: 'Quiet rails',
    strapline: 'Minimal row fills with calm edge rails and tiny signed markers.',
    detail: 'Best for reading code first: restrained fills, narrow continuity rails, and small start/end signs keep changed words in charge.',
  },
  {
    id: 'signed-gutters',
    label: 'Signed gutters',
    strapline: 'Wide structural gutters turn addition and deletion into non-color-first scaffolding.',
    detail: 'Best for scanning shape first: enlarged sign lanes, strong multi-line bars, and lighter row fills make Base/Head meaning explicit at a glance.',
  },
  {
    id: 'layered-overlap',
    label: 'Layered overlap',
    strapline: 'Diff meaning stays underneath visibly stacked selection, focus, anchor, and active-line geometry.',
    detail: 'Best for state-heavy review: layered fills, crisp inset edges, and anchor rails show how overlap could read without replacing diff semantics.',
  },
] as const;

const DIFF_CHECKLIST: readonly CoverageItem[] = [
  {
    id: 'DIFF-01',
    title: 'Coordinated shell and editor palette',
    detail: 'Canvas, side labels, gutters, comments rail, and syntax accents all reuse the existing Phase 05 semantic tokens.',
  },
  {
    id: 'DIFF-02',
    title: 'Addition, deletion, intraline, hunk, unchanged, and empty states',
    detail: 'The mock canvas shows quiet unchanged context, recessed empty counterparts, hunk separators, line fills, and stronger intraline change spans.',
  },
  {
    id: 'DIFF-03',
    title: 'Base and Head stay distinct without color alone',
    detail: 'BASE/HEAD headers, persistent minus/plus signage, and side-specific rails reinforce meaning beyond red-versus-green reading.',
  },
  {
    id: 'DIFF-04',
    title: 'Legible gutters and comment affordance without reflow',
    detail: 'Line numbers, continuous bars, sparse signs, and the fixed gutter comment button stay visible while code geometry remains side by side.',
  },
  {
    id: 'DIFF-05',
    title: 'Overlapping states remain separable',
    detail: 'Selection edge, active-line edge, hover affordance, anchor rail, and focus ring stack as distinct channels instead of replacing diff meaning.',
  },
] as const;

const DECISION_CHECKLIST: readonly CoverageItem[] = [
  {
    id: 'D-01',
    title: 'Quiet changed rows, stronger changed words',
    detail: 'Whole-line fills stay restrained while intraline marks carry the highest local emphasis.',
  },
  {
    id: 'D-02',
    title: 'Signed Base and Head cues',
    detail: 'Every treatment keeps non-color minus and plus markers alongside BASE/HEAD labels and side position.',
  },
  {
    id: 'D-03',
    title: 'Continuous multi-line change bars',
    detail: 'Long contiguous changes use uninterrupted gutter rails with sparse start/end signs rather than repeated badges on every row.',
  },
  {
    id: 'D-04',
    title: 'Quiet unchanged and empty treatment',
    detail: 'Unchanged rows stay near the canvas tone while empty counterparts recess farther into the inset role.',
  },
  {
    id: 'D-05',
    title: 'Diff meaning is the persistent base layer',
    detail: 'Interaction states are drawn with edges, rails, outlines, and affordances instead of opaque replacement fills.',
  },
  {
    id: 'D-06',
    title: 'Selection fill plus crisp edge',
    detail: 'The selected row keeps a restrained blue fill and visible edge while the signed gutter and diff rails remain readable.',
  },
  {
    id: 'D-07',
    title: 'Active-line edge and hover affordance',
    detail: 'An active-line edge and stronger line-number emphasis sit beside a visible comment affordance instead of another row tint.',
  },
  {
    id: 'D-08',
    title: 'Persistent anchor rail plus separate focus ring',
    detail: 'The anchored row keeps its inset rail while the diff surface and controls preserve an outer focus ring as a second location signal.',
  },
] as const;

const SWITCHER_NOTES = [
  'Use the floating switcher buttons or ArrowLeft / ArrowRight to cycle variants.',
  'Arrow keys are ignored inside the textarea, inputs, selects, and contenteditable surfaces.',
  'Share any treatment with a stable dev URL containing ?prototype=phase6&variant=…',
] as const;

const canvasHost = ref<HTMLElement | null>(null);
const variant = ref<VariantId>(readVariantFromUrl());

function readVariantFromUrl(): VariantId {
  const candidate = new URLSearchParams(window.location.search).get('variant');
  return VARIANTS.some((entry) => entry.id === candidate)
    ? candidate as VariantId
    : 'quiet-rails';
}

function writeVariantToUrl(next: VariantId): void {
  const url = new URL(window.location.href);
  url.searchParams.set('prototype', 'phase6');
  url.searchParams.set('variant', next);
  window.history.replaceState({ prototype: 'phase6', variant: next }, '', url);
}

function setVariant(next: VariantId): void {
  variant.value = next;
  writeVariantToUrl(next);
}

function cycleVariant(direction: -1 | 1): void {
  const index = VARIANTS.findIndex((entry) => entry.id === variant.value);
  const nextIndex = (index + direction + VARIANTS.length) % VARIANTS.length;
  setVariant(VARIANTS[nextIndex]!.id);
}

function handlePopState(): void {
  variant.value = readVariantFromUrl();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]') !== null;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    cycleVariant(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    cycleVariant(1);
  }
}

const currentVariant = computed(() => VARIANTS.find((entry) => entry.id === variant.value) ?? VARIANTS[0]!);
const currentIndex = computed(() => VARIANTS.findIndex((entry) => entry.id === variant.value));
const previousVariant = computed(() => VARIANTS[(currentIndex.value + VARIANTS.length - 1) % VARIANTS.length]!);
const nextVariant = computed(() => VARIANTS[(currentIndex.value + 1) % VARIANTS.length]!);
const shareableQuery = computed(() => `?prototype=phase6&variant=${variant.value}`);

onMounted(() => {
  writeVariantToUrl(variant.value);
  canvasHost.value?.focus();
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('popstate', handlePopState);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('popstate', handlePopState);
});
</script>

<template>
  <main
    :class="['phase6-prototype', `phase6-prototype--${variant}`]"
    :data-active-variant="variant"
    aria-label="Phase 6 diff semantics throwaway mockup"
  >
    <header class="session-header phase6-prototype__header">
      <div class="phase6-prototype__header-copy">
        <p class="phase6-prototype__eyebrow">PHASE 6 THROWAWAY MOCKUP</p>
        <h1>{{ RENAME_MAP.displayName }}: Monaco diff semantics board</h1>
        <p>
          Development-only shell for comparing three possible Phase 6 visual treatments before real Monaco theming.
          The production review workflow, persistence, and API behavior stay untouched.
        </p>
      </div>
      <div class="header-facts" aria-label="Prototype facts">
        <span>Dev URL only</span>
        <span>No persistence</span>
        <span>Existing shell vocabulary</span>
        <span>Cleanup after visual decision</span>
      </div>
    </header>

    <section class="workspace-shell phase6-prototype__workspace" aria-label="Prototype review workspace">
      <section class="phase6-prototype__primary">
        <header class="active-file-strip phase6-prototype__file-strip">
          <div>
            <p class="phase6-prototype__file-kicker">Pinned comparison · semantic mock only</p>
            <h2>src/server/review-session.ts</h2>
            <p>BASE 7b1a64d · HEAD c91ef5a · 3 semantic variants</p>
          </div>
          <div class="phase6-prototype__toolbar" aria-label="Static view controls">
            <button type="button" class="view-tab" aria-selected="true">Side by side</button>
            <button type="button" class="view-tab" aria-selected="false">Comments</button>
            <button type="button" class="ui-button">Reveal hunk</button>
          </div>
        </header>

        <div class="phase6-prototype__diff-scroll" aria-label="Localized side-by-side diff scroll container">
          <section class="diff-workspace phase6-prototype__diff-workspace" aria-labelledby="phase6-diff-heading">
            <div class="diff-workspace__side-labels" aria-hidden="true">
              <span>BASE</span>
              <span>HEAD</span>
            </div>
            <button
              type="button"
              class="diff-workspace__gutter-action"
              style="top: 176px"
              aria-label="Mock hover affordance on head line 49"
              title="Mock hover affordance on head line 49"
            >+</button>
            <div ref="canvasHost" class="phase6-prototype__canvas" tabindex="0">
              <div class="phase6-prototype__variant-intro">
                <span class="phase6-prototype__variant-chip">{{ currentVariant.label }}</span>
                <p id="phase6-diff-heading">{{ currentVariant.strapline }}</p>
              </div>

              <div class="phase6-prototype__row phase6-prototype__row--hunk" role="presentation">
                <div class="phase6-prototype__hunk-banner">@@ -41,18 +41,22 @@ renderReviewSurface(session)</div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--unchanged">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L41</span></div>
                  <pre class="phase6-prototype__code"><span class="phase6-prototype__token-keyword">const</span> reviewState = <span class="phase6-prototype__token-function">computeReviewState</span>(draft);</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--unchanged">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L41</span></div>
                  <pre class="phase6-prototype__code"><span class="phase6-prototype__token-keyword">const</span> reviewState = <span class="phase6-prototype__token-function">computeReviewState</span>(draft);</pre>
                </div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--deletion phase6-prototype__cell--block-start phase6-prototype__cell--active">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L42</span>
                    <span class="phase6-prototype__sign">−</span>
                  </div>
                  <pre class="phase6-prototype__code"><span class="phase6-prototype__token-keyword">const</span> semanticState = <mark class="phase6-prototype__intraline phase6-prototype__intraline--deletion">renderLegacyDiffFill</mark>(selection);</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--addition phase6-prototype__cell--block-start phase6-prototype__cell--selection">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L42</span>
                    <span class="phase6-prototype__sign">+</span>
                  </div>
                  <pre class="phase6-prototype__code"><span class="phase6-prototype__token-keyword">const</span> semanticState = <mark class="phase6-prototype__intraline phase6-prototype__intraline--addition">renderSemanticLayers</mark>(selection);</pre>
                </div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--deletion phase6-prototype__cell--block-mid">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L43</span>
                    <span class="phase6-prototype__sign phase6-prototype__sign--muted">−</span>
                  </div>
                  <pre class="phase6-prototype__code">applySelectionFill(editor, <mark class="phase6-prototype__intraline phase6-prototype__intraline--deletion">diffRow</mark>);</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--addition phase6-prototype__cell--block-mid phase6-prototype__cell--selection">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L43</span>
                    <span class="phase6-prototype__sign phase6-prototype__sign--muted">+</span>
                  </div>
                  <pre class="phase6-prototype__code">applySelectionEdge(editor, <mark class="phase6-prototype__intraline phase6-prototype__intraline--addition">semanticRow</mark>);</pre>
                </div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--deletion phase6-prototype__cell--block-end phase6-prototype__cell--empty-note">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L44</span>
                    <span class="phase6-prototype__sign">−</span>
                  </div>
                  <pre class="phase6-prototype__code">highlightHoveredRows(editor, hoverLine);</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--addition phase6-prototype__cell--block-end phase6-prototype__cell--selection phase6-prototype__cell--hover">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L44</span>
                    <span class="phase6-prototype__sign">+</span>
                  </div>
                  <pre class="phase6-prototype__code">highlightHoveredAffordance(editor, hoverLine);<span class="phase6-prototype__comment-affordance" aria-hidden="true">+</span></pre>
                </div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--unchanged phase6-prototype__cell--anchor">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L45</span></div>
                  <pre class="phase6-prototype__code">syncAnchorRail(baseEditor, anchorLine);</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--unchanged phase6-prototype__cell--anchor phase6-prototype__cell--focus-target">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L45</span></div>
                  <pre class="phase6-prototype__code">syncAnchorRail(headEditor, anchorLine);</pre>
                </div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--empty">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L46</span></div>
                  <pre class="phase6-prototype__code">∅ empty counterpart stays recessed</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--addition phase6-prototype__cell--block-start">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L46</span>
                    <span class="phase6-prototype__sign">+</span>
                  </div>
                  <pre class="phase6-prototype__code"><span class="phase6-prototype__token-keyword">if</span> (isFocused) <span class="phase6-prototype__token-function">showOuterFocusRing</span>();</pre>
                </div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--empty">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L47</span></div>
                  <pre class="phase6-prototype__code">∅ no base counterpart</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--addition phase6-prototype__cell--block-end phase6-prototype__cell--selection">
                  <div class="phase6-prototype__gutter" aria-hidden="true">
                    <span>L47</span>
                    <span class="phase6-prototype__sign">+</span>
                  </div>
                  <pre class="phase6-prototype__code">persistSelectionGeometry(editor, focusedSide);</pre>
                </div>
              </div>

              <div class="phase6-prototype__row phase6-prototype__row--collapsed">
                <div class="phase6-prototype__collapsed-region">⋯ 12 unchanged lines hidden · reveal controls keep the hunk accent, not the code rows ⋯</div>
              </div>

              <div class="phase6-prototype__row">
                <div class="phase6-prototype__cell phase6-prototype__cell--unchanged phase6-prototype__cell--selection">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L60</span></div>
                  <pre class="phase6-prototype__code"><span class="phase6-prototype__token-keyword">return</span> currentSelection.<span class="phase6-prototype__token-property">lineCount</span> &gt; 0;</pre>
                </div>
                <div class="phase6-prototype__cell phase6-prototype__cell--unchanged phase6-prototype__cell--selection phase6-prototype__cell--hover">
                  <div class="phase6-prototype__gutter" aria-hidden="true"><span>L63</span></div>
                  <pre class="phase6-prototype__code"><span class="phase6-prototype__token-keyword">return</span> currentSelection.<span class="phase6-prototype__token-property">lineCount</span> &gt; 0;</pre>
                </div>
              </div>
            </div>
            <p class="diff-workspace__context-help">
              Quiet unchanged context, stronger changed words, signed gutters, selection edges, anchor rails, and a separate focus ring are all visible here.
            </p>
          </section>
        </div>
      </section>

      <aside class="phase6-prototype__rail" aria-label="Semantic legend and checklist">
        <section class="phase6-prototype__panel phase6-prototype__panel--variant">
          <div class="comments-rail__heading">
            <h2>Variant switcher</h2>
            <span class="phase6-prototype__status-pill">{{ currentVariant.label }}</span>
          </div>
          <p>{{ currentVariant.detail }}</p>
          <code class="phase6-prototype__share-link">{{ shareableQuery }}</code>
          <ul class="phase6-prototype__variant-list" aria-label="Available variants">
            <li v-for="entry in VARIANTS" :key="entry.id">
              <button
                type="button"
                class="ui-button phase6-prototype__variant-button"
                :class="{ 'phase6-prototype__variant-button--current': entry.id === variant }"
                :aria-pressed="entry.id === variant"
                :data-variant="entry.id"
                @click="setVariant(entry.id)"
              >
                <span>{{ entry.label }}</span>
                <small>{{ entry.strapline }}</small>
              </button>
            </li>
          </ul>
          <ul class="phase6-prototype__switcher-notes">
            <li v-for="note in SWITCHER_NOTES" :key="note">{{ note }}</li>
          </ul>
        </section>

        <section class="phase6-prototype__panel">
          <div class="comments-rail__heading">
            <h2>Acceptance checklist</h2>
            <span class="phase6-prototype__status-pill">13 signals</span>
          </div>
          <ol class="phase6-prototype__checklist" aria-label="Diff requirements coverage">
            <li v-for="item in DIFF_CHECKLIST" :key="item.id">
              <strong>{{ item.id }}</strong>
              <span>{{ item.title }}</span>
              <p>{{ item.detail }}</p>
            </li>
          </ol>
          <ol class="phase6-prototype__checklist" aria-label="Decision coverage">
            <li v-for="item in DECISION_CHECKLIST" :key="item.id">
              <strong>{{ item.id }}</strong>
              <span>{{ item.title }}</span>
              <p>{{ item.detail }}</p>
            </li>
          </ol>
        </section>

        <section class="phase6-prototype__panel">
          <div class="comments-rail__heading">
            <h2>Keyboard and overlap probe</h2>
            <span class="phase6-prototype__status-pill">Focusable controls</span>
          </div>
          <label class="phase6-prototype__field" for="phase6-switcher-textarea">Notes for the chosen treatment</label>
          <textarea
            id="phase6-switcher-textarea"
            class="phase6-prototype__textarea"
            rows="4"
          >Arrow keys here should move the caret, not switch variants.</textarea>
          <div class="phase6-prototype__editable-probe" contenteditable="true" aria-label="Editable prose probe">
            Contenteditable probe: arrow keys stay local here too.
          </div>
        </section>
      </aside>
    </section>

    <nav class="phase6-prototype__floating-switcher" aria-label="Floating semantic switcher">
      <button type="button" class="ui-button" :data-cycle="previousVariant.id" @click="setVariant(previousVariant.id)">
        ← {{ previousVariant.label }}
      </button>
      <button type="button" class="ui-button ui-button--primary phase6-prototype__floating-current" :data-current-variant="variant">
        {{ currentVariant.label }}
      </button>
      <button type="button" class="ui-button" :data-cycle="nextVariant.id" @click="setVariant(nextVariant.id)">
        {{ nextVariant.label }} →
      </button>
    </nav>
  </main>
</template>

<style scoped>
.phase6-prototype {
  display: grid;
  min-height: 100dvh;
  padding: var(--space-6);
  gap: var(--space-6);
  background: var(--surface-canvas);
  color: var(--text-primary);
}

.phase6-prototype__header,
.phase6-prototype__workspace,
.phase6-prototype__floating-switcher,
.phase6-prototype__panel,
.phase6-prototype__variant-button,
.phase6-prototype__textarea,
.phase6-prototype__editable-probe,
.phase6-prototype__canvas {
  box-sizing: border-box;
}

.phase6-prototype__header {
  gap: var(--space-4);
}

.phase6-prototype__header-copy {
  display: grid;
  gap: var(--space-2);
}

.phase6-prototype__header-copy p,
.phase6-prototype__file-strip p,
.phase6-prototype__panel p {
  margin: 0;
}

.phase6-prototype__header-copy h1,
.phase6-prototype__file-strip h2 {
  margin: 0;
}

.phase6-prototype__eyebrow,
.phase6-prototype__file-kicker {
  color: var(--text-muted);
  font-size: var(--font-size-metadata);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.phase6-prototype__workspace {
  grid-template-columns: minmax(0, 1fr) minmax(300px, 340px);
  gap: var(--space-6);
}

.phase6-prototype__primary {
  display: grid;
  min-width: 0;
  gap: var(--space-4);
}

.phase6-prototype__file-strip {
  align-items: start;
  gap: var(--space-4);
}

.phase6-prototype__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: flex-end;
}

.phase6-prototype__diff-scroll {
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-overlay);
  background: var(--surface-panel);
}

.phase6-prototype__diff-workspace {
  min-width: 640px;
  border-radius: var(--radius-overlay);
}

.phase6-prototype__canvas {
  position: relative;
  display: grid;
  gap: 1px;
  padding: var(--space-2);
  background: var(--border-default);
  outline: none;
}

.phase6-prototype__canvas:focus-visible {
  box-shadow: 0 0 0 2px var(--focus-ring) inset;
}

.phase6-prototype__variant-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--surface-panel);
  border-bottom: 1px solid var(--border-default);
}

.phase6-prototype__variant-intro p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-metadata);
}

.phase6-prototype__variant-chip,
.phase6-prototype__status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  background: var(--surface-interactive);
  color: var(--text-muted);
  font-size: var(--font-size-metadata);
  font-weight: var(--font-weight-semibold);
}

.phase6-prototype__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1px;
  background: var(--border-default);
}

.phase6-prototype__row--hunk,
.phase6-prototype__row--collapsed {
  grid-template-columns: 1fr;
}

.phase6-prototype__hunk-banner,
.phase6-prototype__collapsed-region {
  padding: var(--space-2) var(--space-4);
  background: var(--surface-panel);
  color: var(--diff-hunk-foreground);
  font-family: var(--font-mono);
  font-size: var(--font-size-metadata);
}

.phase6-prototype__collapsed-region {
  background: color-mix(in srgb, var(--diff-hunk-background) 50%, var(--surface-panel));
  color: var(--text-muted);
}

.phase6-prototype__cell {
  position: relative;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  min-height: 40px;
  background: var(--surface-panel);
}

.phase6-prototype__gutter {
  position: relative;
  display: grid;
  align-items: center;
  justify-items: end;
  gap: 2px;
  padding: 0 var(--space-2);
  border-right: 1px solid var(--border-default);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--font-size-metadata);
}

.phase6-prototype__code {
  position: relative;
  margin: 0;
  padding: 10px var(--space-4);
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phase6-prototype__token-keyword,
.phase6-prototype__token-function,
.phase6-prototype__token-property {
  font-weight: var(--font-weight-semibold);
}

.phase6-prototype__token-keyword {
  color: var(--status-information-foreground);
}

.phase6-prototype__token-function {
  color: var(--interactive-accent);
}

.phase6-prototype__token-property {
  color: var(--status-warning-foreground);
}

.phase6-prototype__cell--unchanged {
  background: color-mix(in srgb, var(--surface-panel) 84%, var(--diff-unchanged-background));
}

.phase6-prototype__cell--empty {
  background: var(--diff-empty-background);
}

.phase6-prototype__cell--empty .phase6-prototype__code {
  color: var(--text-muted);
}

.phase6-prototype__cell--deletion {
  background: color-mix(in srgb, var(--surface-panel) 74%, var(--diff-deletion-background));
}

.phase6-prototype__cell--addition {
  background: color-mix(in srgb, var(--surface-panel) 74%, var(--diff-addition-background));
}

.phase6-prototype__cell--selection {
  box-shadow: inset 3px 0 0 var(--selection-border);
}

.phase6-prototype__cell--selection::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--selection-background);
  pointer-events: none;
}

.phase6-prototype__cell--active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--destructive-foreground) 60%, transparent), inset 0 -1px 0 color-mix(in srgb, var(--destructive-foreground) 70%, transparent);
}

.phase6-prototype__cell--anchor::before {
  content: '';
  position: absolute;
  inset: 6px auto 6px 3px;
  width: 4px;
  border-radius: var(--radius-pill);
  background: var(--status-resolved-foreground);
}

.phase6-prototype__cell--focus-target {
  box-shadow: inset 0 0 0 2px var(--focus-ring);
}

.phase6-prototype__cell--hover .phase6-prototype__code {
  padding-right: 44px;
}

.phase6-prototype__comment-affordance {
  position: absolute;
  top: 50%;
  right: var(--space-4);
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  color: var(--interactive-accent);
  transform: translateY(-50%);
}

.phase6-prototype__sign {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--surface-interactive);
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.phase6-prototype__sign--muted {
  opacity: 0;
}

.phase6-prototype__cell--block-start .phase6-prototype__gutter::before,
.phase6-prototype__cell--block-mid .phase6-prototype__gutter::before,
.phase6-prototype__cell--block-end .phase6-prototype__gutter::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 6px;
  width: 3px;
  border-radius: var(--radius-pill);
}

.phase6-prototype__cell--deletion .phase6-prototype__gutter::before {
  background: var(--diff-deletion-foreground);
}

.phase6-prototype__cell--addition .phase6-prototype__gutter::before {
  background: var(--diff-addition-foreground);
}

.phase6-prototype__intraline {
  padding: 0 2px;
  border-radius: 2px;
  color: inherit;
}

.phase6-prototype__intraline--deletion {
  background: var(--diff-deletion-intraline-background);
}

.phase6-prototype__intraline--addition {
  background: var(--diff-addition-intraline-background);
}

.phase6-prototype__rail {
  display: grid;
  align-content: start;
  gap: var(--space-4);
  min-width: 0;
}

.phase6-prototype__panel {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-overlay);
  background: var(--surface-panel);
}

.phase6-prototype__share-link {
  overflow-wrap: anywhere;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.phase6-prototype__variant-list,
.phase6-prototype__checklist,
.phase6-prototype__switcher-notes {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.phase6-prototype__variant-button {
  display: grid;
  justify-items: start;
  gap: 2px;
  width: 100%;
  padding: var(--space-2) var(--space-4);
  text-align: left;
}

.phase6-prototype__variant-button small {
  color: var(--text-muted);
  font-size: var(--font-size-metadata);
}

.phase6-prototype__variant-button--current {
  border-color: var(--selection-border);
  background: var(--selection-background);
}

.phase6-prototype__checklist li {
  display: grid;
  gap: 2px;
  padding: var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  background: var(--surface-canvas);
}

.phase6-prototype__checklist strong {
  color: var(--status-information-foreground);
  font-size: var(--font-size-metadata);
}

.phase6-prototype__checklist span {
  font-weight: var(--font-weight-semibold);
}

.phase6-prototype__checklist p {
  color: var(--text-muted);
}

.phase6-prototype__field {
  font-weight: var(--font-weight-semibold);
}

.phase6-prototype__textarea,
.phase6-prototype__editable-probe {
  min-width: 0;
  padding: var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  background: var(--surface-empty);
  color: var(--text-primary);
  font: inherit;
}

.phase6-prototype__textarea {
  min-height: 92px;
  resize: vertical;
}

.phase6-prototype__editable-probe {
  min-height: 64px;
}

.phase6-prototype__textarea:focus-visible,
.phase6-prototype__editable-probe:focus-visible,
.phase6-prototype__floating-switcher button:focus-visible {
  outline: var(--focus-outline-width) solid var(--focus-ring);
  outline-offset: var(--focus-offset);
}

.phase6-prototype__floating-switcher {
  position: fixed;
  right: var(--space-6);
  bottom: var(--space-6);
  z-index: 6;
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-overlay);
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  box-shadow: var(--shadow-overlay);
}

.phase6-prototype__floating-current {
  min-width: 176px;
}

.phase6-prototype--quiet-rails .phase6-prototype__cell--deletion,
.phase6-prototype--quiet-rails .phase6-prototype__cell--addition {
  background: color-mix(in srgb, var(--surface-panel) 84%, transparent);
}

.phase6-prototype--quiet-rails .phase6-prototype__cell--selection::after {
  background: color-mix(in srgb, var(--selection-background) 60%, transparent);
}

.phase6-prototype--quiet-rails .phase6-prototype__sign {
  width: 16px;
  height: 16px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
}

.phase6-prototype--quiet-rails .phase6-prototype__cell--block-start .phase6-prototype__gutter::before,
.phase6-prototype--quiet-rails .phase6-prototype__cell--block-mid .phase6-prototype__gutter::before,
.phase6-prototype--quiet-rails .phase6-prototype__cell--block-end .phase6-prototype__gutter::before {
  left: 10px;
  width: 2px;
}

.phase6-prototype--signed-gutters .phase6-prototype__cell {
  grid-template-columns: 72px minmax(0, 1fr);
}

.phase6-prototype--signed-gutters .phase6-prototype__gutter {
  justify-items: center;
  padding-inline: var(--space-1);
  border-right-color: color-mix(in srgb, var(--border-default) 45%, transparent);
}

.phase6-prototype--signed-gutters .phase6-prototype__cell--deletion,
.phase6-prototype--signed-gutters .phase6-prototype__cell--addition {
  background: var(--surface-panel);
}

.phase6-prototype--signed-gutters .phase6-prototype__cell--block-start .phase6-prototype__gutter::before,
.phase6-prototype--signed-gutters .phase6-prototype__cell--block-mid .phase6-prototype__gutter::before,
.phase6-prototype--signed-gutters .phase6-prototype__cell--block-end .phase6-prototype__gutter::before {
  left: 18px;
  width: 16px;
  opacity: 0.38;
}

.phase6-prototype--signed-gutters .phase6-prototype__sign {
  width: 22px;
  height: 22px;
  background: color-mix(in srgb, var(--surface-raised) 84%, transparent);
  border: 1px solid var(--border-control);
}

.phase6-prototype--signed-gutters .phase6-prototype__code {
  padding-left: var(--space-2);
}

.phase6-prototype--layered-overlap .phase6-prototype__cell--deletion {
  background: color-mix(in srgb, var(--diff-deletion-background) 58%, var(--surface-panel));
}

.phase6-prototype--layered-overlap .phase6-prototype__cell--addition {
  background: color-mix(in srgb, var(--diff-addition-background) 58%, var(--surface-panel));
}

.phase6-prototype--layered-overlap .phase6-prototype__cell--selection::after {
  inset: 4px 6px;
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--selection-background) 75%, transparent);
}

.phase6-prototype--layered-overlap .phase6-prototype__cell--active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-primary) 20%, transparent), inset 0 -2px 0 color-mix(in srgb, var(--selection-border) 75%, transparent);
}

.phase6-prototype--layered-overlap .phase6-prototype__cell--anchor::before {
  inset: 4px auto 4px 4px;
  width: 6px;
}

.phase6-prototype--layered-overlap .phase6-prototype__comment-affordance {
  background: color-mix(in srgb, var(--selection-background) 40%, var(--surface-raised));
}

@media (max-width: 1279px) {
  .phase6-prototype__workspace {
    grid-template-columns: 1fr;
  }

  .phase6-prototype__rail {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}

@media (max-width: 767px) {
  .phase6-prototype {
    padding: var(--space-4);
  }

  .phase6-prototype__header,
  .phase6-prototype__file-strip {
    gap: var(--space-2);
  }

  .phase6-prototype__variant-intro {
    align-items: start;
    flex-direction: column;
  }

  .phase6-prototype__floating-switcher {
    right: var(--space-4);
    left: var(--space-4);
    bottom: var(--space-4);
    flex-wrap: wrap;
    justify-content: center;
  }

  .phase6-prototype__floating-current {
    min-width: 0;
    flex: 1 1 180px;
  }
}
</style>
