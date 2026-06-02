/**
 * Taxonomy matching utilities for taxa photos selector
 */

/**
 * Match two taxonomy objects strictly
 * All fields must match exactly (null === null, undefined === undefined)
 */
export function taxonomiesMatch(tax1, tax2) {
    if (!tax1 || !tax2) return false

    const fields = ['group', 'family', 'species', 'subspecies']

    return fields.every(field => {
        const v1 = tax1[field] ?? null
        const v2 = tax2[field] ?? null
        return v1 === v2
    })
}

/**
 * Generate unique key for taxonomy object
 */
export function getTaxonomyKey(taxonomy) {
  if (!taxonomy) return 'null'
  const norm = (v) => {
    if(!v) return ''

    const s = String(v ?? '').trim().toLowerCase()
    return s === '' ? null : s
  }
  return norm(taxonomy.group) + '|' + norm(taxonomy.family) + '|' + norm(taxonomy.species) + '|' + norm(taxonomy.subspecies)
}

/**
 * Get display name for taxon (Family – Species or Family – Subspecies)
 */
export function getTaxonDisplayName(taxonomy) {
    if (!taxonomy) return 'Unknown'

    const family = taxonomy.family || 'Unknown family'
    const name = taxonomy.subspecies || taxonomy.species || 'Unknown species'

    return `${family} – ${name}`
}

/**
 * Get full taxonomy path for display (Group / Family / Species or Subspecies)
 */
export function getTaxonFullPath(taxonomy) {
    if (!taxonomy) return ''

    const parts = []
    if (taxonomy.group) parts.push(String(taxonomy.group).trim())
    if (taxonomy.family) parts.push(String(taxonomy.family).trim())
    if (taxonomy.subspecies) {
        parts.push(String(taxonomy.subspecies).trim())
    } else if (taxonomy.species) {
        parts.push(String(taxonomy.species).trim())
    }

    return parts.filter(Boolean).join(' / ')
}

/**
 * Normalize specimen matching bits
 */
function norm(v) { return String(v ?? '').trim() }
function sameAccletter(a, b) { return norm(a) === norm(b) } // '' === undefined
function sameNumber(a, b) { return norm(a) === norm(b) }
function sameInitials(a, b) { return norm(a).toUpperCase() === norm(b).toUpperCase() }

// Shared sort comparator
function sortByTaxonomy(a, b) {
  const t1 = a.taxonomy || a
  const t2 = b.taxonomy || b
  if ((t1.group || '') !== (t2.group || '')) return (t1.group || '').localeCompare(t2.group || '')
  if ((t1.family || '') !== (t2.family || '')) return (t1.family || '').localeCompare(t2.family || '')
  if ((t1.species || '') !== (t2.species || '')) return (t1.species || '').localeCompare(t2.species || '')
  return (t1.subspecies || '').localeCompare(t2.subspecies || '')
}

// Pre-group field notes by taxonomy key — O(N) one-time cost
function groupFieldNotesByTaxKey(fieldNotes) {
  const map = new Map()
  for (const fn of fieldNotes) {
    if (!fn?.taxonomy) continue
    const key = getTaxonomyKey(fn.taxonomy)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(fn)
  }
  return map
}

// Pre-index folders by specimen composite key — O(F) one-time cost
function indexFoldersBySpecimen(folders) {
  const map = new Map()
  for (const f of folders) {
    if (!f?.specimenMeta || !f.hasImages) continue
    const key = [
      norm(f.specimenMeta.initials).toUpperCase(),
      norm(f.specimenMeta.number),
      norm(f.specimenMeta.accletter),
    ].join('|')
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(f)
  }
  return map
}

/**
 * Build simple photographed specimens list:
 * Array of { specimenNumber, taxonomy, folders: [{folderName, fullPath, handle, hasImages}] }
 * Rules:
 * 1) keep checklist taxa present in field notes (taxonomy equality via getTaxonomyKey)
 * 2) for each matching field-notes entry, find folders by initials+number+accletter ('' == undefined), hasImages=true
 */
export function buildPhotographedSpecimens(checklistData, fieldNotesData, matchedFolders, collectorShortNames) {
  const fieldNotes = fieldNotesData || []
  const folders = matchedFolders || []

  // Pre-index both sides — O(N) + O(F)
  const fnByTaxKey = groupFieldNotesByTaxKey(fieldNotes)
  const foldersBySpecimen = indexFoldersBySpecimen(folders)

  const checklistTaxa = (checklistData || []).map(x => x.taxonomy || x)

  // Pre-compute taxonomy key set for filtering — O(T)
  const fnTaxKeys = new Set(fnByTaxKey.keys())
  const presentChecklistTaxa = checklistTaxa.filter(t => fnTaxKeys.has(getTaxonomyKey(t)))

  const result = []

  for (const taxon of presentChecklistTaxa) {
    const taxKey = getTaxonomyKey(taxon)
    const matchingFn = fnByTaxKey.get(taxKey) || []

    for (const fnEntry of matchingFn) {
      const sn = fnEntry.specimenNumber || {}
      const initials = norm(sn.initials) || norm(collectorShortNames?.[sn.name])
      const specimenKey = [
        norm(initials).toUpperCase(),
        norm(sn.number),
        norm(sn.accletter),
      ].join('|')

      const matched = (foldersBySpecimen.get(specimenKey) || []).map(f => ({
        folderName: f.folderName,
        fullPath: f.fullPath,
        handle: f.handle,
        hasImages: !!f.hasImages,
      }))

      result.push({
        specimenNumber: {
          name: sn.name || '',
          initials,
          number: sn.number,
          accletter: norm(sn.accletter),
        },
        taxonomy: taxon,
        folders: matched,
      })
    }
  }

  result.sort((a, b) => {
    const st = sortByTaxonomy(a, b)
    if (st !== 0) return st
    return String(a.specimenNumber?.number || '').localeCompare(String(b.specimenNumber?.number || ''))
  })

  return result
}

/**
 * Build photographed taxa: one entry per CHECKLIST taxon with aggregated folders
 * - Keep only checklist taxa present in field notes (taxonomy-equal)
 * - For each matching field notes entry, locate existing folders (initials, number, accletter; '' == undefined)
 * - Aggregate unique folders per checklist taxon; include only taxa that have at least one matching folder
 */
export function buildPhotographedTaxa(checklistData, fieldNotesData, matchedFolders, collectorShortNames) {
  const fieldNotes = fieldNotesData || []
  const folders = matchedFolders || []

  // Pre-index both sides — O(N) + O(F), done once
  const fnByTaxKey = groupFieldNotesByTaxKey(fieldNotes)
  const foldersBySpecimen = indexFoldersBySpecimen(folders)

  const checklistTaxa = (checklistData || []).map(x => x.taxonomy || x)
  const result = []

  for (const taxon of checklistTaxa) {
    const taxKey = getTaxonomyKey(taxon)          // computed once per taxon
    const matchingFn = fnByTaxKey.get(taxKey)
    if (!matchingFn) continue

    const seen = new Set()
    const uniqFolders = []

    for (const fnEntry of matchingFn) {
      const sn = fnEntry.specimenNumber || {}
      const initials = norm(sn.initials) || norm(collectorShortNames?.[sn.name])
      const specimenKey = [
        norm(initials).toUpperCase(),
        norm(sn.number),
        norm(sn.accletter),
      ].join('|')

      for (const f of (foldersBySpecimen.get(specimenKey) || [])) {
        const id = f.fullPath || f.folderName
        if (!seen.has(id)) {
          seen.add(id)
          uniqFolders.push({
            folderName: f.folderName,
            fullPath: f.fullPath,
            handle: f.handle,
            hasImages: !!f.hasImages,
          })
        }
      }
    }

    if (uniqFolders.length) {
      result.push({ taxonomy: taxon, folders: uniqFolders })
    }
  }

  return result.sort(sortByTaxonomy)
}
