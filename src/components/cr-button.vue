<script setup lang="ts">

defineProps({
  circle: {
    type: Boolean,
    default: false,
  },
  border: {
    type: Boolean,
    default: true,
  },
});
</script>

<template>
  <div class="cr-button" :class="{
    'cr-button-circle': circle,
    'cr-button-border': border
  }" tabindex="0">
    <slot></slot>
  </div>
</template>

<style scoped>
.cr-button {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 5.14em;
  height: 36px;
  padding: 8px 16px;
  outline-width: 0;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  border-radius: 100px;
  background: rgba(0, 0, 0, 0);
  color: #a8c7fa;
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  isolation: isolate;
}

.cr-button-border {
  border: 1px solid rgb(4, 125, 183);
}

.cr-button-circle {
  min-width:unset;
  padding: 8px 8px;
}

.cr-button:hover {
  background: #38393b;
}
</style>