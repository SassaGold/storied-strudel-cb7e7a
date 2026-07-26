// Minimal RFC4180 CSV parse/serialise, preserving quoting on round-trip.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const needsQuote = (s) => /[",\r\n]/.test(s);
const enc = (s) => (needsQuote(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
const serialiseCsv = (rows) => rows.map((r) => r.map(enc).join(',')).join('\r\n') + '\r\n';

module.exports = { parseCsv, serialiseCsv };
