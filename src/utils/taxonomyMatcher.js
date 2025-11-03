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

/**
 * Build simple photographed specimens list:
 * Array of { specimenNumber, taxonomy, folders: [{folderName, fullPath, handle, hasImages}] }
 * Rules:
 * 1) keep checklist taxa present in field notes (taxonomy equality via getTaxonomyKey)
 * 2) for each matching field-notes entry, find folders by initials+number+accletter ('' == undefined), hasImages=true
 */
export function buildPhotographedSpecimens(checklistData, fieldNotesData, matchedFolders, collectorShortNames) {
    const checklistTaxa = (checklistData || []).map(x => x.taxonomy || x)
    const fieldNotes = fieldNotesData || []
    const folders = matchedFolders || []

    // Step 1: find checklist taxa present in field notes by taxonomy key
    const fnTaxKeys = new Set(fieldNotes
        .filter(fn => fn?.taxonomy)
        .map(fn => getTaxonomyKey(fn.taxonomy))
    )

    const presentChecklistTaxa = checklistTaxa.filter(t => fnTaxKeys.has(getTaxonomyKey(t)))

    // Step 2: for each present checklist taxon, list all matching field notes entries and their folders
    const result = []

    for (const taxon of presentChecklistTaxa) {
        const taxKey = getTaxonomyKey(taxon)
        const matchingFn = fieldNotes.filter(fn => fn?.taxonomy && getTaxonomyKey(fn.taxonomy) === taxKey)

        for (const fnEntry of matchingFn) {
            const sn = fnEntry.specimenNumber || {}
            // Prefer initials provided in field notes; fallback to name mapping if missing
            const initials = norm(sn.initials) || norm(collectorShortNames?.[sn.name])
            const number = sn.number
            const accletter = sn.accletter

            // Find matching folders (can be 0..n)
            const matched = folders.filter(f =>
                f?.specimenMeta &&
                f.hasImages &&
                sameInitials(f.specimenMeta.initials, initials) &&
                sameNumber(f.specimenMeta.number, number) &&
                sameAccletter(f.specimenMeta.accletter, accletter)
            ).map(f => ({
                folderName: f.folderName,
                fullPath: f.fullPath,
                handle: f.handle,
                hasImages: !!f.hasImages,
            }))

            result.push({
                specimenNumber: {
                    name: sn.name || '',
                    initials,
                    number,
                    accletter: norm(accletter), // normalize '' for consistency
                },
                taxonomy: taxon,
                folders: matched,
            })
        }
    }

    // Sort stable by taxonomy then specimen number
    result.sort((a, b) => {
        const t1 = a.taxonomy || {}
        const t2 = b.taxonomy || {}
        if ((t1.group || '') !== (t2.group || '')) return (t1.group || '').localeCompare(t2.group || '')
        if ((t1.family || '') !== (t2.family || '')) return (t1.family || '').localeCompare(t2.family || '')
        if ((t1.species || '') !== (t2.species || '')) return (t1.species || '').localeCompare(t2.species || '')
        if ((t1.subspecies || '') !== (t2.subspecies || '')) return (t1.subspecies || '').localeCompare(t2.subspecies || '')
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
    const checklistTaxa = (checklistData || []).map(x => x.taxonomy || x)
    const fieldNotes = fieldNotesData || []
    const folders = matchedFolders || []

    // 1) Find checklist taxa present in field notes
    const fnTaxKeys = new Set(
        fieldNotes.filter(fn => fn?.taxonomy).map(fn => getTaxonomyKey(fn.taxonomy))
    )
    const presentChecklistTaxa = checklistTaxa.filter(t => fnTaxKeys.has(getTaxonomyKey(t)))


    // 2) For each present taxon, collect folders from all matching field-notes entries
    const result = []
    for (const taxon of presentChecklistTaxa) {
        const taxKey = getTaxonomyKey(taxon)
        const matchingFn = fieldNotes.filter(fn => fn?.taxonomy && getTaxonomyKey(fn.taxonomy) === taxKey)

        const uniqFolders = []
        const seen = new Set()

        for (const fnEntry of matchingFn) {
            const sn = fnEntry.specimenNumber || {}
            // Prefer initials from field notes; fallback to name mapping
            const initials = norm(sn.initials) || norm(collectorShortNames?.[sn.name])
            const number = sn.number
            const accletter = sn.accletter

            for (const f of folders) {
                if (!f?.specimenMeta || !f.hasImages) continue
                if (
                    sameInitials(f.specimenMeta.initials, initials) &&
                    sameNumber(f.specimenMeta.number, number) &&
                    sameAccletter(f.specimenMeta.accletter, accletter)
                ) {
                    const id = f.fullPath || f.folderName
                    if (!seen.has(id)) {
                        seen.add(id)
                        uniqFolders.push(f)
                    }
                }
            }
        }

        if (uniqFolders.length) {
            result.push({ taxonomy: taxon, folders: uniqFolders })
        }
    }

    // 3) Sort
    const sortFn = (a, b) => {
        const t1 = a.taxonomy || a
        const t2 = b.taxonomy || b
        if ((t1.group || '') !== (t2.group || '')) return (t1.group || '').localeCompare(t2.group || '')
        if ((t1.family || '') !== (t2.family || '')) return (t1.family || '').localeCompare(t2.family || '')
        if ((t1.species || '') !== (t2.species || '')) return (t1.species || '').localeCompare(t2.species || '')
        return (t1.subspecies || '').localeCompare(t2.subspecies || '')
    }

    console.log(result)

    return result.sort(sortFn)
}
