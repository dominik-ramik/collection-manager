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
    </div>
    <div style="flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column;">
      <v-list nav style="flex:1;">
        <v-list-item
          v-for="(item, idx) in safeSortedFolders"
          :key="folderKeyOf(item)"
          :value="item"
          :active="folderKeyOf(item) === selectedFolderKey"
          :color="folderKeyOf(item) === selectedFolderKey ? 'primary' : undefined"
          @click="selectFolder(item)"
          :data-folder-key="folderKeyOf(item)"
          tabindex="0"
          @keydown="onListItemKeydown($event, idx)"
          style="cursor:pointer; position:relative;"
        >
          <v-list-item-title>{{ item.folderName }}</v-list-item-title>
          <template #append>
            <span v-if="getTagCount(item, 's') > 0"
              class="tag-count-badge"
              style="background:#8e24aa; color:#fff; border-radius:8px; font-size:0.85em; padding:2px 8px; margin-left:8px; position:absolute; right:12px; top:50%; transform:translateY(-50%);"
            >
              {{ getTagCount(item, 's') }}
            </span>
          </template>
        </v-list-item>
      </v-list>
      <div v-if="safeSortedFolders.length === 0" style="padding:1em; color:#888; text-align:center;">
        No folders found for selected type.
      </div>
    </div>
    <div style="padding:1em; border-top:1px solid #ddd; background:#fafafa;">
    </div>
  </div>
</template>
<script setup>
import { computed, onActivated, onMounted } from 'vue'
import { specimenPhotosStore } from './specimenPhotosStore'

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

const safeSortedFolders = computed(() => Array.isArray(sortedFolders) ? sortedFolders : (sortedFolders?.value ?? []))

function onListItemKeydown(event, idx) {
  if (event.key === 'Tab') {
    event.preventDefault()
    const items = document.querySelectorAll('[data-folder-key]')
    let nextIdx = idx
    const step = event.shiftKey ? -1 : 1
    let found = false
    // If no folder is selected or idx is undefined, select first folder with no "s" tag
    if (!selectedFolderKey.value || typeof idx !== 'number') {
      for (let i = 0; i < safeSortedFolders.value.length; i++) {
        if (getTagCount(safeSortedFolders.value[i], 's') === 0) {
          nextIdx = i
          found = true
          break
        }
      }
      if (found && items[nextIdx]) {
        items[nextIdx].focus()
        selectFolder(safeSortedFolders.value[nextIdx])
      }
      return
    }
    for (
      let i = idx + step;
      event.shiftKey ? i >= 0 : i < safeSortedFolders.value.length;
      i += step
    ) {
      if (getTagCount(safeSortedFolders.value[i], 's') === 0) {
        nextIdx = i
        found = true
        break
      }
    }
    if (!found) {
      for (
        let i = event.shiftKey ? safeSortedFolders.value.length - 1 : 0;
        event.shiftKey ? i < idx : i > idx;
        i += step
      ) {
        if (getTagCount(safeSortedFolders.value[i], 's') === 0) {
          nextIdx = i
          found = true
          break
        }
      }
    }
    if (found && items[nextIdx]) {
      event.target.blur?.()
      items[nextIdx].focus()
      selectFolder(safeSortedFolders.value[nextIdx])
    }
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectFolder(safeSortedFolders.value[idx])
  }
}

onMounted(() => { refreshTagCounts() })
onActivated(() => { refreshTagCounts() })
</script>
