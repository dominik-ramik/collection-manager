/**
 * Shared per-folder file listing cache.
 *
 * Caches enumerated image files per directory handle. Also maintains a
 * per-folder map of file-name → index for O(1) lookups and updates.
 *
 * Consumers call `invalidateFolder(handle)` only when files are truly
 * added or removed.  Renames are handled surgically via
 * `updateCachedFileName()` which never triggers re-enumeration.
 */

const IMAGE_RE = /\.(jpe?g|png|webp|tiff?)$/i

// cache entry: { files: [{name,handle}], nameIndex: Map<name,idx> }
const cache = new Map()

function buildIndex(files) {
  const idx = new Map()
  for (let i = 0; i < files.length; i++) idx.set(files[i].name, i)
  return idx
}

/**
 * Get cached file listing for a folder handle.
 * Returns array of { name, handle } objects (always the same reference
 * until the folder is invalidated).
 */
export async function getCachedFiles(folderHandle) {
  const existing = cache.get(folderHandle)
  if (existing) return existing.files

  const files = []
  for await (const [name, handle] of folderHandle.entries()) {
    if (handle.kind === 'file' && !name.startsWith('._') && IMAGE_RE.test(name)) {
      files.push({ name, handle })
    }
  }

  cache.set(folderHandle, { files, nameIndex: buildIndex(files) })
  return files
}

/**
 * Synchronous: returns cached files if available, otherwise null.
 */
export function getCachedFilesSync(folderHandle) {
  return cache.get(folderHandle)?.files ?? null
}

/** Invalidate cache for a specific folder handle. */
export function invalidateFolder(folderHandle) {
  cache.delete(folderHandle)
}

/** Invalidate all cached folders. */
export function invalidateAll() {
  cache.clear()
}

/** Check if a folder is cached. */
export function isCached(folderHandle) {
  return cache.has(folderHandle)
}

/**
 * Update a single file entry in place (rename).  O(1) via name index.
 * Does NOT trigger re-enumeration.
 */
export function updateCachedFileName(folderHandle, oldName, newName, newHandle) {
  const entry = cache.get(folderHandle)
  if (!entry) return

  const idx = entry.nameIndex.get(oldName)
  if (idx === undefined) return

  // Update both the array and the index
  entry.files[idx] = { name: newName, handle: newHandle }
  entry.nameIndex.delete(oldName)
  entry.nameIndex.set(newName, idx)
}

/**
 * Remove a file entry from the cache. O(1) lookup, O(n) splice but
 * typically called rarely (revert operations).
 */
export function removeCachedFile(folderHandle, fileName) {
  const entry = cache.get(folderHandle)
  if (!entry) return

  const idx = entry.nameIndex.get(fileName)
  if (idx === undefined) return

  entry.files.splice(idx, 1)
  // Rebuild index after splice (indices shifted)
  entry.nameIndex = buildIndex(entry.files)
}

/**
 * Add a file entry to the cache without re-reading the folder.
 */
export function addCachedFile(folderHandle, name, handle) {
  const entry = cache.get(folderHandle)
  if (!entry) return

  const newIdx = entry.files.length
  entry.files.push({ name, handle })
  entry.nameIndex.set(name, newIdx)
}
