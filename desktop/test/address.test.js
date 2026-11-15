const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAddress, isInsideApp } = require('../address');

test('turns what people type into an address', () => {
  assert.equal(normalizeAddress('bulkposting.igt.com'), 'https://bulkposting.igt.com');
  assert.equal(normalizeAddress(' https://bulkposting.igt.com/loads?x=1 '), 'https://bulkposting.igt.com');
  assert.equal(normalizeAddress('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizeAddress('localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizeAddress(''), null);
  assert.equal(normalizeAddress('ftp://x.com'), null);
});

test('tells BulkPosting links from other sites', () => {
  assert.equal(isInsideApp('https://bulkposting.igt.com/inquiries/4', 'https://bulkposting.igt.com'), true);
  assert.equal(isInsideApp('https://mail.google.com/mail/?view=cm', 'https://bulkposting.igt.com'), false);
  assert.equal(isInsideApp('not a url', 'https://bulkposting.igt.com'), false);
});
