<template>
  <!-- ...existing main area content only, no layout divs... -->
  <div v-if="selectedFolder">
    <!-- Taxon indication and toggle switch on the same line -->
    <div class="d-flex align-center mb-2" style="gap:1em;">
      <v-switch
        v-model="showSelectedOnly"
        color="primary"
        inset
        hide-details
        :label="showSelectedOnly
          ? `Showing ${selectedImages.length} selected file${selectedImages.length === 1 ? '' : 's'} out of ${images.length}`
          : 'Showing all files'"
        style="min-width:16em;"
      />
      <div style="flex:1;">
        <template v-if="selectedType === 'matched'">
          <template v-if="matchedTaxon">
            <span>
              {{ matchedTaxon.taxonomy.group }} /
              {{ matchedTaxon.taxonomy.family }} /
              <span v-if="matchedTaxon.taxonomy.subspecies"> {{ matchedTaxon.taxonomy.subspecies }}</span>
              <span v-else-if="matchedTaxon.taxonomy.species">
                {{ matchedTaxon.taxonomy.species }}
              </span>
            </span>
          </template>
          <template v-else>
            <v-alert type="warning" dense class="py-1 px-2" style="display:inline-block;vertical-align:middle;">
              No matching field notes entry found for this folder. Make sure that the folder name is using correct initials and number.
            </v-alert>
          </template>
        </template>
      </div>
    </div>
    <ThumbnailGrid
      :images="filteredImages"
      :loading="loadingImages"
      :matchedTaxon="matchedTaxon"
      :selectedType="selectedType"
      @thumbnailClick="onThumbnailClick"
      @editIconClick="onEditIconClick"
      @showRevertDialog="showRevertDialog"
    />
    <!-- Indication if no selected files but folder has files -->
    <div v-if="showSelectedOnly && !selectedImages.length && images.length > 0" class="mt-2 mb-2">
      <v-alert type="info" dense>
        This folder contains images, but none are marked as selected. Switch to 'All files' to view them.
      </v-alert>
    </div>
    <!-- Confirmation dialog for revert -->
    <v-dialog v-model="showConfirmRevert" max-width="400">
      <v-card>
        <v-card-title>Confirm revert</v-card-title>
        <v-card-text>
          Are you sure you want to remove the edited version and revert to the original file?<br>
          <span style="font-size:0.95em;color:#666;">The original file will be kept. This action cannot be undone.</span>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="grey" @click="showConfirmRevert = false">Cancel</v-btn>
          <v-btn color="red" @click="doRevertEdit">Delete edited version</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <!-- Dialog for edited file must be selected -->
    <v-dialog v-model="showEditMustBeSelectedDialog" max-width="400">
      <v-card>
        <v-card-title>Edited files must be selected</v-card-title>
        <v-card-text>
          Edited files must always be marked as selected.<br>
          If you wish to unselect this file, please revert it to the original version first.<br>
          <span style="font-size:0.95em;color:#666;">This prevents ambiguities such as edited but not selected files.</span>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="showEditMustBeSelectedDialog = false">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <div v-if="!filteredImages.length && !loadingImages && (!showSelectedOnly || images.length === 0)" class="mt-4">
      <v-alert type="info" dense>No images found in this folder.</v-alert>
    </div>
  </div>
  <div v-else>
    <h2>Select a folder from the menu</h2>
    <div style="margin-top:0.5em; color:#666; font-size:1.05em;">
      <em>You can use <strong>Tab</strong> to quickly jump to the next folder without selected photos.</em>
    </div>
  </div>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="snackbar.timeout">
    {{ snackbar.message }}
  </v-snackbar>
</template>

<script setup>
import { specimenPhotosStore } from './specimenPhotosStore'
import ThumbnailGrid from './ThumbnailGrid.vue'
import { watch, computed, ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { parseFilename, isEditFile, hasTag, toggleTagLetter, countTaggedFiles, createEditCopy } from '@/utils/tagging'

const appStore = useAppStore()

const {
  selectedType,
  sortedFolders,
  selectedFolder,
  selectedFolderKey,
  images,
  loadingImages,
  tagCounts,
  getTagCount,
  selectFolder,
  snackbar,
  showSnackbar,
  folderKeyOf,
  matchedFolders,
  unmatchedFolders,
} = specimenPhotosStore

async function renameFileInFolder(folderHandle, oldName, newName) {
  let oldFileHandle, file
  try {
    oldFileHandle = await folderHandle.getFileHandle(oldName)
    file = await oldFileHandle.getFile()
  } catch (e) {
    throw new Error(`File "${oldName}" not found.`)
  }
  const newFileHandle = await folderHandle.getFileHandle(newName, { create: true })
  const writable = await newFileHandle.createWritable()
  await writable.write(await file.arrayBuffer())
  await writable.close()
  if (oldName !== newName) {
    try {
      await folderHandle.removeEntry(oldName)
    } catch (e) {
      // Ignore if already removed
    }
  }
}

async function onThumbnailClick(img) {
  const folderHandle = selectedFolder.value.handle
  const oldName = img.name
  const parsed = parseFilename(oldName)
  // If file is edited AND tagged "s", prevent untagging and show dialog
  if (parsed.edit && hasTag(img.name, 's')) {
    showEditMustBeSelectedDialog.value = true
    return
  }
  try {
    // Toggle tag for the clicked image only
    const newName = toggleTagLetter(img.name, 's')
    await renameFileInFolder(folderHandle, img.name, newName)
    // Update only the affected image in the images array
    const updatedFileHandle = await folderHandle.getFileHandle(newName)
    const updatedFile = await updatedFileHandle.getFile()
    const updatedImg = {
      ...img,
      name: newName,
      url: URL.createObjectURL(updatedFile),
      handle: updatedFileHandle
    }
    const idx = images.value.findIndex(i => i.name === img.name)
    if (idx !== -1) {
      images.value[idx] = updatedImg
    }
    // Update tag count for current folder
    const folderKey = selectedFolder.value.fullPath || selectedFolder.value.folderName
    const files = []
    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
        files.push({ name: entry.name, handle: entry })
      }
    }
    tagCounts.value[folderKey] = {
      s: countTaggedFiles(files, 's')
    }
  } catch (e) {
    showSnackbar('File operation failed: ' + e.message, 'error')
  }
}

async function onEditIconClick(img) {
  const folderHandle = selectedFolder.value.handle
  if (isEditFile(img.name)) {
    return
  }
  try {
    await createEditCopy(folderHandle, img.name)
    showSnackbar('File prepared for editing.', 'success')
    await selectFolder(selectedFolder.value)
  } catch (e) {
    showSnackbar(e.message, 'error')
  }
}

// Fix: matchedTaxon computed property uses appStore.fieldNotesData
const matchedTaxon = computed(() => {
  if (
    selectedType.value !== 'matched' ||
    !selectedFolder.value ||
    !selectedFolder.value.specimenMeta
  ) {
    return null
  }
  const fieldNotes = appStore.fieldNotesData || []
  const { initials, number, accletter } = selectedFolder.value.specimenMeta
  return fieldNotes.find(item =>
    item?.specimenNumber?.initials === initials &&
    String(item?.specimenNumber?.number) === String(number) &&
    ((item?.specimenNumber?.accletter ?? undefined) === (accletter ?? undefined))
  )
})

const showConfirmRevert = ref(false)
const revertImgRef = ref(null)
// Add new dialog state
const showEditMustBeSelectedDialog = ref(false)
const showSelectedOnly = ref(false)

// Compute selected images and filtered images based on toggle
const selectedImages = computed(() =>
  images.value.filter(img => hasTag(img.name, 's'))
)
const filteredImages = computed(() =>
  showSelectedOnly.value ? selectedImages.value : images.value
)

function showRevertDialog(img) {
  revertImgRef.value = img
  showConfirmRevert.value = true
}

async function doRevertEdit() {
  showConfirmRevert.value = false
  const img = revertImgRef.value
  if (!img || !isEditFile(img.name)) return
  const folderHandle = selectedFolder.value.handle
  try {
    await folderHandle.removeEntry(img.name)
    const parsed = parseFilename(img.name)
    let originalFile = null
    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file') {
        const p = parseFilename(entry.name)
        if (p.base === parsed.base && !p.edit && p.ext === parsed.ext) {
          originalFile = entry
          break
        }
      }
    }
    if (originalFile) {
      img.name = originalFile.name
      img.handle = originalFile
      img.url = URL.createObjectURL(await originalFile.getFile())
      images.value.sort((a, b) => a.name.localeCompare(b.name))
      showSnackbar('Edited version removed. Original file restored.', 'success')
    } else {
      images.value = images.value.filter(i => i !== img)
      showSnackbar('Edited version removed. Original file not found.', 'warning')
    }
  } catch (e) {
    showSnackbar('Failed to remove edited version: ' + e.message, 'error')
  }
}
</script>

<style scoped>
.module-layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.module-main {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  background: #fff;
  padding: 2em 2em 2em 2em;
}
</style>
