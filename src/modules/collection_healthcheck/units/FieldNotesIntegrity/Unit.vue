<template>
  <div>
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

      <!-- Field Notes not in checklist -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: fnNotInChecklist.length > 0 ? '#d32f2f' : 'inherit' }">
            Field Notes not in checklist ({{ fnNotInChecklist.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Rows from Field Notes that do not match any taxon (group/family/genus/species/subspecies) in the Checklist.
          </div>
          <HcDataTable
            v-if="fnNotInChecklist.length"
            :headers="fnHeaders"
            :items="fnNotInChecklist.map(r => ({
              row: getRowIndex(r),
              collector: r?.specimenNumber?.name || '',
              number: String(r?.specimenNumber?.number ?? ''),
              taxonomy: formatTaxonomy(r?.taxonomy || null),
            }))"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">All Field Notes entries match the checklist.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Field Notes: whitespace-only taxa (trim-fixable) -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: fnTrimFixable.length > 0 ? '#d32f2f' : 'inherit' }">
            Field Notes: whitespace-only taxa ({{ fnTrimFixable.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Rows that fail strict matching but would match the checklist after trimming spaces around names.
          </div>
          <HcDataTable
            v-if="fnTrimFixable.length"
            :headers="fnHeaders"
            :items="fnTrimFixable.map(r => ({
              row: getRowIndex(r),
              collector: r?.specimenNumber?.name || '',
              number: String(r?.specimenNumber?.number ?? ''),
              taxonomy: formatTaxonomy(r?.taxonomy || null),
            }))"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No whitespace-only issues in Field Notes.</div>
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
const rows = computed(() => appStore.fieldNotesData || [])
const checklist = computed(() => appStore.checklistData || [])

// New: helpers and indexes for FN vs Checklist matching
const normStr = (v) => String(v ?? '')
const lc = (v) => normStr(v).trim().toLowerCase()
const lcRaw = (v) => normStr(v).toLowerCase()

const clIdx = {
  trim: {
    groups: new Set(),
    families: new Set(),
    genera: new Set(),
    species: new Set(),
    subspecies: new Set(),
  },
  raw: {
    groups: new Set(),
    families: new Set(),
    genera: new Set(),
    species: new Set(),
    subspecies: new Set(),
  },
}

function buildChecklistIdx() {
  clIdx.trim.groups.clear(); clIdx.trim.families.clear(); clIdx.trim.genera.clear(); clIdx.trim.species.clear(); clIdx.trim.subspecies.clear()
  clIdx.raw.groups.clear(); clIdx.raw.families.clear(); clIdx.raw.genera.clear(); clIdx.raw.species.clear(); clIdx.raw.subspecies.clear()

  for (const rec of (checklist.value || [])) {
    const t = rec?.taxonomy || rec || {}
    const gRaw = normStr(t.group), fRaw = normStr(t.family), geRaw = normStr(t.genus), spRaw = normStr(t.species), sspRaw = normStr(t.subspecies)
    const g = lc(gRaw), f = lc(fRaw), ge = lc(geRaw), sp = lc(spRaw), ssp = lc(sspRaw)
    if (g) clIdx.trim.groups.add(g)
    if (f) clIdx.trim.families.add(f)
    if (ge) clIdx.trim.genera.add(ge)
    if (sp) clIdx.trim.species.add(sp)
    if (ssp) clIdx.trim.subspecies.add(ssp)
    if (gRaw) clIdx.raw.groups.add(lcRaw(gRaw))
    if (fRaw) clIdx.raw.families.add(lcRaw(fRaw))
    if (geRaw) clIdx.raw.genera.add(lcRaw(geRaw))
    if (spRaw) clIdx.raw.species.add(lcRaw(spRaw))
    if (sspRaw) clIdx.raw.subspecies.add(lcRaw(sspRaw))
  }
}

function fnMatchesChecklist(tax, mode = 'trim') {
  if (!tax) return false
  const g = mode === 'trim' ? lc(tax.group) : lcRaw(tax.group)
  const f = mode === 'trim' ? lc(tax.family) : lcRaw(tax.family)
  const ge = mode === 'trim' ? lc(tax.genus) : lcRaw(tax.genus)
  const sp = mode === 'trim' ? lc(tax.species) : lcRaw(tax.species)
  const ssp = mode === 'trim' ? lc(tax.subspecies) : lcRaw(tax.subspecies)
  const idx = clIdx[mode]
  return (ssp && idx.subspecies.has(ssp)) || (sp && idx.species.has(sp)) || (ge && idx.genera.has(ge)) || (f && idx.families.has(f)) || (g && idx.groups.has(g)) || false
}

// Existing state
const totalRows = computed(() => (rows.value || []).length)

const duplicateGroups = ref([])         // [{ key, label, items: [row,...] }]
const conflicts = ref([])               // [{ key, label, taxonomyVariants: [{ key, display, count }] }]
const missingRequired = ref([])         // rows
const unknownCollectors = ref([])       // rows
const problemsCount = ref(0)

// New state
const fnNotInChecklist = ref([])
const fnTrimFixable = ref([])

// helper to normalize string inputs used across checks
const norm = (v) => String(v ?? '').trim()

// Problems are the sum of issue panel counts
const panelTotal = computed(() =>
  duplicateGroups.value.length +
  missingRequired.value.length +
  unknownCollectors.value.length +
  conflicts.value.length +
  fnNotInChecklist.value.length +
  fnTrimFixable.value.length
)

// Keep Problems equal to panel totals and emit
watch(panelTotal, (n) => {
  problemsCount.value = n
  emit('update:problems', problemsCount.value)
}, { immediate: true })

// Extend recompute to include FN vs Checklist checks
function recompute() {
  duplicateGroups.value = []
  conflicts.value = []
  missingRequired.value = []
  unknownCollectors.value = []
  fnNotInChecklist.value = []
  fnTrimFixable.value = []
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

  // Build checklist indexes and compute FN vs Checklist
  buildChecklistIdx()
  for (const row of (rows.value || [])) {
    const tax = row?.taxonomy || {}
    const matchTrim = fnMatchesChecklist(tax, 'trim')
    const matchRaw = fnMatchesChecklist(tax, 'raw')
    if (!matchTrim) fnNotInChecklist.value.push(row)
    else if (!matchRaw) fnTrimFixable.value.push(row)
  }

  // problemsCount.value = panelTotal.value // handled by watcher
  emit('update:problems', panelTotal.value)
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

// New helpers for FN key building (INITIALS|NUMBER|ACCLETTER) and display label
function keyFromRow(row) {
  const sn = row?.specimenNumber || {}
  const i = norm(sn.initials).toUpperCase()
  const n = norm(sn.number)
  const a = norm(sn.accletter).toUpperCase()
  return `${i}|${n}|${a}`
}
function keyLabelFromRow(row) {
  const sn = row?.specimenNumber || {}
  return `${norm(sn.initials)}-${norm(sn.number)}${norm(sn.accletter)}`
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

// New headers for FN tables
const fnHeaders = [
  { title: 'Row', value: 'row' },
  { title: 'Collector', value: 'collector' },
  { title: 'Collection #', value: 'number' },
  { title: 'Taxonomy', value: 'taxonomy' },
]
</script>
