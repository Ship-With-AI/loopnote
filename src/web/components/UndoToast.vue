<script setup lang="ts">
defineProps<{
  message: string;
}>();

const emit = defineEmits<{ undo: [] }>();
</script>

<template>
  <div class="undo-toast" role="status">
    <span>{{ message }}</span>
    <button type="button" class="icon-btn" @click="emit('undo')">Undo</button>
  </div>
</template>
