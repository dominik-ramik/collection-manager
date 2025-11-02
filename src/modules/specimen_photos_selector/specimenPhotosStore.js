import { ref, computed, watch, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  toggleTagLetter,
  syncEditTag,
  findEditFile,
  parseFilename,
  hasTag,
  isEditFile,
  createEditCopy,
  countTaggedFiles
} from '@/utils/tagging'

export function useSpecimenPhotos() {
  const appStore = useAppStore()

  const selectedType = ref('matched')

  const matchedFolders = computed(() => appStore.specimensPhotosFolderResult?.matching || [])
  const unmatchedFolders = computed(() => appStore.specimensPhotosFolderResult?.nonmatching || [])

  const folders = computed(() =>
    selectedType.value === 'matched'
      ? matchedFolders.value
      : unmatchedFolders.value
  )

  const sortedFolders = computed(() =>
    [...folders.value].sort((a, b) =>
      (a.folderName || '').localeCompare(b.folderName || '')
    )
  )

  const selectedFolder = ref(null)
  const selectedFolderKey = ref(null)
  const images = ref([])
  const loadingImages = ref(false)
  const tagCounts = ref({})

  // Snackbar state
  const snackbar = ref({
    show: false,
    message: '',
    color: 'success',
    timeout: 3500,
  })

  function showSnackbar(message, color = 'success', timeout = 3500) {
    snackbar.value.message = message
    snackbar.value.color = color
    snackbar.value.timeout = timeout
    snackbar.value.show = true
  }

  async function computeAllTagCounts(foldersArr) {
    for (const folder of foldersArr) {
      const handle = folder.handle
      const files = []
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
          files.push({ name: entry.name, handle: entry })
        }
      }
      tagCounts.value[folder.fullPath || folder.folderName] = {
        s: countTaggedFiles(files, 's')
      }
    }
  }

  watch(
    () => [matchedFolders.value, unmatchedFolders.value],
    async ([matchedArr, unmatchedArr]) => {
      const allFolders = [...matchedArr, ...unmatchedArr].filter(f => f.hasImages)
      await computeAllTagCounts(allFolders)
    },
    { immediate: true }
  )

  function getTagCount(folder, letter) {
    const key = folder?.fullPath || folder?.folderName || ''
    return tagCounts.value[key]?.[letter] || 0
  }

  function folderKeyOf(folder) {
    return folder?.fullPath || folder?.folderName || ''
  }

  function onTypeChange(val) {
    selectedType.value = val
    selectedFolder.value = null
    selectedFolderKey.value = null
    images.value = []
  }

  watch(selectedType, () => {
    selectedFolder.value = null
    selectedFolderKey.value = null
    images.value = []
  })

  async function selectFolder(item) {
    selectedFolder.value = item
    selectedFolderKey.value = folderKeyOf(item)
    images.value = []
    loadingImages.value = true
    try {
      const handle = item.handle
      const files = []
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
          files.push({ name: entry.name, url: URL.createObjectURL(await entry.getFile()), handle: entry })
        }
      }
      // Only show "edit" file if both exist, else show single file
      const displayFiles = []
      const seenBases = new Set()
      files.sort((a, b) => a.name.localeCompare(b.name))
      for (const file of files) {
        const parsed = parseFilename(file.name)
        const baseKey = parsed.base + parsed.ext
        if (parsed.edit) {
          displayFiles.push(file)
          seenBases.add(baseKey)
        } else if (!seenBases.has(baseKey)) {
          const hasEdit = files.some(f => {
            const p = parseFilename(f.name)
            return p.base === parsed.base && p.edit && p.ext === parsed.ext
          })
          if (!hasEdit) {
            displayFiles.push(file)
            seenBases.add(baseKey)
          }
        }
      }
      images.value = [...displayFiles].sort((a, b) => a.name.localeCompare(b.name))
      await nextTick()
      if (document.activeElement) document.activeElement.blur()
      const listItem = document.querySelector(`[data-folder-key="${CSS.escape(folderKeyOf(item))}"]`)
      if (listItem) {
        listItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        listItem.focus?.()
      }
    } catch (e) {
      images.value = []
    } finally {
      loadingImages.value = false
    }
  }

  // Public: refresh counts for both matched and unmatched folders (used on module switch)
  async function refreshTagCounts() {
    const allFolders = [...(matchedFolders.value || []), ...(unmatchedFolders.value || [])].filter(f => f.hasImages)
    tagCounts.value = {}
    await computeAllTagCounts(allFolders)
  }

  // Public: refresh currently displayed thumbnails for the selected folder (used on module switch)
  async function refreshSelectedFolderImages() {
    if (!selectedFolder.value) return
    await selectFolder(selectedFolder.value)
  }

  return {
    selectedType,
    sortedFolders,
    selectedFolder,
    selectedFolderKey,
    images,
    loadingImages,
    tagCounts,
    getTagCount,
    selectFolder,
    onTypeChange,
    snackbar,
    showSnackbar,
    folderKeyOf,
    matchedFolders,
    unmatchedFolders,
    refreshTagCounts,
    refreshSelectedFolderImages, // expose
  }
}

// Export a singleton instance for named import compatibility
export const specimenPhotosStore = useSpecimenPhotos()
