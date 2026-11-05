// Shared GST cases (G-16): the same bills through the POS engine and the server's create_sale.
// Run: node --test tests/gst-vectors.test.mjs   (server part needs TEST_DATABASE_URL = Neon "qa" branch;
// everything it writes is inside one transaction that is rolled back, so nothing is kept).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { QA, repo } from '../scripts/workspace.mjs';

const { cases } = JSON.parse(fs.readFileSync(path.join(QA, 'vectors/gst-cases.json'), 'utf8'));
const envFile = path.join(QA, '.env');
if (!process.env.TEST_DATABASE_URL && fs.existsSync(envFile)) {
  const m = /^\s*TEST_DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(fs.readFileSync(envFile, 'utf8')); if (m) process.env.TEST_DATABASE_URL = m[1];
}

function posEngine() {
  const html = fs.readFileSync(path.join(repo('kiro-pos'), 'app/index.html'), 'utf8');
  const src = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('KIRO billing engine'));
  const box = { module: { exports: {} }, window: {} }; box.self = box.window; box.exports = box.module.exports;
  vm.runInNewContext(src, box);
  const E = Object.keys(box.module.exports).length ? box.module.exports : (box.window.KiroEngine || box.KiroEngine);
  assert.ok(E && E.computeBill, 'POS billing engine not found in kiro-pos/app/index.html');
  return E;
}
function pos(E, c) {
  const bill = E.computeBill({
    lines: c.lines.map((l, i) => ({ id: 'l' + i, unitPricePaise: l.pricePaise, qty: l.qty, taxComponents: l.gstPct ? [{ code: 'CGST', bp: l.gstPct * 50 }, { code: 'SGST', bp: l.gstPct * 50 }] : [] })),
    discount: c.discountPaise ? { type: 'amount', paise: c.discountPaise } : null,
    ctx: { regime: 'regular', pricesIncludeTax: true, roundToRupee: false },
  });
  const tax = (code) => bill.taxRows.filter((t) => t.code === code).reduce((s, t) => s + t.paise, 0);
  return { totalPaise: bill.total, cgstPaise: tax('CGST'), sgstPaise: tax('SGST'), taxPaise: tax('CGST') + tax('SGST') };
}
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

const E = posEngine();
const posOut = Object.fromEntries(cases.map((c) => [c.id, pos(E, c)]));
for (const c of cases) test(`POS engine: ${c.id}`, () => assert.deepEqual(pick(posOut[c.id], Object.keys(c.expect)), c.expect));

const URL = process.env.TEST_DATABASE_URL;
test('server create_sale matches the hand-worked cases and the POS engine', { skip: !URL && 'TEST_DATABASE_URL not set' }, async (t) => {
  const { Client } = createRequire(path.join(repo('kiro-backend'), 'api/package.json'))('pg');
  const db = new Client({ connectionString: URL, ssl: /localhost|127\.0\.0\.1/.test(URL) ? undefined : { rejectUnauthorized: false } });
  await db.connect();
  const server = {};
  try {
    await db.query('BEGIN');
    const { businessId, userId } = (await db.query("SELECT create_business('GST vectors (rolled back)','general','QA','gst-vectors-' || floor(random()*1e9)::text,'x') AS r")).rows[0].r;
    for (const c of cases) {
      const lines = [];
      for (const l of c.lines) {
        const id = (await db.query('INSERT INTO items (business_id, name, price_paise, gst_pct, track_stock) VALUES ($1,$2,$3,$4,false) RETURNING id', [businessId, c.id, l.pricePaise, l.gstPct])).rows[0].id;
        lines.push({ itemId: String(id), qty: l.qty });
      }
      const total = c.lines.reduce((s, l) => s + l.pricePaise * l.qty, 0) - c.discountPaise;
      const r = (await db.query('SELECT create_sale($1,$2,$3::jsonb) AS r', [businessId, userId, JSON.stringify({ lines, discountPaise: c.discountPaise, payments: [{ mode: 'CASH', amountPaise: total }] })])).rows[0].r;
      server[c.id] = { totalPaise: Number(r.totalPaise), cgstPaise: Number(r.cgstPaise), sgstPaise: Number(r.sgstPaise), taxPaise: Number(r.cgstPaise) + Number(r.sgstPaise) };
    }
  } finally { await db.query('ROLLBACK').catch(() => {}); await db.end(); }
  const report = [];
  for (const c of cases) {
    await t.test(`server: ${c.id}`, () => assert.deepEqual(pick(server[c.id], Object.keys(c.expect)), c.expect));
    const p = posOut[c.id], s = server[c.id];
    if (JSON.stringify(p) !== JSON.stringify(s)) report.push(`${c.id}: POS ${JSON.stringify(p)} vs server ${JSON.stringify(s)}`);
  }
  fs.mkdirSync(path.join(QA, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(QA, 'artifacts/gst-differences.txt'), report.join('\n') + '\n');
  if (report.length) console.log('POS and server differ (reported, not changed):\n  ' + report.join('\n  '));
});
