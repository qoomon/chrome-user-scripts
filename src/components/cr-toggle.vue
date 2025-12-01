<script setup lang="ts">
const checked = defineModel({type: Boolean, required: true});
defineProps({
  label: {
    type: String,
  },
})

const toggle = () => {
  checked.value = !checked.value;
};
</script>

<template>
  <div class="toggle">
    <div v-if="label">{{ label }}</div>
    <div @click="toggle" class="bar" :class="{ 'checked': checked }">
      <div class="knob"></div>
    </div>
  </div>
</template>

<style scoped>
* {
  --transition: all 0.2s ease-in-out;
  --cr-toggle-unchecked-knob-color: #8e918f;
  --cr-toggle-checked-knob-color: #062e6f;

  --cr-toggle-unchecked-bar-color: #444746;
  --cr-toggle-checked-bar-color: #a8c7fa;

  --cr-toggle-bar-width: 26px;
  --cr-toggle-knob-diameter: 8px;

  --cr-toggle-knob-center-edge-distance_: 9px;
  --cr-toggle-knob-direction_: 1;
  --cr-toggle-knob-travel-distance_: calc(0.5 * var(--cr-toggle-bar-width) - var(--cr-toggle-knob-center-edge-distance_));
  --cr-toggle-knob-position-center_: calc(0.5 * var(--cr-toggle-bar-width) + -50%);
  --cr-toggle-knob-position-start_: calc(var(--cr-toggle-knob-position-center_) - var(--cr-toggle-knob-direction_) * var(--cr-toggle-knob-travel-distance_));
  --cr-toggle-knob-position-end_: calc(var(--cr-toggle-knob-position-center_) + var(--cr-toggle-knob-direction_) * var(--cr-toggle-knob-travel-distance_));
}

.toggle {
  display: flex;
  gap: 12px;
  align-items: center;
}

.bar {
  cursor: pointer;
  display: block;
  height: 16px;
  isolation: isolate;
  min-width: initial;
  outline: none;
  position: relative;

  background-color: var(--cr-toggle-unchecked-bar-color);
  border: 1px solid var(--cr-toggle-unchecked-knob-color);
  border-radius: 50px;
  box-sizing: border-box;

  opacity: 1;
  transition: background-color 80ms linear;
  width: var(--cr-toggle-bar-width);
  z-index: 0;
}

.bar:hover {
  filter: brightness(1.1);
}

.knob {
  background-color: var(--cr-toggle-unchecked-knob-color);
  border-radius: 50%;
  box-shadow: none;
  display: block;
  height: var(--cr-toggle-knob-diameter);
  position: absolute;
  top: 50%;
  transform: translate(var(--cr-toggle-knob-position-start_), -50%);
  transition: transform linear 80ms, background-color linear 80ms, width linear 80ms, height linear 80ms;
  width: var(--cr-toggle-knob-diameter);
  z-index: 1;
}

.checked.bar {
  background-color: var(--cr-toggle-checked-bar-color);
  border-color: var(--cr-toggle-checked-bar-color);
  opacity: 1;
}

.checked.bar:hover {
  filter: brightness(1.05);
}

.checked .knob {
  --cr-toggle-knob-diameter: 12px;
  background-color: var(--cr-toggle-checked-knob-color);
  border-color: var(--cr-toggle-checked-knob-color);
  transform: translate(var(--cr-toggle-knob-position-end_), -50%);
}

.checked .knob:hover {
  filter: brightness(1.2);
}
</style>