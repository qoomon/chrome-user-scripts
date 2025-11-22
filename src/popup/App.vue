<script setup lang="ts">
import CrIcon from "@/components/cr-icon.vue";
import {onMounted, ref} from "vue";
import * as UserScripts from "@/service_worker/user_scripts.ts";
import {ChromeUserScript, ChromeUserScriptMetaLocal} from "@/service_worker/user_scripts.ts";
import CrToggle from "@/components/cr-toggle.vue";

const userScripts = ref<ChromeUserScriptMetaLocal[]>([]);

onMounted(async () => {
  // TODO display tab scripts only
  // const currentTabId = await chrome.tabs.query({active: true, currentWindow: true})
  //     .then(tabs => tabs[0]?.id ?? null);
  userScripts.value = await UserScripts.getAll();
  console.log("userScripts:", userScripts.value);
});

function editUserScript(id: string) {
  const url = new URL(chrome.runtime.getURL("src/options/index.html"));
  url.searchParams.set('id', id);
  window.open(url.toString(), '_blank');
}

function openOptionsPage() {
  chrome.runtime.openOptionsPage()
}

function closePopup() {
  window.close();
}

function saveUserScript(userScript: Partial<ChromeUserScript>) {
  if (!userScript) {
    throw new Error("No user script to save");
  }
  UserScripts.set(userScript);
}
</script>

<template>
  <div id="popup">
    <header>
      <div>User Scripts</div>
      <cr-icon id="close-button" name="close" @click="closePopup()"/>
    </header>

    <div id="user-scripts">
      <div class="user-script" v-for="userScript in userScripts" :key="userScript.id">
        <div class="mainContainer" @click="editUserScript(userScript.id)">
          <img class="icon" alt="icon" :src="userScript.meta.icon ?? UserScripts.determineIcon(userScript.meta) ?? '' "
               @error="(e) => {(e.target as HTMLImageElement).src = '../assets/globe128.png'}">
          <div>{{ userScript.meta.name }}</div>
        </div>
        <cr-toggle v-model="userScript.enabled"
                   @click.stop="saveUserScript(userScript)" />
      </div>
    </div>

    <footer @click="openOptionsPage()">
      <cr-icon name="settings" style="color: #c7c7c7; font-size: 18px"/>
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
  padding: 16px 16px 8px 20px;
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
  gap: 14px;
  padding: 0 24px 0 18px;
}
.user-script > * {
  padding: 8px 0;
}

.user-script .mainContainer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-grow: 1;
  cursor: pointer;
}

.user-script .mainContainer > :first-child {
  margin: 0 0 0 6px;
}

.user-script .mainContainer:hover {
  background: #38393b;
}

.user-script .icon {
  width: 20px;
  height: 20px;
}

footer {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  gap: 14px;
  border-top: 1px solid #4c4c4c;
  cursor: pointer;
  margin-top: 8px;
}

footer:hover {
  background: #38393b;
}
</style>
