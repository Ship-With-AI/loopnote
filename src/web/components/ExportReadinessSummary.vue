<script setup lang="ts">
import { computed } from 'vue';

import type { LoopnoteIgnoreStatus } from '../../contracts/api.js';
import type { WorkspaceComment } from '../model/workspace-state.js';
import { RENAME_MAP } from '../../domain/product-identity.js';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';
import UiIcon from './ui/UiIcon.vue';

const props = defineProps<{
  revision: number;
  summary: string;
  comments: readonly WorkspaceComment[];
  ignoreStatus: LoopnoteIgnoreStatus | null;
}>();

const actionableCount = computed(() => props.comments.filter((comment) => comment.state === 'open' && comment.status === 'verified').length);
const attentionCount = computed(() => props.comments.filter((comment) => comment.state === 'open' && comment.status !== 'verified').length);
const resolvedCount = computed(() => props.comments.filter((comment) => comment.state === 'resolved').length);
const ignoreStatusPresentation = computed(() => {
  if (props.ignoreStatus === null) return { kind: 'pending' as const, label: 'Checking ignore status' };

  switch (props.ignoreStatus.kind) {
    case 'ignored': return { kind: 'success' as const, label: `/${RENAME_MAP.repoStateDir} is ignored` };
    case 'notIgnored': return { kind: 'warning' as const, label: `/${RENAME_MAP.repoStateDir} is not ignored` };
    case 'unavailable': return { kind: 'disabled' as const, label: 'Ignore status unavailable' };
  }
});
</script>

<template>
  <dl class="export-readiness" aria-label="Export readiness">
    <div><dt>Accepted revision</dt><dd>{{ revision }}</dd></div>
    <div><dt>Open actionable</dt><dd>{{ actionableCount }}</dd></div>
    <div><dt>Need reviewer attention</dt><dd>{{ attentionCount }}</dd></div>
    <div><dt>Resolved</dt><dd>{{ resolvedCount }}</dd></div>
    <div><dt>Summary</dt><dd>{{ summary === '' ? 'No summary provided' : 'Summary included' }}</dd></div>
    <div><dt>Ignore status</dt><dd><ReviewStateBadge :kind="ignoreStatusPresentation.kind" :label="ignoreStatusPresentation.label" /></dd></div>
  </dl>
  <section v-if="actionableCount === 0" class="inline-notice" aria-labelledby="export-zero-actionable-heading">
    <UiIcon name="information" class="inline-notice__icon" />
    <div class="inline-notice__content">
      <h4 id="export-zero-actionable-heading">{{ comments.length === 0 && summary === '' ? 'No review requests yet' : 'No open actionable requests' }}</h4>
      <p>{{ comments.length === 0 && summary === '' ? 'You can still export the accepted empty review record, or add a summary or comment first.' : 'The export will still include the accepted review, full comment history in JSON, and agent verification instructions.' }}</p>
    </div>
  </section>
  <section v-if="attentionCount > 0" class="inline-notice inline-notice--warning" aria-labelledby="export-attention-heading">
    <UiIcon name="warning" class="inline-notice__icon" />
    <div class="inline-notice__content">
      <h4 id="export-attention-heading">{{ attentionCount }} comments need reviewer attention</h4>
      <p>Stale or unavailable anchors will be exported as non-actionable records. An applying agent is instructed not to guess or relocate them.</p>
    </div>
  </section>
</template>
