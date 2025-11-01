<template>
  <v-container>
    <v-tabs v-model="activeSection" grow>
      <v-tab
        v-for="item in menuItems"
        :key="item.value"
        :value="item.value"
        :prepend-icon="item.icon"
      >
        {{ item.label }}
      </v-tab>
    </v-tabs>
    <v-divider class="mb-4" />
    <div v-if="loadingData" class="d-flex justify-center align-center" style="min-height: 200px;">
      <v-progress-circular indeterminate color="primary" size="48" />
      <span class="ml-4">Loading Symbiota data...</span>
    </div>
    <component
      v-else
      :is="sectionComponent"
      v-bind="sectionProps"
    />
  </v-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import SymbiotaFilterSection from './SymbiotaFilterSection.vue'
import SymbiotaModifyIdentification from './SymbiotaModifyIdentification.vue'
import SymbiotaBackupSection from './SymbiotaBackupSection.vue'
import settings from './settings.json'

const appStore = useAppStore()
const results = computed(() => appStore.symbiotaCollectionData || [])

const selectedSciname = ref('')
const editFamily = ref('')
const editSciname = ref('')
const editAuthorship = ref('')

const menuItems = [
  { value: 'filter', label: 'Filter Specimens', icon: 'mdi-filter' },
  { value: 'identification', label: 'Modify Identifications', icon: 'mdi-pencil' },
  { value: 'backup', label: 'Backup', icon: 'mdi-database-export' },
]

const activeSection = ref('filter')

const loadingData = ref(false)
const dataLoaded = computed(() => !!appStore.symbiotaCollectionData && appStore.symbiotaCollectionData.length > 0)

watch(
  () => appStore.ready.dataSources['symbiota'],
  async (ready) => {
    if (ready && !dataLoaded.value) {
      loadingData.value = true
      try {
        const { getDbConfig } = await import('./dbConfig')
        const dbConfig = await getDbConfig()
        const apiUrl = settings.settings.apiEndpoint + 'get_collection'
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
        appStore.setError('Failed to fetch Symbiota data: ' + e.message)
      } finally {
        loadingData.value = false
      }
    }
  },
  { immediate: true }
)

const sectionComponent = computed(() => {
  if (activeSection.value === 'filter') return SymbiotaFilterSection
  if (activeSection.value === 'identification') return SymbiotaModifyIdentification
  if (activeSection.value === 'backup') return SymbiotaBackupSection
  return null
})

const sectionProps = computed(() => {
  if (activeSection.value === 'filter') {
    return { results: results.value }
  }
  if (activeSection.value === 'identification') {
    return {
      results: results.value,
      selectedSciname: selectedSciname.value,
      editFamily: editFamily.value,
      editSciname: editSciname.value,
      editAuthorship: editAuthorship.value,
      'onUpdate:selectedSciname': val => (selectedSciname.value = val),
      'onUpdate:editFamily': val => (editFamily.value = val),
      'onUpdate:editSciname': val => (editSciname.value = val),
      'onUpdate:editAuthorship': val => (editAuthorship.value = val),
    }
  }
  return {}
})
</script>

<style scoped>
.module-layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.module-main {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  background: #fff;
  padding: 2em 2em 2em 2em;
}
</style>
