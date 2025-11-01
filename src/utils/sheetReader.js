import * as XLSX from 'xlsx'

export default {
  async readSheet(buffer, sheetName, mapping, dataPostprocessor) {
    // buffer is ArrayBuffer
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    if (!rows.length) throw new Error('Sheet is empty')
    const headers = rows[0]
    const result = []
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const obj = {}
      for (const key in mapping) {
        const map = mapping[key]
        if (typeof map === 'string') {
          const colIdx = headers.indexOf(map)
          obj[key] = colIdx !== -1 ? row[colIdx] : undefined
        } else if (typeof map === 'object') {
          obj[key] = {}
          for (const subKey in map) {
            const colIdx = headers.indexOf(map[subKey])
            obj[key][subKey] = colIdx !== -1 ? row[colIdx] : undefined
          }
        }
      }
      result.push(dataPostprocessor ? dataPostprocessor(obj) : obj)
    }
    return result
  }
}
