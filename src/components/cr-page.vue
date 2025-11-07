<script setup lang="ts">

</script>

<template>
  <div class="cr-page">
    <slot></slot>
  </div>
</template>

<style scoped>
.cr-page {
  --cr-page-background-color: #292a2d;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  padding: 16px 20px;
  background-color: var(--cr-page-background-color);
  box-shadow: color(srgb 0 0 0 / 0.3) 0px 1px 2px 0px, color(srgb 0 0 0 / 0.15) 0px 2px 6px 2px;
  overflow: hidden;
  height: 100%;
  width: 680px;;
}
</style>