<!-- If needed, add sidebar content here. Otherwise, omit this file. -->
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
      <!-- New: filter switch (visible only for Photographed taxa) -->
      <div v-if="selectedType === 'photographed'" class="mt-2">
        <v-switch
          v-model="onlyWithSelected"
          density="compact"
          class="v-switch--sm"
          hide-details
          :label="onlyWithSelected
            ? 'All taxa with photos'
            : 'With selected photos'"
        />
      </div>
    </div>
    <div style="flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column;">
      <v-list nav style="flex:1;">
        <v-list-item
          v-for="(item, idx) in displayedTaxa"
          :key="taxonKeyOf(item)"
          :value="taxonKeyOf(item)"
          :active="taxonKeyOf(item) === selectedTaxonKey"
          :color="taxonKeyOf(item) === selectedTaxonKey ? 'primary' : undefined"
          @click.stop="selectTaxon(item)"
          :data-item-key="taxonKeyOf(item)"
          tabindex="0"
          style="cursor:pointer; position:relative;"
        >
          <v-list-item-content>
            <v-list-item-title :style="{ color: getTagCount(item, 's') === 0 ? '#9e9e9e' : undefined }">
              {{ speciesNameOf(item) }}
            </v-list-item-title>
            <v-list-item-subtitle v-if="familyOf(item)" style="font-size:0.70em; color:#777;">
              {{ familyOf(item) }}
            </v-list-item-subtitle>
          </v-list-item-content>
          <template #append>
            <span v-if="getTagCount(item, 't') > 0"
              class="tag-count-badge"
              style="background:#e53935; color:#fff; border-radius:8px; font-size:0.85em; padding:2px 8px; margin-left:8px; position:absolute; right:12px; top:50%; transform:translateY(-50%);"
            >
              {{ getTagCount(item, 't') }}
            </span>
          </template>
        </v-list-item>
      </v-list>
      <div v-if="displayedTaxa.length === 0" style="padding:1em; color:#888; text-align:center;">
        No taxa found for selected type.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { taxaPhotosStore } from './taxaPhotosStore'

const {
  selectedType,
  currentTaxaList,
  selectedTaxonKey,
  getTagCount,
  selectTaxon,
  onTypeChange,
  taxonKeyOf,
  aggregatedImages,
  refreshTagCounts,
} = taxaPhotosStore

// Refresh counts when module is entered/switched to
onMounted(() => {
  refreshTagCounts()
  document.addEventListener('keydown', handleGlobalKeydown)
})
onActivated(() => {
  refreshTagCounts()
  // Re-register listener when module becomes active (in case it was removed)
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('keydown', handleGlobalKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})

const typeOptions = [
  { title: 'Photographed taxa', value: 'photographed' },
  { title: 'Taxa without photos', value: 'without_photos' },
]

// New: switch state and filtered list
const onlyWithSelected = ref(false)
const displayedTaxa = computed(() => {
  if (selectedType.value !== 'photographed') return currentTaxaList.value
  return onlyWithSelected.value
    ? currentTaxaList.value.filter(t => getTagCount(t, 's') > 0)
    : currentTaxaList.value
})

function handleGlobalKeydown(event) {
  // Ignore keys when focus is in an input/textarea/select
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  const isNavigate = event.key === 'Tab' || event.key === ' '
  if (!isNavigate) return

  event.preventDefault()
  
  // Use displayedTaxa instead of currentTaxaList to respect the filter
  const currentIdx = selectedTaxonKey.value
    ? displayedTaxa.value.findIndex(t => taxonKeyOf(t) === selectedTaxonKey.value)
    : -1
  
  const step = event.shiftKey ? -1 : 1
  let nextIdx = currentIdx
  let found = false
  
  // Navigate to next taxon with 0 t-tagged images but has at least one folder
  if (currentIdx === -1) {
    for (let i = 0; i < displayedTaxa.value.length; i++) {
      if (getTagCount(displayedTaxa.value[i], 't') === 0 && hasImages(displayedTaxa.value[i])) {
        nextIdx = i
        found = true
        break
      }
    }
  } else {
    for (
      let i = currentIdx + step;
      event.shiftKey ? i >= 0 : i < displayedTaxa.value.length;
      i += step
    ) {
      if (getTagCount(displayedTaxa.value[i], 't') === 0 && hasImages(displayedTaxa.value[i])) {
        nextIdx = i
        found = true
        break
      }
    }
    
    if (!found) {
      for (
        let i = event.shiftKey ? displayedTaxa.value.length - 1 : 0;
        event.shiftKey ? i < currentIdx : i > currentIdx;
        i += step
      ) {
        if (getTagCount(displayedTaxa.value[i], 't') === 0 && hasImages(displayedTaxa.value[i])) {
          nextIdx = i
          found = true
          break
        }
      }
    }
  }
  
  if (found && displayedTaxa.value[nextIdx]) {
    selectTaxon(displayedTaxa.value[nextIdx])
    const key = taxonKeyOf(displayedTaxa.value[nextIdx])
    const listItem = document.querySelector(`[data-item-key="${CSS.escape(key)}"]`)
    if (listItem) {
      listItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      // Focus the list item to match Specimen Photos Selector behavior
      listItem.focus?.()
    }
  }
}

function hasImages(taxon) {
  // Check if taxon has at least one folder (list remains clickable regardless of s-tag presence)
  return taxon.folders && taxon.folders.length > 0
}

function speciesNameOf(taxon) {
  const t = taxon?.taxonomy || taxon || {}
  return t.subspecies || t.species || 'Unknown species'
}

function familyOf(taxon) {
  const t = taxon?.taxonomy || taxon || {}
  return t.family || ''
}
</script>

<style scoped>
.v-switch--sm {
  font-size: 0.8em;
  min-height: 1.2em;
  --v-switch-thumb-size: 16px;
  --v-switch-track-height: 12px;
  --v-switch-label-font-size: 0.9em;
}
</style>