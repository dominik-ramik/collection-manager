<template>
  <v-container>
    <div class="d-flex align-center mb-4" style="gap:0.5em;">
      <v-icon :icon="settings.icon || settings.settings?.icon" color="primary" />
      <span style="font-size:1.3em; font-weight:500;">{{ settings.title || settings.settings?.title }}</span>
    </div>
    <p>Select an Excel (.xlsx) file containing the checklist.</p>
    <v-file-input
      label="Pick XLSX file"
      accept=".xlsx"
      @change="onFileChange"
      :disabled="!!fileName"
      show-size
    />
    <div v-if="fileName" class="mt-4">
      <v-icon color="success" class="mr-2">mdi-check-circle</v-icon>
      <span>Loaded file: <strong>{{ fileName }}</strong></span>
    </div>
    <div v-if="error" class="mt-4">
      <v-alert type="error">{{ error }}</v-alert>
    </div>
  </v-container>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import sheetReader from '@/utils/sheetReader'
import settings from './settings.json'

const appStore = useAppStore()
const fileName = ref('')
const error = ref('')
const sheetData = ref([])

function onFileChange(event) {
  error.value = ''
  let inputFile = null
  if (event && event.target && event.target.files && event.target.files.length > 0) {
    inputFile = event.target.files[0]
  }
  if (
    !inputFile ||
    !(inputFile instanceof File) ||
    !inputFile.name.toLowerCase().endsWith('.xlsx')
  ) {
    error.value = 'Failed to read sheet: Please select a valid .xlsx file.'
    fileName.value = ''
    return
  }
  fileName.value = inputFile.name

  const reader = new FileReader()
  reader.onload = async function(e) {
    try {
      const buffer = e.target.result
      let postprocessor = null
      const postprocessorName = settings.settings.dataPostprocessor
      if (postprocessorName) {
        const mod = await import('./index.js')
        if (typeof mod[postprocessorName] === 'function') {
          postprocessor = mod[postprocessorName]
        }
      }
      const result = await sheetReader.readSheet(
        buffer,
        settings.settings.sheetName,
        settings.settings.data,
        postprocessor
      )
      sheetData.value = result
      appStore.checklistData = result
      appStore.ready.dataSources['checklist'] = true
      console.log('Checklist data:', result)
    } catch (err) {
      error.value = 'Failed to read sheet: ' + err.message
      fileName.value = ''
    }
  }
  reader.onerror = function(e) {
    error.value = 'Failed to read sheet: FileReader error'
    fileName.value = ''
  }
  reader.readAsArrayBuffer(inputFile)
}
</script>
