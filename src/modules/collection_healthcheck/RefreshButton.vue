<template>
  <v-btn
    color="primary"
    variant="text"
    style="background:#fff; color:#43a047; font-weight:600;"
    :loading="loading"
    @click="onRefresh"
  >
    Update Symbiota data
  </v-btn>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import symbiotaSettings from '@/modules/symbiota_manager/settings.json'
import { getDbConfig } from '@/modules/symbiota_manager/dbConfig.js'

const appStore = useAppStore()
const loading = ref(false)
const dsReady = computed(() => !!appStore.ready.dataSources['symbiota'])

async function onRefresh() {
  if (!dsReady.value) {
    appStore.setError('Symbiota data source is not ready.')
    return
  }
  loading.value = true
  try {
    const dbConfig = await getDbConfig()
    const apiUrl = symbiotaSettings.settings.apiEndpoint + 'get_collection'
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db: dbConfig })
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || `HTTP error ${response.status}`)
    }
    const data = await response.json()
    appStore.symbiotaCollectionData = Array.isArray(data) ? data : []
  } catch (e) {
    appStore.setError('Failed to refresh Symbiota data: ' + e.message)
  } finally {
    loading.value = false
  }
}
</script>
