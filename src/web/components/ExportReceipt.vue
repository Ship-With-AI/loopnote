<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

import type { ExportDirectoryRevealResult, ExportReviewResult } from '../../contracts/api.js';
import ReceiptFileRow from './ReceiptFileRow.vue';
import UiIcon from './ui/UiIcon.vue';

type ConfirmedReceipt = Extract<ExportReviewResult, { readonly kind: 'exported' }>;

const props = withDefaults(defineProps<{
  receipt: ConfirmedReceipt;
  revealExportDirectory: () => Promise<ExportDirectoryRevealResult>;
  previous?: boolean;
}>(), {
  previous: false,
});

const heading = ref<HTMLElement>();
const copyMessage = ref('');
const revealMessage = ref('');
const revealFailed = ref(false);
const revealAlert = ref<HTMLElement>();

const headingText = computed(() => props.previous ? 'Previous confirmed export' : 'Review export complete');
const exactPatch = computed(() => 'patch' in props.receipt ? props.receipt.patch : undefined);
const standaloneExport = computed(() => 'standalone' in props.receipt ? props.receipt.standalone : undefined);
const driftText = computed(() => {
  if ('patch' in props.receipt) {
    return props.receipt.patch.snapshot.status === 'drifted' ? 'Target drift observed' : 'No target drift observed';
  }
  if ('drift' in props.receipt) {
    return props.receipt.drift.kind === 'acknowledged' ? 'Acknowledged for this export' : 'None observed';
  }
  return '';
});
const metadataRow = computed(() => {
  if (exactPatch.value !== undefined) return { label: 'Snapshot status', value: driftText.value };
  if (standaloneExport.value !== undefined) return { label: 'Review key', value: standaloneExport.value.reviewKey };
  return { label: 'Drift', value: driftText.value };
});
const acknowledgedIdentitiesOpen = ref(false);
const comparisonOpen = ref(false);
const comparisonEndpoints = computed(() => 'comparison' in props.receipt
  ? [
      { role: 'Base', identity: props.receipt.comparison.base },
      { role: 'Head', identity: props.receipt.comparison.head },
    ]
  : []);
const acknowledgedIdentities = computed(() => 'drift' in props.receipt && props.receipt.drift.kind === 'acknowledged'
  ? props.receipt.drift.identities
  : []);
const acknowledgedIdentityDetails = computed(() => acknowledgedIdentities.value.map((identity) => [
  `${identity.role === 'base' ? 'Base' : 'Head'} pinned label: ${identity.pinned.label}`,
  `${identity.role === 'base' ? 'Base' : 'Head'} pinned type: ${identity.pinned.selectorType}`,
  `${identity.role === 'base' ? 'Base' : 'Head'} pinned: ${identity.pinned.oid}`,
  identity.current.kind === 'available'
    ? [
      `${identity.role === 'base' ? 'Base' : 'Head'} current label: ${identity.current.label}`,
      `${identity.role === 'base' ? 'Base' : 'Head'} current type: ${identity.current.selectorType}`,
      `${identity.role === 'base' ? 'Base' : 'Head'} current: ${identity.current.oid}`,
    ].join('\n')
    : [
      `${identity.role === 'base' ? 'Base' : 'Head'} current label: ${identity.current.label}`,
      `${identity.role === 'base' ? 'Base' : 'Head'} current type: ${identity.current.selectorType}`,
      `${identity.role === 'base' ? 'Base' : 'Head'} current unavailable: ${identity.current.reason}`,
    ].join('\n'),
].join('\n')).join('\n'));
const receiptDetails = computed(() => [
  `Accepted revision: ${props.receipt.draftRevision}`,
  `Exported at: ${props.receipt.exportedAt}`,
  ...(exactPatch.value !== undefined
    ? [
        `Patch digest: ${exactPatch.value.digest}`,
        `Review key: ${exactPatch.value.reviewKey}`,
        `Validation target: ${exactPatch.value.validationTarget.kind}`,
        `Snapshot status: ${exactPatch.value.snapshot.status}`,
      ]
    : standaloneExport.value !== undefined
      ? [`Review key: ${standaloneExport.value.reviewKey}`]
      : [`Drift: ${driftText.value}`]),
  `Path: ${props.receipt.files[0].path}`,
  `${props.receipt.files[0].algorithm}:${props.receipt.files[0].sha256}`,
  `Bytes: ${props.receipt.files[0].bytes}`,
  `Path: ${props.receipt.files[1].path}`,
  `${props.receipt.files[1].algorithm}:${props.receipt.files[1].sha256}`,
  `Bytes: ${props.receipt.files[1].bytes}`,
].join('\n'));

onMounted(() => {
  if (!props.previous) void nextTick(() => heading.value?.focus());
});

async function copyAgentPrompt(): Promise<void> {
  copyMessage.value = '';
  try {
    await navigator.clipboard.writeText(
      `Apply the review in \`${props.receipt.files[0].path}\` (human-readable: \`review.md\`). `
      + 'Address every open comment; leave resolved ones as context.',
    );
    copyMessage.value = 'Copied agent prompt.';
  } catch {
    copyMessage.value = 'Could not copy. Select the value and copy it manually.';
  }
}

async function copyDetails(): Promise<void> {
  copyMessage.value = '';
  try {
    await navigator.clipboard.writeText(receiptDetails.value);
    copyMessage.value = 'Copied export receipt details.';
  } catch {
    copyMessage.value = 'Could not copy. Select the value and copy it manually.';
  }
}

async function copyAcknowledgedIdentities(): Promise<void> {
  copyMessage.value = '';
  try {
    await navigator.clipboard.writeText(acknowledgedIdentityDetails.value);
    copyMessage.value = 'Acknowledged identities copied.';
  } catch {
    copyMessage.value = 'Could not copy acknowledged identities. Select and copy the visible values manually.';
  }
}

async function revealDirectory(): Promise<void> {
  revealMessage.value = '';
  revealFailed.value = false;
  try {
    const result = await props.revealExportDirectory();
    if (result.kind === 'revealed') {
      revealMessage.value = 'Export directory revealed in the system file browser.';
      return;
    }
  } catch {
    // The fixed capability reports no path or OS diagnostic to the browser.
  }
  revealFailed.value = true;
  revealMessage.value = 'Could not reveal the export directory. Copy the relative path and open it from the repository root.';
  await nextTick();
  revealAlert.value?.focus();
}
</script>

<template>
  <section class="export-receipt" :class="{ 'export-receipt--current': !previous, 'export-receipt--previous': previous }" :aria-labelledby="previous ? 'previous-export-heading' : 'export-receipt-heading'">
    <header class="export-receipt__heading">
      <UiIcon v-if="!previous" name="check" class="export-receipt__status-icon" />
      <h4 :id="previous ? 'previous-export-heading' : 'export-receipt-heading'" ref="heading" tabindex="-1">{{ headingText }}</h4>
    </header>
    <p v-if="!previous" class="export-receipt__body">Both files were published together from accepted revision {{ receipt.draftRevision }}.</p>
    <p v-if="previous" class="export-receipt__previous-note">This last confirmed pair remains available; the later export attempt was not published.</p>
    <dl class="export-receipt__metadata">
      <div><dt>Accepted revision</dt><dd>{{ receipt.draftRevision }}</dd></div>
      <div><dt>Exported at</dt><dd><time :datetime="receipt.exportedAt">{{ receipt.exportedAt }}</time></dd></div>
      <div><dt>{{ metadataRow.label }}</dt><dd>{{ metadataRow.value }}</dd></div>
      <template v-if="exactPatch !== undefined">
        <div><dt>Patch digest</dt><dd><code>{{ exactPatch.digest }}</code></dd></div>
        <div><dt>Review key</dt><dd><code>{{ exactPatch.reviewKey }}</code></dd></div>
        <div><dt>Validation target</dt><dd>{{ exactPatch.validationTarget.kind }}</dd></div>
      </template>
    </dl>
    <section v-if="exactPatch === undefined && standaloneExport === undefined" class="export-receipt__drift-disclosure">
      <button
        type="button"
        class="ui-button"
        :aria-expanded="comparisonOpen"
        aria-controls="receipt-comparison"
        @click="comparisonOpen = !comparisonOpen"
      >Comparison</button>
      <div v-if="comparisonOpen" id="receipt-comparison" class="export-receipt__acknowledged-identities">
        <dl v-for="endpoint in comparisonEndpoints" :key="endpoint.role">
          <dt>{{ endpoint.role }}</dt>
          <dd>Pinned {{ endpoint.role }}: <code>{{ endpoint.identity.oid }}</code></dd>
          <dd>Label: {{ endpoint.identity.label }}</dd>
          <dd>Type: {{ endpoint.identity.selectorType ?? 'not reported' }}</dd>
        </dl>
      </div>
    </section>
    <section v-if="acknowledgedIdentities.length > 0" class="export-receipt__drift-disclosure">
      <button
        type="button"
        class="ui-button"
        :aria-expanded="acknowledgedIdentitiesOpen"
        aria-controls="acknowledged-identities"
        @click="acknowledgedIdentitiesOpen = !acknowledgedIdentitiesOpen"
      >View acknowledged identities</button>
      <div v-if="acknowledgedIdentitiesOpen" id="acknowledged-identities" class="export-receipt__acknowledged-identities">
        <dl v-for="identity in acknowledgedIdentities" :key="identity.role">
          <dt>{{ identity.role === 'base' ? 'Base' : 'Head' }}</dt>
          <dd>Pinned {{ identity.role === 'base' ? 'Base' : 'Head' }}: <code>{{ identity.pinned.oid }}</code></dd>
          <dd>Pinned label: {{ identity.pinned.label }}</dd>
          <dd>Pinned type: {{ identity.pinned.selectorType }}</dd>
          <template v-if="identity.current.kind === 'available'">
            <dd>Current {{ identity.role === 'base' ? 'Base' : 'Head' }}: <code>{{ identity.current.oid }}</code></dd>
            <dd>Current label: {{ identity.current.label }}</dd>
            <dd>Current type: {{ identity.current.selectorType }}</dd>
          </template>
          <template v-else>
            <dd>Current {{ identity.role === 'base' ? 'Base' : 'Head' }} unavailable: {{ identity.current.reason }}</dd>
            <dd>Current label: {{ identity.current.label }}</dd>
            <dd>Current type: {{ identity.current.selectorType }}</dd>
          </template>
        </dl>
        <button type="button" class="ui-button" @click="copyAcknowledgedIdentities">Copy acknowledged identities</button>
      </div>
    </section>
    <div class="export-receipt__files" aria-label="Published files">
      <ReceiptFileRow :file="receipt.files[0]" file-name="review.json" />
      <ReceiptFileRow :file="receipt.files[1]" file-name="review.md" />
    </div>
    <div v-if="!previous" class="export-actions">
      <button type="button" class="ui-button" @click="copyAgentPrompt">Copy agent prompt</button>
      <button type="button" class="ui-button" @click="copyDetails">Copy all receipt details</button>
      <button type="button" class="ui-button" @click="revealDirectory">Reveal export directory</button>
    </div>
    <p v-if="copyMessage !== ''" class="export-receipt__message" :class="{ 'export-receipt__message--error': copyMessage.startsWith('Could not'), 'export-receipt__message--success': !copyMessage.startsWith('Could not') }" :role="copyMessage.startsWith('Could not') ? 'alert' : 'status'">
      <UiIcon :name="copyMessage.startsWith('Could not') ? 'error' : 'check'" />
      <span>{{ copyMessage }}</span>
    </p>
    <p v-if="revealMessage !== ''" ref="revealAlert" class="export-receipt__message" :class="{ 'export-receipt__message--error': revealFailed, 'export-receipt__message--success': !revealFailed }" :role="revealFailed ? 'alert' : 'status'" tabindex="-1">
      <UiIcon :name="revealFailed ? 'error' : 'check'" />
      <span>{{ revealMessage }}</span>
    </p>
  </section>
</template>
