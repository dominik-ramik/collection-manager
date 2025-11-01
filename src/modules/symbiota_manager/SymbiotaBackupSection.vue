<template>
  <div class="d-flex justify-center align-center" style="min-height: 40vh;">
    <v-card class="mb-4" style="min-width:350px;">
      <v-card-title class="text-center">Backup omoccurrences table</v-card-title>
      <v-card-text>
        <div class="text-center mb-2" style="font-size: 0.95em; color: rgba(0,0,0,0.7);">
          This operation may take a minute or two depending on the size of your database. Stay on this screen until the backup is finished.
        </div>
        <div class="d-flex justify-center">
          <v-btn color="primary" :loading="loading" @click="downloadBackup">
            Download SQL Backup
          </v-btn>
        </div>
        <div v-if="error" class="mt-2">
          <v-alert type="error" dense>{{ error }}</v-alert>
        </div>
        <div v-if="backupSuccess" class="mt-2">
          <v-alert type="success" dense>
            Backup file downloaded successfully.
          </v-alert>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import settings from './settings.json'
import { useAppStore } from '@/stores/app'
import { getDbConfig } from './dbConfig'

const loading = ref(false)
const error = ref('')
const backupSuccess = ref(false)
const appStore = useAppStore()

function getTimestampFilename() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `omoccurrences_${d.getFullYear()}_${pad(d.getMonth()+1)}_${pad(d.getDate())}_${pad(d.getHours())}_${pad(d.getMinutes())}_${pad(d.getSeconds())}.sql`
}

async function downloadBackup() {
  error.value = ''
  backupSuccess.value = false
  loading.value = true
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
      console.log('Backup API response (invalid JSON):', jsonErr)
      throw new Error('Invalid server response')
    }
    console.log('Backup API response:', result)
    if (!response.ok) {
      const errMsg = result?.error || `HTTP error ${response.status}`
      error.value = errMsg
      return
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
    backupSuccess.value = true // Show success indicator
  } catch (e) {
    console.log('Backup API error:', e)
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>
