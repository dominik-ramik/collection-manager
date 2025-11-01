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
    
    // group
    if (row.taxonomy.group && row.taxonomy.group.includes('-')) {
      row.taxonomy.group = row.taxonomy.group.split('-').slice(1).join('-').trim()
    }
    
    if(row.taxonomy.speciesEpiteth && row.taxonomy.genus){
      row.taxonomy.species = `${row.taxonomy.genus} ${row.taxonomy.speciesEpiteth}`
    }
    if(row.taxonomy.subspeciesEpiteth && row.taxonomy.speciesEpiteth && row.taxonomy.genus){
      row.taxonomy.subspecies = `${row.taxonomy.genus} ${row.taxonomy.speciesEpiteth} ${row.taxonomy.subspeciesEpitethspeciesEpiteth}`
    }
  } else {
    row.hasError = "Unknown collector"
  }
  return row
}
