<template>
  <div>
    <v-expansion-panels multiple>
      <!-- Duplicate taxa -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: duplicateGroups.length > 0 ? '#d32f2f' : 'inherit' }">
            Duplicate taxa ({{ duplicateGroups.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Multiple checklist rows share the exact same taxonomy (Group/Family/Genus/Species/Subspecies).
          </div>
          <HcDataTable
            v-if="duplicateGroups.length"
            :headers="dupHeaders"
            :items="duplicateGroups.map(g => ({
              group: String(g.rows[0]?._t?.group ?? '').trim(),
              family: String(g.rows[0]?._t?.family ?? '').trim(),
              genus: String(g.rows[0]?._t?.genus ?? '').trim(),
              species: String(g.rows[0]?._t?.species ?? '').trim(),
              subspecies: String(g.rows[0]?._t?.subspecies ?? '').trim(),
            }))"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No duplicate taxa found.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Authority conflicts -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: authorityConflicts.length > 0 ? '#d32f2f' : 'inherit' }">
            Authority conflicts ({{ authorityConflicts.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Same taxon with different author strings. Checked at species (species_authority) and subspecies (subspecies_authority) levels.
          </div>
          <HcDataTable
            v-if="authorityConflicts.length"
            :headers="authHeaders"
            :items="authorityConflicts.map(c => ({
              level: c.level,
              taxon: c.display,
              authorities: [...c.authors].join(' | '),
              rows: c.rows.map(r => r._row).join(', ')
            }))"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No authority conflicts found.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Existing: whitespace issues -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: issues.length > 0 ? '#d32f2f' : 'inherit' }">
            Values with leading/trailing whitespace ({{ issues.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Checklist entries with unnecessary whitespace. Trailing whitespace is shown as emojis (🟨 space, ➡️ tab, ↩️ newline).
          </div>
          <HcDataTable
            v-if="issues.length"
            :headers="headers"
            :items="issues"
            :html-fields="['value']"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No whitespace found in Checklist values.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup>
/* eslint-disable no-cond-assign */
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import HcDataTable from '../../components/HcDataTable.vue'

const emit = defineEmits(['update:problems', 'unit-progress', 'unit-done'])
const appStore = useAppStore()
const checklist = computed(() => appStore.checklistData || [])

const raw = (v) => String(v ?? '')
const trim = (v) => raw(v).trim()
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}
function markTrailingWhitespace(str) {
  const s = String(str ?? '')
  const m = s.match(/\s+$/)
  if (!m) return escapeHtml(s)
  const core = s.slice(0, s.length - m[0].length)
  const tail = m[0]
  const emoji = [...tail].map(ch => (ch === ' ' ? '🟨' : ch === '\t' ? '➡️' : (ch === '\n' || ch === '\r') ? '↩️' : '◼️')).join('')
  return escapeHtml(core) + emoji
}

const issues = ref([])
const duplicateGroups = ref([])   // [{ key, display, rows: [rowObjWithRowIndex] }]
const authorityConflicts = ref([]) // [{ level: 'species'|'subspecies', key, display, authors:Set, rows:[rowObj] }]

const problemsCount = ref(0)

const headers = [
  { title: 'Row', value: 'row' },
  { title: 'Field', value: 'field' },
  { title: 'Value', value: 'value' },
  { title: 'Trimmed', value: 'trimmed' },
]

const dupHeaders = [
  { title: 'Group', value: 'group' },
  { title: 'Family', value: 'family' },
  { title: 'Genus', value: 'genus' },
  { title: 'Species', value: 'species' },
  { title: 'Subspecies', value: 'subspecies' },
]
const authHeaders = [
  { title: 'Level', value: 'level' },
  { title: 'Taxon', value: 'taxon' },
  { title: 'Authorities', value: 'authorities' },
  { title: 'Rows', value: 'rows' },
]

// Helper: attach 1-based row index for display
function mapRowsWithIndex(arr) {
  const out = []
  for (let i = 0; i < (arr || []).length; i++) {
    const rec = arr[i]
    const t = rec?.taxonomy || rec || {}
    out.push({ ...rec, _row: i + 1, _t: t })
  }
  return out
}

// New: build a full taxonomy key including genus; skip rows with all taxonomy parts empty
function fullTaxKey(t) {
  const n = (v) => String(v ?? '').trim().toLowerCase()
  const parts = [n(t.group), n(t.family), n(t.genus), n(t.species), n(t.subspecies)]
  if (parts.every(p => !p)) return '' // all-empty taxonomy — ignore
  return parts.join('|')
}

function recompute() {
  issues.value = []
  duplicateGroups.value = []
  authorityConflicts.value = []

  const rows = mapRowsWithIndex(checklist.value || [])

  // 1) Whitespace issues
  for (const r of rows) {
    const t = r._t
    const fields = [
      ['group', t.group], ['family', t.family], ['genus', t.genus],
      ['species', t.species], ['subspecies', t.subspecies],
      ['species_authority', t.species_authority ?? t.speciesAuthority],
      ['subspecies_authority', t.subspecies_authority ?? t.subspeciesAuthority],
    ]
    for (const [name, val] of fields) {
      const rv = raw(val)
      const tv = trim(val)
      if (rv && rv !== tv) {
        issues.value.push({ row: r._row, field: name, value: markTrailingWhitespace(rv), trimmed: escapeHtml(tv) })
      }
    }
  }

  // 2) Duplicate taxa (same normalized taxonomy incl. genus)
  const byTaxKey = new Map()
  for (const r of rows) {
    const t = r._t
    const key = fullTaxKey(t)
    if (!key) continue
    if (!byTaxKey.has(key)) byTaxKey.set(key, [])
    byTaxKey.get(key).push(r)
  }
  for (const [key, arr] of byTaxKey.entries()) {
    if (arr.length > 1) {
      duplicateGroups.value.push({ key, rows: arr })
    }
  }

  // 3) Authority conflicts
  // Species-level: same genus+species (subspecies empty), differing species_authority
  const speciesMap = new Map()
  const subspeciesMap = new Map()
  for (const r of rows) {
    const t = r._t
    const genus = trim(t.genus)
    const species = trim(t.species)
    const subspecies = trim(t.subspecies)
    const spAuth = trim(t.species_authority ?? t.speciesAuthority)
    const sspAuth = trim(t.subspecies_authority ?? t.subspeciesAuthority)

    if (genus && species && !subspecies) {
      const k = `${genus.toLowerCase()}|${species.toLowerCase()}`
      let rec = speciesMap.get(k)
      if (!rec) { rec = { level: 'species', display: `${genus} ${species}`, authors: new Set(), rows: [] }; speciesMap.set(k, rec) }
      if (spAuth) rec.authors.add(spAuth)
      rec.rows.push(r)
    }
    if (genus && species && subspecies) {
      const k2 = `${genus.toLowerCase()}|${species.toLowerCase()}|${subspecies.toLowerCase()}`
      let rec2 = subspeciesMap.get(k2)
      if (!rec2) { rec2 = { level: 'subspecies', display: `${genus} ${species} ${subspecies}`, authors: new Set(), rows: [] }; subspeciesMap.set(k2, rec2) }
      if (sspAuth) rec2.authors.add(sspAuth)
      rec2.rows.push(r)
    }
  }
  for (const rec of speciesMap.values()) {
    if (rec.authors.size > 1) authorityConflicts.value.push(rec)
  }
  for (const rec of subspeciesMap.values()) {
    if (rec.authors.size > 1) authorityConflicts.value.push(rec)
  }

  // Problems total: groups + conflicts + whitespace rows
  problemsCount.value = duplicateGroups.value.length + authorityConflicts.value.length + issues.value.length
  emit('update:problems', problemsCount.value)
}

watch(checklist, recompute, { deep: true, immediate: true })

async function runChecks() {
  emit('unit-progress', 'Checking checklist values...')
  recompute()
  emit('unit-done')
}
defineExpose({ runChecks })
</script>
