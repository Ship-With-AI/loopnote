<script setup lang="ts">
import { ref } from 'vue';

import PathText from './ui/PathText.vue';
import ReviewStateBadge from './ui/ReviewStateBadge.vue';

const props = defineProps<{
  attachedNoFeedback: boolean;
  hasUnsavedText: boolean;
  unsavedInlineComposerFile?: Readonly<{ fileId: string; display: string }>;
  attachedBlockedByUnsavedText: boolean;
  attachedBlockedByPending: boolean;
  attachedBlockedByConflict: boolean;
  conflict?: Readonly<{ expectedRevision: number; actualRevision: number }> | null;
  attachedReady?: boolean;
}>();

const emit = defineEmits<{
  reviewUnsavedText: [];
  reviewInlineComposer: [fileId: string];
  reloadLatest: [];
  finishReview: [];
}>();

const completionAction = ref<HTMLButtonElement>();

function finishAttachedReview(): void {
  if (props.attachedReady) emit('finishReview');
}
</script>

<template>
  <section class="attached-completion" aria-labelledby="finish-attached-review-heading">
    <header class="attached-completion__heading">
      <h3 id="finish-attached-review-heading">Finish attached review</h3>
      <ReviewStateBadge kind="open" label="Waiting" />
    </header>
    <p class="attached-completion__waiting">The requesting agent is waiting. Only Finish review returns the accepted summary and comments. Exporting, closing, reloading, or disconnecting leaves this review unfinished.</p>
    <div v-if="attachedNoFeedback" class="inline-notice">
      <div class="inline-notice__content">
        <h4>No feedback added</h4>
        <p>This review has no accepted summary or comments. You can still finish and return an empty review result, or add feedback first.</p>
      </div>
    </div>
    <div v-if="hasUnsavedText" class="inline-notice inline-notice--warning">
      <div class="inline-notice__content">
        <h4>Unsaved text must be reviewed</h4>
        <p>Save or discard unsaved summary or comment text before finishing. The requesting agent only receives the accepted review.</p>
        <button type="button" class="ui-button" @click="emit('reviewUnsavedText')">Review unsaved text</button>
      </div>
    </div>
    <div v-if="unsavedInlineComposerFile !== undefined" class="inline-notice inline-notice--warning" role="region" aria-labelledby="inline-composer-finish-block-heading">
      <div class="inline-notice__content">
        <h4 id="inline-composer-finish-block-heading">Inline comment draft must be reviewed</h4>
        <p><PathText :display="unsavedInlineComposerFile.display" /> has unsaved text. Save or discard it before finishing.</p>
        <button type="button" class="ui-button" @click="emit('reviewInlineComposer', unsavedInlineComposerFile.fileId)">
          Review draft in <PathText :display="unsavedInlineComposerFile.display" />
        </button>
      </div>
    </div>
    <p v-if="!attachedBlockedByUnsavedText && attachedBlockedByPending" class="attached-completion__pending" role="status">Saving review changes…</p>
    <div v-else-if="!attachedBlockedByUnsavedText && attachedBlockedByConflict" class="inline-notice inline-notice--warning">
      <div class="inline-notice__content">
        <h4>Review changed before finish</h4>
        <p>Accepted revision {{ conflict?.expectedRevision }} is no longer current. Latest revision is {{ conflict?.actualRevision }}. No feedback was returned. Reload the latest review, check the comments and summary, then choose Finish review again.</p>
        <button type="button" class="ui-button" @click="emit('reloadLatest')">Reload latest</button>
      </div>
    </div>
    <button ref="completionAction" type="button" class="ui-button ui-button--primary attached-completion__action" :disabled="attachedReady !== true" @click="finishAttachedReview">Finish review</button>
  </section>
</template>
