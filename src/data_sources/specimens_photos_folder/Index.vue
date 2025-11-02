<template>
  <v-container>
    <p>Select a folder which contains the specimen photos.</p>
    <v-btn color="primary" @click="pickFolder">Pick Folder</v-btn>
    <div v-if="folderName" class="mt-4">
      <v-icon color="success" class="mr-2">mdi-check-circle</v-icon>
      <span>Selected folder: <strong>{{ folderName }}</strong></span>
    </div>
    <v-dialog v-model="showNoFoldersDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>No specimen folders found</v-card-title>
        <v-card-text>
          No specimen folders were found in the selected folder.<br>
          Please pick a different folder.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="showNoFoldersDialog = false">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import settings from './settings.json'

const appStore = useAppStore()
const folderName = ref('')
const showNoFoldersDialog = ref(false)
const emit = defineEmits(['ready'])

// Try to restore folder handle from store (if available)
if (appStore.ready.dataSources['specimens_photos_folder'] && appStore.folderHandle) {
  folderName.value = appStore.folderHandle.name || ''
}

// Recursively traverse all subfolders and collect matches based on full path regex
async function findMatchingFolders(folderHandle, regex) {
  const matching = []
  const allFolders = []

  // Async check for images in a folder
  async function folderHasImages(folderHandle) {
    for await (const entry of folderHandle.values()) {
      if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
        return true
      }
    }
    return false
  }

  async function traverse(handle, parentPath = '') {
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') {
        const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
        const matchResult = regex.exec(fullPath)
        const isMatch = !!matchResult
        // Check if folder has images (async)
        const hasImages = await folderHasImages(entry)
        allFolders.push({
          handle: entry,
          folderName: entry.name,
          fullPath,
          isMatch,
          hasImages
        })
        if (isMatch) {
          // Extract named groups if present
          const specimenMeta = matchResult.groups ? { ...matchResult.groups } : {}
          // Ensure accletter is used
          if (specimenMeta.accletter !== undefined) {
            specimenMeta.accletter = specimenMeta.accletter
          }
          matching.push({
            handle: entry,
            folderName: entry.name,
            fullPath,
            specimenMeta,
            hasImages
          })
          // Do NOT traverse subfolders of a matching folder
        } else {
          // Continue traversing subfolders of non-matching folders
          await traverse(entry, fullPath)
        }
      }
    }
  }

  await traverse(folderHandle)

  // Filter nonmatching: exclude any folder that is an ancestor of a matching folder
  const matchedPaths = matching.map(f => f.fullPath)
  const nonmatching = allFolders
    .filter(f => !f.isMatch)
    .filter(f => !matchedPaths.some(mp => mp.startsWith(f.fullPath + '/')))
    .filter(f => f.hasImages)
    .map(f => ({
      handle: f.handle,
      folderName: f.folderName,
      fullPath: f.fullPath,
      hasImages: f.hasImages
    }))

  // Only include folders with images in matching array
  const matchingWithImages = matching.filter(f => f.hasImages)

  return { matching: matchingWithImages, nonmatching }
}

async function pickFolder() {
  try {
    // Show folder picker (requires browser support)
    const handle = await window.showDirectoryPicker()
    if (handle) {
      appStore.folderHandle = handle
      folderName.value = handle.name
      // Get regex from settings (now using match_folder)
      const regexStr = settings.settings.match_folder
      const re = new RegExp(regexStr)
      const result = await findMatchingFolders(handle, re)
      // Output the resulting object of matched and unmatched folders
      console.log('[SpecimenPhotosFolder] Matching folders:', result.matching)
      console.log('[SpecimenPhotosFolder] Unmatched folders:', result.nonmatching)
      // If no matching or nonmatching folders found, show modal dialog and let user re-pick
      if ((!result.matching || result.matching.length === 0) && (!result.nonmatching || result.nonmatching.length === 0)) {
        folderName.value = ''
        appStore.folderHandle = null
        appStore.specimensPhotosFolderResult = null
        appStore.ready.dataSources['specimens_photos_folder'] = false
        emit('ready', false)
        showNoFoldersDialog.value = true
        return
      }
      // Remove folderHasImages from this file, and update selectedArray to use hasImages property
      const selectedArray = computed(() =>
        (selectedType.value === 'matched' ? matched.value : unmatched.value)
          .filter(folder => folder.hasImages)
      )
      appStore.specimensPhotosFolderResult = result
      console.log("Folders", result)
      appStore.ready.dataSources['specimens_photos_folder'] = true
      emit('ready')
    } else {
      console.log('No folder handle returned')
    }
  } catch (e) {
    console.log('Error in pickFolder:', e)
    appStore.setError('Unable to access folder: ' + e.message)
  }
}

</script>
