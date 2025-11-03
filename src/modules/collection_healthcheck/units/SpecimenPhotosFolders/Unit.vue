<template>
  <div>
    <v-alert
      :type="problemsCount > 0 ? 'warning' : 'success'"
      variant="tonal"
      class="mb-4"
    >
      <div class="d-flex align-center flex-wrap" style="gap: 12px;">
        <div>
          <strong>Found</strong> {{ foundSpecimenFolders }} / {{ totalFieldNotes }} specimen folders
        </div>
        <v-divider vertical />
        <div>
          <strong>Problems</strong> {{ problemsCount }}
          <span style="color:#666;">
            (Missing: {{ missingSpecimens.length }}, Extra: {{ extraFolders.length }}, Duplicates: {{ duplicatesExtraCount }}, Invalid FN: {{ invalidFieldNotes.length }}
            <template v-if="nearAccletterCount + fnDupConflicts.length + fileIssueTotals + invalidAuthorCount > 0">
              , Near accletter: {{ nearAccletterCount }}, FN dup conflicts: {{ fnDupConflicts.length }}, Invalid authors: {{ invalidAuthorCount }}, File issues: {{ fileIssueTotals }}
            </template>
            )
          </span>
        </div>
        <v-divider vertical />
        <div>
          <strong>Unmatched folders</strong> {{ unmatchedFolders.length }} <span style="color:#666;">(info)</span>
        </div>
        <div style="flex:1"></div>
        <!-- Removed local Re-run button; global Run health checks handles this -->
      </div>
    </v-alert>

    <v-expansion-panels multiple>
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: missingSpecimens.length > 0 ? '#d32f2f' : 'inherit' }">
            Missing specimen folders ({{ missingSpecimens.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Field Notes entries (with initials and number) that have no corresponding matched folder.
          </div>
          <div v-if="missingSpecimens.length === 0" class="text-medium-emphasis">
            All valid Field Notes entries have matching specimen folders.
          </div>
          <HcDataTable
            v-else
            :headers="missHeaders"
            :items="missingSpecimens.map(r => ({
              row: getRowIndex(r),
              key: formatSpecimenKey(r),
              collector: r?.specimenNumber?.name || '(unknown collector)',
              taxonomy: (r?.taxonomy ? (r?.taxonomy.subspecies || r?.taxonomy.species || r?.taxonomy.family || r?.taxonomy.group) : '') || '',
            }))"
            :items-per-page="10"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: extraFolders.length > 0 ? '#d32f2f' : 'inherit' }">
            Extra folders without specimen ({{ extraFolders.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Matched folders (with images) that do not correspond to any valid Field Notes specimen.
          </div>
          <div v-if="extraFolders.length === 0" class="text-medium-emphasis">
            No extra specimen folders were found.
          </div>
          <HcDataTable
            v-else
            :headers="extraHeaders"
            :items="extraFolders.map(f => ({
              label: `${f.specimenMeta.initials}-${f.specimenMeta.number}${f.specimenMeta.accletter || ''}`,
              path: f.fullPath || f.folderName,
              parent: parentDir(f.fullPath || ''),
            }))"
            :items-per-page="10"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: duplicatesList.length > 0 ? '#d32f2f' : 'inherit' }">
            Duplicated specimen folders ({{ duplicatesExtraCount }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Multiple folders detected for the same specimen key (INITIALS|NUMBER|ACCLETTER).
          </div>
          <div v-if="duplicatesList.length === 0" class="text-medium-emphasis">No duplicated specimen folders detected.</div>
          <div v-else>
            <div
              v-for="(group, gIdx) in duplicatesList"
              :key="`dup-group-${gIdx}`"
              class="mb-3"
            >
              <div class="mb-1" style="font-weight:600;">
                {{ group.label }} — {{ group.items.length }} folders ({{ Math.max(0, group.items.length - 1) }} extra)
              </div>
              <HcDataTable
                :headers="dupFolderHeaders"
                :items="group.items.map(f => ({
                  path: f.fullPath || f.folderName,
                  parent: parentDir(f.fullPath || ''),
                }))"
                :items-per-page="10"
              />
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: invalidFieldNotes.length > 0 ? '#d32f2f' : 'inherit' }">
            Invalid Field Notes entries ({{ invalidFieldNotes.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Field Notes rows with Collector name for which we don't have initials and/or number. These cannot be matched to folders.
          </div>
          <div v-if="invalidFieldNotes.length === 0" class="text-medium-emphasis">No invalid Field Notes entries found.</div>
          <HcDataTable
            v-else
            :headers="invalidHeaders"
            :items="invalidFieldNotes.map(r => ({
              row: getRowIndex(r),
              collector: r?.specimenNumber?.name || '(unknown collector)',
              number: r?.specimenNumber?.number ?? '-',
              accletter: r?.specimenNumber?.accletter ?? '-',
              initials: r?.specimenNumber?.initials ?? '-',
            }))"
            :items-per-page="10"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <!-- info-only -->
          <span>Unmatched folders ({{ unmatchedFolders.length }}) — info</span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Non-matching folder names (could be malformed specimen folders that need a fix).
          </div>
          <HcDataTable
            :headers="unmatchedHeaders"
            :items="(unmatchedFolders || []).map(f => ({
              path: f.fullPath || f.folderName,
              name: f.folderName,
            }))"
            :items-per-page="10"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- info-only -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span>Matched folders without images ({{ matchedNoImages.length }}) — info</span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">Folders match the naming pattern but contain no images.</div>
          <HcDataTable
            :headers="noImgHeaders"
            :items="matchedNoImages.map(f => ({
              path: f.fullPath || f.folderName,
              specimen: `${f.specimenMeta?.initials || ''}-${f.specimenMeta?.number || ''}${f.specimenMeta?.accletter || ''}`,
            }))"
            :items-per-page="10"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Folder author codes: now a check -->
      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: invalidAuthorCount > 0 ? '#d32f2f' : 'inherit' }">
            Folder author codes ({{ invalidAuthorCount }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Checks for unknown specimen photo author codes.
          </div>
          <div class="mb-2" v-if="invalidAuthorCount > 0">
            <strong>Invalid author codes ({{ invalidAuthorCount }})</strong>
            <HcDataTable
              :headers="invalidAuthorHeaders"
              :items="invalidAuthorRecords"
              :items-per-page="10"
            />
          </div>
          <div v-else class="text-medium-emphasis">All folder author codes are valid.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: nearAccletterCount > 0 ? '#d32f2f' : 'inherit' }">
            Near matches by accletter ({{ nearAccletterCount }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Potential matches where only the accletter differs or is missing on one side.
          </div>
          <HcDataTable
            v-if="nearAccletter_fnHas_onlyFolderNone.length"
            :headers="nearHeaders"
            :items="nearAccletter_fnHas_onlyFolderNone"
            :items-per-page="10"
          />
          <HcDataTable
            v-if="nearAccletter_fnNone_onlyFolderHas.length"
            :headers="nearHeaders"
            :items="nearAccletter_fnNone_onlyFolderHas"
            :items-per-page="10"
          />
          <HcDataTable
            v-if="nearAccletter_otherDiff.length"
            :headers="nearHeaders"
            :items="nearAccletter_otherDiff"
            :items-per-page="10"
          />
          <div v-if="nearAccletterCount === 0" class="text-medium-emphasis">No near matches by accletter.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: fnDupConflicts.length > 0 ? '#d32f2f' : 'inherit' }">
            Folders with multiple matching FN entries ({{ fnDupConflicts.length }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Conflicts where one folder corresponds to multiple Field Notes entries (duplicate FN keys).
          </div>
          <HcDataTable
            v-if="fnDupConflicts.length"
            :headers="conflictHeaders"
            :items="fnDupConflicts.map(c => ({
              label: c.label,
              fnCount: c.fnCount,
              paths: (c.paths || []).join('\n'),
            }))"
            :items-per-page="10"
          />
          <div v-else class="text-medium-emphasis">No conflicts found.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel>
        <v-expansion-panel-title>
          <span :style="{ color: fileIssueTotals > 0 ? '#d32f2f' : 'inherit' }">
            File-level checks ({{ fileIssueTotals }})
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="text-medium-emphasis mb-2">
            Last scan: <span v-if="lastScanTs">{{ new Date(lastScanTs).toLocaleString() }}</span><span v-else>never</span>
          </div>
          <div class="mb-2" v-if="orphanEdits.length">
            <strong>Orphan edit files ({{ orphanEdits.length }})</strong>
            <HcDataTable :headers="fileHeaders" :items="orphanEdits" :items-per-page="10" />
          </div>
          <div class="mb-2" v-if="editedNotSelected.length">
            <strong>Edited files not selected “s” ({{ editedNotSelected.length }})</strong>
            <HcDataTable :headers="fileHeaders" :items="editedNotSelected" :items-per-page="10" />
          </div>
          <div class="mb-2" v-if="taxonWithoutSpecimen.length">
            <strong>“t” tagged without “s” on same base ({{ taxonWithoutSpecimen.length }})</strong>
            <HcDataTable :headers="fileHeaders" :items="taxonWithoutSpecimen" :items-per-page="10" />
          </div>
          <div class="mb-2" v-if="baseCollisions.length">
            <strong>Base filename collisions ({{ baseCollisions.length }})</strong>
            <HcDataTable
              :headers="collisionHeaders"
              :items="baseCollisions.map(r => ({ base: r.base, folder: r.folder, files: (r.files || []).join('\n') }))"
              :items-per-page="10"
            />
          </div>
          <div v-if="fileIssueTotals === 0" class="text-medium-emphasis">No file-level issues found in last scan.</div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup>
import { computed, watch, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { parseFilename, hasTag } from '@/utils/tagging'
import dsSettings from '@/data_sources/specimens_photos_folder/settings.json'
import HcDataTable from '../../components/HcDataTable.vue'
import { collectorShortNames } from '@/data_sources/field_notes/index.js'

const emit = defineEmits(['update:problems', 'unit-progress', 'unit-done'])
const appStore = useAppStore()

function norm(v) { return String(v ?? '').trim() }
function keyFromMeta(initials, number, accletter) {
  const i = norm(initials).toUpperCase()
  const n = norm(number)
  const a = norm(accletter).toUpperCase()
  return `${i}|${n}|${a}`
}
function keyLabel(initials, number, accletter) {
  return `${norm(initials)}-${norm(number)}${norm(accletter)}`
}
function pairKey(initials, number) {
  return `${norm(initials).toUpperCase()}|${norm(number)}`
}
function parentDir(fullPath = '') {
  if (!fullPath || typeof fullPath !== 'string') return ''
  const idx = fullPath.lastIndexOf('/')
  return idx > -1 ? fullPath.slice(0, idx) : ''
}

// Data accessors
const fieldNotes = computed(() => appStore.fieldNotesData || [])
const foldersResult = computed(() => appStore.specimensPhotosFolderResult || { matching: [], nonmatching: [], matchingAll: [] })
const matchedFolders = computed(() => foldersResult.value?.matching || [])
const matchedAllFolders = computed(() => foldersResult.value?.matchingAll || [])
const nonmatchingFolders = computed(() => foldersResult.value?.nonmatching || [])

// Derived structures (existing)
const invalidFieldNotes = ref([])
const validFieldNotes = ref([])
const missingSpecimens = ref([])
const extraFolders = ref([])
const duplicatesList = ref([]) // [{ label, items: [folder,...] }]
const duplicatesExtraCount = ref(0)
const foundSpecimenFolders = ref(0)
const totalFieldNotes = ref(0)
const unmatchedFolders = computed(() => nonmatchingFolders.value || [])

// New: derive allowed author codes from collectorShortNames (lowercased)
const allowedAuthorSet = computed(() => {
  try {
    const vals = Object.values(collectorShortNames || {})
    return new Set(vals.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean))
  } catch {
    return new Set()
  }
})

// New derived
const matchedNoImages = computed(() =>
  (matchedAllFolders.value || []).filter(f => f && f.hasImages === false)
)
const authorCodes = computed(() => {
  const map = new Map()
  for (const f of matchedAllFolders.value || []) {
    const code = String(f?.specimenMeta?.author ?? '').trim().toLowerCase()
    if (!code) continue
    map.set(code, (map.get(code) || 0) + 1)
  }
  return map
})

// New: invalid folders by author code (missing or not in allowed set)
const invalidAuthorRecords = computed(() => {
  const out = []
  for (const f of matchedAllFolders.value || []) {
    const path = f?.fullPath || f?.folderName || ''
    const code = String(f?.specimenMeta?.author ?? '').trim().toLowerCase()
    if (!code || !allowedAuthorSet.value.has(code)) {
      out.push({ path, author: code || '(missing)' })
    }
  }
  // De-duplicate by path
  const seen = new Set()
  return out.filter(r => (seen.has(r.path) ? false : (seen.add(r.path), true)))
})
const invalidAuthorCount = computed(() => invalidAuthorRecords.value.length)

// Near matches and conflicts
const nearAccletter_fnHas_onlyFolderNone = ref([])
const nearAccletter_fnNone_onlyFolderHas = ref([])
const nearAccletter_otherDiff = ref([])
const fnDupConflicts = ref([])

const problemsCount = ref(0)
const nearAccletterCount = computed(() =>
  nearAccletter_fnHas_onlyFolderNone.value.length +
  nearAccletter_fnNone_onlyFolderHas.value.length +
  nearAccletter_otherDiff.value.length
)

// File-level checks
const orphanEdits = ref([])
const editedNotSelected = ref([])
const taxonWithoutSpecimen = ref([])
const baseCollisions = ref([])
const lastScanTs = ref(0)
const rescanning = ref(false)
const scanningFiles = ref(false)
const fileIssueTotals = computed(() =>
  orphanEdits.value.length +
  editedNotSelected.value.length +
  taxonWithoutSpecimen.value.length +
  baseCollisions.value.length
)

function formatSpecimenKey(row) {
  const sn = row?.specimenNumber || {}
  return keyLabel(sn.initials || '', sn.number || '', sn.accletter || '')
}
function formatSpecimenSubtitle(row) {
  const sn = row?.specimenNumber || {}
  const tax = row?.taxonomy || {}
  const name = sn.name ? `Collector: ${sn.name}` : 'Collector: (unknown)'
  const taxStr = tax.subspecies || tax.species || tax.family || tax.group || '(unknown taxon)'
  return `${name} • ${taxStr}`
}

function recompute() {
  // Reset existing
  invalidFieldNotes.value = []
  validFieldNotes.value = []
  missingSpecimens.value = []
  extraFolders.value = []
  duplicatesList.value = []
  duplicatesExtraCount.value = 0
  foundSpecimenFolders.value = 0
  totalFieldNotes.value = 0

  // Reset near/conflicts
  nearAccletter_fnHas_onlyFolderNone.value = []
  nearAccletter_fnNone_onlyFolderHas.value = []
  nearAccletter_otherDiff.value = []
  fnDupConflicts.value = []

  const fn = fieldNotes.value || []
  const mf = (matchedFolders.value || []).filter(f => f?.specimenMeta)
  const mfAll = (matchedAllFolders.value || []).filter(f => f?.specimenMeta)

  // Index folders by key and by pair (initials|number)
  const foldersByKey = new Map()
  const foldersByPair = new Map() // pair -> { accletters:Set, byAcc: Map(accletter -> [folders]) }
  for (const f of mfAll) {
    const sm = f.specimenMeta || {}

    // Skip if key parts are missing
    const initialsNorm = norm(sm.initials)
    const numberNorm = norm(sm.number)
    if (!initialsNorm || !numberNorm) continue

    const k = keyFromMeta(sm.initials, sm.number, sm.accletter)
    if (!foldersByKey.has(k)) foldersByKey.set(k, [])
    foldersByKey.get(k).push(f)

    const pk = pairKey(sm.initials, sm.number)
    const acc = norm(sm.accletter)

    // Defensive: ensure accumulator is well-formed
    let rec = foldersByPair.get(pk)
    if (!rec || !(rec.acletters instanceof Set) || !(rec.byAcc instanceof Map)) {
      rec = { accletters: new Set(), byAcc: new Map() }
      foldersByPair.set(pk, rec)
    }
    if (!(rec.acletters instanceof Set)) rec.acletters = new Set()
    if (!(rec.byAcc instanceof Map)) rec.byAcc = new Map()

    rec.acletters.add(acc)
    if (!rec.byAcc.has(acc)) rec.byAcc.set(acc, [])
    rec.byAcc.get(acc).push(f)
  }

  // Duplicates
  const dupGroups = []
  let dupExtra = 0
  for (const [k, arr] of foldersByKey.entries()) {
    if (arr.length > 1) {
      dupGroups.push({
        key: k,
        label: keyLabel(arr[0]?.specimenMeta?.initials, arr[0]?.specimenMeta?.number, arr[0]?.specimenMeta?.accletter),
        items: arr,
      })
      dupExtra += Math.max(0, arr.length - 1)
    }
  }
  duplicatesList.value = dupGroups
  duplicatesExtraCount.value = dupExtra

  // FN split and counts per key
  const fnKeyCounts = new Map()
  const validKeys = new Set()
  const allValidKeys = new Set()
  for (const row of fn) {
    const sn = row?.specimenNumber || {}
    const hasInitials = !!norm(sn.initials)
    const hasNumber = !!norm(sn.number)
    if (!hasInitials || !hasNumber) {
      invalidFieldNotes.value.push(row)
      continue
    }
    validFieldNotes.value.push(row)
    const k = keyFromMeta(sn.initials, sn.number, sn.accletter)
    allValidKeys.add(k)
    fnKeyCounts.set(k, (fnKeyCounts.get(k) || 0) + 1)
    if (foldersByKey.has(k)) {
      validKeys.add(k)
      foundSpecimenFolders.value += 1
    } else {
      missingSpecimens.value.push(row)
    }
  }

  // Denominator: only valid FN entries (not valid + invalid)
  totalFieldNotes.value = validFieldNotes.value.length

  // Extra folders: keys present in folders that are not present in valid FN keys
  const extras = []
  for (const [k, arr] of foldersByKey.entries()) {
    if (!allValidKeys.has(k)) {
      extras.push(...arr.filter(f => f.hasImages)) // show only image folders here
    }
  }
  extraFolders.value = extras

  // Near matches by accletter
  for (const row of missingSpecimens.value) {
    const sn = row?.specimenNumber || {}
    const acc = norm(sn.accletter)
    const pk = pairKey(sn.initials, sn.number)
    const rec = foldersByPair.get(pk)
    if (!rec) continue
    const set = rec.acletters
    // FN has accletter, folder none only
    if (acc && set.size === 1 && set.has('')) {
      const f = rec.byAcc.get('')[0]
      nearAccletter_fnHas_onlyFolderNone.value.push({
        label: `${keyLabel(sn.initials, sn.number, sn.accletter)} → ${keyLabel(f.specimenMeta.initials, f.specimenMeta.number, f.specimenMeta.accletter)}`,
        folderPath: f.fullPath || f.folderName
      })
      continue
    }
    // FN none, folder has accletter(s) only
    if (!acc && set.size >= 1 && !set.has('')) {
      const f = rec.byAcc.values().next().value?.[0]
      nearAccletter_fnNone_onlyFolderHas.value.push({
        label: `${keyLabel(sn.initials, sn.number, '')} → ${keyLabel(f.specimenMeta.initials, f.specimenMeta.number, f.specimenMeta.accletter)}`,
        folderPath: f.fullPath || f.folderName
      })
      continue
    }
    // Other differing accletters (both sides have acc, but not matching)
    if (acc && set.has(acc) === false && set.size > 0) {
      const f = rec.byAcc.values().next().value?.[0]
      nearAccletter_otherDiff.value.push({
        label: `${keyLabel(sn.initials, sn.number, sn.accletter)} ≠ {${[...set].filter(Boolean).join(', ')}}`,
        folderPath: f?.fullPath || f?.folderName || ''
      })
    }
  }

  // FN duplicates vs folders (conflicts)
  for (const [k, cnt] of fnKeyCounts.entries()) {
    if (cnt > 1 && foldersByKey.has(k)) {
      const arr = foldersByKey.get(k)
      const sm = arr[0]?.specimenMeta || {}
      fnDupConflicts.value.push({
        key: k,
        fnCount: cnt,
        label: keyLabel(sm.initials, sm.number, sm.accletter),
        paths: arr.map(x => x.fullPath || x.folderName)
      })
    }
  }

  // Problems: include invalid author codes count
  problemsCount.value =
    missingSpecimens.value.length +
    extraFolders.value.length +
    duplicatesExtraCount.value +
    invalidFieldNotes.value.length +
    nearAccletterCount.value +
    fnDupConflicts.value.length +
    invalidAuthorCount.value +
    fileIssueTotals.value

  emit('update:problems', problemsCount.value)
}

// Recompute on sources change
watch(
  () => [fieldNotes.value, matchedFolders.value, matchedAllFolders.value, nonmatchingFolders.value],
  () => recompute(),
  { deep: true, immediate: true }
)

onMounted(() => {
  recompute()
})

// Re-run checks: rescan folders from disk (refresh DS) then run file-level scanning
async function reRunChecks() {
  emit('unit-progress', 'Rescanning specimen folders...')
  rescanning.value = true
  try {
    await rescanFolders()
  } finally {
    rescanning.value = false
  }

  emit('unit-progress', 'Scanning files in matched folders...')
  scanningFiles.value = true
  try {
    await scanFiles()
  } finally {
    scanningFiles.value = false
  }

  emit('unit-progress', 'Recomputing folder checks...')
  recompute()
  emit('unit-done')
}

// Expose for parent "Run health checks" button
function runChecks() {
  return reRunChecks()
}
defineExpose({ runChecks })

// Rescan using the same regex from DS settings, updating appStore.specimensPhotosFolderResult (adds matchingAll)
async function rescanFolders() {
  const folderHandle = appStore.folderHandle
  if (!folderHandle) return
  try {
    const regexStr = dsSettings.settings.match_folder
    const re = new RegExp(regexStr)
    const result = await findMatchingFolders(folderHandle, re)
    appStore.specimensPhotosFolderResult = result
  } catch (e) {
    console.warn('Rescan failed:', e)
  }
}

// Local copy of DS traversal to avoid import cycles; returns { matching, nonmatching, matchingAll }
async function findMatchingFolders(folderHandle, regex) {
  const matching = []
  const allFolders = []

  async function folderHasImages(h) {
    for await (const entry of h.values()) {
      if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) return true
    }
    return false
  }

  async function traverse(handle, parentPath = '') {
    for await (const entry of handle.values()) {
      if (entry.kind !== 'directory') continue
      const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
      const matchResult = regex.exec(fullPath)
      const isMatch = !!matchResult
      const hasImages = await folderHasImages(entry)
      allFolders.push({ handle: entry, folderName: entry.name, fullPath, isMatch, hasImages })
      if (isMatch) {
        const specimenMeta = matchResult?.groups ? { ...matchResult.groups } : {}
        matching.push({ handle: entry, folderName: entry.name, fullPath, specimenMeta, hasImages })
        // Do not traverse below a matched folder
      } else {
        await traverse(entry, fullPath)
      }
    }
  }

  await traverse(folderHandle)

  const matchedPaths = matching.map(f => f.fullPath)
  const nonmatching = allFolders
    .filter(f => !f.isMatch)
    .filter(f => !matchedPaths.some(mp => mp.startsWith(f.fullPath + '/')))
    .filter(f => f.hasImages)
    .map(f => ({ handle: f.handle, folderName: f.folderName, fullPath: f.fullPath, hasImages: f.hasImages }))

  const matchingWithImages = matching.filter(f => f.hasImages)
  return { matching: matchingWithImages, nonmatching, matchingAll: matching }
}

// File-level scan across matched folders (with images)
async function scanFiles() {
  orphanEdits.value = []
  editedNotSelected.value = []
  taxonWithoutSpecimen.value = []
  baseCollisions.value = []
  try {
    for (const folder of matchedFolders.value || []) {
      const files = []
      for await (const entry of folder.handle.values()) {
        if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
          files.push({ name: entry.name, handle: entry })
        }
      }
      // Aggregate by base+ext
      const byBase = new Map()
      for (const f of files) {
        const p = parseFilename(f.name)
        const key = p.base + p.ext
        if (!byBase.has(key)) byBase.set(key, { originals: [], edits: [], all: [] })
        const rec = byBase.get(key)
        rec.all.push(f.name)
        if (p.edit) rec.edits.push(f)
        else rec.originals.push(f)
      }
      for (const [key, rec] of byBase.entries()) {
        const folderPath = folder.fullPath || folder.folderName
        if (rec.edits.length && rec.originals.length === 0) {
          for (const e of rec.edits) {
            orphanEdits.value.push({ folder: folderPath, file: e.name })
            if (!hasTag(e.name, 's')) {
              editedNotSelected.value.push({ folder: folderPath, file: e.name })
            }
          }
        }
        if (rec.edits.length && rec.originals.length) {
          const e = rec.edits[0]
          const o = rec.originals[0]
          if (!hasTag(e.name, 's')) {
            editedNotSelected.value.push({ folder: folderPath, file: e.name })
          }
          const sPresent = hasTag(e.name, 's') || hasTag(o.name, 's')
          const tPresent = hasTag(e.name, 't') || hasTag(o.name, 't')
          if (tPresent && !sPresent) {
            taxonWithoutSpecimen.value.push({ folder: folderPath, file: e.name })
          }
        }
        if (rec.originals.length > 1 || rec.edits.length > 1 || (rec.originals.length + rec.edits.length) > 2) {
          baseCollisions.value.push({ folder: folderPath, base: key, files: rec.all.sort() })
        }
      }
    }
  } catch (e) {
    console.warn('File scan failed:', e)
  } finally {
    lastScanTs.value = Date.now()
  }
}

// Row index helper (from original Field Notes array)
function getRowIndex(row) {
  const arr = fieldNotes.value || []
  const idx = arr.indexOf(row)
  return idx >= 0 ? (idx + 1) : ''
}

// Table headers
const missHeaders = [
  { title: 'Row', value: 'row' },
  { title: 'Specimen', value: 'key' },
  { title: 'Collector', value: 'collector' },
  { title: 'Taxon', value: 'taxonomy' },
]
const extraHeaders = [
  { title: 'Specimen', value: 'label' },
  { title: 'Path', value: 'path' },
  { title: 'Parent', value: 'parent' },
]
const dupFolderHeaders = [
  { title: 'Path', value: 'path' },
  { title: 'Parent', value: 'parent' },
]
const invalidHeaders = [
  { title: 'Row', value: 'row' },
  { title: 'Collector', value: 'collector' },
  { title: 'Number', value: 'number' },
  { title: 'Accletter', value: 'acccletter' }, // fix below
  { title: 'Initials', value: 'initials' },
]
invalidHeaders[3].value = 'accletter'
const unmatchedHeaders = [
  { title: 'Path', value: 'path' },
  { title: 'Name', value: 'name' },
]
const noImgHeaders = [
  { title: 'Path', value: 'path' },
  { title: 'Specimen', value: 'specimen' },
]
const nearHeaders = [
  { title: 'Label', value: 'label' },
  { title: 'Folder', value: 'folderPath' },
]
const conflictHeaders = [
  { title: 'Folder', value: 'label' },
  { title: 'FN entries', value: 'fnCount' },
  { title: 'Paths', value: 'paths' },
]
const fileHeaders = [
  { title: 'File', value: 'file' },
  { title: 'Folder', value: 'folder' },
]
const collisionHeaders = [
  { title: 'Base', value: 'base' },
  { title: 'Folder', value: 'folder' },
  { title: 'Files', value: 'files' },
]
// New: invalid author table headers
const invalidAuthorHeaders = [
  { title: 'Folder', value: 'path' },
  { title: 'Author code', value: 'author' },
]
</script>
