const Database = require('better-sqlite3');

const dbPath = process.argv[2];
const campaignName = process.argv[3] || 'Energia B2B — gotowi od Analityka';

if (!dbPath) {
  console.error('Usage: electron scripts/add-ready-to-campaign.js <path-to-sqlite> [campaign-name]');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const ready = db.prepare(`
  SELECT p.id, p.first_name, p.last_name, p.title, c.company_name
  FROM people p
  JOIN companies c ON c.duns = p.duns
  WHERE p.ready_for_outreach = 1
    AND p.campaign_id IS NULL
    AND p.optout = 0
    AND p.status IN ('enriched', 'sourced')
  ORDER BY p.created_at DESC, p.id DESC
`).all();

const before = {
  readyWithoutCampaign: ready.length,
  queue: db.prepare(`
    SELECT COUNT(*) n
    FROM people
    WHERE status='awaiting_selection' AND campaign_id IS NOT NULL
  `).get().n,
};

if (ready.length === 0) {
  console.log(JSON.stringify({ dbPath, campaignName, before, added: 0, people: [] }, null, 2));
  db.close();
  process.exit(0);
}

const tx = db.transaction(() => {
  let campaign = db.prepare('SELECT id FROM campaigns WHERE name=?').get(campaignName);
  if (!campaign) {
    const result = db.prepare(`
      INSERT INTO campaigns(name, date_from, date_to, goal, status, updated_by)
      VALUES(?, date('now'), date('now', '+14 days'), ?, 'zaproponowana', 'ai')
    `).run(campaignName, 'Partia utworzona przez Prowadzącego kampanię z rekordów gotowych od Analityka.');
    campaign = { id: result.lastInsertRowid };
  }

  const updatePerson = db.prepare(`
    UPDATE people
    SET campaign_id = ?,
        status = 'awaiting_selection',
        selected_for_outreach = 0,
        updated_by = 'ai'
    WHERE id = ?
  `);
  const insertEvent = db.prepare(`
    INSERT INTO events(entity_type, entity_id, event_type, actor, payload)
    VALUES('person', ?, 'campaign_proposed', 'ai', ?)
  `);

  ready.forEach((person) => {
    updatePerson.run(campaign.id, person.id);
    insertEvent.run(String(person.id), JSON.stringify({
      label: `Dodany do kampanii: ${campaignName}`,
      campaignId: campaign.id,
      role: 'Prowadzący kampanię',
    }));
  });

  return campaign.id;
});

const campaignId = tx();

const after = {
  queue: db.prepare(`
    SELECT COUNT(*) n
    FROM people
    WHERE status='awaiting_selection' AND campaign_id IS NOT NULL
  `).get().n,
};

console.log(JSON.stringify({
  dbPath,
  campaignId,
  campaignName,
  before,
  after,
  added: ready.length,
  people: ready,
}, null, 2));

db.close();
