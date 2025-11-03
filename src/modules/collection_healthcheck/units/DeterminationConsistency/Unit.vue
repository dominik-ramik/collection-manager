<template>
  <div>
    <v-expansion-panels multiple>
      <!-- Symbiota: unknown scientific names (no match in checklist) -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: symUnknown.length > 0 ? '#d32f2f' : 'inherit' }">
            Symbiota: unknown scientific names ({{ symUnknown.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Occurrence records whose scientific name does not match any checklist entry.
          </div>
          <HcDataTable
            v-if="symUnknown.length"
            :headers="symUnknownHeaders"
            :items="symUnknown"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No unknown names in Symbiota data.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Symbiota: author mismatches -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: symAuthorIssues.length > 0 ? '#d32f2f' : 'inherit' }">
            Symbiota: author mismatches ({{ symAuthorIssues.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Species/subspecies with mismatching scientific name authorship against the checklist.
          </div>
          <HcDataTable
            v-if="symAuthorIssues.length"
            :headers="symAuthorHeaders"
            :items="symAuthorIssues"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No author mismatches.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Symbiota: family mismatches -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: symFamilyIssues.length > 0 ? '#d32f2f' : 'inherit' }">
            Symbiota: family mismatches ({{ symFamilyIssues.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Genus/species/subspecies with family mismatching the checklist.
          </div>
          <HcDataTable
            v-if="symFamilyIssues.length"
            :headers="symFamilyHeaders"
            :items="symFamilyIssues"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No family mismatches.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Symbiota: whitespace-only fixable differences (name) -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: symNameTrimFixableItems.length > 0 ? '#d32f2f' : 'inherit' }">
            Symbiota: name trim-fixable ({{ symNameTrimFixableItems.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Names that match the checklist after trimming whitespace.
          </div>
          <HcDataTable
            v-if="symNameTrimFixableItemsDecorated.length"
            :headers="symNameTrimHeaders"
            :items="symNameTrimFixableItemsDecorated"
            :html-fields="['sciname']"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No trim-fixable name issues.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Symbiota: whitespace-only fixable differences (author) -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: symAuthorTrimFixableItems.length > 0 ? '#d32f2f' : 'inherit' }">
            Symbiota: author trim-fixable ({{ symAuthorTrimFixableItems.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Authors that match after trimming whitespace.
          </div>
          <HcDataTable
            v-if="symAuthorTrimFixableItemsDecorated.length"
            :headers="symAuthorTrimHeaders"
            :items="symAuthorTrimFixableItemsDecorated"
            :html-fields="['scientificNameAuthorship']"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No trim-fixable author issues.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Symbiota: whitespace-only fixable differences (family) -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: symFamilyTrimFixableItems.length > 0 ? '#d32f2f' : 'inherit' }">
            Symbiota: family trim-fixable ({{ symFamilyTrimFixableItems.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Families that match after trimming whitespace.
          </div>
          <HcDataTable
            v-if="symFamilyTrimFixableItemsDecorated.length"
            :headers="symFamilyTrimHeaders"
            :items="symFamilyTrimFixableItemsDecorated"
            :html-fields="['family']"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No trim-fixable family issues.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup>
import { computed, ref, watch, reactive, toRef } from 'vue'
import { useAppStore } from '@/stores/app'
import HcDataTable from '../../components/HcDataTable.vue'
import MatchingRecordsTable from '@/data_sources/symbiota/MatchingRecordsTable.vue'

// Emit events for parent component (moved up so watchers can use it)
const emit = defineEmits(['update:problems', 'unit-progress', 'unit-done'])

// Data sources
const appStore = useAppStore()
const checklist = computed(() => appStore.checklistData || [])
const fieldNotes = computed(() => appStore.fieldNotesData || [])
const symbiota = computed(() => appStore.symbiotaCollectionData || [])

// Helpers: normalize values
const raw = (v) => String(v ?? '')
const trim = (v) => raw(v).trim()
const lc = (v) => trim(v).toLowerCase()
const lcRaw = (v) => raw(v).toLowerCase()

// Indices for checklist (trimmed and raw)
const idx = reactive({
  trim: {
    groups: new Set(),
    families: new Set(),
    genusMeta: new Map(),     // name -> { familyTrim, familyRaw }
    speciesMeta: new Map(),   // name -> { familyTrim, authorTrim, familyRaw, authorRaw }
    subspeciesMeta: new Map() // name -> { familyTrim, authorTrim, familyRaw, authorRaw }
  },
  raw: {
    groups: new Set(),
    families: new Set(),
    genera: new Set(),
    species: new Set(),
    subspecies: new Set(),
  },
})

// All issues grouped in one place to avoid many refs
const issues = reactive({
  symUnknown: [],
  symUnknownItems: [],
  symAuthorIssues: [],
  symAuthorIssueItems: [],
  symFamilyIssues: [],
  symFamilyIssueItems: [],
  symNameTrimFixableItems: [],
  symAuthorTrimFixableItems: [],
  symFamilyTrimFixableItems: [],
})

// Expose refs used in the template
const symUnknown = toRef(issues, 'symUnknown')
const symUnknownItems = toRef(issues, 'symUnknownItems')
const symAuthorIssues = toRef(issues, 'symAuthorIssues')
const symAuthorIssueItems = toRef(issues, 'symAuthorIssueItems')
const symFamilyIssues = toRef(issues, 'symFamilyIssues')
const symFamilyIssueItems = toRef(issues, 'symFamilyIssueItems')
const symNameTrimFixableItems = toRef(issues, 'symNameTrimFixableItems')
const symAuthorTrimFixableItems = toRef(issues, 'symAuthorTrimFixableItems')
const symFamilyTrimFixableItems = toRef(issues, 'symFamilyTrimFixableItems')

// Problems counter derived strictly from panel counts
const problemsCount = ref(0)
const panelTotal = computed(() =>
  (issues.symUnknown?.length || 0) +
  (issues.symAuthorIssues?.length || 0) +
  (issues.symFamilyIssues?.length || 0) +
  (issues.symNameTrimFixableItems?.length || 0) +
  (issues.symAuthorTrimFixableItems?.length || 0) +
  (issues.symFamilyTrimFixableItems?.length || 0)
)
watch(panelTotal, (n) => {
  problemsCount.value = n
  emit('update:problems', problemsCount.value)
}, { immediate: true })

// Build checklist indices (trimmed + raw) and collect whitespace issues
function buildChecklistIndexes() {
  // Reset
  idx.trim.groups.clear(); idx.trim.families.clear()
  idx.trim.genusMeta.clear(); idx.trim.speciesMeta.clear(); idx.trim.subspeciesMeta.clear()
  idx.raw.groups.clear(); idx.raw.families.clear(); idx.raw.genera.clear(); idx.raw.species.clear(); idx.raw.subspecies.clear()

  const rows = checklist.value || []
  for (let i = 0; i < rows.length; i++) {
    const t = rows[i]?.taxonomy || rows[i] || {}
    const fields = [
      ['group', t.group],
      ['family', t.family],
      ['genus', t.genus],
      ['species', t.species],
      ['subspecies', t.subspecies],
      ['species_authority', t.species_authority ?? t.speciesAuthority],
      ['subspecies_authority', t.subspecies_authority ?? t.subspeciesAuthority],
    ]

    const grpRaw = raw(t.group), famRaw = raw(t.family), genRaw = raw(t.genus)
    const spRaw = raw(t.species), sspRaw = raw(t.subspecies)
    const spAuthRaw = raw(t.species_authority ?? t.speciesAuthority)
    const sspAuthRaw = raw(t.subspecies_authority ?? t.subspeciesAuthority)

    const grpTrim = trim(grpRaw), famTrim = trim(famRaw), genTrim = trim(genRaw)
    const spTrim = trim(spRaw), sspTrim = trim(sspRaw)

    if (grpTrim) idx.trim.groups.add(lc(grpTrim))
    if (famTrim) idx.trim.families.add(lc(famTrim))
    if (genTrim) idx.trim.genusMeta.set(lc(genTrim), { familyTrim: lc(famTrim), familyRaw: famRaw })
    if (spTrim) idx.trim.speciesMeta.set(lc(spTrim), {
      familyTrim: lc(famTrim), authorTrim: lc(trim(spAuthRaw)), familyRaw: famRaw, authorRaw: spAuthRaw
    })
    if (sspTrim) idx.trim.subspeciesMeta.set(lc(sspTrim), {
      familyTrim: lc(famTrim), authorTrim: lc(trim(sspAuthRaw)), familyRaw: famRaw, authorRaw: sspAuthRaw
    })

    if (grpRaw) idx.raw.groups.add(lcRaw(grpRaw))
    if (famRaw) idx.raw.families.add(lcRaw(famRaw))
    if (genRaw) idx.raw.genera.add(lcRaw(genRaw))
    if (spRaw) idx.raw.species.add(lcRaw(spRaw))
    if (sspRaw) idx.raw.subspecies.add(lcRaw(sspRaw))
  }
}

// Symbiota matching against checklist
function symMatch(sciname, mode = 'trim') {
  const nm = mode === 'trim' ? lc(sciname) : lcRaw(sciname)
  if (!nm) return null
  if (mode === 'trim') {
    if (idx.trim.subspeciesMeta.has(nm)) {
      const m = idx.trim.subspeciesMeta.get(nm)
      return { level: 'subspecies', familyTrim: m.familyTrim, familyRaw: m.familyRaw, expectedAuthorTrim: m.authorTrim, authorRaw: m.authorRaw }
    }
    if (idx.trim.speciesMeta.has(nm)) {
      const m = idx.trim.speciesMeta.get(nm)
      return { level: 'species', familyTrim: m.familyTrim, familyRaw: m.familyRaw, expectedAuthorTrim: m.authorTrim, authorRaw: m.authorRaw }
    }
    if (idx.trim.genusMeta.has(nm)) {
      const m = idx.trim.genusMeta.get(nm)
      return { level: 'genus', familyTrim: m.familyTrim, familyRaw: m.familyRaw, expectedAuthorTrim: '' }
    }
    if (idx.trim.families.has(nm)) return { level: 'family', familyTrim: nm, familyRaw: '', expectedAuthorTrim: '' }
    if (idx.trim.groups.has(nm)) return { level: 'group', familyTrim: '', familyRaw: '', expectedAuthorTrim: '' }
    return null
  } else {
    if (idx.raw.subspecies.has(nm)) return { level: 'subspecies' }
    if (idx.raw.species.has(nm)) return { level: 'species' }
    if (idx.raw.genera.has(nm)) return { level: 'genus' }
    if (idx.raw.families.has(nm)) return { level: 'family' }
    if (idx.raw.groups.has(nm)) return { level: 'group' }
    return null
  }
}

// Whitespace visualization helpers
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
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

// New: treat "Indet." (with optional trailing dot) as legitimate no-ID
function isIndeterminateName(s) {
  const v = String(s ?? '')
  return v === 'Indet.'
}

// Decorators for whitespace-only fixable items in Symbiota
const symAuthorTrimFixableItemsDecorated = computed(() =>
  (issues.symAuthorTrimFixableItems || []).map(it => ({ ...it, scientificNameAuthorship: markTrailingWhitespace(it?.scientificNameAuthorship || '') }))
)
const symNameTrimFixableItemsDecorated = computed(() =>
  (issues.symNameTrimFixableItems || []).map(it => ({ ...it, sciname: markTrailingWhitespace(it?.sciname || '') }))
)
const symFamilyTrimFixableItemsDecorated = computed(() =>
  (issues.symFamilyTrimFixableItems || []).map(it => ({ ...it, family: markTrailingWhitespace(it?.family || '') }))
)

// Main recompute
function recompute() {
  // Reset issues
  for (const k of Object.keys(issues)) issues[k] = []
  problemsCount.value = 0

  buildChecklistIndexes()

  // Symbiota checks
  for (const it of (symbiota.value || [])) {
    const sciname = it?.sciname || ''
    const author = raw(it?.scientificNameAuthorship)
    const fam = raw(it?.family)
    const occid = it?.occurrenceID || it?.occid || ''

    // Skip legitimate indeterminate identifications
    if (isIndeterminateName(sciname)) {
      continue
    }

    const matchT = symMatch(sciname, 'trim')
    const matchR = symMatch(sciname, 'raw')

    if (!matchT) {
      issues.symUnknown.push({ occurrenceID: occid, sciname: sciname || '(missing)', family: trim(fam), author: trim(author) })
      issues.symUnknownItems.push(it)
      continue
    }
    if (!matchR) issues.symNameTrimFixableItems.push(it)

    // Author rule: ONLY for species/subspecies
    if (matchT.level === 'species' || matchT.level === 'subspecies') {
      const expAuthorRaw = matchT.authorRaw || ''
      const okTrim = lc(author) === lc(expAuthorRaw)
      const okRaw = lcRaw(author) === lcRaw(expAuthorRaw)
      if (!okTrim) {
        issues.symAuthorIssues.push({ occurrenceID: occid, sciname, level: matchT.level, expectedAuthor: expAuthorRaw, gotAuthor: author })
        issues.symAuthorIssueItems.push(it)
      } else if (!okRaw) {
        issues.symAuthorTrimFixableItems.push(it)
      }
    }

    // Family rule (for genus/species/subspecies)
    if (matchT.level === 'genus' || matchT.level === 'species' || matchT.level === 'subspecies') {
      const expFamilyRaw = matchT.familyRaw || ''
      const okTrim = lc(fam) === lc(expFamilyRaw)
      const okRaw = lcRaw(fam) === lcRaw(expFamilyRaw)
      if (!okTrim) {
        issues.symFamilyIssues.push({ occurrenceID: occid, sciname, level: matchT.level, expectedFamily: expFamilyRaw, gotFamily: fam })
        issues.symFamilyIssueItems.push(it)
      } else if (!okRaw) {
        issues.symFamilyTrimFixableItems.push(it)
      }
    }
  }

  emit('update:problems', panelTotal.value)
}

// React to DS changes
watch(
  () => [checklist.value, fieldNotes.value, symbiota.value],
  () => recompute(),
  { deep: true, immediate: true }
)

// Run from global button
async function runChecks() {
  emit('unit-progress', 'Checking determination consistency...')
  recompute()
  emit('unit-done')
}
defineExpose({ runChecks })

// Table headers for Symbiota panels
const symUnknownHeaders = [
  { title: 'Occurrence ID', value: 'occurrenceID' },
  { title: 'Name', value: 'sciname' },
  { title: 'Family', value: 'family' },
  { title: 'Author', value: 'author' },
]
const symAuthorHeaders = [
  { title: 'Occurrence ID', value: 'occurrenceID' },
  { title: 'Name', value: 'sciname' },
  { title: 'Level', value: 'level' },
  { title: 'Expected author', value: 'expectedAuthor' },
  { title: 'Got author', value: 'gotAuthor' },
]
const symFamilyHeaders = [
  { title: 'Occurrence ID', value: 'occurrenceID' },
  { title: 'Name', value: 'sciname' },
  { title: 'Level', value: 'level' },
  { title: 'Expected family', value: 'expectedFamily' },
  { title: 'Got family', value: 'gotFamily' },
]
const symNameTrimHeaders = [
  { title: 'Occurrence ID', value: 'occid' }, // may be missing; show whatever field is available
  { title: 'Name (untrimmed)', value: 'sciname' },
]
const symAuthorTrimHeaders = [
  { title: 'Occurrence ID', value: 'occid' },
  { title: 'Author (untrimmed)', value: 'scientificNameAuthorship' },
]
const symFamilyTrimHeaders = [
  { title: 'Occurrence ID', value: 'occid' },
  { title: 'Family (untrimmed)', value: 'family' },
]
</script>

<style scoped>
/* highlight whitespace characters inside the checklist whitespace report */
.ws {
  background-color: #ffebee;           /* light red background */
  outline: 1px solid #e57373;          /* red outline to emphasize */
}
</style>
