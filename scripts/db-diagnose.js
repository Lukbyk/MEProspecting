const Database = require('better-sqlite3');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: electron scripts/db-diagnose.js <path-to-sqlite>');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true, fileMustExist: true });

function count(sql) {
  return db.prepare(sql).get().n;
}

const summary = {
  dbPath,
  companies: count('SELECT COUNT(*) n FROM companies'),
  people: count('SELECT COUNT(*) n FROM people'),
  campaigns: count('SELECT COUNT(*) n FROM campaigns'),
  queue: count("SELECT COUNT(*) n FROM people WHERE status='awaiting_selection' AND campaign_id IS NOT NULL"),
  readyWithoutCampaign: count("SELECT COUNT(*) n FROM people WHERE ready_for_outreach=1 AND campaign_id IS NULL AND optout=0"),
  selected: count("SELECT COUNT(*) n FROM people WHERE status='selected'"),
  rejected: count("SELECT COUNT(*) n FROM people WHERE status='rejected'"),
  sent: count("SELECT COUNT(*) n FROM people WHERE status='sent'"),
};

const people = db.prepare(`
  SELECT p.id, p.first_name, p.last_name, p.status, p.campaign_id,
         p.ready_for_outreach, c.company_name
  FROM people p
  JOIN companies c ON c.duns = p.duns
  ORDER BY p.status, p.campaign_id, p.id
`).all();

console.log(JSON.stringify({ summary, people }, null, 2));
db.close();
process.exit(0);
