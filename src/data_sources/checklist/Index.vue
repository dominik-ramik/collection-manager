<template>
  <v-container>
    <!-- Cached notice and actions -->
    <v-alert
      v-if="usingCache"
      type="success"
      variant="tonal"
      class="mb-3"
    >
      Using cached Checklist data from previous session
      <span v-if="fileName"> ({{ fileName }})</span>.
      <v-btn
        class="ml-3"
        color="primary"
        size="small"
        variant="flat"
        @click="repick"
      >
        Pick different file
      </v-btn>
    </v-alert>

    <p>Select an Excel (.xlsx) file containing the checklist.</p>
    <v-file-input
      label="Pick XLSX file"
      accept=".xlsx"
      :disabled="!!fileName && usingCache"
      :loading="loading"
      show-size
      @change="e => onFileChange(e, appStore)"
    />
    <div v-if="fileName && !usingCache" class="mt-4">
      <v-icon color="success" class="mr-2">mdi-check-circle</v-icon>
      <span>Loaded file: <strong>{{ fileName }}</strong></span>
    </div>
    <div v-if="error" class="mt-4">
      <v-alert type="error">{{ error }}</v-alert>
    </div>
  </v-container>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import settings from './settings.json'
import { useSheetCache } from '@/composables/useSheetCache'

const appStore = useAppStore()

const {
  fileName,
  error,
  loading,
  usingCache,
  repick,
  onFileChange,
  init,
} = useSheetCache({
  sourceName: 'checklist',
  storeField: 'checklistData',
  settings,
  getPostprocessor: async () => {
    const mod = await import('./index.js')
    const name = settings.settings.dataPostprocessor
    return name && typeof mod[name] === 'function' ? mod[name] : null
  }
})

onMounted(() => { init(appStore) })
</script>
