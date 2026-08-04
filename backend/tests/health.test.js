require('dotenv').config();
const request = require('supertest');
const { createApp } = require('../src/app');

describe('GET /api/health', () => {
  test('returns ok:true', async () => {
    const app = createApp(null);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
