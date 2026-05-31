import { ref, shallowRef, nextTick } from 'vue'
import { parseFilename, countTaggedFiles } from '@/utils/tagging'

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

  /**
   * Compute tag counts for all items
   */
  async function computeAllTagCounts(itemsArr) {
    const newCounts = {}
    for (const item of itemsArr) {
      const files = await getFilesForItem(item)
      const key = itemKeyFn(item)
      newCounts[key] = {
        [tagLetter]: countTaggedFiles(files, tagLetter)
      }
    }
    tagCounts.value = newCounts
  }

  /**
   * Get tag count for specific item
   */
  function getTagCount(item, letter) {
    const key = itemKeyFn(item)
    return tagCounts.value[key]?.[letter] || 0
  }

  /**
   * Select an item and load its images
   */
  async function selectItem(item) {
    selectedItem.value = item
    selectedItemKey.value = itemKeyFn(item)
    images.value = []
    loadingImages.value = true
    
    try {
      let loadedImages = await loadImagesFn(item)
      
      // Apply filter if provided
      if (filterImagesFn) {
        loadedImages = filterImagesFn(loadedImages)
      }
      
      // Prefer edit files over originals
      const displayFiles = preferEditFiles(loadedImages)
      
      images.value = displayFiles.sort((a, b) => a.name.localeCompare(b.name))
      
      await nextTick()
      
      // Scroll selected item into view
      if (document.activeElement) document.activeElement.blur()
      const listItem = document.querySelector(`[data-item-key="${CSS.escape(itemKeyFn(item))}"]`)
      if (listItem) {
        listItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        listItem.focus?.()
      }
    } catch (e) {
      images.value = []
      showSnackbar('Failed to load images: ' + e.message, 'error')
    } finally {
      loadingImages.value = false
    }
  }

  /**
   * Prefer edit files over originals when both exist
   */
  function preferEditFiles(files) {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
    const editBases = new Set()
    const parsedMap = new Map()

    for (const file of sorted) {
      const parsed = parseFilename(file.name)
      parsedMap.set(file, parsed)
      if (parsed.edit) editBases.add(parsed.base + parsed.ext)
    }

    const displayFiles = []
    const seenBases = new Set()
    for (const file of sorted) {
      const parsed = parsedMap.get(file)
      const baseKey = parsed.base + parsed.ext
      if (parsed.edit) {
        displayFiles.push(file)
        seenBases.add(baseKey)
      } else if (!seenBases.has(baseKey) && !editBases.has(baseKey)) {
        displayFiles.push(file)
        seenBases.add(baseKey)
      }
    }
    return displayFiles
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
    selectItem,
    navigateToNextUntagged,
    preferEditFiles,
    getFilesForItem,
  }
}
