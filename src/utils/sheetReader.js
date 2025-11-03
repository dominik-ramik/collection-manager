import * as XLSX from 'xlsx'

export default {
  async readSheet(buffer, sheetName, mapping, dataPostprocessor) {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error(`Sheet "${sheetName}" not found`)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (!rows.length) throw new Error('Sheet is empty')
    const headers = rows[0]
    const result = []
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]

      // Skip completely empty rows
      if (Array.isArray(row) && row.every(c => String(c ?? '').trim() === '')) {
        continue
      }

      const obj = {}
      
      for (const key in mapping) {
        const map = mapping[key]
        
        if (typeof map === 'string') {
          const colIdx = headers.indexOf(map)
          const value = colIdx !== -1 ? row[colIdx] : ''
          obj[key] = value ?? ''
        } else if (typeof map === 'object') {
          obj[key] = {}
          
          for (const subKey in map) {
            const colName = map[subKey]
            const colIdx = headers.indexOf(colName)
            const value = colIdx !== -1 ? row[colIdx] : ''
            obj[key][subKey] = value ?? ''
          }
        }
      }
      
      // Attach original Excel line number (1-based; header is row 1)
      const excelRow = i + 1
      obj.line_number = excelRow

      // Let postprocessor run, but ensure line_number is kept
      const processed = dataPostprocessor ? dataPostprocessor(obj) : obj
      if (processed && typeof processed === 'object' && processed.line_number == null) {
        processed.line_number = excelRow
      }
      result.push(processed)
    }
    
    return result
  }
}
