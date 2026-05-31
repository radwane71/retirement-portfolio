const XLSX = require('./node_modules/xlsx');

// ─── Read Excel ───────────────────────────────────────────────
const wb = XLSX.readFile('C:\\Users\\User\\Downloads\\Transactions_Updated_Names.xlsx');
const xlRows = XLSX.utils.sheet_to_json(wb.Sheets['عمليات التداول'], { defval: '' });

const typeMapEn = { 'Buy': 'buy', 'Sell': 'sell' };

const xlNorm = xlRows.map(r => ({
  date: String(r['التاريخ']).trim(),
  sym: String(r['رمز السهم']).trim(),
  name: r['السهم'],
  type: typeMapEn[r['النوع']] || r['النوع'],
  qty: Number(r['الكمية']),
  price: Number(r['السعر']),
}));

// ─── Fetch from Supabase ───────────────────────────────────────
async function fetchAllTransactions() {
  const url = 'https://mlqqxxpkzzquzftzvzfj.supabase.co';
  const key = 'sb_publishable_mm5KSAP5gWuVcYzrpsemGA_n7DeWR6j';

  let all = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const res = await fetch(`${url}/rest/v1/transactions?select=id,date,ticker,name,type,shares,price&order=date.asc,id.asc&limit=${pageSize}&offset=${from}`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      }
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  console.log('Fetching transactions from Supabase...');
  const dbRows = await fetchAllTransactions();
  console.log(`DB rows: ${dbRows.length} | Excel rows: ${xlNorm.length}\n`);

  // Normalize DB rows
  const dbNorm = dbRows.map(r => ({
    id: r.id,
    date: r.date,
    sym: String(r.ticker || '').trim(),
    name: r.name,
    type: r.type,
    qty: Number(r.shares),
    price: Number(r.price),
  }));

  // ─── Match Excel rows to DB rows by: sym + type + qty + price ─
  // Try to find each Excel row in DB and check if date matches

  // Build a map from DB: key = sym|type|qty|price → list of {id, date}
  const dbMap = {};
  dbNorm.forEach(r => {
    const k = `${r.sym}|${r.type}|${r.qty}|${r.price}`;
    if (!dbMap[k]) dbMap[k] = [];
    dbMap[k].push({ id: r.id, date: r.date, name: r.name });
  });

  // For each Excel row, try to match
  const usedDbIds = new Set();
  const mismatches = [];
  const notFound = [];
  const matched = [];

  xlNorm.forEach((xl, i) => {
    const k = `${xl.sym}|${xl.type}|${xl.qty}|${xl.price}`;
    const candidates = (dbMap[k] || []).filter(d => !usedDbIds.has(d.id));

    if (candidates.length === 0) {
      notFound.push({ xl, key: k });
      return;
    }

    // Find one with matching date first
    const exactDate = candidates.find(d => d.date === xl.date);
    if (exactDate) {
      usedDbIds.add(exactDate.id);
      matched.push({ xl, db: exactDate });
      return;
    }

    // No exact date match — take first available, flag as mismatch
    const pick = candidates[0];
    usedDbIds.add(pick.id);
    mismatches.push({ xl, db: pick, key: k });
  });

  // DB rows not used at all
  const unmatchedDb = dbNorm.filter(r => !usedDbIds.has(r.id));

  console.log(`✅ Matched (date correct): ${matched.length}`);
  console.log(`⚠️  Date mismatches: ${mismatches.length}`);
  console.log(`❌ Excel rows NOT found in DB: ${notFound.length}`);
  console.log(`❓ DB rows NOT matched to Excel: ${unmatchedDb.length}\n`);

  if (mismatches.length > 0) {
    console.log('=== DATE MISMATCHES (Excel date vs DB date) ===');
    console.log('Format: [Excel: date sym type qty@price] → DB id=X date=Y\n');
    mismatches.forEach(m => {
      console.log(`  XL: ${m.xl.date}  ${m.xl.sym.padEnd(5)} ${m.xl.type.padEnd(4)} ${m.xl.qty}@${m.xl.price}`);
      console.log(`  DB: ${m.db.date}  id=${m.db.id}  name=${m.db.name}`);
      console.log('');
    });
  }

  if (notFound.length > 0) {
    console.log('=== EXCEL ROWS NOT FOUND IN DB ===');
    notFound.forEach(m => {
      console.log(`  ${m.xl.date} ${m.xl.sym} ${m.xl.type} qty=${m.xl.qty} price=${m.xl.price}  key=${m.key}`);
    });
  }

  if (unmatchedDb.length > 0) {
    console.log('\n=== DB ROWS NOT MATCHED TO EXCEL ===');
    unmatchedDb.forEach(r => {
      console.log(`  id=${r.id} date=${r.date} ticker=${r.sym} type=${r.type} qty=${r.qty} price=${r.price} name=${r.name}`);
    });
  }
}

main().catch(console.error);
