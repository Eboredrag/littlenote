<script setup lang="ts">
const { sourceUrl } = useRuntimeConfig().public
</script>

<template>
  <p class="source">
    Open source under the
    <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer license">AGPL-3.0</a><template v-if="sourceUrl">, <a :href="sourceUrl" target="_blank" rel="noopener noreferrer">click here to view the source</a></template>.
  </p>
</template>

<style scoped>
.source { margin: 0; color: var(--ink-2); font-size: var(--text-xs); }
a { color: var(--ink); font-weight: 750; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
a:hover { color: var(--action); }
</style>
