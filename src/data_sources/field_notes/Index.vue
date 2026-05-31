<template>
  <v-container>
    <ExcelSourceLoader
      :using-cache="usingCache"
      :file-name="fileName"
      :loading="loading"
      :disabled="!!fileName && usingCache"
      :error="error"
      select-help-text="Select an Excel (.xlsx) file containing field notes."
      pick-label="Pick XLSX file"
      loaded-prefix="Loaded file:"
      :repick="repick"
      :on-file-change="handleFileChange"
      :cache-timestamp="cacheMeta?.timestamp"
    />
  </v-container>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import settings from './settings.json'
import { useSheetCache } from '@/composables/useSheetCache'
import ExcelSourceLoader from '@/components/ExcelSourceLoader.vue'

const appStore = useAppStore()

const {
  fileName,
  error,
  loading,
  usingCache,
  repick,
  onFileChange,
  init,
  cacheMeta,
} = useSheetCache({
  sourceName: 'field_notes',
  storeField: 'fieldNotesData',
  settings,
  getPostprocessor: async () => {
    const mod = await import('./index.js')
    const name = settings.settings.dataPostprocessor
    return name && typeof mod[name] === 'function' ? mod[name] : null
  }
})

// Wrap to bind appStore once
function handleFileChange(e) {
  onFileChange(e, appStore)
}

onMounted(() => { init(appStore) })

// Log when field notes data is loaded into the app store
watch(
  () => appStore.fieldNotesData,
  (newVal, oldVal) => {
    try {
      const becameLoaded = newVal && (!oldVal || (Array.isArray(newVal) && newVal.length > 0 && Array.isArray(oldVal) && oldVal.length === 0))
      // Also handle first non-empty assignment when oldVal is falsy
      if (newVal && !oldVal) {
        console.log('[field_notes] loaded:', newVal)
      } else if (becameLoaded) {
        console.log('[field_notes] loaded (updated):', newVal)
      }
    } catch (e) {
      // Guard against logging errors
      console.log('[field_notes] loaded (could not stringify)', newVal.value)
    }
  }
)
</script>
