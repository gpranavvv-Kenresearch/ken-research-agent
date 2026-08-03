// check-sessions.cjs — for each given nickname, list every platform registry entry
// and whether its sessionDir actually exists on disk (not just registered).
//
// Usage: node scripts/check-sessions.cjs vishal vansh meenakshi hritika sameeksha

const fs = require('fs');
const path = require('path');

const names = process.argv.slice(2).map(n => n.toLowerCase());
if (!names.length) {
  console.log('Usage: node scripts/check-sessions.cjs <name> [name...]');
  process.exit(1);
}

const files = fs.readdirSync('.accounts').filter(f => f.endsWith('.json') && !f.includes('.bak'));

for (const name of names) {
  console.log(`==================== ${name} ====================`);
  for (const f of files) {
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join('.accounts', f), 'utf8')); } catch { continue; }
    const arr = Array.isArray(data) ? data : (data.accounts || Object.values(data));
    if (!Array.isArray(arr)) continue;
    const matches = arr.filter(a => a && typeof a === 'object' && (a.nickname || '').toLowerCase() === name);
    for (const a of matches) {
      const exists = a.sessionDir && fs.existsSync(a.sessionDir);
      console.log(`  ${f.replace('.json', '')}\t${a.username || a.email || '-'}\t${a.sessionDir}\t${exists ? 'EXISTS' : 'MISSING'}`);
    }
  }
}
