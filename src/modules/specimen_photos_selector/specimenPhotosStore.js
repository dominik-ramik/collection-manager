import { ref, computed, watch, shallowRef } from 'vue'
import { useAppStore } from '@/stores/app'
import { parseFilename, countTaggedFilesMulti } from '@/utils/tagging'
import {
  getCachedFiles,
  invalidateFolder,
  updateCachedFileName,
} from '@/utils/folderFileCache'

/**
 * Specimen Photos Store – rewritten for efficiency.
 *
 * Key design decisions
 * ────────────────────
 * 1.  **Lazy blob URLs** – Object URLs are only created when a folder is
 *     selected, and immediately revoked when switching away.
 *
 * 2.  **Incremental tag counts** – After a tag toggle we adjust the
 *     affected folder's count by ±1 instead of re-scanning all files.
 *     Full re-scans only happen on initial load or cache invalidation.
 *
 * 3.  **Single-pass display-file selection** – `buildDisplayFiles` runs
 *     one O(n) pass using a pre-built Set of edit bases.
 *
 * 4.  **In-place image updates** – On tag toggle the single changed
 *     entry in `images` is replaced directly by index.
 *
 * 5.  **Abort controller** – Rapid folder switching cancels in-flight
 *     loads so we never do redundant work.
 *
 * 6.  **No redundant cache invalidation on rename** – Tag toggles only
 *     update the cached entry via `updateCachedFileName`.  Full
 *     invalidation is reserved for add / remove operations.
 */
export function useSpecimenPhotos() {
  const appStore = useAppStore()

  // ── reactive state ───────────────────────────────────────────────────
  const selectedType = ref('matched')
  const selectedFolder = ref(null)
  const selectedFolderKey = ref(null)
  const images = shallowRef([])
  const loadingImages = ref(false)
  const tagCounts = ref({})          // { folderKey: { s: n } }

  const snackbar = ref({ show: false, message: '', color: 'success', timeout: 3500 })

  // ── derived lists ────────────────────────────────────────────────────
  const matchedFolders = computed(() => appStore.specimensPhotosFolderResult?.matching || [])
  const unmatchedFolders = computed(() => appStore.specimensPhotosFolderResult?.nonmatching || [])

  const folders = computed(() =>
    selectedType.value === 'matched' ? matchedFolders.value : unmatchedFolders.value,
  )

  const sortedFolders = computed(() =>
    [...folders.value].sort((a, b) => (a.folderName || '').localeCompare(b.folderName || '')),
  )

  // ── internals ────────────────────────────────────────────────────────
  let activeObjectUrls = []
  let _selectAbort = null

  // ── helpers ──────────────────────────────────────────────────────────
  function folderKeyOf(folder) {
    return folder?.fullPath || folder?.folderName || ''
  }

  function showSnackbar(message, color = 'success', timeout = 3500) {
    snackbar.value = { show: true, message, color, timeout }
  }

  function revokeActiveUrls() {
    for (const url of activeObjectUrls) {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    }
    activeObjectUrls = []
  }

  // ── display-file selection (single-pass) ─────────────────────────────
  function buildDisplayFiles(files) {
    const sorted = files.slice().sort((a, b) => a.name.localeCompare(b.name))

    const editBases = new Set()
    const parsedArr = new Array(sorted.length)
    for (let i = 0; i < sorted.length; i++) {
      const p = parseFilename(sorted[i].name)
      parsedArr[i] = p
      if (p.edit) editBases.add(p.base + p.ext)
    }

    const display = []
    const seen = new Set()
    for (let i = 0; i < sorted.length; i++) {
      const p = parsedArr[i]
      const key = p.base + p.ext
      if (p.edit) {
        if (!seen.has(key)) { display.push(sorted[i]); seen.add(key) }
      } else if (!editBases.has(key) && !seen.has(key)) {
        display.push(sorted[i]); seen.add(key)
      }
    }
    return display
  }

  // ── tag count computation ────────────────────────────────────────────

  async function computeAllTagCounts(foldersArr) {
    const BATCH = 16
    const out = {}
    for (let i = 0; i < foldersArr.length; i += BATCH) {
      const batch = foldersArr.slice(i, i + BATCH)
      const results = await Promise.all(batch.map(async (f) => {
        const files = await getCachedFiles(f.handle)
        return { key: folderKeyOf(f), counts: countTaggedFilesMulti(files, ['s']) }
      }))
      for (const { key, counts } of results) out[key] = counts
    }
    tagCounts.value = out
  }

  function getTagCount(folder, letter) {
    return tagCounts.value[folderKeyOf(folder)]?.[letter] || 0
  }

  /**
   * Incremental: adjust the count for one folder by `delta` for a given
   * tag letter.  Avoids re-scanning files.
   */
  function adjustTagCount(folder, letter, delta) {
    const key = folderKeyOf(folder)
    const prev = tagCounts.value[key] || {}
    const cur = (prev[letter] || 0) + delta
    tagCounts.value = { ...tagCounts.value, [key]: { ...prev, [letter]: Math.max(0, cur) } }
  }

  /**
   * Re-scan the selected folder only (used after add/remove operations
   * where we can't simply ±1).
   */
  async function rescanSelectedFolderTagCount() {
    if (!selectedFolder.value) return
    const files = await getCachedFiles(selectedFolder.value.handle)
    const counts = countTaggedFilesMulti(files, ['s'])
    const key = folderKeyOf(selectedFolder.value)
    tagCounts.value = { ...tagCounts.value, [key]: counts }
  }

  // ── watchers ─────────────────────────────────────────────────────────
  watch(
    () => appStore.specimensPhotosFolderResult,
    async (res) => {
      if (!res) return
      const all = [...(res.matching || []), ...(res.nonmatching || [])].filter(f => f.hasImages)
      await computeAllTagCounts(all)
    },
    { immediate: true },
  )

  // ── type switch ──────────────────────────────────────────────────────
  function onTypeChange(val) {
    selectedType.value = val
    selectedFolder.value = null
    selectedFolderKey.value = null
    revokeActiveUrls()
    images.value = []
  }

  watch(selectedType, () => {
    selectedFolder.value = null
    selectedFolderKey.value = null
    revokeActiveUrls()
    images.value = []
  })

  // ── folder selection & image loading ─────────────────────────────────

  async function selectFolder(item) {
    if (_selectAbort) _selectAbort.abort()
    const ctrl = new AbortController()
    _selectAbort = ctrl

    selectedFolder.value = item
    selectedFolderKey.value = folderKeyOf(item)
    revokeActiveUrls()
    images.value = []
    loadingImages.value = true

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (ctrl.signal.aborted) return

    try {
      const allFiles = await getCachedFiles(item.handle)
      if (ctrl.signal.aborted) return

      const displayFiles = buildDisplayFiles(allFiles)
      if (ctrl.signal.aborted) return

      const BATCH = 24
      const result = []
      for (let i = 0; i < displayFiles.length; i += BATCH) {
        if (ctrl.signal.aborted) return
        const batch = displayFiles.slice(i, i + BATCH)
        const loaded = await Promise.all(batch.map(async (entry) => {
          const file = await entry.handle.getFile()
          const url = URL.createObjectURL(file)
          activeObjectUrls.push(url)
          return { name: entry.name, url, handle: entry.handle }
        }))
        result.push(...loaded)
      }

      if (ctrl.signal.aborted) return
      images.value = result.sort((a, b) => a.name.localeCompare(b.name))

      await Promise.resolve()
      const el = document.querySelector(`[data-folder-key="${CSS.escape(folderKeyOf(item))}"]`)
      if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.focus?.() }
    } catch (e) {
      if (!ctrl.signal.aborted) images.value = []
    } finally {
      if (!ctrl.signal.aborted) loadingImages.value = false
    }
  }

  // ── cache helpers (called by Index.vue after file operations) ────────

  function updateFileInCache(folderHandle, oldName, newName, newHandle) {
    updateCachedFileName(folderHandle, oldName, newName, newHandle)
  }

  function invalidateFolderCache(folderHandle) {
    invalidateFolder(folderHandle)
  }

  async function refreshSelectedFolderImages() {
    if (!selectedFolder.value) return
    await selectFolder(selectedFolder.value)
  }

  async function refreshTagCounts() {
    const all = [...(matchedFolders.value || []), ...(unmatchedFolders.value || [])].filter(f => f.hasImages)
    if (all.length) await computeAllTagCounts(all)
  }

  // ── public API ───────────────────────────────────────────────────────
  return {
    selectedType,
    sortedFolders,
    selectedFolder,
    selectedFolderKey,
    images,
    loadingImages,
    tagCounts,
    snackbar,

    matchedFolders,
    unmatchedFolders,

    getTagCount,
    adjustTagCount,
    rescanSelectedFolderTagCount,
    selectFolder,
    onTypeChange,
    showSnackbar,
    folderKeyOf,
    refreshTagCounts,
    refreshSelectedFolderImages,
    invalidateFolderCache,
    updateFileInCache,
    buildDisplayFiles,
  }
}

export const specimenPhotosStore = useSpecimenPhotos()
