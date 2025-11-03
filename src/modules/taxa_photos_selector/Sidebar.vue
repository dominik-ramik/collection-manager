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
          :value="item"
          :active="taxonKeyOf(item) === selectedTaxonKey"
          :color="taxonKeyOf(item) === selectedTaxonKey ? 'primary' : undefined"
          @click="selectTaxon(item)"
          :data-item-key="taxonKeyOf(item)"
          tabindex="0"
          @keydown="onListItemKeydown($event, idx)"
          style="cursor:pointer; position:relative;"
        >
          <v-list-item-title
            :style="{ color: getTagCount(item, 's') === 0 ? '#9e9e9e' : undefined }"
          >
            {{ speciesNameOf(item) }}
          </v-list-item-title>
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
import { computed, ref, onMounted, onActivated } from 'vue'
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
  computeAllTagCounts,
} = taxaPhotosStore

// Refresh counts when module is entered/switched to
onMounted(() => { computeAllTagCounts() })
onActivated(() => { computeAllTagCounts() })

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

function onListItemKeydown(event, idx) {
  if (event.key === 'Tab') {
    event.preventDefault()
    const items = document.querySelectorAll('[data-item-key]')
    let nextIdx = idx
    const step = event.shiftKey ? -1 : 1
    let found = false
    
    // Navigate to next taxon with 0 t-tagged images but has at least one s-tagged image
    if (!selectedTaxonKey.value || typeof idx !== 'number') {
      for (let i = 0; i < currentTaxaList.value.length; i++) {
        if (getTagCount(currentTaxaList.value[i], 't') === 0 && hasImages(currentTaxaList.value[i])) {
          nextIdx = i
          found = true
          break
        }
      }
      if (found && items[nextIdx]) {
        items[nextIdx].focus()
        selectTaxon(currentTaxaList.value[nextIdx])
      }
      return
    }
    
    for (
      let i = idx + step;
      event.shiftKey ? i >= 0 : i < currentTaxaList.value.length;
      i += step
    ) {
      if (getTagCount(currentTaxaList.value[i], 't') === 0 && hasImages(currentTaxaList.value[i])) {
        nextIdx = i
        found = true
        break
      }
    }
    
    if (!found) {
      for (
        let i = event.shiftKey ? currentTaxaList.value.length - 1 : 0;
        event.shiftKey ? i < idx : i > idx;
        i += step
      ) {
        if (getTagCount(currentTaxaList.value[i], 't') === 0 && hasImages(currentTaxaList.value[i])) {
          nextIdx = i
          found = true
          break
        }
      }
    }
    
    if (found && items[nextIdx]) {
      event.target.blur?.()
      items[nextIdx].focus()
      selectTaxon(currentTaxaList.value[nextIdx])
    }
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectTaxon(currentTaxaList.value[idx])
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