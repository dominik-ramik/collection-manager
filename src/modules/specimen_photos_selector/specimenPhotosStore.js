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
 * 1.  **Eager ArrayBuffer blobs** – File bytes are read into RAM before
 *     createObjectURL so the browser paints without a FSAA round-trip
 *     at render time.
 *
 * 2.  **Look-ahead precache** – After selecting a folder the next
 *     PRECACHE_AHEAD folders are loaded in the background so sequential
 *     navigation is nearly instant.  Memory is bounded to
 *     (1 active + PRECACHE_AHEAD) folders; stale entries are revoked.
 *
 * 3.  **Incremental tag counts** – After a tag toggle we adjust the
 *     affected folder's count by ±1 instead of re-scanning all files.
 *     Full re-scans only happen on initial load or cache invalidation.
 *
 * 4.  **Single-pass display-file selection** – `buildDisplayFiles` runs
 *     one O(n) pass using a pre-built Set of edit bases.
 *
 * 5.  **In-place image updates** – On tag toggle the single changed
 *     entry in `images` is replaced directly by index.
 *
 * 6.  **Abort controller** – Rapid folder switching cancels in-flight
 *     loads so we never do redundant work.
 *
 * 7.  **No redundant cache invalidation on rename** – Tag toggles only
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
  let _tagCountsTimestamp = 0   // ms since epoch of last completed full tag-count load
  let _tagCountsLoading = false // prevents concurrent computeAllTagCounts runs

  // ── image precache ────────────────────────────────────────────────────
  const _precache = new Map()       // folderKey → { images, urls }  (resolved)
  const _precacheAborts = new Map() // folderKey → AbortController   (in-flight)
  const PRECACHE_AHEAD = 3

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

  function _revokePrecacheEntry(key) {
    const entry = _precache.get(key)
    if (entry) {
      for (const u of entry.urls) try { URL.revokeObjectURL(u) } catch {}
      _precache.delete(key)
    }
    const ctrl = _precacheAborts.get(key)
    if (ctrl) { ctrl.abort(); _precacheAborts.delete(key) }
  }

  function _clearPrecache() {
    for (const key of [..._precache.keys()]) _revokePrecacheEntry(key)
    for (const [key, ctrl] of [..._precacheAborts.entries()]) {
      ctrl.abort(); _precacheAborts.delete(key)
    }
  }

  // Load all images for a folder into RAM blobs; returns { images, urls } or null
  async function _loadImagesForFolder(item, signal) {
    try {
      const allFiles = await getCachedFiles(item.handle)
      if (signal?.aborted) return null
      const displayFiles = buildDisplayFiles(allFiles)
      if (signal?.aborted) return null
      const urls = []
      const images = []
      const BATCH = 24
      for (let i = 0; i < displayFiles.length; i += BATCH) {
        if (signal?.aborted) {
          for (const u of urls) try { URL.revokeObjectURL(u) } catch {}
          return null
        }
        const batch = displayFiles.slice(i, i + BATCH)
        const loaded = await Promise.all(batch.map(async (entry) => {
          const file = await entry.handle.getFile()
          const buf = await file.arrayBuffer()
          const blob = new Blob([buf], { type: file.type || 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          return { name: entry.name, url, handle: entry.handle }
        }))
        if (signal?.aborted) {
          for (const img of loaded) try { URL.revokeObjectURL(img.url) } catch {}
          for (const u of urls) try { URL.revokeObjectURL(u) } catch {}
          return null
        }
        for (const img of loaded) { urls.push(img.url); images.push(img) }
      }
      return { images, urls }
    } catch {
      return null
    }
  }

  function _precacheNextFolders(currentItem) {
    const list = sortedFolders.value
    const idx = list.findIndex(f => folderKeyOf(f) === folderKeyOf(currentItem))
    const wantedKeys = new Set()
    for (let i = idx + 1; i <= idx + PRECACHE_AHEAD && i < list.length; i++) {
      wantedKeys.add(folderKeyOf(list[i]))
    }
    // Evict entries outside the look-ahead window
    for (const key of [..._precache.keys(), ..._precacheAborts.keys()]) {
      if (!wantedKeys.has(key)) _revokePrecacheEntry(key)
    }
    // Start background loads for not-yet-cached entries
    for (let i = idx + 1; i <= idx + PRECACHE_AHEAD && i < list.length; i++) {
      const folder = list[i]
      const key = folderKeyOf(folder)
      if (_precache.has(key) || _precacheAborts.has(key)) continue
      const ctrl = new AbortController()
      _precacheAborts.set(key, ctrl)
      _loadImagesForFolder(folder, ctrl.signal).then(result => {
        _precacheAborts.delete(key)
        if (result) _precache.set(key, result)
      })
    }
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
    const BATCH = 48  // 3× more parallel I/O per round vs. previous 16
    const out = {}
    for (let i = 0; i < foldersArr.length; i += BATCH) {
      const batch = foldersArr.slice(i, i + BATCH)
      const results = await Promise.all(batch.map(async (f) => {
        const files = await getCachedFiles(f.handle)
        return { key: folderKeyOf(f), counts: countTaggedFilesMulti(files, ['s']) }
      }))
      for (const { key, counts } of results) out[key] = counts
      // Update reactively after each batch so the sidebar shows counts progressively
      tagCounts.value = { ...out }
    }
    _tagCountsTimestamp = Date.now()
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
      // Reset timestamp so the forced watcher re-scan runs even if data was recently fresh
      _tagCountsTimestamp = 0
      _tagCountsLoading = false
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
    _clearPrecache()
    images.value = []
  }

  watch(selectedType, () => {
    selectedFolder.value = null
    selectedFolderKey.value = null
    revokeActiveUrls()
    _clearPrecache()
    images.value = []
  })

  // ── folder selection & image loading ─────────────────────────────────

  async function selectFolder(item) {
    if (_selectAbort) _selectAbort.abort()
    const ctrl = new AbortController()
    _selectAbort = ctrl

    const key = folderKeyOf(item)
    // Abort any in-flight precache for this key (we'll load it ourselves)
    const precacheCtrl = _precacheAborts.get(key)
    if (precacheCtrl) { precacheCtrl.abort(); _precacheAborts.delete(key) }

    selectedFolder.value = item
    selectedFolderKey.value = key
    revokeActiveUrls()
    images.value = []

    // ── Precache hit: instant display ──────────────────────────────────
    const cached = _precache.get(key)
    if (cached) {
      _precache.delete(key)
      activeObjectUrls = cached.urls
      images.value = cached.images
      loadingImages.value = false
      _precacheNextFolders(item)
      await Promise.resolve()
      const el = document.querySelector(`[data-folder-key="${CSS.escape(key)}"]`)
      if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.focus?.() }
      return
    }

    // ── Cache miss: progressive load ───────────────────────────────────
    loadingImages.value = true
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (ctrl.signal.aborted) return

    try {
      const allFiles = await getCachedFiles(item.handle)
      if (ctrl.signal.aborted) return

      const displayFiles = buildDisplayFiles(allFiles)
      if (ctrl.signal.aborted) return

      const BATCH = 24
      // Pre-allocate the result array to avoid repeated spreads during progressive loading
      const allLoaded = new Array(displayFiles.length)
      let firstBatch = true
      for (let i = 0; i < displayFiles.length; i += BATCH) {
        if (ctrl.signal.aborted) return
        const batch = displayFiles.slice(i, i + BATCH)
        const loaded = await Promise.all(batch.map(async (entry) => {
          const file = await entry.handle.getFile()
          const buf = await file.arrayBuffer()
          const blob = new Blob([buf], { type: file.type || 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          activeObjectUrls.push(url)
          return { name: entry.name, url, handle: entry.handle }
        }))
        if (ctrl.signal.aborted) return
        for (let j = 0; j < loaded.length; j++) allLoaded[i + j] = loaded[j]
        // Assign a fresh slice so shallowRef triggers reactivity for progressive display
        images.value = allLoaded.slice(0, i + loaded.length)
        // Clear the spinner after the first visible batch so images appear immediately
        if (firstBatch) { loadingImages.value = false; firstBatch = false }
      }

      if (ctrl.signal.aborted) return
      await Promise.resolve()
      const el = document.querySelector(`[data-folder-key="${CSS.escape(key)}"]`)
      if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.focus?.() }
      _precacheNextFolders(item)
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
    _clearPrecache()
  }

  async function refreshSelectedFolderImages() {
    if (!selectedFolder.value) return
    await selectFolder(selectedFolder.value)
  }

  async function refreshTagCounts() {
    // Skip if a load is already in flight, or data is fresh (< 30 s old)
    if (_tagCountsLoading) return
    if (_tagCountsTimestamp > 0 && Date.now() - _tagCountsTimestamp < 30_000) return
    _tagCountsLoading = true
    try {
      const all = [...(matchedFolders.value || []), ...(unmatchedFolders.value || [])].filter(f => f.hasImages)
      if (all.length) await computeAllTagCounts(all)
    } finally {
      _tagCountsLoading = false
    }
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
