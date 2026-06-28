const Database = require('better-sqlite3');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: electron scripts/add-original-demo-records.js <path-to-sqlite>');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const before = {
  companies: db.prepare('SELECT COUNT(*) n FROM companies').get().n,
  people: db.prepare('SELECT COUNT(*) n FROM people').get().n,
  campaigns: db.prepare('SELECT COUNT(*) n FROM campaigns').get().n,
};

const companies = [
  { duns: '849693443', company_name: 'Świat Szkła Sp. z o.o.', domain: 'swiat-szkla.com.pl', city: 'Bielsko-Biała', region: 'Śląskie', industry: 'Produkcja szkła płaskiego', sales_eur: 630, employees_total: null, employees_reliable: 0 },
  { duns: '522817543', company_name: 'Prolinea Sp. z o.o.', domain: 'prolinea.eu', city: 'Wrocław', region: 'Dolnośląskie', industry: 'Produkcja szkła płaskiego', sales_eur: 251, employees_total: 5, employees_reliable: 1 },
  { duns: '369417940', company_name: 'Huta Szkła Biaglass Łużyce', domain: 'luzyce.pl', city: 'Pieńsk', region: 'Dolnośląskie', industry: 'Produkcja szkła gospodarczego', sales_eur: 180, employees_total: null, employees_reliable: 0 },
  { duns: '422404665', company_name: 'Spółdzielnia Pracy Huta Szkła Sława', domain: 'slawa.com.pl', city: 'Kielce', region: 'Świętokrzyskie', industry: 'Produkcja szkła gospodarczego', sales_eur: 10779, employees_total: null, employees_reliable: 0 },
  { duns: '989510751', company_name: 'Innovaglass Solution Sp. z o.o.', domain: 'innovaglasssolution.com', city: 'Warszawa', region: 'Mazowieckie', industry: 'Obróbka szkła', sales_eur: 61, employees_total: null, employees_reliable: 0 },
  { duns: '675248111', company_name: 'Photonroof P.S.A.', domain: 'misspv1.pl', city: 'Zaczernie', region: 'Podkarpackie', industry: 'Fotowoltaika / szkło', sales_eur: 121, employees_total: null, employees_reliable: 0 },
];

const campaigns = [
  { id: 1, name: 'Szkło H1 — Śląsk + Dolny Śląsk', date_from: '2026-06-12', date_to: '2026-06-30', status: 'aktywna', goal: 'Producenci szkła płaskiego, okno przed wakacjami' },
  { id: 2, name: 'Producenci szkła — Dolny Śląsk + Mazowsze', date_from: '2026-06-23', date_to: '2026-07-11', status: 'zaproponowana', goal: 'Kandydaci z mailem osobistym, gotowi do kontaktu. Okno przed sezonem letnim.' },
];

const people = [
  { duns: '849693443', first_name: 'Tomasz Edward', last_name: 'Olek', title: 'Prezes Zarządu', email: 't.olek@swiat-szkla.com.pl', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 0, campaign_id: 1, optout: 0, status: 'sent', created_at: '2026-06-11 17:35' },
  { duns: '849693443', first_name: 'Anna', last_name: 'Nowak', title: 'Dyrektor Operacyjny', email: 'a.nowak@swiat-szkla.com.pl', email_type: 'personal', contactability: 'A', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Operacje', ready_for_outreach: 1, ready_reason: 'gotowa: decydent operacyjny + mail osobisty', selected_for_outreach: 0, campaign_id: 2, optout: 0, status: 'awaiting_selection', created_at: '2026-06-12 02:14' },
  { duns: '849693443', first_name: 'Marek', last_name: 'Wiśniewski', title: 'Kierownik ds. Zakupów', email: null, email_type: 'none', contactability: 'B', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Zakupy', ready_for_outreach: 0, ready_reason: 'brak maila; do Apollo', selected_for_outreach: 0, campaign_id: null, optout: 0, status: 'sourced', created_at: '2026-06-13 09:05' },
  { duns: '522817543', first_name: 'Mirosław Jan', last_name: 'Piększa', title: 'Prezes Zarządu', email: 'm.pienksza@prolinea.eu', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 0, campaign_id: 1, optout: 0, status: 'sent', created_at: '2026-06-11 17:35' },
  { duns: '369417940', first_name: 'Leszek', last_name: 'Czemiel', title: 'Prezes Zarządu', email: 'sekretariat@luzyce.pl', email_type: 'generic', contactability: 'D', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 0, ready_reason: 'mail generyczny; do Apollo', selected_for_outreach: 0, campaign_id: null, optout: 0, status: 'sourced', created_at: '2026-06-11 17:35' },
  { duns: '369417940', first_name: 'Joanna', last_name: 'Lewandowska', title: 'Dyrektor Sprzedaży', email: 'j.lewandowska@luzyce.pl', email_type: 'personal', contactability: 'A', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Sprzedaż', ready_for_outreach: 1, ready_reason: 'gotowa: profil sprzedażowy + mail osobisty', selected_for_outreach: 0, campaign_id: 2, optout: 0, status: 'awaiting_selection', created_at: '2026-06-12 02:30' },
  { duns: '422404665', first_name: 'Jarosław Artur', last_name: 'Rogala', title: 'Prezes', email: 'sekretariat@slawa.com.pl', email_type: 'generic', contactability: 'D', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 0, ready_reason: 'optout', selected_for_outreach: 0, campaign_id: null, optout: 1, status: 'suppressed', created_at: '2026-06-11 17:35' },
  { duns: '989510751', first_name: 'Jacek Paweł', last_name: 'Witt', title: 'Prezes Zarządu', email: 'j.witt@innovaglasssolution.com', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 0, campaign_id: 1, optout: 0, status: 'replied', created_at: '2026-06-11 17:35' },
  { duns: '675248111', first_name: 'Dawid', last_name: 'Cycoń', title: 'Prezes Zarządu', email: 'd.cycon@misspv1.pl', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 1, campaign_id: 1, optout: 0, status: 'selected', created_at: '2026-06-11 17:35' },
  { duns: '675248111', first_name: 'Piotr', last_name: 'Zając', title: 'CTO', email: 'p.zajac@misspv1.pl', email_type: 'personal', contactability: 'A', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Techniczny', ready_for_outreach: 1, ready_reason: 'gotowy: profil techniczny + mail osobisty', selected_for_outreach: 0, campaign_id: 2, optout: 0, status: 'awaiting_selection', created_at: '2026-06-12 02:31' },
];

const insertCompany = db.prepare(`
  INSERT OR IGNORE INTO companies
    (duns, company_name, domain, city, region, country, industry, sales_eur,
     employees_total, employees_reliable, source, updated_by)
  VALUES
    (@duns, @company_name, @domain, @city, @region, 'PL', @industry, @sales_eur,
     @employees_total, @employees_reliable, 'demo', 'import')
`);

const insertCampaign = db.prepare(`
  INSERT OR IGNORE INTO campaigns(id, name, date_from, date_to, goal, status, updated_by)
  VALUES(@id, @name, @date_from, @date_to, @goal, @status, 'ai')
`);

const insertPerson = db.prepare(`
  INSERT OR IGNORE INTO people
    (duns, first_name, last_name, title, email, email_type, contactability,
     source, is_dnb_anchor, icp_profile, ready_for_outreach, ready_reason,
     selected_for_outreach, campaign_id, optout, status, created_at, updated_by)
  VALUES
    (@duns, @first_name, @last_name, @title, @email, @email_type, @contactability,
     @source, @is_dnb_anchor, @icp_profile, @ready_for_outreach, @ready_reason,
     @selected_for_outreach, @campaign_id, @optout, @status, @created_at, 'demo')
`);

const findPerson = db.prepare(`
  SELECT id FROM people
  WHERE duns=@duns AND first_name=@first_name AND last_name=@last_name AND title=@title
`);

const hasEvent = db.prepare(`
  SELECT COUNT(*) n FROM events
  WHERE entity_type='person' AND entity_id=? AND event_type=?
`);

const insertEvent = db.prepare(`
  INSERT INTO events(entity_type, entity_id, event_type, actor, payload, at)
  VALUES('person', ?, ?, ?, ?, ?)
`);

function addEvent(person, eventType, actor, label, at) {
  const row = findPerson.get(person);
  if (!row) return;
  if (hasEvent.get(String(row.id), eventType).n > 0) return;
  insertEvent.run(String(row.id), eventType, actor, JSON.stringify({ label }), at);
}

const tx = db.transaction(() => {
  companies.forEach((company) => insertCompany.run(company));
  campaigns.forEach((campaign) => insertCampaign.run(campaign));
  people.forEach((person) => insertPerson.run(person));

  addEvent(people[0], 'sent', 'operator', 'Wysłany mail #1 (kampania H1)', '2026-06-13 09:12');
  addEvent(people[3], 'sent', 'operator', 'Mail #1 wysłany', '2026-06-12 08:40');
  addEvent(people[3], 'followup_1', 'operator', 'Follow-up #1', '2026-06-16 09:05');
  addEvent(people[3], 'followup_2_silence', 'operator', 'Follow-up #2 — cisza', '2026-06-23 09:10');
  addEvent(people[7], 'sent', 'operator', 'Mail #1 wysłany', '2026-06-12 08:42');
  addEvent(people[7], 'replied', 'ai', 'ODPOWIEDŹ — zainteresowany', '2026-06-13 14:08');
});

tx();

const after = {
  companies: db.prepare('SELECT COUNT(*) n FROM companies').get().n,
  people: db.prepare('SELECT COUNT(*) n FROM people').get().n,
  campaigns: db.prepare('SELECT COUNT(*) n FROM campaigns').get().n,
};

console.log(JSON.stringify({ dbPath, before, after }, null, 2));
db.close();
