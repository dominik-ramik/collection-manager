import { ref, shallowRef, nextTick } from 'vue'
import { parseFilename, countTaggedFiles, countTaggedFilesMulti } from '@/utils/tagging'

/**
 * Shared composable for photo selector modules
 * Provides common state management and logic for both specimen and taxa photo selectors
 * 
 * @param {Object} config - Configuration object
 * @param {String} config.tagLetter - Which tag letter to work with ('s' or 't')
 * @param {Function} config.itemKeyFn - Function to generate unique key for items
 * @param {Function} config.getItemsFn - Function to get the list of items (computed)
 * @param {Function} config.loadImagesFn - Async function to load images for selected item
 * @param {Function} config.filterImagesFn - Optional function to filter images after loading
 */
export function usePhotoSelector(config) {
  const {
    tagLetter,
    itemKeyFn,
    getItemsFn,
    loadImagesFn,
    filterImagesFn = null
  } = config

  const selectedItem = ref(null)
  const selectedItemKey = ref(null)
  const images = shallowRef([])
  const loadingImages = ref(false)
  const tagCounts = ref({})
  
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

  // Persists across selectItem calls; keyed by itemKeyFn(item)
  const tagCountCache = new Map()

  async function computeAllTagCounts(itemsArr) {
    const entries = await Promise.all(
      itemsArr.map(async (item) => {
        const key = itemKeyFn(item)
        if (tagCountCache.has(key)) {
          return [key, tagCountCache.get(key)]
        }
        const files = await getFilesForItem(item)
        // countTaggedFilesMulti does a single O(N) pass for all letters
        const counts = countTaggedFilesMulti(files, [tagLetter])
        tagCountCache.set(key, counts)
        return [key, counts]
      })
    )
    tagCounts.value = Object.fromEntries(entries)
  }

  function getTagCount(item, letter) {
    const key = itemKeyFn(item)
    return tagCounts.value[key]?.[letter] ?? 0
  }

  function invalidateTagCount(item) {
    tagCountCache.delete(itemKeyFn(item))
  }

  let currentLoadId = 0

  /**
   * Select an item and load its images
   */
  async function selectItem(item) {
    const loadId = ++currentLoadId

    selectedItem.value = item
    selectedItemKey.value = itemKeyFn(item)
    images.value = []
    loadingImages.value = true

    try {
      let loadedImages = await loadImagesFn(item)
      if (loadId !== currentLoadId) return   // superseded by a newer click

      if (filterImagesFn) {
        loadedImages = filterImagesFn(loadedImages)
      }

      const displayFiles = preferEditFiles(loadedImages)
      images.value = displayFiles.sort((a, b) => a.name.localeCompare(b.name))

      await nextTick()
      if (loadId !== currentLoadId) return   // check again after nextTick

      if (document.activeElement) document.activeElement.blur()
      const listItem = document.querySelector(
        `[data-item-key="${CSS.escape(itemKeyFn(item))}"]`
      )
      if (listItem) {
        listItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        listItem.focus?.()
      }
    } catch (e) {
      if (loadId !== currentLoadId) return
      images.value = []
      showSnackbar('Failed to load images: ' + e.message, 'error')
    } finally {
      if (loadId === currentLoadId) {
        loadingImages.value = false
      }
    }
  }

  function preferEditFiles(files) {
    // Single pass: group by base+ext, prefer edit variant
    const byBase = new Map()   // baseKey → { edit: file|null, original: file|null }

    for (const file of files) {
      const parsed = parseFilename(file.name)
      const key = parsed.base + parsed.ext
      const slot = byBase.get(key) ?? { edit: null, original: null }
      if (parsed.edit) {
        slot.edit = file
      } else {
        slot.original = file
      }
      byBase.set(key, slot)
    }

    const result = []
    for (const { edit, original } of byBase.values()) {
      result.push(edit ?? original)
    }
    // Caller does the final sort; return unsorted to avoid double-sort
    return result
  }

  /**
   * Get files for an item (must be implemented by consumer)
   * This is a placeholder that should be overridden
   */
  async function getFilesForItem(item) {
    // Default implementation - should be overridden in config
    return []
  }

  /**
   * Navigate to next item without tags
   */
  function navigateToNextUntagged(currentIdx, items, direction = 1) {
    const step = direction
    let nextIdx = currentIdx
    let found = false
    
    // If no item selected, find first untagged
    if (currentIdx === -1 || currentIdx === null) {
      for (let i = 0; i < items.length; i++) {
        if (getTagCount(items[i], tagLetter) === 0) {
          nextIdx = i
          found = true
          break
        }
      }
    } else {
      // Search forward/backward from current position
      for (
        let i = currentIdx + step;
        direction > 0 ? i < items.length : i >= 0;
        i += step
      ) {
        if (getTagCount(items[i], tagLetter) === 0) {
          nextIdx = i
          found = true
          break
        }
      }
      
      // Wrap around if not found
      if (!found) {
        for (
          let i = direction > 0 ? 0 : items.length - 1;
          direction > 0 ? i < currentIdx : i > currentIdx;
          i += step
        ) {
          if (getTagCount(items[i], tagLetter) === 0) {
            nextIdx = i
            found = true
            break
          }
        }
      }
    }
    
    return found ? nextIdx : -1
  }

  return {
    // State
    selectedItem,
    selectedItemKey,
    images,
    loadingImages,
    tagCounts,
    snackbar,
    
    // Methods
    showSnackbar,
    computeAllTagCounts,
    getTagCount,
    invalidateTagCount,
    selectItem,
    navigateToNextUntagged,
    preferEditFiles,
    getFilesForItem,
  }
}
