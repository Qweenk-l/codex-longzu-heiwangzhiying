<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ text: string }>();
const paragraphs = computed(() => props.text.split(/\n\s*\n/).filter(Boolean).map(paragraph =>
  paragraph.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => ({
    bold: part.startsWith('**') && part.endsWith('**'),
    text: part.startsWith('**') && part.endsWith('**') ? part.slice(2, -2) : part,
  })),
));
</script>

<template>
  <p v-for="(parts, index) in paragraphs" :key="index">
    <template v-for="(part, partIndex) in parts" :key="partIndex"><strong v-if="part.bold">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template>
  </p>
</template>
