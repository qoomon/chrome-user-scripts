<script setup lang="ts">
import {onBeforeMount, ref} from 'vue';
import {CodeEditor} from 'monaco-editor-vue3';
import CrIcon from "@/components/cr-icon.vue";
import CrButton from "@/components/cr-button.vue";
import UserscriptCard from "@/components/userscript-card.vue";
import * as UserScripts from "@/service_worker/user_scripts.ts";
import {BrowserUserScript} from "@/service_worker/user_scripts.ts";
import userScriptTemplate from './template.userscript.js?raw'
import CrPage from "@/components/cr-page.vue";

const editorOptions = {
  fontSize: 14,
  automaticLayout: true,
  padding: {
    top: 28,
  }
};

const userScripts = ref<BrowserUserScript[]>();
const editorUserScript = ref<BrowserUserScript>();

onBeforeMount(async () => {

  const scriptId = new URL(location.href).searchParams.get('id');
  if (scriptId) {
      editorUserScript.value = await UserScripts.getUserScript(scriptId);
      console.log("userScript:", editorUserScript.value);
  } else {
    userScripts.value = await UserScripts.getUserScripts();
    console.log("userScripts:", userScripts.value);
  }
});

function editUserScript(userScript: BrowserUserScript) {
  editorUserScript.value = userScript;

  const url = new URL(location.href);
  url.searchParams.set('id', userScript.id);
  window.history.pushState(null, '', url.toString());
}

function createUserScript() {
  editorUserScript.value = Object.assign(UserScripts.parse(userScriptTemplate), {
    id: new TextEncoder().encode(crypto.randomUUID()).toBase64({urlSafe: true, omitPadding: true}),
    enabled: true,
  });

  const url = new URL(location.href);
  url.searchParams.delete('id');
  window.history.pushState(null, '', url.toString());
}

function closeUserscript() {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete("id");
  window.location.search = searchParams.toString();
}

function saveUserScript(userScript: BrowserUserScript) {
  if (!userScript) {
    throw new Error("No user script to save");
  }
  UserScripts.setUserScript({
    ...userScript,
    ...UserScripts.parse(userScript.raw),
  }, true);

  const url = new URL(location.href);
  url.searchParams.set('id', userScript.id);
  window.history.pushState(null, '', url.toString());
}

async function removeUserScript(userScript: BrowserUserScript) {
  await UserScripts.removeUserScript(userScript.id, true);
  if (editorUserScript.value) {
    if (editorUserScript.value.id === userScript.id) {
      closeUserscript();
    }
  } else {
    userScripts.value = await UserScripts.getUserScripts();
  }
}
</script>

<template>
  <div id="header">
    <cr-icon name="code" style="font-weight: 800;
    color: rgba(255, 255, 255, 0.87);
    width: 1em;
    font-size: 24px;"/>
    <div id="title">User Scripts</div>
  </div>

  <div id="navbar">
    <cr-button @click="createUserScript()">Create</cr-button>
  </div>

  <cr-page v-if="editorUserScript" id="edit-page">
    <div id="edit-page-actions">
      <cr-button :circle="true" :border="false" @click="closeUserscript()">
        <cr-icon name="arrow_back"/>
      </cr-button>
      <cr-button @click="saveUserScript(editorUserScript)">Save</cr-button>
    </div>
    <CodeEditor
        id="editor"
        v-model:value="editorUserScript.raw"
        language="javascript"
        theme="vs-dark"
        :options="editorOptions"
        placeholder="Moin"
    />
  </cr-page>
  <div v-else id="user-scripts-page">
    <h2 id="user-scripts-label">All User Scripts</h2>
    <div id="user-scripts">
      <userscript-card v-for="userScript in userScripts" :key="userScript.id"
                       :user-script="userScript"
                       @edit="editUserScript(userScript)"
                       @state-change="saveUserScript(userScript)"
                       @remove="removeUserScript(userScript)"
      />
    </div>
  </div>
</template>

<style scoped>
#header {
  display: flex;
  align-items: center;
  gap: 19px;
  padding: 11.5px 12px 9px 24px;
}

#title {
  font-size: 22.1px;
  font-weight: 500;
  white-space: nowrap;
  letter-spacing: 0.25px;
}

#navbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12.5px 24px;
  border-bottom: solid 1px #ffffff17;
}

#user-scripts-page {
  padding: 0 60px;
  overflow: auto;
  height: calc(100vh - 116px);
}

#user-scripts-label {
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0.25px;
  margin-top: 53px;
  margin-bottom: 16px;
}

#user-scripts-label,
#user-scripts {
  --max-columns: 3;
  --extensions-card-width: 400px;
  --grid-gutter: 12px;
  display: grid;
  flex-wrap: wrap;
  column-gap: var(--grid-gutter);
  row-gap: var(--grid-gutter);
  grid-template-columns: repeat(auto-fill, var(--extensions-card-width));
  justify-content: center;
  max-width: calc(var(--extensions-card-width) * var(--max-columns) + var(--grid-gutter) * var(--max-columns));
  margin-left: auto;
  margin-right: auto;
}

#edit-page {
  width: calc(100% - 96px);
  height: calc(100vh - 62px);
  margin: 0 auto;
  padding-top: 12px;
  display: flex;
}

#edit-page-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

#edit-page-actions > div:last-child {
  margin-left: auto;
}

#editor {
  border-radius: 8px;
  overflow: hidden;
}
</style>
