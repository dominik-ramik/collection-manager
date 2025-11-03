<template>
  <div>
    <v-alert
      :type="problemsCount > 0 ? 'warning' : 'success'"
      variant="tonal"
      class="mb-4"
    >
      <div class="d-flex align-center flex-wrap" style="gap:12px;">
        <div><strong>Records</strong> {{ totalRows }}</div>
        <v-divider vertical />
        <div>
          <strong>Problems</strong> {{ problemsCount }}
          <span style="color:#666;">
            (Duplicates: {{ duplicateGroups.length }}, Missing fields: {{ missingRequired.length }}, Unknown collectors: {{ unknownCollectors.length }}, Conflicting taxonomy: {{ conflicts.length }})
          </span>
        </div>
      </div>
    </v-alert>

    <v-expansion-panels multiple>
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: duplicateGroups.length > 0 ? '#d32f2f' : 'inherit' }">
            Duplicate specimen keys ({{ duplicateGroups.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Shows Field Notes entries that share the same specimen key (INITIALS|NUMBER|ACCLETTER). Indicates possible duplicate data-entry for a single specimen.
          </div>
          <div v-if="duplicateGroups.length === 0" class="text-medium-emphasis">No duplicates found.</div>
          <div v-else>
            <div
              v-for="(grp, idx) in duplicateGroups"
              :key="`dup-${idx}`"
              class="mb-3"
            >
              <div class="mb-1" style="font-weight:600;">{{ grp.label }} — {{ grp.items.length }} entries</div>
              <HcDataTable
                :headers="dupHeaders"
                :items="grp.items.map(r => ({
                  row: getRowIndex(r),
                  key: keyLabelFromRow(r),
                  collector: r?.specimenNumber?.name || '(unknown collector)',
                  initials: (r?.specimenNumber?.initials || '').toString(),
                  number: (r?.specimenNumber?.number || '').toString(),
                  accletter: (r?.specimenNumber?.accletter || '').toString(),
                  taxonomy: formatTaxonomy(r?.taxonomy || null),
                }))"
                :items-per-page="10"
              />
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: conflicts.length > 0 ? '#d32f2f' : 'inherit' }">
            Conflicting taxonomy for same key ({{ conflicts.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Highlights specimens with the same key but different taxonomy values. Suggests inconsistent or conflicting determinations for the same specimen.
          </div>
          <div v-if="conflicts.length === 0" class="text-medium-emphasis">No conflicting taxonomy found.</div>
          <div v-else>
            <div
              v-for="(c, idx) in conflicts"
              :key="`conf-${idx}`"
              class="mb-3"
            >
              <div class="mb-1" style="font-weight:600;">{{ c.label }}</div>
              <HcDataTable
                :headers="confHeaders"
                :items="c.taxonomyVariants.map(v => ({ taxonomy: v.display, count: v.count }))"
                :items-per-page="10"
              />
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: missingRequired.length > 0 ? '#d32f2f' : 'inherit' }">
            Records with missing initials or number ({{ missingRequired.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Lists entries missing required matching fields (collector initials or collection number). Such rows cannot be matched to specimen folders.
          </div>
          <div v-if="missingRequired.length === 0" class="text-medium-emphasis">No records with missing required fields.</div>
          <HcDataTable
            v-else
            :headers="mrHeaders"
            :items="missingRequired.map(r => ({
              row: getRowIndex(r),
              collector: r?.specimenNumber?.name || '(unknown collector)',
              initials: (r?.specimenNumber?.initials || '').toString(),
              number: (r?.specimenNumber?.number || '').toString(),
              accletter: (r?.specimenNumber?.accletter || '').toString(),
              taxonomy: formatTaxonomy(r?.taxonomy || null),
            }))"
            :items-per-page="10"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: unknownCollectors.length > 0 ? '#d32f2f' : 'inherit' }">
            Unknown collector names ({{ unknownCollectors.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Shows rows where the collector name is not mapped to initials. Add a mapping so initials can be derived and matching can work.
          </div>
          <div v-if="unknownCollectors.length === 0" class="text-medium-emphasis">No unknown collectors found.</div>
          <HcDataTable
            v-else
            :headers="unkHeaders"
            :items="unknownCollectors.map(r => ({
              row: getRowIndex(r),
              collector: r?.specimenNumber?.name || '(no collector name)',
              initials: (r?.specimenNumber?.initials || '').toString(),
              number: (r?.specimenNumber?.number || '').toString(),
              accletter: (r?.specimenNumber?.accletter || '').toString(),
              taxonomy: formatTaxonomy(r?.taxonomy || null),
            }))"
            :items-per-page="10"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup>
import { computed, watch, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { getTaxonomyKey, getTaxonFullPath as formatTaxonomy } from '@/utils/taxonomyMatcher'
import HcDataTable from '../../components/HcDataTable.vue'

const emit = defineEmits(['update:problems', 'unit-progress', 'unit-done'])
const appStore = useAppStore()

function norm(v) { return String(v ?? '').trim() }
function keyFromRow(row) {
  const sn = row?.specimenNumber || {}
  const initials = norm(sn.initials).toUpperCase()
  const number = norm(sn.number)
  const acc = norm(sn.accletter).toUpperCase()
  return `${initials}|${number}|${acc}`
}
function keyLabelFromRow(row) {
  const sn = row?.specimenNumber || {}
  return `${norm(sn.initials)}-${norm(sn.number)}${norm(sn.accletter)}`
}
function formatSpecimenRow(row) {
  const sn = row?.specimenNumber || {}
  const name = sn.name || '(unknown collector)'
  return `${name} • ${keyLabelFromRow(row)}`
}

const rows = computed(() => appStore.fieldNotesData || [])
const totalRows = computed(() => (rows.value || []).length)

const duplicateGroups = ref([])         // [{ key, label, items: [row,...] }]
const conflicts = ref([])               // [{ key, label, taxonomyVariants: [{ key, display, count }] }]
const missingRequired = ref([])         // rows
const unknownCollectors = ref([])       // rows
const problemsCount = ref(0)

function recompute() {
  duplicateGroups.value = []
  conflicts.value = []
  missingRequired.value = []
  unknownCollectors.value = []
  problemsCount.value = 0

  const mapByKey = new Map()
  const taxByKey = new Map()

  for (const row of rows.value || []) {
    const sn = row?.specimenNumber || {}
    const hasInitials = !!norm(sn.initials)
    const hasNumber = !!norm(sn.number)
    if (!hasInitials || !hasNumber) {
      missingRequired.value.push(row)
    }
    // Unknown collector: flagged by DS or missing mapping resulting in no initials
    if (row?.hasError === 'Unknown collector' || (!norm(sn.initials) && norm(sn.name))) {
      unknownCollectors.value.push(row)
    }

    const k = keyFromRow(row)
    if (!mapByKey.has(k)) mapByKey.set(k, [])
    mapByKey.get(k).push(row)

    const taxKey = row?.taxonomy ? getTaxonomyKey(row.taxonomy) : 'null'
    if (!taxByKey.has(k)) taxByKey.set(k, new Map())
    const taxMap = taxByKey.get(k)
    taxMap.set(taxKey, (taxMap.get(taxKey) || 0) + 1)
  }

  // Duplicates
  for (const [k, arr] of mapByKey.entries()) {
    if (arr.length > 1) {
      duplicateGroups.value.push({
        key: k,
        label: keyLabelFromRow(arr[0]),
        items: arr,
      })
    }
  }

  // Conflicts (same key, multiple distinct taxonomy keys)
  for (const [k, taxMap] of taxByKey.entries()) {
    const variants = [...taxMap.entries()].filter(([t]) => t !== 'null')
    if (variants.length > 1) {
      const items = variants.map(([tk, cnt]) => ({
        key: tk,
        display: formatTaxonomy(
          (rows.value.find(r => getTaxonomyKey(r?.taxonomy || null) === tk) || {}).taxonomy || null
        ),
        count: cnt
      }))
      const sampleRow = (mapByKey.get(k) || [])[0]
      conflicts.value.push({
        key: k,
        label: keyLabelFromRow(sampleRow),
        taxonomyVariants: items
      })
    }
  }

  problemsCount.value =
    duplicateGroups.value.length +
    missingRequired.value.length +
    unknownCollectors.value.length +
    conflicts.value.length

  emit('update:problems', problemsCount.value)
}

watch(rows, recompute, { deep: true, immediate: true })

async function runChecks() {
  emit('unit-progress', 'Recomputing field notes integrity...')
  // recompute runs synchronously; wrap to keep async shape
  recompute()
  emit('unit-done')
}
defineExpose({ runChecks })

// Row index helper from original fieldNotes array
function getRowIndex(row) {
  const arr = rows.value || []
  const idx = arr.indexOf(row)
  return idx >= 0 ? (idx + 1) : ''
}

// Table headers
const dupHeaders = [
  { title: 'Row', value: 'row' },
  { title: 'Key', value: 'key' },
  { title: 'Collector', value: 'collector' },
  { title: 'Initials', value: 'initials' },
  { title: 'Number', value: 'number' },
  { title: 'Accletter', value: 'accletter' },
  { title: 'Taxonomy', value: 'taxonomy' },
]
const confHeaders = [
  { title: 'Taxonomy', value: 'taxonomy' },
  { title: 'Count', value: 'count' },
]
const mrHeaders = [
  { title: 'Row', value: 'row' },
  { title: 'Collector', value: 'collector' },
  { title: 'Initials', value: 'initials' },
  { title: 'Number', value: 'number' },
  { title: 'Accletter', value: 'acccletter' }, // typo fixed below
  { title: 'Taxonomy', value: 'taxonomy' },
]
// Fix header key
mrHeaders[4].value = 'accletter'
const unkHeaders = [...mrHeaders]
</script>
