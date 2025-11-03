<template>
  <v-card>
    <v-card-title>Matching Records</v-card-title>
    <v-card-text>
      <v-data-table
        v-if="items.length"
        :headers="computedHeadersWithCheckbox"
        :items="sortedItems"
        :items-per-page="itemsPerPage"
        class="elevation-1"
        density="compact"
        hover
      >
        <template #header.select>
          <th v-if="selectable" style="width:2em;">
            <v-checkbox
              :model-value="allSelected"
              @update:model-value="toggleSelectAll"
              density="compact"
              hide-details
            />
          </th>
        </template>
        <template #item.select="{ item }">
          <td v-if="selectable">
            <v-checkbox
              :model-value="isSelected(item)"
              @update:model-value="val => toggleRow(item, val)"
              density="compact"
              hide-details
            />
          </td>
        </template>
        <template #item.actions="{ item }">
          <v-btn
            variant="tonal"
            color="primary"
            icon
            size="x-small"
            @click="openEditor(item.occid)"
            :aria-label="'Edit specimen ' + item.occurrenceID"
          >
            <v-icon size="18">mdi-pencil</v-icon>
          </v-btn>
        </template>
        <template #item.occurrenceID="{ item }">
          <v-btn
            variant="tonal"
            color="primary"
            size="small"
            @click="openSpecimen(item.occid)"
          >
            {{ item.occurrenceID }}
          </v-btn>
        </template>
        <!-- Render selected fields as HTML content -->
        <template
          v-for="field in htmlFields"
          :key="`html-${field}`"
          v-slot:[`item.${field}`]="{ item }"
        >
          <span v-html="item[field]" />
        </template>
      </v-data-table>
      <div v-if="selectable && items.length" class="mt-4">
        <div v-if="selectedOccids.length === items.length">
          <strong>All ({{ items.length }}) records selected</strong>
        </div>
        <div v-else>
          <strong>Selected records ({{ selectedOccids.length }}):</strong>
          <span>{{ selectedOccids.join(', ') }}</span>
        </div>
      </div>
      <div v-if="items.length && showExport" class="d-flex justify-end mt-4">
        <v-btn color="primary" @click="exportToExcel">
          Export to Excel
        </v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
/* filepath: d:\Programy\web\collection-manager\src\data_sources\symbiota\MatchingRecordsTable.vue */
import settings from '@/modules/symbiota_manager/settings.json'
import * as XLSX from 'xlsx'
import { ref, computed } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
  selectable: { type: Boolean, default: false },
  showExport: { type: Boolean, default: true },
  itemsPerPage: { type: Number, default: 20 },
  htmlFields: { type: Array, default: () => [] }, // fields to render as HTML
})

const headers = [
  { title: '', value: 'actions', sortable: false },
  { title: 'occurrenceID', value: 'occurrenceID', sortable: true },
  { title: 'sciname', value: 'sciname', sortable: true },
  { title: 'scientificNameAuthorship', value: 'scientificNameAuthorship', sortable: true },
  { title: 'family', value: 'family', sortable: true },
  { title: 'recordedBy', value: 'recordedBy', sortable: true },
  { title: 'recordNumber', value: 'recordNumber', sortable: true },
  { title: 'eventDate', value: 'eventDate', sortable: true },
  { title: 'identifiedBy', value: 'identifiedBy', sortable: true },
  { title: 'dateIdentified', value: 'dateIdentified', sortable: true },
  { title: 'country', value: 'country', sortable: true },
  { title: 'stateProvince', value: 'stateProvince', sortable: true },
  { title: 'county', value: 'county', sortable: true },
]

const computedHeadersWithCheckbox = computed(() =>
  props.selectable ? [{ title: '', value: 'select', sortable: false }, ...headers] : headers
)

function openSpecimen(occid) {
  const url = settings.settings.specimenLink.replace('{occid}', occid)
  window.open(url, '_blank')
}

function openEditor(occid) {
  const url = settings.settings.specimenEditor.replace('{occid}', occid)
  window.open(url, '_blank')
}

function exportToExcel() {
  if (!props.items.length) return
  const data = props.items.map(row => {
    const obj = {}
    headers.forEach(h => { obj[h.value] = row[h.value] })
    return obj
  })
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MatchingRecords')
  XLSX.writeFile(workbook, 'MatchingRecords.xlsx')
}

// Selection
const selectedRows = ref(props.items ? [...props.items] : [])
const sortedItems = computed(() =>
  [...props.items].sort((a, b) => String(a.occurrenceID).localeCompare(String(b.occurrenceID)))
)
function isSelected(item) { return selectedRows.value.some(row => row.occurrenceID === item.occurrenceID) }
function toggleRow(item, checked) {
  if (checked) {
    if (!isSelected(item)) selectedRows.value.push(item)
  } else {
    selectedRows.value = selectedRows.value.filter(row => row.occurrenceID !== item.occurrenceID)
  }
}
const allSelected = computed(() => selectedRows.value.length === props.items.length && props.items.length > 0)
function toggleSelectAll(val) { selectedRows.value = val ? [...props.items] : [] }
const selectedOccids = computed(() => selectedRows.value.map(row => row.occid))
defineExpose({ selectedOccids })
</script>
