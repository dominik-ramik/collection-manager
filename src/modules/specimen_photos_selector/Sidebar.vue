<template>
  <div style="width:15em; background:#f5f5f5; border-right:1px solid #ddd; display:flex; flex-direction:column; flex:1 1 0; min-height:0;">
    <div class="pa-4">
      <v-select
        v-model="selectedType"
        :items="typeOptions"
        label="Folder type"
        density="compact"
        variant="solo"
        hide-details
        @update:modelValue="onTypeChange"
      />
      <div class="mt-2">
        <v-btn-toggle
          v-model="onlySpeciesLevel"
          density="compact"
          color="blue"
          class="species-toggle"
          mandatory
        >
          <v-btn :value="false" title="Show all specimens">All</v-btn>
          <v-btn :value="true" title="Show species-level specimens only">Species-level</v-btn>
        </v-btn-toggle>
      </div>
    </div>
    <div style="flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden;">
      <!-- Spinner shown while tag counts are being refreshed -->
      <div v-if="loadingTags" class="pa-2 d-flex justify-center" style="border-bottom:1px solid #eee; flex-shrink:0;">
        <span style="font-size: 70%;" class="mr-1">Loading selected photos counts</span> <v-progress-circular indeterminate size="20" color="primary" />
      </div>

      <!-- Virtual scroll: only renders ~10-20 visible rows regardless of folder count -->
      <v-virtual-scroll
        ref="virtualScrollRef"
        :items="displayedFolders"
        :item-height="getItemHeight"
        style="flex:1;"
      >
        <template #default="{ item }">
          <v-list-item
            :key="folderKeyOf(item)"
            :value="folderKeyOf(item)"
            :active="folderKeyOf(item) === selectedFolderKey"
            :color="folderKeyOf(item) === selectedFolderKey ? 'primary' : undefined"
            @click.stop="selectFolder(item)"
            :data-folder-key="folderKeyOf(item)"
            tabindex="0"
            nav
            style="cursor:pointer; position:relative;"
          >
            <v-list-item-title>{{ item.folderName }}</v-list-item-title>
            <v-list-item-subtitle v-if="lowestPrimary(item) || familyOf(item)" style="font-size:0.70em; color:black; display:flex; flex-direction:column; gap:2px;">
              <div v-if="lowestPrimary(item)" style="line-height:1;">{{ lowestPrimary(item) }}</div>
              <div v-if="familyOf(item)" style="line-height:1; margin-left: 1.5em; font-size:1em; color:black;">{{ familyOf(item) }}</div>
            </v-list-item-subtitle>
            <template #append>
              <span v-if="getTagCount(item, 's') > 0"
                class="tag-count-badge"
                style="background:#8e24aa; color:#fff; border-radius:8px; font-size:0.85em; padding:2px 8px; margin-left:8px; position:absolute; right:12px; top:50%; transform:translateY(-50%);"
              >
                {{ getTagCount(item, 's') }}
              </span>
            </template>
          </v-list-item>
        </template>
      </v-virtual-scroll>
      <div v-if="displayedFolders.length === 0" style="padding:1em; color:#888; text-align:center;">
        No folders found for selected type.
      </div>
    </div>
    <div style="padding:1em; border-top:1px solid #ddd; background:#fafafa;">
    </div>
  </div>
</template>
<script setup>
import { computed, onActivated, onDeactivated, onMounted, onBeforeUnmount, watch, ref, nextTick } from 'vue'
import { specimenPhotosStore } from './specimenPhotosStore'
import { useAppStore } from '@/stores/app'

const {
  selectedType,
  sortedFolders,
  selectedFolderKey,
  getTagCount,
  selectFolder,
  onTypeChange,
  folderKeyOf,
  refreshTagCounts,
} = specimenPhotosStore

const typeOptions = [
  { title: 'Specimen folders', value: 'matched' },
  { title: 'Other folders', value: 'unmatched' },
]

const onlySpeciesLevel = ref(false)
const loadingTags = ref(false)
const virtualScrollRef = ref(null)

// Per-item height for v-virtual-scroll.
// Matched folders that have a taxonomy subtitle occupy ~72px; single-line items ~48px.
function getItemHeight(item) {
  if (selectedType.value !== 'matched') return 48
  return (lowestPrimary(item) || familyOf(item)) ? 72 : 48
}

// Scroll the virtual list to keep the selected folder visible
watch(selectedFolderKey, async (key) => {
  if (!key || !virtualScrollRef.value) return
  await nextTick()
  const idx = displayedFolders.value.findIndex(f => folderKeyOf(f) === key)
  if (idx !== -1) virtualScrollRef.value.scrollToIndex?.(idx)
})

const safeSortedFolders = computed(() => Array.isArray(sortedFolders) ? sortedFolders : (sortedFolders?.value ?? []))

// Helper to check if folder is species/subspecies level
function isSpeciesLevel(folder) {
  if (!folder || !folder.specimenMeta) return false
  const key = folderKeyCache.get(folder) || `${normInitials(folder.specimenMeta.initials)}|${normNumber(folder.specimenMeta.number)}|${normAcc(folder.specimenMeta.accletter)}`
  const entry = fieldNotesMap.get(key)
  if (!entry) return false
  return entry.level === 'species' || entry.level === 'subspecies'
}

// Filtered list based on switch state
const displayedFolders = computed(() => {
  if (!onlySpeciesLevel.value) return safeSortedFolders.value
  return safeSortedFolders.value.filter(f => isSpeciesLevel(f))
})

const appStore = useAppStore()

// Fast lookup cache: specimenKey -> lowest taxonomy string
// Key format: NORMALIZED_INITIALS|NORMALIZED_NUMBER|NORMALIZED_ACC
let fieldNotesMap = new Map()

function normInitials(v) { return String(v ?? '').trim().toUpperCase() }
function normNumber(v) { return String(v ?? '').trim() }
function normAcc(v) { return String(v ?? '').trim() }

function buildFieldNotesMap() {
  const out = new Map()
  const fnotes = appStore.fieldNotesData || []
  for (const item of fnotes) {
    const sn = item?.specimenNumber || {}
    const initials = normInitials(sn.initials || sn.initials)
    const number = normNumber(sn.number)
    const acc = normAcc(sn.accletter)
    if (!initials && !number) continue
    const key = `${initials}|${number}|${acc}`
    const tax = item?.taxonomy || {}
    // determine lowest available level and keep family
    if (tax.subspecies) {
      out.set(key, { level: 'subspecies', name: String(tax.subspecies).trim(), family: String(tax.family || '') })
    } else if (tax.species) {
      out.set(key, { level: 'species', name: String(tax.species).trim(), family: String(tax.family || '') })
    } else if (tax.genus) {
      out.set(key, { level: 'genus', name: String(tax.genus).trim(), family: String(tax.family || '') })
    } else if (tax.family) {
      out.set(key, { level: 'family', name: String(tax.family).trim(), family: String(tax.family).trim() })
    } else if (tax.group) {
      out.set(key, { level: 'group', name: String(tax.group).trim(), family: '' })
    }
  }
  fieldNotesMap = out
}

// Rebuild cache whenever field notes change
watch(() => appStore.fieldNotesData, () => buildFieldNotesMap(), { immediate: true })

function capitalize(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1) }

// WeakMap for folder -> specimen key to avoid rebuilding the key string
const folderKeyCache = new WeakMap()

function buildFolderKeyCache() {
  try {
    // Clear by creating a new WeakMap (can't iterate to clear reliably)
    // Note: reassigning keeps semantics simple and avoids memory leaks
    // when old folder objects are no longer referenced elsewhere.
    // eslint-disable-next-line no-global-assign
    // folderKeyCache = new WeakMap()
  } catch (e) {
    // ignore
  }
  for (const f of safeSortedFolders.value || []) {
    if (!f || !f.specimenMeta) continue
    const sn = f.specimenMeta
    const key = `${normInitials(sn.initials)}|${normNumber(sn.number)}|${normAcc(sn.accletter)}`
    try { folderKeyCache.set(f, key) } catch { /* ignore */ }
  }
}

// Rebuild the folder key cache when the folder list changes
watch(safeSortedFolders, () => buildFolderKeyCache(), { immediate: true })

function lowestTaxonomyOf(folder) {
  if (!folder || !folder.specimenMeta) return ''
  const key = folderKeyCache.get(folder) || `${normInitials(folder.specimenMeta.initials)}|${normNumber(folder.specimenMeta.number)}|${normAcc(folder.specimenMeta.accletter)}`
  const entry = fieldNotesMap.get(key)
  if (!entry) return ''
  // If lowest level is below Family (species/subspecies/genus), output "<name> (Family)"
  if (entry.level === 'species' || entry.level === 'subspecies' || entry.level === 'genus') {
    const fam = entry.family || ''
    const text = fam ? `${entry.name}${fam ? ` (${fam})` : ''}` : entry.name
    // Prepend alert triangle for genus or higher levels (genus, family, group)
    if (entry.level === 'genus' || entry.level === 'family' || entry.level === 'group') {
      return `⚠️ ${text}`
    }
    return text
  }
  // otherwise (family or group) return the name as-is (with emoji for genus or above)
  const text = entry.name || ''
  if (entry.level === 'family' || entry.level === 'group') return `⚠️ ${text}`
  return text
}

function lowestPrimary(folder) {
  if (!folder || !folder.specimenMeta) return ''
  const key = folderKeyCache.get(folder) || `${normInitials(folder.specimenMeta.initials)}|${normNumber(folder.specimenMeta.number)}|${normAcc(folder.specimenMeta.accletter)}`
  const entry = fieldNotesMap.get(key)
  if (!entry) return ''
  // For genus or higher levels, prepend triangle emoji per request
  if (entry.level === 'genus') return `⚠️ ${entry.name}`
  if (entry.level === 'family' || entry.level === 'group') return `⚠️ ${entry.name}`
  // species or subspecies: show the actual name (no emoji)
  if (entry.level === 'species' || entry.level === 'subspecies') return entry.name || ''
  return entry.name || ''
}

function familyOf(folder) {
  if (!folder || !folder.specimenMeta) return ''
  const key = folderKeyCache.get(folder) || `${normInitials(folder.specimenMeta.initials)}|${normNumber(folder.specimenMeta.number)}|${normAcc(folder.specimenMeta.accletter)}`
  const entry = fieldNotesMap.get(key)
  if (!entry) return ''
  // Return family without parentheses, but only if present
  return entry.family || ''
}

function handleGlobalKeydown(event) {
  // Ignore keys when focus is in an input/textarea/select
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  const isNavigate = event.key === 'Tab' || event.key === ' '
  if (!isNavigate) return

  event.preventDefault()
  
  const currentIdx = selectedFolderKey.value
    ? displayedFolders.value.findIndex(f => folderKeyOf(f) === selectedFolderKey.value)
    : -1
  
  const step = event.shiftKey ? -1 : 1
  let nextIdx = currentIdx
  let found = false
  
  // If no folder selected, find first with no "s" tag
  if (currentIdx === -1) {
    for (let i = 0; i < displayedFolders.value.length; i++) {
      if (getTagCount(displayedFolders.value[i], 's') === 0) {
        nextIdx = i
        found = true
        break
      }
    }
  } else {
    // Search forward/backward from current
    for (
      let i = currentIdx + step;
      event.shiftKey ? i >= 0 : i < displayedFolders.value.length;
      i += step
    ) {
      if (getTagCount(displayedFolders.value[i], 's') === 0) {
        nextIdx = i
        found = true
        break
      }
    }
    
    // Wrap around if not found
    if (!found) {
      for (
        let i = event.shiftKey ? displayedFolders.value.length - 1 : 0;
        event.shiftKey ? i < currentIdx : i > currentIdx;
        i += step
      ) {
        if (getTagCount(displayedFolders.value[i], 's') === 0) {
          nextIdx = i
          found = true
          break
        }
      }
    }
  }
  
  if (found && displayedFolders.value[nextIdx]) {
    selectFolder(displayedFolders.value[nextIdx])
    // With virtual scroll, scrollIntoView on a DOM element won't work for off-screen items
    if (virtualScrollRef.value) {
      virtualScrollRef.value.scrollToIndex?.(nextIdx)
    } else {
      const key = folderKeyOf(displayedFolders.value[nextIdx])
      const listItem = document.querySelector(`[data-folder-key="${CSS.escape(key)}"]`)
      if (listItem) listItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }
}

// Replace direct refreshTagCounts() calls with this async helper
async function loadTagCounts() {
  loadingTags.value = true
  try {
    await Promise.resolve(refreshTagCounts())
  } catch (e) {
    // Stale folder handles (NotFoundError) are expected when the filesystem changes
    if (e?.name !== 'NotFoundError') console.error('loadTagCounts error:', e)
  } finally {
    loadingTags.value = false
  }
}

onMounted(() => {
  loadTagCounts()
  document.addEventListener('keydown', handleGlobalKeydown)
})
onActivated(() => {
  loadTagCounts()
  // Guard against double-registration when keep-alive fires both onMounted and onActivated
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('keydown', handleGlobalKeydown)
})
onDeactivated(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.v-switch--sm {
  font-size: 0.8em;
  min-height: 1.2em;
  --v-switch-thumb-size: 16px;
  --v-switch-track-height: 12px;
  --v-switch-label-font-size: 0.9em;
}

.species-toggle {
  display: flex;
  gap: 6px;
}

.species-toggle .v-btn {
  font-size: 0.85em;
  padding: 4px 8px;
  min-width: 0;
}
</style>
