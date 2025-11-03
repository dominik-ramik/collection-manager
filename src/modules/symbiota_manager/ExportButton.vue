<template>
  <div>
    <v-btn
      color="green-darken-1"
      variant="text"
      style="background:#fff; color:#43a047; font-weight:600;"
      @click="downloadBackup"
      :loading="loading"
    >
      Download SQL Backup
    </v-btn>

    <!-- Working dialog -->
    <v-dialog v-model="showWorkingDialog" max-width="420" persistent>
      <v-card>
        <v-card-title>{{ workingDialogTitle }}</v-card-title>
        <v-card-text>
          <div class="d-flex align-center">
            <v-progress-circular indeterminate color="primary" class="mr-2" />
            <span>{{ workingDialogText }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Result dialog -->
    <v-dialog v-model="showResultDialog" max-width="500">
      <v-card>
        <v-card-title>{{ resultDialogTitle }}</v-card-title>
        <v-card-text>
          <div v-if="resultDialogError">
            <v-alert type="error" density="comfortable" variant="tonal">
              {{ resultDialogError }}
            </v-alert>
          </div>
          <div v-else>
            <v-alert type="success" density="comfortable" variant="tonal">
              {{ resultDialogMessage }}
            </v-alert>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="closeResultDialog">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import settings from './settings.json'
import { getDbConfig } from './dbConfig'

const loading = ref(false)

// Working dialog state
const showWorkingDialog = ref(false)
const workingDialogTitle = ref('Preparing Backup')
const workingDialogText = ref('Please wait...')

// Result dialog state
const showResultDialog = ref(false)
const resultDialogTitle = ref('')
const resultDialogMessage = ref('')
const resultDialogError = ref('')

function closeResultDialog() {
  showResultDialog.value = false
  resultDialogTitle.value = ''
  resultDialogMessage.value = ''
  resultDialogError.value = ''
}

function getTimestampFilename() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `omoccurrences_${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}_${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}.sql`
}

async function downloadBackup() {
  resultDialogError.value = ''
  resultDialogMessage.value = ''
  loading.value = true
  workingDialogTitle.value = 'Preparing Backup'
  workingDialogText.value = 'Contacting server...'
  showWorkingDialog.value = true
  try {
    const dbConfig = await getDbConfig()
    const apiUrl = settings.settings.apiEndpoint + 'backup_omoccurrences'
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db: dbConfig })
    })
    let result
    try {
      result = await response.json()
    } catch (jsonErr) {
      throw new Error('Invalid server response')
    }
    if (!response.ok) {
      const errMsg = result?.error || `HTTP error ${response.status}`
      throw new Error(errMsg)
    }
    if (!result.sql) throw new Error('No SQL data received')

    // Download as file
    const blob = new Blob([result.sql], { type: 'application/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = getTimestampFilename()
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    // Success
    showWorkingDialog.value = false
    resultDialogTitle.value = 'Backup complete'
    resultDialogMessage.value = 'Backup file downloaded successfully.'
    resultDialogError.value = ''
    showResultDialog.value = true
  } catch (e) {
    showWorkingDialog.value = false
    resultDialogTitle.value = 'Backup failed'
    resultDialogMessage.value = ''
    resultDialogError.value = e?.message || String(e)
    showResultDialog.value = true
  } finally {
    loading.value = false
  }
}
</script>
