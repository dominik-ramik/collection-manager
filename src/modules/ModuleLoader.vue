<template>
  <div class="module-loader-layout">
    <div class="module-loader-main-row">
      <aside v-if="moduleObj?.sidebar" class="module-loader-sidebar">
        <component :is="moduleObj.sidebar" />
      </aside>
      <main class="module-loader-main">
        <!-- Centered data source icon/title -->
        <div
          v-if="showDataSourceUi && dsSettings"
          class="d-flex flex-column align-center justify-center mb-4"
          style="gap:0.5em;"
        >
          <v-icon :icon="dsSettings.settings?.icon || dsSettings.icon" color="primary" size="36" />
          <span style="font-size:1.3em; font-weight:500; text-align:center;">{{ dsSettings.settings?.title || dsSettings.title }}</span>
        </div>
        <component v-if="moduleObj?.main" :is="moduleObj.main" />
        <div v-else class="pa-8 text-center">
          <v-progress-circular indeterminate color="primary" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()
const moduleName = ref(route.params.name)
const moduleObj = ref(null)
const dsSettings = ref(null)
const showDataSourceUi = ref(false)
const currentDsName = ref(null)

watch(
  () => route.params.name,
  (val) => {
    moduleName.value = val
    loadModule()
  }
)

async function loadModule() {
  const moduleMeta = appStore.modules.find(m => m.name === moduleName.value)
  if (!moduleMeta) {
    appStore.setError('Module settings.json missing or malformed.')
    moduleObj.value = null
    dsSettings.value = null
    showDataSourceUi.value = false
    currentDsName.value = null
    return
  }
  const notReadyDs = (moduleMeta.dataSources || []).find(ds => !appStore.ready.dataSources[ds])
  if (notReadyDs) {
    showDataSourceUi.value = true
    currentDsName.value = notReadyDs
    try {
      const ds = await import(`@/data_sources/${notReadyDs}/index.js`)
      moduleObj.value = { main: ds.default }
      // Load settings for the data source
      dsSettings.value = (await import(`@/data_sources/${notReadyDs}/settings.json`)).default || {}
      appStore.modulesObj = appStore.modulesObj || {}
      appStore.modulesObj[moduleName.value] = moduleObj.value
    } catch (e) {
      appStore.setError(`Data source "${notReadyDs}" loader missing or malformed.`)
      moduleObj.value = null
      dsSettings.value = null
      showDataSourceUi.value = false
      currentDsName.value = null
      console.error(`Data source "${notReadyDs}" loader missing or malformed.`, e)
    }
  } else {
    showDataSourceUi.value = false
    currentDsName.value = null
    dsSettings.value = null
    try {
      const mod = await import(`@/modules/${moduleName.value}/index.js`)
      moduleObj.value = mod.default
      appStore.modulesObj = appStore.modulesObj || {}
      appStore.modulesObj[moduleName.value] = moduleObj.value
    } catch (e) {
      appStore.setError(`Module "${moduleName.value}" main component missing or malformed.`)
      moduleObj.value = null
      dsSettings.value = null
      showDataSourceUi.value = false
      currentDsName.value = null
      console.error(`Module "${moduleName.value}" main component missing or malformed.`, e)
    }
  }
}

watch(
  () => [
    moduleName.value,
    ...(appStore.modules.find(m => m.name === moduleName.value)?.dataSources?.map(ds => appStore.ready.dataSources[ds]) ?? [])
  ],
  loadModule,
  { immediate: true, deep: true }
)
</script>

<style scoped>
.module-loader-layout {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: calc(100vh - 64px); /* 64px is the app-bar height */
}
.module-loader-main-row {
  display: flex;
  flex-direction: row;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.module-loader-sidebar {
  width: 15em;
  min-width: 15em;
  max-width: 15em;
  flex: 0 0 15em;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.module-loader-main {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: #fff;
  padding: 2em;
  display: flex;
  flex-direction: column;
}
</style>
