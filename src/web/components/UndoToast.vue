<script setup lang="ts">
defineProps<{
  commentId: string;
  message: string;
}>();

const emit = defineEmits<{ undo: [] }>();
</script>

<template>
  <div class="undo-toast" role="status" :data-comment-id="commentId">
    <span>{{ message }}</span>
    <button type="button" class="icon-btn" @click="emit('undo')">Undo</button>
  </div>
</template>
