<template>
  <v-card class="mb-4">
    <v-card-title>Filter Specimens</v-card-title>
    <v-card-text>
      <v-row>
        <v-col
          v-for="filter in filterFields"
          :key="filter.key"
          cols="12" sm="6" md="4"
        >
          <v-autocomplete
            v-model="filter.value.value"
            :items="filter.options.value"
            :label="filter.label"
            clearable
            autocomplete="off"
            density="compact"
            @update:modelValue="val => { filter.value.value = val || ''; updateAllOptions(); }"
          />
        </v-col>
      </v-row>
      <div class="mt-2 mb-2" style="font-size: 1.15em; color: #444;">
        <span v-if="activeFilters.length">
          <strong>Active filters: </strong>
          <span v-for="(f, idx) in activeFilters" :key="f.key">
            <span v-if="idx > 0">, </span>
            <span>{{ f.label }}: <strong>{{ f.value }}</strong></span>
          </span>
        </span>
        <span v-else>
          <em>No filters selected. Showing all specimens.</em>
        </span>
      </div>
      <div class="d-flex justify-space-between mt-2">
        <v-btn color="primary" prepend-icon="mdi-refresh" :loading="refreshing" @click="refreshData">
          Refresh data from the server
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-filter-remove" @click="clearFilters">
          Clear all filters
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
  <MatchingRecordsTable :items="filteredSpecimens" />
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import MatchingRecordsTable from './MatchingRecordsTable.vue'
import settings from './settings.json'

const props = defineProps({
  results: Array,
})

const appStore = useAppStore()
const data = computed(() => props.results && props.results.length ? props.results : (appStore.symbiotaCollectionData || []))

const filterOccurrenceID = ref('')
const filterFamily = ref('')
const filterSciname = ref('')
const filterAuthorship = ref('')
const filterIdentifiedBy = ref('')
const filterDateIdentified = ref('')
const filterRecordedBy = ref('')
const filterRecordNumber = ref('')
const filterEventDate = ref('')
const filterCountry = ref('')
const filterStateProvince = ref('')
const filterCounty = ref('')

// Compute filtered data based on current filters
const filteredSpecimens = computed(() =>
  (data.value || []).filter(row =>
    (
      filterOccurrenceID.value === '' ? true :
      filterOccurrenceID.value === '[empty]' ? !row.occurrenceID :
      filterOccurrenceID.value === '[no barcode]' ? (row.occurrenceID && row.occurrenceID.startsWith('PVNH-NO_BARCODE')) :
      row.occurrenceID === filterOccurrenceID.value
    ) &&
    (filterFamily.value === '' ? true :
      filterFamily.value === '[empty]' ? !row.family :
      row.family === filterFamily.value) &&
    (filterSciname.value === '' ? true :
      filterSciname.value === '[empty]' ? !row.sciname :
      row.sciname === filterSciname.value) &&
    (filterAuthorship.value === '' ? true :
      filterAuthorship.value === '[empty]' ? !row.scientificNameAuthorship :
      row.scientificNameAuthorship === filterAuthorship.value) &&
    (filterIdentifiedBy.value === '' ? true :
      filterIdentifiedBy.value === '[empty]' ? !row.identifiedBy :
      row.identifiedBy === filterIdentifiedBy.value) &&
    (filterDateIdentified.value === '' ? true :
      filterDateIdentified.value === '[empty]' ? !row.dateIdentified :
      row.dateIdentified === filterDateIdentified.value) &&
    (filterRecordedBy.value === '' ? true :
      filterRecordedBy.value === '[empty]' ? !row.recordedBy :
      row.recordedBy === filterRecordedBy.value) &&
    (filterRecordNumber.value === '' ? true :
      filterRecordNumber.value === '[empty]' ? !row.recordNumber :
      row.recordNumber === filterRecordNumber.value) &&
    (filterEventDate.value === '' ? true :
      filterEventDate.value === '[empty]' ? !row.eventDate :
      row.eventDate === filterEventDate.value) &&
    (filterCountry.value === '' ? true :
      filterCountry.value === '[empty]' ? !row.country :
      row.country === filterCountry.value) &&
    (filterStateProvince.value === '' ? true :
      filterStateProvince.value === '[empty]' ? !row.stateProvince :
      row.stateProvince === filterStateProvince.value) &&
    (filterCounty.value === '' ? true :
      filterCounty.value === '[empty]' ? !row.county :
      row.county === filterCounty.value)
  )
)

// Only show options present in the currently filtered data, plus "[empty]" for empty string
function uniqueOptions(field) {
  const seen = new Set()
  let opts = filteredSpecimens.value
    .map(row => row[field] ?? '')
    .map(val => val === '' ? '[empty]' : val)
    .filter(val => !seen.has(val) && seen.add(val))
    .sort((a, b) => a.localeCompare(b))
  // For Barcode number, add [no barcode] to the top
  if (field === 'occurrenceID') {
    opts = ['[no barcode]', ...opts.filter(v => v !== '[no barcode]')]
  }
  return opts
}

const occurrenceIDOptions = ref([])
const familyOptions = ref([])
const scinameOptions = ref([])
const authorshipOptions = ref([])
const identifiedByOptions = ref([])
const dateIdentifiedOptions = ref([])
const recordedByOptions = ref([])
const recordNumberOptions = ref([])
const eventDateOptions = ref([])
const countryOptions = ref([])
const stateProvinceOptions = ref([])
const countyOptions = ref([])

function updateAllOptions() {
  occurrenceIDOptions.value = uniqueOptions('occurrenceID')
  familyOptions.value = uniqueOptions('family')
  scinameOptions.value = uniqueOptions('sciname')
  authorshipOptions.value = uniqueOptions('scientificNameAuthorship')
  identifiedByOptions.value = uniqueOptions('identifiedBy')
  dateIdentifiedOptions.value = uniqueOptions('dateIdentified')
  recordedByOptions.value = uniqueOptions('recordedBy')
  recordNumberOptions.value = uniqueOptions('recordNumber')
  eventDateOptions.value = uniqueOptions('eventDate')
  countryOptions.value = uniqueOptions('country')
  stateProvinceOptions.value = uniqueOptions('stateProvince')
  countyOptions.value = uniqueOptions('county')
}

// Update options whenever any filter changes
function onFilterChange() {
  updateAllOptions()
}

// Also update options when data changes
watch([
  data,
  filterOccurrenceID,
  filterFamily,
  filterSciname,
  filterAuthorship,
  filterIdentifiedBy,
  filterDateIdentified,
  filterRecordedBy,
  filterRecordNumber,
  filterEventDate,
  filterCountry,
  filterStateProvince,
  filterCounty
], updateAllOptions, { immediate: true })

function clearFilters() {
  filterOccurrenceID.value = ''
  filterFamily.value = ''
  filterSciname.value = ''
  filterAuthorship.value = ''
  filterIdentifiedBy.value = ''
  filterDateIdentified.value = ''
  filterRecordedBy.value = ''
  filterRecordNumber.value = ''
  filterEventDate.value = ''
  filterCountry.value = ''
  filterStateProvince.value = ''
  filterCounty.value = ''
}

const refreshing = ref(false)

async function refreshData() {
  refreshing.value = true
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
    // results table will refresh automatically via computed
  } catch (e) {
    appStore.setError('Failed to refresh data: ' + e.message)
  } finally {
    refreshing.value = false
  }
}

const filterFields = [
  { key: 'filterOccurrenceID', label: 'Barcode number', value: filterOccurrenceID, options: occurrenceIDOptions },
  { key: 'filterFamily', label: 'Family', value: filterFamily, options: familyOptions },
  { key: 'filterSciname', label: 'Scientific name', value: filterSciname, options: scinameOptions },
  { key: 'filterAuthorship', label: 'Authority', value: filterAuthorship, options: authorshipOptions },
  { key: 'filterIdentifiedBy', label: 'Identified by', value: filterIdentifiedBy, options: identifiedByOptions },
  { key: 'filterDateIdentified', label: 'Date identified', value: filterDateIdentified, options: dateIdentifiedOptions },
  { key: 'filterRecordedBy', label: 'Collector name', value: filterRecordedBy, options: recordedByOptions },
  { key: 'filterRecordNumber', label: 'Collector number', value: filterRecordNumber, options: recordNumberOptions },
  { key: 'filterEventDate', label: 'Collection date', value: filterEventDate, options: eventDateOptions },
  { key: 'filterCountry', label: 'Country', value: filterCountry, options: countryOptions },
  { key: 'filterStateProvince', label: 'Province', value: filterStateProvince, options: stateProvinceOptions },
  { key: 'filterCounty', label: 'Island', value: filterCounty, options: countyOptions },
]

const activeFilters = computed(() =>
  filterFields
    .filter(f => f.value.value && f.value.value !== '')
    .map(f => ({ key: f.key, label: f.label, value: f.value.value }))
)
</script>