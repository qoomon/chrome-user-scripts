<script setup lang="ts">
import {onBeforeMount, ref} from 'vue';
import {CodeEditor} from 'monaco-editor-vue3';
import CrIcon from "@/components/cr-icon.vue";
import CrButton from "@/components/cr-button.vue";
import UserscriptCard from "@/components/userscript-card.vue";
import * as UserScripts from "@/service_worker/user_scripts.ts";
import {UserScript, UserScriptMeta} from "@/service_worker/user_scripts.ts";
import userScriptTemplate from './template.userscript.js?raw'
import CrPage from "@/components/cr-page.vue";
import {Optional} from "@/common.ts";
import CrToggle from "@/components/cr-toggle.vue";

const editorOptions = {
  fontSize: 14,
  automaticLayout: true,
  padding: {
    top: 28,
  },
};

const userScripts = ref<(UserScriptMeta & Omit<UserScript, 'code'>)[]>();
const editorUserScript = ref<Optional<UserScript, 'id'>>();

onBeforeMount(async () => {
  const queryParams = new URL(location.href).searchParams;
  if (queryParams.get('url')) {
    // TODO
    const scriptUrl = queryParams.get('url')!;
    const code = await fetch(scriptUrl).then((res) => res.text());
    editorUserScript.value = {
      enabled: true,
      code,
    };

    const url = new URL(location.href);
    url.searchParams.delete('url');
    window.history.pushState(null, '', url.toString());
  } else if (queryParams.get('id')) {
    const scriptId = queryParams.get('id')!;
    const userScript = await UserScripts.get(scriptId);
    console.log("userScript:", userScript);
    if (!userScript) {
      // TODO
      return;
    }
    editorUserScript.value = userScript;

  } else {
    userScripts.value = (await UserScripts.getAll()).map((script) => {
      const userScriptMeta = UserScripts.parse(script.code);
      return {
        ...userScriptMeta,
        ...script,
      }
    });
    console.log("userScripts:", userScripts.value);
  }
});

function editUserScript(userScript: UserScript) {
  editorUserScript.value = userScript;

  const url = new URL(location.href);
  url.searchParams.set('id', userScript.id);
  window.history.pushState(null, '', url.toString());
}

function createUserScript() {
  editorUserScript.value = {
    enabled: true,
    code: userScriptTemplate,
  };

  const url = new URL(location.href);
  url.searchParams.delete('id');
  window.history.pushState(null, '', url.toString());
}

function closeUserScript() {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete("id");
  window.location.search = searchParams.toString();
}

async function saveUserScript(userScript_: Optional<UserScript, 'id'>) {
  const userScript = await UserScripts.set(userScript_);
  userScript_.id = userScript.id;

  // TODO move somewhere else
  if(editorUserScript.value){
    const url = new URL(location.href);
    url.searchParams.set('id', userScript.id);
    window.history.pushState(null, '', url.toString());
  }
}

async function removeUserScript(userScript: UserScript) {
  await UserScripts.remove(userScript.id);
  if (editorUserScript.value) {
    if (editorUserScript.value.id === userScript.id) {
      closeUserScript();
    }
  } else {
    userScripts.value = userScripts.value?.filter((script) => script.id !== userScript.id);
  }
}

const sync = ref(false);
async function toggleSync() {
  chrome.identity.getAuthToken({ 'interactive': true }, function (token) {
    console.log(token);
  });
}
</script>

<template>
  <div id="header">
    <cr-icon name="code" style="font-weight: 800;
    color: rgba(255, 255, 255, 0.87);
    width: 1em;
    font-size: 24px;"/>
    <div id="title">User Scripts</div>
    <cr-toggle id="state-toggle" label="Sync" @click="toggleSync()" v-model="sync"></cr-toggle>
  </div>

  <div id="navbar">
    <cr-button @click="createUserScript()">Create</cr-button>
  </div>

  <cr-page v-if="editorUserScript" id="edit-page">
    <div id="edit-page-actions">
      <cr-button :circle="true" :border="false" @click="closeUserScript()">
        <cr-icon name="arrow_back"/>
      </cr-button>
      <cr-button @click="saveUserScript(editorUserScript)">Save</cr-button>
    </div>
    <CodeEditor
        id="editor"
        v-model:value="editorUserScript.code"
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
