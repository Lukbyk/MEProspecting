const Database = require('better-sqlite3');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: electron scripts/list-people.js <path-to-sqlite>');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(`
  SELECT p.id, p.first_name, p.last_name, p.title, p.status, p.campaign_id,
         p.ready_for_outreach, p.ready_reason, c.company_name
  FROM people p
  JOIN companies c ON c.duns = p.duns
  ORDER BY p.created_at DESC, p.id DESC
`).all();

console.table(rows);
db.close();
