<script setup lang="ts">
import CrIcon from "@/components/cr-icon.vue";
import {onBeforeMount, ref} from "vue";
import * as UserScripts from "@/service_worker/user_scripts.ts";
import CrToggle from "@/components/cr-toggle.vue";
import {UserScript, UserScriptMeta} from "@/service_worker/user_scripts.ts";

const userScripts = ref<(UserScriptMeta & Omit<UserScript, 'code'>)[]>();

onBeforeMount(async () => {
  // TODO display tab scripts only
  // const currentTabId = await chrome.tabs.query({active: true, currentWindow: true})
  //     .then(tabs => tabs[0]?.id ?? null);
  try {
    const scripts = await UserScripts.getAll();
    userScripts.value = scripts.map((script) => {
      try {
        const userScriptMeta = UserScripts.parse(script.code);
        return {
          ...userScriptMeta,
          ...script,
        }
      } catch (error) {
        console.error('Failed to parse user script:', error);
        // Return a basic object with error information
        return {
          ...script,
          name: 'Invalid Script',
          description: `Error: ${error instanceof Error ? error.message : 'Parse failed'}`,
        };
      }
    });
    console.log("userScripts:", userScripts.value);
  } catch (error) {
    console.error('Failed to load user scripts:', error);
  }
});

function openOptionsPage() {
  chrome.runtime.openOptionsPage()
}

function closePopup() {
  window.close();
}

async function saveUserScript(userScript: UserScript) {
  if (!userScript) {
    console.error("No user script to save");
    return;
  }
  try {
    await UserScripts.set(userScript);
  } catch (error) {
    console.error('Failed to save user script:', error);
  }
}
</script>

<template>
  <div id="popup">
    <header>
      <div>User Scripts</div>
      <cr-icon id="close-button" name="close"
               @click="closePopup()"/>
    </header>

    <div id="user-scripts">
      <div class="user-script" v-for="userScript in userScripts" :key="userScript.id">
        <img id="icon" :src="userScript.icon ?? UserScripts.determineIcon(userScript) ?? '' "
        @error="(e) => {(e.target as HTMLImageElement).src = '../assets/globe128.png'}">
        <div>{{ userScript.name }}</div>
        <cr-toggle v-model="userScript.enabled" style="margin-left: auto;"
        @click="saveUserScript(userScript)"/>
      </div>
    </div>

    <footer @click="openOptionsPage()">
      <cr-icon name="settings" style="color: #c7c7c7; font-size: 20px"/>
      <div>Manage User Scripts</div>
    </footer>
  </div>
</template>

<style scoped>
#popup {
  display: flex;
  flex-direction: column;
  border: 1px solid #4c4c4c;
}

header {
  padding: 12px 16px 8px 20px;
  font-size: 16px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

#close-button {
  cursor: pointer;
  border-radius: 50%;
  padding: 4px;
  color: #c7c7c7;
  font-size: 16px;
  font-weight: 800;
}

#close-button:hover {
  background: #38393b;
}

#user-scripts {
  width: 100%;
  max-height: 600px;
}

.user-script {
  display: flex;
  align-items: center;
  padding: 8px 24px;
  gap: 14px;
  border-bottom: 1px solid #4c4c4c;
}

.user-script > img {
  width: 20px;
  height: 20px;
}

footer {
  display: flex;
  align-items: center;
  padding: 14px 24px;
  gap: 14px;
  border-top: 1px solid #4c4c4c;
  cursor: pointer;
}

footer:hover {
  background: #38393b;
}
</style>
