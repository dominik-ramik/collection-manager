export { default } from './Index.vue'

// Collector name shortening lookup table (move outside function)
export const collectorShortNames = {
  'Ashley A McGuigan': 'AAM',
  'David Bruy': 'DB',
  'Dominik M. Ramik': 'DMR',
  'Gregory M. Plunkett': 'GMP',
  'Jérôme Munzinger': 'JM',
  'Kate Armstrong': 'KEA',
  'Keith E. Clancy': 'KEC',
  'Laurence Ramon': 'LR',
  'Michael J. Balick': 'MJB',
  'R. Sean Thackurdeen': 'RST',
  'Tom A. Ranker': 'TAR'
}

export function fieldNotePostprocess(row) {
  const name = row?.specimenNumber?.name
  if (name && collectorShortNames[name]) {
    row.specimenNumber.initials = collectorShortNames[name]

    if (row.taxonomy?.group && row.taxonomy.group.includes('-')) {
      row.taxonomy.group = row.taxonomy.group.split('-').slice(1).join('-').trim()
    }

    const genusName = row.taxonomy?.genus || ''
    const speciesEpithet = row.taxonomy?.speciesEpithet || ''
    const subspeciesEpithet = row.taxonomy?.subspeciesEpithet || ''

    if (speciesEpithet && genusName) {
      row.taxonomy.species = `${genusName} ${speciesEpithet}`.trim()
    }

    if (subspeciesEpithet && speciesEpithet && genusName) {
      row.taxonomy.subspecies = `${genusName} ${speciesEpithet} ${subspeciesEpithet}`.trim()
    }

    delete row.taxonomy.speciesEpithet
    delete row.taxonomy.subspeciesEpithet

  } else {
    row.hasError = "Unknown collector"
  }
  return row
}
