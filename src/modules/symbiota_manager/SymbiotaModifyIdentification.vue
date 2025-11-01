<template>
  <v-card class="mb-4">
    <v-card-title>Modify Identifications</v-card-title>
    <v-card-text>
      <div class="mb-2" style="white-space: normal;">
        <span>
          This section allows you to batch-update any specimens identification. Select first the specimen identification which you wish to update. You will be asked for the new identification and will be presented with a list of specimens that will be affected by the change.
        </span>
      </div>
      <v-autocomplete
        v-model="localSelectedTaxon"
        :items="taxonOptions"
        item-title="label"
        item-value="value"
        label="Select taxon"
        clearable
        autocomplete="off"
        :return-object="true"
        :filter="customFilter"
        class="mb-4"
        @update:modelValue="onTaxonSelected"
      />
      <div v-if="localSelectedTaxon">
        <div class="mb-2">
          Change the selected specimens to the following:
        </div>
        <div class="d-flex align-center mb-2" style="gap: 16px;">
          <v-text-field
            v-model="localEditFamily"
            label="family"
            density="compact"
            class="mb-2"
            style="width:33%;"
            @update:modelValue="updateEditFamily"
            required
          />
          <v-text-field
            v-model="localEditSciname"
            label="sciname"
            density="compact"
            class="mb-2"
            style="width:33%;"
            @update:modelValue="updateEditSciname"
            required
          />
          <v-text-field
            v-model="localEditAuthorship"
            label="scientificNameAuthorship"
            density="compact"
            class="mb-2"
            style="width:33%;"
            @update:modelValue="updateEditAuthorship"
            required
          />
        </div>
        <div class="d-flex align-center mb-2" style="gap: 16px;">
          <v-autocomplete
            v-model="localEditIdentifiedBy"
            :items="identifiedByOptions"
            label="identifiedBy"
            density="compact"
            class="mb-2"
            style="width:50%; margin-bottom:0; align-self: flex-start;"
            clearable
            autocomplete="off"
            allow-overflow
            hide-details
            :return-object="false"
          />
          <div style="width:50%; margin-bottom:0; display: flex; align-items: flex-start;">
            <v-select
              v-model="dateOption"
              :items="dateOptions"
              label="dateIdentified"
              density="compact"
              style="width:100%; min-width:180px; margin-bottom:0;"
              hide-details
            />
          </div>
        </div>
        <div class="d-flex align-center mb-4" style="gap: 16px;">
          <div style="flex: 1;"></div>
          <v-btn
            color="primary"
            @click="showConfirmDialog = true"
            :disabled="selectedOccids.length === 0 || allIdFieldsEmpty"
          >
            Modify identification of {{ selectedOccids.length }} specimen<span v-if="selectedOccids.length !== 1">s</span>
          </v-btn>
          <div style="flex: 1;"></div>
        </div>
        <div v-if="selectedOccids.length === 0" class="mb-4">
          <v-alert type="info" dense>Please select at least one record to modify.</v-alert>
        </div>
        <div v-if="allIdFieldsEmpty" class="mb-4">
          <v-alert type="error" dense>
            Family, scientific name, and scientificNameAuthorship cannot all be empty.
          </v-alert>
        </div>
      </div>
      <v-dialog v-model="showConfirmDialog" max-width="1000">
        <v-card>
          <v-card-title>Confirm Batch Update</v-card-title>
          <v-card-text>
            <div>
              Are you sure you want to modify the following <strong>{{ selectedOccids.length }}</strong> records?
            </div>
            <div class="mt-4">
              <v-expansion-panels v-model="showRecordsPanel" multiple>
                <v-expansion-panel>
                  <v-expansion-panel-title style="background: #f5f7fa; color: #2e3a4d; font-weight: 600;">
                    Show the affected records
                  </v-expansion-panel-title>
                  <v-expansion-panel-text style="background: #f5f7fa;">
                    <component
                      :is="MatchingRecordsTable"
                      :items="selectedRecords"
                      :selectable="false"
                      :showExport="false"
                      :itemsPerPage="5"
                    />
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>
            <div class="mt-4">
              <h3 style="font-size:1.1em; margin-bottom:0.5em;">New values</h3>
              <ul style="margin-left: 2em;">
                <li><strong>family:</strong> "{{ localEditFamily || 'NULL' }}"</li>
                <li><strong>sciname:</strong> "{{ localEditSciname || 'NULL' }}"</li>
                <li><strong>scientificNameAuthorship:</strong> "{{ localEditAuthorship || 'NULL' }}"</li>
                <li>
                  <strong>identifiedBy: </strong>
                  <span v-if="localEditIdentifiedBy === identifiedByKeepUnchanged"><i>keep unchanged</i></span>
                  <span v-else>"{{ localEditIdentifiedBy || 'NULL' }}"</span>
                </li>
                <li>
                  <strong>dateIdentified: </strong>
                  <span v-if="dateOption === 'unchanged'"><i>keep unchanged</i></span>
                  <span v-else>{{ todayDate }}</span>
                </li>
              </ul>
            </div>
            <div v-if="apiError" class="mt-2">
              <v-alert type="error" dense>{{ apiError }}</v-alert>
            </div>
            <div v-if="apiResult" class="mt-2">
              <v-alert type="success" dense>{{ apiResult }}</v-alert>
            </div>
            <div v-if="hasEmptyFields" class="mt-4">
              <v-alert type="error" dense>
                Some fields are empty and will be set to <strong>NULL</strong> in the database.<br>
                This is fine if you intend to clear these values. Please check that this is not accidental.
                <div class="ml-4 mt-2">
                  <span v-if="!localEditFamily"><strong>family</strong>, </span>
                  <span v-if="!localEditSciname"><strong>sciname</strong>, </span>
                  <span v-if="!localEditAuthorship"><strong>scientificNameAuthorship</strong>, </span>
                  <span v-if="!localEditIdentifiedBy"><strong>identifiedBy</strong></span>
                </div>
              </v-alert>
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn color="grey" @click="closeDialog">Cancel</v-btn>
            <v-btn color="primary" :disabled="loading" @click="doBatchUpdate">
              Confirm
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
      <v-dialog v-model="showWorkingDialog" max-width="400" persistent>
        <v-card>
          <v-card-title>{{ workingDialogTitle }}</v-card-title>
          <v-card-text>
            <div class="d-flex align-center justify-center">
              <v-progress-circular indeterminate color="primary" class="mr-2" />
              <span>{{ workingDialogText }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-dialog>
      <v-dialog v-model="showResultDialog" max-width="500" persistent>
        <v-card>
          <v-card-title>{{ resultDialogTitle }}</v-card-title>
          <v-card-text>
            <div v-if="resultDialogError">
              <v-alert type="error" dense>{{ resultDialogError }}</v-alert>
            </div>
            <div v-else>
              <v-alert type="success" dense>{{ resultDialogMessage }}</v-alert>
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" @click="closeResultDialog">
              Close
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-text>
  </v-card>
  <MatchingRecordsTable
    v-if="localSelectedSciname"
    :items="filteredRecords"
    :selectable="true"
    ref="matchingTableRef"
  />
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import MatchingRecordsTable from './MatchingRecordsTable.vue'
import settings from './settings.json'
import { getDbConfig } from './dbConfig'

const props = defineProps({
  results: Array,
  selectedSciname: String,
  editFamily: String,
  editSciname: String,
  editAuthorship: String,
})
const emit = defineEmits([
  'update:selectedSciname',
  'update:editFamily',
  'update:editSciname',
  'update:editAuthorship',
])

const appStore = useAppStore()

const localSelectedSciname = ref(props.selectedSciname)
const localEditFamily = ref(props.editFamily)
const localEditSciname = ref(props.editSciname)
const localEditAuthorship = ref(props.editAuthorship)
const identifiedByKeepUnchanged = '[keep unchanged]'
const localEditIdentifiedBy = ref(identifiedByKeepUnchanged)
const dateOption = ref('unchanged')
const dateOptions = [
  { title: '[keep unchanged]', value: 'unchanged' },
  { title: 'today date', value: 'today' }
]

// Autocomplete options for "Identified by"
const identifiedByOptions = computed(() => {
  const seen = new Set()
  const opts = (props.results || [])
    .map(row => row.identifiedBy || '')
    .filter(val => val && !seen.has(val) && seen.add(val))
    .sort((a, b) => a.localeCompare(b))
  opts.unshift(identifiedByKeepUnchanged)
  return opts
})

watch(() => props.selectedSciname, val => { localSelectedSciname.value = val })
watch(() => props.editFamily, val => { localEditFamily.value = val })
watch(() => props.editSciname, val => { localEditSciname.value = val })
watch(() => props.editAuthorship, val => { localEditAuthorship.value = val })

function updateSelectedSciname(val) { emit('update:selectedSciname', val) }
function updateEditFamily(val) { emit('update:editFamily', val) }
function updateEditSciname(val) { emit('update:editSciname', val) }
function updateEditAuthorship(val) { emit('update:editAuthorship', val) }

// Taxon options should use both sciname and scientificNameAuthorship as value
const taxonOptions = computed(() => {
  const seen = new Set()
  return (props.results || [])
    .map(row => {
      const valueObj = { sciname: row.sciname, scientificNameAuthorship: row.scientificNameAuthorship }
      const key = JSON.stringify(valueObj)
      return {
        label: `${row.sciname} ${row.scientificNameAuthorship || ''}`.trim(),
        value: valueObj,
        sciname: row.sciname,
        scientificNameAuthorship: row.scientificNameAuthorship
      }
    })
    .filter(opt => {
      const key = JSON.stringify(opt.value)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.label.localeCompare(b.label))
})

// Selected taxon is now an object
const localSelectedTaxon = ref(null)
watch(() => props.selectedSciname, val => {
  // Find the matching object in taxonOptions
  const match = taxonOptions.value.find(opt => JSON.stringify(opt.value) === val)
  localSelectedTaxon.value = match ? match.value : null
})

function onTaxonSelected(val) {
  // Find the matching option and emit its stringified value
  const match = taxonOptions.value.find(opt => opt.value.sciname === val.sciname && opt.value.scientificNameAuthorship === val.scientificNameAuthorship)
  if (match) {
    emit('update:selectedSciname', JSON.stringify(match.value))
  }
  localSelectedTaxon.value = val
}

const filteredRecords = computed(() =>
  (props.results || []).filter(row =>
    row.sciname === localSelectedTaxon.value?.sciname &&
    row.scientificNameAuthorship === localSelectedTaxon.value?.scientificNameAuthorship
  )
)

function customFilter(item, queryText, itemText) {
  const text = item.label.toLowerCase()
  return text.includes(queryText.toLowerCase())
}

const showConfirmDialog = ref(false)
const apiError = ref('')
const apiResult = ref('')
const loading = ref(false)

// Result modal dialog state
const showResultDialog = ref(false)
const resultDialogTitle = ref('')
const resultDialogMessage = ref('')
const resultDialogError = ref('')
const resultDialogLoading = ref(false)

const todayDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
})

const hasEmptyFields = computed(() =>
  !localEditFamily.value ||
  !localEditSciname.value ||
  !localEditAuthorship.value ||
  !localEditIdentifiedBy.value
)

const allIdFieldsEmpty = computed(() =>
  !localEditFamily.value && !localEditSciname.value && !localEditAuthorship.value
)

function closeDialog() {
  showConfirmDialog.value = false
  apiError.value = ''
  apiResult.value = ''
}

function closeResultDialog() {
  showResultDialog.value = false
  resultDialogTitle.value = ''
  resultDialogMessage.value = ''
  resultDialogError.value = ''
}

const showWorkingDialog = ref(false)
const workingDialogTitle = ref('Working')
const workingDialogText = ref('Working...')

const matchingTableRef = ref(null)
const selectedOccids = computed(() => matchingTableRef.value?.selectedOccids ?? [])
const selectedRecords = computed(() => {
  // Defensive: filteredRecords may contain occurrenceID or occid, but MatchingRecordsTable uses occurrenceID for selection
  // Find records in filteredRecords whose occid is in selectedOccids
  if (!filteredRecords.value || !selectedOccids.value) return []
  // Try matching by occid first, fallback to occurrenceID if occid is missing
  return filteredRecords.value.filter(r =>
    selectedOccids.value.includes(r.occid) ||
    selectedOccids.value.includes(r.occurrenceID)
  )
})

async function doBatchUpdate() {
  apiError.value = ''
  apiResult.value = ''
  loading.value = true
  showConfirmDialog.value = false // Hide confirmation dialog immediately
  workingDialogTitle.value = 'Working'
  workingDialogText.value = 'Working...'
  showWorkingDialog.value = true
  try {
    // Wait for spinner to show before starting API call
    await nextTick()
    const dbConfig = await getDbConfig()
    const apiUrl = settings.settings.apiEndpoint + 'batch_update_identification'
    // Prepare payload
    let identifiedByValue = null
    if (localEditIdentifiedBy.value === identifiedByKeepUnchanged) {
      identifiedByValue = '__KEEP_UNCHANGED__'
    } else if (localEditIdentifiedBy.value) {
      identifiedByValue = localEditIdentifiedBy.value
    } // else null

    // Use selectedOccids.value instead of occids
    const occids = selectedOccids.value

    // Only send dateIdentified if not 'unchanged'
    let dateIdentifiedValue = null
    if (dateOption.value === 'today') {
      dateIdentifiedValue = todayDate.value
    }
    const payload = {
      occids,
      family: localEditFamily.value || null,
      newSciname: localEditSciname.value || null,
      newScientificNameAuthorship: localEditAuthorship.value || null,
      identifiedBy: identifiedByValue,
      ...(dateIdentifiedValue !== null ? { dateIdentified: dateIdentifiedValue } : {}),
      db: dbConfig
    }

    let result
    let apiErrorMsg = ''
    let apiSuccess = false
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      result = await response.json()
      // Log SQL for debug if present
      if (result?.error === 'DEBUG: SQL not executed' && result?.sql) {
        console.log('DEBUG SQL:', result.sql)
      }
      if (!response.ok || result.error) {
        apiErrorMsg = result.error || 'Unknown error'
      } else {
        apiSuccess = true
      }
    } catch (jsonErr) {
      apiErrorMsg = 'Invalid server response'
    }

    if (!apiSuccess) {
      showWorkingDialog.value = false
      resultDialogTitle.value = 'Error'
      resultDialogError.value = apiErrorMsg
      resultDialogMessage.value = ''
      showResultDialog.value = true
      return
    }

    // API success, now fetch fresh data
    workingDialogTitle.value = 'Refreshing Data'
    workingDialogText.value = 'Refreshing data from the server...'
    try {
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
      await nextTick()
      // Clear the Selected taxon dropdown
      emit('update:selectedSciname', '')
      localSelectedTaxon.value = null
      localSelectedSciname.value = ''
      // Optionally, reset edit fields to empty
      localEditFamily.value = ''
      localEditSciname.value = ''
      localEditAuthorship.value = ''
      localEditIdentifiedBy.value = identifiedByKeepUnchanged
      dateOption.value = 'unchanged'
      showWorkingDialog.value = false
      resultDialogTitle.value = 'Batch Update Successful'
      resultDialogError.value = ''
      resultDialogMessage.value = result.message || 'Batch update successful'
      showResultDialog.value = true
    } catch (fetchErr) {
      showWorkingDialog.value = false
      resultDialogTitle.value = 'Error'
      resultDialogError.value = fetchErr.message
      resultDialogMessage.value = ''
      showResultDialog.value = true
    }
  } catch (e) {
    showWorkingDialog.value = false
    showConfirmDialog.value = false
    resultDialogTitle.value = 'Error'
    resultDialogError.value = e.message
    resultDialogMessage.value = ''
    showResultDialog.value = true
  } finally {
    loading.value = false
  }
}

const showRecordsPanel = ref([])
</script>