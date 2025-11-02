<template>
  <div v-if="selectedTaxon">
    <!-- Show images or empty state -->
    <div v-if="selectedType === 'photographed'">
      <div v-if="aggregatedImages.length === 0 && !loadingImages">
        <v-alert type="info" dense>
          <strong>No selected images for this taxon.</strong><br>
          The following specimens have photos of this taxon, but none were selected in the Specimen Photos Selector:
          <ul style="margin-top:0.5em; padding-left:1.5em;">
            <li v-for="folder in selectedTaxon.folders" :key="folder.fullPath">
              {{ folder.specimenMeta.initials }} {{ folder.specimenMeta.number }}{{ folder.specimenMeta.accletter || '' }}
            </li>
          </ul>
        </v-alert>
      </div>
      <ThumbnailGrid
        v-else
        :images="aggregatedImages"
        :loading="loadingImages"
        tag-letter="t"
        badge-color="red-darken-1"
        :allow-edit="false"
        :show-specimen-tag="true"
        :get-specimen-label="getSpecimenLabel"
        :enable-filter-switch="true"
        :filter-default-tagged-only="true"
        :taxonomy="selectedTaxon.taxonomy"
        @thumbnail-click="onThumbnailClick"
      >
        <template #empty-state>
          No images found for this taxon.
        </template>
      </ThumbnailGrid>
    </div>
    <div v-else-if="selectedType === 'without_photos'">
      <v-alert type="info" dense>
        <strong>{{ taxonDisplayName(selectedTaxon) }}</strong><br>
        This taxon has no matching specimens with photos in the Field Notes.
      </v-alert>
    </div>
  </div>
  <div v-else>
    <h2>Select a taxon from the sidebar</h2>
    <div style="margin-top:0.5em; color:#666; font-size:1.05em;">
      <em>You can use <strong>Tab</strong> to quickly jump to the next taxon without selected photos.</em>
    </div>
  </div>
  
  <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="snackbar.timeout">
    {{ snackbar.message }}
  </v-snackbar>
</template>

<script setup>
import { onMounted, onActivated } from 'vue'
import { taxaPhotosStore } from './taxaPhotosStore'
import ThumbnailGrid from '@/components/PhotoSelector/ThumbnailGrid.vue'
import { toggleTagLetter, hasTag, propagateTagToEdit } from '@/utils/tagging'

const {
  selectedType,
  selectedTaxon,
  aggregatedImages,
  loadingImages,
  snackbar,
  showSnackbar,
  taxonDisplayName,
  computeAllTagCounts,
  refreshCurrentTaxonImages,
} = taxaPhotosStore

function getSpecimenLabel(img) {
  if (!img.specimenMeta) return ''
  const { initials, number, accletter } = img.specimenMeta
  return `${initials}-${number}${accletter || ''}`
}

async function renameFileInFolder(folderHandle, oldName, newName) {
  const oldFileHandle = await folderHandle.getFileHandle(oldName)
  const file = await oldFileHandle.getFile()
  const newFileHandle = await folderHandle.getFileHandle(newName, { create: true })
  const writable = await newFileHandle.createWritable()
  await writable.write(await file.arrayBuffer())
  await writable.close()
  if (oldName !== newName) {
    await folderHandle.removeEntry(oldName)
  }
}

async function onThumbnailClick(img) {
  // Only allow toggling 't' tag on images that have 's' tag
  if (!hasTag(img.name, 's')) {
    showSnackbar('Only selected specimen images can be tagged for taxa', 'warning')
    return
  }

  // Find the folder handle for this image
  const folder = selectedTaxon.value.folders.find(f =>
    f.specimenMeta.initials === img.specimenMeta.initials &&
    f.specimenMeta.number === img.specimenMeta.number &&
    (f.specimenMeta.accletter ?? '') === (img.specimenMeta.accletter ?? '')
  )

  if (!folder) {
    showSnackbar('Folder not found for this image', 'error')
    return
  }

  const folderHandle = folder.handle
  const oldName = img.name

  try {
    const newName = toggleTagLetter(oldName, 't')
    await renameFileInFolder(folderHandle, oldName, newName)
    
    // Propagate to edit file if exists
    await propagateTagToEdit(folderHandle, newName, 't')

    // Update the image in aggregatedImages array
    const updatedFileHandle = await folderHandle.getFileHandle(newName)
    const updatedFile = await updatedFileHandle.getFile()
    const updatedImg = {
      ...img,
      name: newName,
      url: URL.createObjectURL(updatedFile),
      handle: updatedFileHandle
    }
    
    const idx = aggregatedImages.value.findIndex(i => 
      i.name === oldName && 
      i.specimenMeta.initials === img.specimenMeta.initials &&
      i.specimenMeta.number === img.specimenMeta.number &&
      (i.specimenMeta.accletter ?? '') === (img.specimenMeta.accletter ?? '')
    )
    if (idx !== -1) {
      aggregatedImages.value[idx] = updatedImg
    }

    // Recompute tag counts
    await computeAllTagCounts()
    
    showSnackbar(hasTag(newName, 't') ? 'Image tagged for taxon' : 'Taxon tag removed', 'success')
  } catch (e) {
    showSnackbar('File operation failed: ' + e.message, 'error')
  }
}

// Ensure chip counts and "Selected" overlays reflect current file tags on module switch
onMounted(async () => {
  await computeAllTagCounts()
  await refreshCurrentTaxonImages()
})
onActivated(async () => {
  await computeAllTagCounts()
  await refreshCurrentTaxonImages()
})
</script>

<style scoped>
</style>