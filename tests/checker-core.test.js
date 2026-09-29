const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEntries, indexSellers, makeReport } = require('../checker-core');

test('parses consecutive ads.txt records and optional certification IDs', () => {
  const input = 'axonix.com, 57264, RESELLER axonix.com, 59215, RESELLER, bc385f2b4a87b721\nonetag.com, abc, DIRECT';
  const parsed = parseEntries(input);
  assert.equal(parsed.records.length, 3);
  assert.deepEqual(parsed.invalid, []);
  assert.equal(parsed.records[1].sellerId, '59215');
  assert.equal(parsed.records[1].certId, 'bc385f2b4a87b721');
  assert.equal(parsed.records[2].relationship, 'DIRECT');
});

test('keeps malformed records visible instead of silently dropping them', () => {
  const parsed = parseEntries('bad line\nexample.com, 123, UNKNOWN\nexample.com, 456, RESELLER');
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.invalid.length, 2);
  assert.equal(parsed.records[0].sellerId, '456');
});

test('indexes sellers for exact ID lookup and rejects invalid files', () => {
  const sellers = indexSellers('{"sellers":[{"seller_id":"1063","seller_type":"INTERMEDIARY"}]}');
  assert.equal(sellers.get('1063').seller_type, 'INTERMEDIARY');
  assert.equal(sellers.has('106'), false);
  assert.throws(() => indexSellers('not json'), /Invalid JSON/);
  assert.throws(() => indexSellers('{"sellers":{}}'), /Missing sellers array/);
});

test('report includes totals and per-record outcomes', () => {
  const results = [
    { raw: 'a.com, 1, DIRECT', domain: 'a.com', status: 'found' },
    { raw: 'b.com, 2, RESELLER', domain: 'b.com', status: 'missing' },
    { raw: 'c.com, 3, RESELLER', domain: 'c.com', status: 'error', detail: 'HTTP 404' }
  ];
  const report = makeReport(results, [{ line: 4, raw: 'bad line' }]);
  assert.deepEqual(report.counts, { found: 1, missing: 1, error: 1, invalid: 1 });
  assert.match(report.text, /Found: 1.*ID missing: 1.*Errors: 1/);
  assert.match(report.text, /https:\/\/a\.com\/sellers\.json/);
  assert.match(report.text, /INVALID FORMAT\tbad line/);
});
