<script setup lang="ts">

</script>

<template>
  <div class="cr-card">
    <slot></slot>
  </div>
</template>

<style scoped>
.cr-card {
  --cr-card-background-color: #292a2d;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  background-color: var(--cr-card-background-color);
  border-radius: 8px;
  box-shadow: color(srgb 0 0 0 / 0.3) 0px 1px 2px 0px, color(srgb 0 0 0 / 0.15) 0px 2px 6px 2px;
  overflow: hidden;
  height: 100%;
  width: 100%;
}
</style>