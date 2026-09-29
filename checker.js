document.addEventListener('DOMContentLoaded', () => {
  const { parseEntries, indexSellers, makeReport } = window.SELLERS_CHECKER;
  const input = document.getElementById('entries');
  const checkButton = document.getElementById('checkBtn');
  const copyButton = document.getElementById('copyBtn');
  const section = document.getElementById('resultsSection');
  const body = document.getElementById('resultsBody');
  const progress = document.getElementById('progress');
  let reportText = '';

  function fetchSellers(domain) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action: 'fetchUrl', url: `https://${domain}/sellers.json` }, response => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
            return;
          }
          if (!response?.success) {
            resolve({ error: response?.error || 'Could not load the file' });
            return;
          }
          try {
            resolve({ sellers: indexSellers(response.text) });
          } catch (error) {
            resolve({ error: error.message });
          }
        });
      } catch (error) {
        resolve({ error: error.message });
      }
    });
  }

  function addCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.appendChild(cell);
    return cell;
  }

  function renderRow(result) {
    const row = document.createElement('tr');
    row.className = `status-${result.status}`;
    addCell(row, { found: 'Found', missing: 'ID missing', error: 'Error', invalid: 'Invalid format' }[result.status]);
    addCell(row, result.raw);
    const urlCell = document.createElement('td');
    if (result.domain) {
      const link = document.createElement('a');
      link.href = `https://${result.domain}/sellers.json`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = result.domain;
      urlCell.appendChild(link);
    }
    row.appendChild(urlCell);
    addCell(row, result.detail || '');
    body.appendChild(row);
  }

  function renderSummary(results, invalid, completed, totalDomains) {
    const report = makeReport(results, invalid);
    document.getElementById('totalCount').textContent = String(results.length + invalid.length);
    document.getElementById('foundCount').textContent = String(report.counts.found);
    document.getElementById('missingCount').textContent = String(report.counts.missing);
    document.getElementById('errorCount').textContent = String(report.counts.error);
    document.getElementById('invalidCount').textContent = String(report.counts.invalid);
    progress.textContent = `${completed} of ${totalDomains} domains checked`;
    if (completed === totalDomains) {
      reportText = report.text;
      copyButton.disabled = false;
      progress.textContent = `Check complete. ${progress.textContent}.`;
    }
  }

  async function check() {
    const { records, invalid } = parseEntries(input.value);
    section.hidden = false;
    body.replaceChildren();
    reportText = '';
    copyButton.disabled = true;
    if (!records.length && !invalid.length) {
      progress.textContent = 'Paste at least one record.';
      ['totalCount', 'foundCount', 'missingCount', 'errorCount', 'invalidCount'].forEach(id => {
        document.getElementById(id).textContent = '0';
      });
      input.focus();
      return;
    }

    checkButton.disabled = true;
    const domains = [...new Set(records.map(record => record.domain))];
    const responses = new Map();
    let next = 0;
    let completed = 0;
    progress.textContent = `0 of ${domains.length} domains checked`;

    async function worker() {
      while (next < domains.length) {
        const domain = domains[next++];
        responses.set(domain, await fetchSellers(domain));
        completed += 1;
        progress.textContent = `${completed} of ${domains.length} domains checked`;
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(6, domains.length) }, () => worker()));
      const results = records.map(record => {
        const response = responses.get(record.domain);
        if (response.error) return { ...record, status: 'error', detail: response.error };
        const seller = response.sellers.get(record.sellerId);
        const sellerType = typeof seller?.seller_type === 'string'
          ? seller.seller_type.trim().toUpperCase()
          : '';
        return seller
          ? { ...record, status: 'found', detail: sellerType ? `Type: ${sellerType}` : '' }
          : { ...record, status: 'missing', detail: 'ID not found in sellers.json' };
      });
      results.forEach(renderRow);
      invalid.forEach(item => renderRow({ ...item, status: 'invalid', detail: `Line ${item.line}` }));
      renderSummary(results, invalid, completed, domains.length);
    } catch (error) {
      progress.textContent = `Check failed: ${error.message}`;
    } finally {
      checkButton.disabled = false;
    }
  }

  checkButton.addEventListener('click', check);
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      copyButton.textContent = 'Copied!';
      setTimeout(() => { copyButton.textContent = 'Copy Report'; }, 1500);
    } catch {
      progress.textContent = 'Could not copy the report.';
    }
  });
});
