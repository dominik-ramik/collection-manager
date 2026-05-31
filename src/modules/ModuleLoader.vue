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
            style="position:relative;"
          >
            <v-card-title class="d-flex align-center" style="gap:0.5em;">
              <v-icon :icon="ds.settings?.settings?.icon || ds.settings?.icon || 'mdi-alert-circle-outline'" color="primary" size="28" />
              <span style="font-size:1.1em; font-weight:500;">
                {{ ds.settings?.settings?.title || ds.settings?.title || ds.name }}
              </span>
              <!-- Ready indicator -->
              <v-icon
                v-if="appStore.ready.dataSources[ds.name]"
                color="success"
                size="22"
                class="ml-2"
              >mdi-check-circle</v-icon>
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

          <!-- bottom action to close forced view without changes -->
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
        <template v-else-if="moduleObj?.main">
          <div style="position:relative;">
            <component :is="moduleObj.main" />
          </div>
        </template>

        <div v-else class="pa-8 text-center">
          <v-progress-circular indeterminate color="primary" />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, markRaw } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

// Data-source components and settings
import FieldNotesDS from '@/data_sources/field_notes/Index.vue'
import fieldNotesSettingsMod from '@/data_sources/field_notes/settings.json'
import ChecklistDS from '@/data_sources/checklist/Index.vue'
import checklistSettingsMod from '@/data_sources/checklist/settings.json'
import SpecimensPhotosFolderDS from '@/data_sources/specimens_photos_folder/Index.vue'
import specimensPhotosFolderSettingsMod from '@/data_sources/specimens_photos_folder/settings.json'
import SymbiotaDS from '@/data_sources/symbiota/Index.vue'
import symbiotaSettingsMod from '@/data_sources/symbiota/settings.json'

// Module entry points
import SpecimenPhotosModule from '@/modules/specimen_photos_selector/index.js'
import TaxaPhotosModule from '@/modules/taxa_photos_selector/index.js'
import SymbiotaManagerModule from '@/modules/symbiota_manager/index.js'
import HealthcheckModule from '@/modules/collection_healthcheck/index.js'

const dsRegistry = {
  field_notes: {
    component: markRaw(FieldNotesDS),
    settings: fieldNotesSettingsMod?.default ?? fieldNotesSettingsMod,
  },
  checklist: {
    component: markRaw(ChecklistDS),
    settings: checklistSettingsMod?.default ?? checklistSettingsMod,
  },
  specimens_photos_folder: {
    component: markRaw(SpecimensPhotosFolderDS),
    settings: specimensPhotosFolderSettingsMod?.default ?? specimensPhotosFolderSettingsMod,
  },
  symbiota: {
    component: markRaw(SymbiotaDS),
    settings: symbiotaSettingsMod?.default ?? symbiotaSettingsMod,
  },
}
const moduleRegistry = {
  specimen_photos_selector: SpecimenPhotosModule,
  taxa_photos_selector: TaxaPhotosModule,
  symbiota_manager: SymbiotaManagerModule,
  collection_healthcheck: HealthcheckModule,
}

const route = useRoute()
const appStore = useAppStore()
const moduleName = ref(route.params.name)
const moduleObj = ref(null)
const showDataSourceUi = ref(false)
const dsList = ref([])

const forceShow = computed(() => !!appStore.forceDsForModule?.[moduleName.value])
const loadSeq = ref(0)

watch(
  () => route.params.name,
  (val) => {
    moduleName.value = val
  }
)

const requiredDsNames = computed(() =>
  appStore.modules.find(m => m.name === moduleName.value)?.dataSources ?? []
)
const allReady = computed(() =>
  requiredDsNames.value.length === 0 ||
  requiredDsNames.value.every(ds => appStore.ready.dataSources[ds])
)

async function loadModule() {
  const mySeq = ++loadSeq.value
  const name = moduleName.value
  const moduleMeta = appStore.modules.find(m => m.name === name)
  if (!moduleMeta) {
    if (mySeq !== loadSeq.value) return
    appStore.setError('Module settings.json missing or malformed.')
    moduleObj.value = null
    showDataSourceUi.value = false
    dsList.value = []
    return
  }

  const requiredDs = moduleMeta.dataSources || []
  const allReadyNow = requiredDs.every(ds => appStore.ready.dataSources[ds])

  if ((!allReadyNow || forceShow.value) && requiredDs.length > 0) {
    const entries = requiredDs.map((dsName) => {
      const reg = dsRegistry[dsName]
      if (reg) {
        return { name: dsName, component: reg.component, settings: reg.settings }
      }
      return { name: dsName, component: null, settings: null, error: `Data source "${dsName}" loader missing or malformed.` }
    })
    if (mySeq !== loadSeq.value) return
    showDataSourceUi.value = true
    moduleObj.value = null
    dsList.value = entries
    return
  }

  const mod = moduleRegistry[name]
  if (!mod) {
    if (mySeq !== loadSeq.value) return
    appStore.setError(`Module "${name}" main component missing or malformed.`)
    moduleObj.value = null
    return
  }

  if (mySeq !== loadSeq.value) return
  showDataSourceUi.value = false
  dsList.value = []
  appStore.setModuleReady?.(name, false)
  moduleObj.value = markRaw(mod)
  appStore.modulesObj = appStore.modulesObj || {}
  appStore.modulesObj[name] = moduleObj.value
  appStore.setActiveModule?.(name)
}

const moduleDeps = computed(() => [
  moduleName.value,
  forceShow.value,
  ...(appStore.modules.find(m => m.name === moduleName.value)?.dataSources?.map(ds => appStore.ready.dataSources[ds]) ?? [])
])

async function refreshModule() {
  await loadModule();
}

watch(moduleDeps, refreshModule, { immediate: true, deep: true })

function closeForced() {
  appStore.hideDataSourcesForModule(moduleName.value)
}
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

/* Per-data-source loading overlay */
.ds-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255,255,255,0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 51;
  border-radius: 6px;
}
</style>
