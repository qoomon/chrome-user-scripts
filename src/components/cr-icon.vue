<script setup lang="ts">
defineProps({
  name: {
    type: String,
    required: true,
  },
});
</script>

<template>
<span class="material-symbols-outlined">
    {{ name }}
</span>
</template>


<style scoped>
@import 'material-symbols';

.material-symbols-outlined {
  font-variation-settings: 'FILL' 0,
  'GRAD' 0,
  'opsz' 48;
  font-weight: 500;
  font-size: 20px;
  vertical-align: middle;
  color: #a4a4a4;
}
</style>
