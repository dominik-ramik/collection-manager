<template>
  <div class="module-loader-layout">
    <div class="module-loader-main-row">
      <aside v-if="!showDataSourceUi && moduleObj?.sidebar" class="module-loader-sidebar">
        <component :is="moduleObj.sidebar" />
      </aside>
      <main class="module-loader-main">
        <!-- Show all required data sources stacked when not all are ready -->
        <div v-if="showDataSourceUi" class="ds-stack">
          <v-card
            v-for="ds in dsList"
            :key="ds.name"
            class="mb-4"
            variant="elevated"
          >
            <v-card-title class="d-flex align-center" style="gap:0.5em;">
              <v-icon :icon="ds.settings?.settings?.icon || ds.settings?.icon || 'mdi-alert-circle-outline'" color="primary" size="28" />
              <span style="font-size:1.1em; font-weight:500;">
                {{ ds.settings?.settings?.title || ds.settings?.title || ds.name }}
              </span>
            </v-card-title>
            <v-divider />
            <v-card-text>
              <!-- If component loaded, render; otherwise show alert -->
              <component v-if="ds.component" :is="ds.component" />
              <v-alert
                v-else
                type="error"
                variant="tonal"
                density="comfortable"
              >
                {{ ds.error || `Data source "${ds.name}" loader missing or malformed.` }}
              </v-alert>
            </v-card-text>
          </v-card>

          <!-- New: bottom action to close forced view without changes -->
          <div v-if="forceShow" class="ds-actions">
            <v-btn
              variant="tonal"
              color="primary"
              @click="closeForced"
              :disabled="!allReady"
            >
              Close using current settings
            </v-btn>
          </div>
        </div>

        <!-- Main module UI when all data sources are ready -->
        <component v-else-if="moduleObj?.main" :is="moduleObj.main" />
        <div v-else class="pa-8 text-center">
          <v-progress-circular indeterminate color="primary" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()
const moduleName = ref(route.params.name)
const moduleObj = ref(null)
const showDataSourceUi = ref(false)
const dsList = ref([])

// New: respect forced view toggle
const forceShow = computed(() => !!appStore.forceDsForModule?.[moduleName.value])

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
    showDataSourceUi.value = false
    dsList.value = []
    return
  }

  const requiredDs = moduleMeta.dataSources || []
  const allReady = requiredDs.every(ds => appStore.ready.dataSources[ds])

  // Updated condition: also show when forceShow is true
  if ((!allReady || forceShow.value) && requiredDs.length > 0) {
    showDataSourceUi.value = true
    moduleObj.value = null

    const entries = await Promise.all(requiredDs.map(async (dsName) => {
      try {
        const comp = (await import(`@/data_sources/${dsName}/index.js`)).default
        const settings = ((await import(`@/data_sources/${dsName}/settings.json`)).default) || {}
        return { name: dsName, component: comp, settings }
      } catch (e) {
        // Keep entry with error to show alert instead of skipping
        const msg = `Data source "${dsName}" loader missing or malformed.`
        appStore.setError(msg)
        return { name: dsName, component: null, settings: null, error: msg }
      }
    }))

    // Do not filter out missing components; we want to show alerts for them
    dsList.value = entries
  } else {
    // All ready and not forced – show the main module UI
    showDataSourceUi.value = false
    dsList.value = []
    try {
      const mod = await import(`@/modules/${moduleName.value}/index.js`)
      moduleObj.value = mod.default
      appStore.modulesObj = appStore.modulesObj || {}
      appStore.modulesObj[moduleName.value] = moduleObj.value
    } catch (e) {
      appStore.setError(`Module "${moduleName.value}" main component missing or malformed.`)
      moduleObj.value = null
      console.error(`Module "${moduleName.value}" main component missing or malformed.`, e)
    }
  }
}

// New: close forced view without changes
function closeForced() {
  appStore.hideDataSourcesForModule(moduleName.value)
}

watch(
  () => [
    moduleName.value,
    forceShow.value,
    ...(appStore.modules.find(m => m.name === moduleName.value)?.dataSources?.map(ds => appStore.ready.dataSources[ds]) ?? [])
  ],
  loadModule,
  { immediate: true, deep: true }
)

// New: compute readiness across required data sources for current module
const requiredDsNames = computed(() =>
  appStore.modules.find(m => m.name === moduleName.value)?.dataSources ?? []
)
const allReady = computed(() =>
  requiredDsNames.value.length === 0 ||
  requiredDsNames.value.every(ds => appStore.ready.dataSources[ds])
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

/* Constrain DS cards stack width to 50vw with a reasonable minimum */
.ds-stack {
  width: 50vw;
  min-width: 420px;
  margin: 0 auto;
}

/* Align the bottom action to the constrained width */
.ds-actions {
  display: flex;
  justify-content: flex-start;
}
</style>
