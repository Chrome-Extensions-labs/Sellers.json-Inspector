(function initCheckerCore(globalScope) {
  const recordStart = /(^|[\s;])((?:[a-z0-9-]+\.)+[a-z]{2,})\s*,/gi;
  const completeRecord = /^((?:[a-z0-9-]+\.)+[a-z]{2,})\s*,\s*([^,\s]+)\s*,\s*(DIRECT|RESELLER)(?:\s*,\s*([a-f0-9]+))?\s*$/i;

  function parseEntries(input) {
    const records = [];
    const invalid = [];

    String(input).split(/\r?\n/).forEach((line, lineIndex) => {
      if (!line.trim()) return;
      const starts = [];
      recordStart.lastIndex = 0;
      let match;
      while ((match = recordStart.exec(line)) !== null) {
        starts.push(match.index + match[1].length);
      }

      if (!starts.length) {
        invalid.push({ line: lineIndex + 1, raw: line.trim() });
        return;
      }
      if (line.slice(0, starts[0]).trim()) {
        invalid.push({ line: lineIndex + 1, raw: line.slice(0, starts[0]).trim() });
      }

      starts.forEach((start, index) => {
        const raw = line.slice(start, starts[index + 1] ?? line.length).trim().replace(/;$/, '').trim();
        const fields = completeRecord.exec(raw);
        if (!fields) {
          invalid.push({ line: lineIndex + 1, raw });
          return;
        }
        records.push({
          line: lineIndex + 1,
          raw,
          domain: fields[1].toLowerCase(),
          sellerId: fields[2],
          relationship: fields[3].toUpperCase(),
          certId: fields[4] || ''
        });
      });
    });

    return { records, invalid };
  }

  function indexSellers(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON');
    }
    if (!data || !Array.isArray(data.sellers)) {
      throw new Error('Missing sellers array');
    }
    const sellers = new Map();
    data.sellers.forEach(seller => {
      if (seller && seller.seller_id != null) sellers.set(String(seller.seller_id), seller);
    });
    return sellers;
  }

  function makeReport(results, invalid) {
    const counts = { found: 0, missing: 0, error: 0, invalid: invalid.length };
    results.forEach(result => { counts[result.status] += 1; });
    const lines = [
      'Seller ID check in sellers.json',
      `Total: ${results.length + invalid.length} | Found: ${counts.found} | ID missing: ${counts.missing} | Errors: ${counts.error} | Invalid format: ${counts.invalid}`,
      '',
      'Status\tRecord\tURL\tDetails'
    ];
    results.forEach(result => {
      const status = { found: 'FOUND', missing: 'ID MISSING', error: 'ERROR' }[result.status];
      lines.push([status, result.raw, `https://${result.domain}/sellers.json`, result.detail || ''].join('\t'));
    });
    invalid.forEach(item => lines.push(['INVALID FORMAT', item.raw, '', `Line ${item.line}`].join('\t')));
    return { counts, text: lines.join('\n') };
  }

  const api = { parseEntries, indexSellers, makeReport };
  globalScope.SELLERS_CHECKER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
