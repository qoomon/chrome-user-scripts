<script setup lang="ts">
import CrCard from "@/components/cr-card.vue";
import CrButton from "@/components/cr-button.vue";
import CrToggle from "@/components/cr-toggle.vue";

import {BrowserUserScript} from "../service_worker/user_scripts.ts"
import {defineProps, PropType} from "vue";
import * as UserScripts from "@/service_worker/user_scripts.ts";

defineEmits(['edit', 'remove', 'state-change']);

const props = defineProps({
  userScript: {
    type: Object as PropType<BrowserUserScript>,
    required: true,
  },
});



</script>

<template>
  <cr-card id="card">
    <div id="main">
      <img id="icon" :src="props.userScript.meta.icon ?? UserScripts.determineIcon(props.userScript) ?? '' "
           @error="(e) => {(e.target as HTMLImageElement).src = '../assets/globe128.png'}">
      <div>
        <div id="headline">
          <div id="name">{{ props.userScript.meta.name }}</div>
          <div id="version">{{ props.userScript.meta.version }}</div>
        </div>
        <div id="description">{{ props.userScript.meta.description }}</div>
      </div>
    </div>
    <div id="buttons">
      <cr-button id="edit-button"
                 @click="$emit('edit')">Edit
      </cr-button>
      <cr-button id="remove-button"
                 @click="$emit('remove')">Remove
      </cr-button>
      <cr-toggle id="state-toggle" v-model="props.userScript.enabled"
                 @click="$emit('state-change')"></cr-toggle>
    </div>
  </cr-card>
</template>

<style scoped>
@import "@/components/cr-style.css";

#card {
  font-size: 13px;
  width: 400px;
}

#headline {
  display: flex;
  gap: 8px;
  padding-bottom: 4px;
}

#main {
  display: flex;
  gap: 24px;
  padding: 16px 20px 0 20px;
}

#icon {
  width: 48px;
  height: 48px;
  padding: 6px;
}

#name {
  color: var(--cr-primary-text-color);
}

#version {
  color: var(--cr-secondary-text-color);
}

#description {
  color: var(--cr-secondary-text-color);

  overflow: hidden;
  text-overflow: ellipsis;
  height: 48px;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}


#buttons {
  margin-top: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px;
  padding-right: 20px;
}

#state-toggle {
  margin-left: auto;
}

</style>