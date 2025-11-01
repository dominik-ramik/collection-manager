/**
 * Parse filename into { base, tag, edit, ext }
 * - base: filename without tagging area, " edit", or extension
 * - tag: string of lowercase letters in [+...] or ''
 * - edit: boolean, true if ends with " edit"
 * - ext: file extension (with dot)
 */
export function parseFilename(filename) {
  const extMatch = filename.match(/(\.[^.]+)$/)
  const ext = extMatch ? extMatch[1] : ''
  let name = ext ? filename.slice(0, -ext.length) : filename

  let edit = false
  if (name.endsWith(' edit')) {
    edit = true
    name = name.slice(0, -5)
  }

  const tagMatch = name.match(/\[\+([a-z]*)\]$/)
  let tag = ''
  if (tagMatch) {
    tag = tagMatch[1]
    name = name.slice(0, -tagMatch[0].length)
  }

  return { base: name, tag, edit, ext }
}

/**
 * Compose filename from parts
 */
export function composeFilename({ base, tag, edit, ext }) {
  let name = base
  if (tag && tag.length > 0) {
    name += `[+${tag}]`
  }
  if (edit) {
    name += ' edit'
  }
  return name + ext
}

/**
 * Toggle a tag letter in the filename, returns new filename
 * - If tag area missing, create it with the letter
 * - If tag area present, toggle the letter (add/remove, keep sorted)
 * - If tag area becomes empty, remove it
 * - Tag area is always before " edit" and before extension
 */
export function toggleTagLetter(filename, letter) {
  const parsed = parseFilename(filename)
  let tagArr = parsed.tag.split('').filter(Boolean)
  const idx = tagArr.indexOf(letter)
  if (idx !== -1) {
    tagArr.splice(idx, 1)
  } else {
    tagArr.push(letter)
  }
  tagArr = [...new Set(tagArr)].sort()
  parsed.tag = tagArr.join('')
  return composeFilename(parsed)
}

/**
 * Synchronize " edit" file's tagging area to match the main file
 * - Returns new filename for the edit file
 */
export function syncEditTag(mainFilename, editFilename) {
  const main = parseFilename(mainFilename)
  const edit = parseFilename(editFilename)
  edit.tag = main.tag
  return composeFilename(edit)
}

/**
 * Get the "edit" filename for a given file (if exists in files array)
 * - files: array of { name, handle }
 * - Returns file object or null
 */
export function findEditFile(files, filename) {
  const main = parseFilename(filename)
  return files.find(f => {
    const parsed = parseFilename(f.name)
    return (
      parsed.base === main.base &&
      parsed.edit === true &&
      parsed.ext === main.ext
    )
  }) || null
}

/**
 * Rename a file in the folder, with safety checks
 * - folderHandle: handle of the folder containing the file
 * - oldName: current name of the file
 * - newName: desired new name for the file
 */
export async function renameFileInFolder(folderHandle, oldName, newName) {
  // Defensive: Do not overwrite an existing file with the same name unless it's the same file
  if (oldName === newName) return;
  // Check if newName already exists and is not the same as oldName
  let newFileExists = false;
  try {
    await folderHandle.getFileHandle(newName);
    newFileExists = true;
  } catch (e) {
    newFileExists = false;
  }
  if (newFileExists) {
    throw new Error(`Cannot rename: target file "${newName}" already exists.`);
  }
  // Proceed with safe rename
  const oldFileHandle = await folderHandle.getFileHandle(oldName);
  const file = await oldFileHandle.getFile();
  const newFileHandle = await folderHandle.getFileHandle(newName, { create: true });
  const writable = await newFileHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  await folderHandle.removeEntry(oldName);
}

/**
 * Returns true if filename is tagged with the given letter
 */
export function hasTag(filename, letter) {
  const parsed = parseFilename(filename)
  return parsed.tag.includes(letter)
}

/**
 * Returns true if filename is an "edit" file
 */
export function isEditFile(filename) {
  const parsed = parseFilename(filename)
  return parsed.edit
}

/**
 * Create an "edit" copy of a file in the same folder
 * - Copies file and adds " edit" before extension (preserving tag area)
 * - Returns new filename
 */
export async function createEditCopy(folderHandle, filename) {
  const parsed = parseFilename(filename)
  if (parsed.edit) return filename // already edit
  parsed.edit = true
  const newName = composeFilename(parsed)
  // Defensive: do not overwrite
  try {
    await folderHandle.getFileHandle(newName)
    throw new Error('Edit file already exists')
  } catch {}
  const oldFileHandle = await folderHandle.getFileHandle(filename)
  const file = await oldFileHandle.getFile()
  const newFileHandle = await folderHandle.getFileHandle(newName, { create: true })
  const writable = await newFileHandle.createWritable()
  await writable.write(await file.arrayBuffer())
  await writable.close()
  return newName
}

/**
 * Count unique files tagged with a given letter.
 * - files: array of { name, handle }
 * - tagLetter: letter to count
 * - Treat "edit" and non-edit versions as one (count only once per base/ext)
 */
export function countTaggedFiles(files, tagLetter) {
  const seen = new Set()
  let count = 0
  for (const f of files) {
    const parsed = parseFilename(f.name)
    if (parsed.tag.includes(tagLetter)) {
      const key = parsed.base + parsed.ext // "edit" is ignored in key
      if (!seen.has(key)) {
        seen.add(key)
        count++
      }
    }
  }
  return count
}
