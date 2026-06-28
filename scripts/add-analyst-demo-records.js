const Database = require('better-sqlite3');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('Usage: electron scripts/add-analyst-demo-records.js <path-to-sqlite>');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const before = {
  companies: db.prepare('SELECT COUNT(*) n FROM companies').get().n,
  people: db.prepare('SELECT COUNT(*) n FROM people').get().n,
};

const companies = [
  {
    duns: '812450991',
    company_name: 'Energia dla Przemysłu Sp. z o.o.',
    domain: 'energiadlaprzemyslu.pl',
    city: 'Katowice',
    region: 'Śląskie',
    industry: 'Doradztwo energetyczne dla przemysłu',
    sales_eur: 2150,
    employees_total: 58,
  },
  {
    duns: '745019283',
    company_name: 'GlassTech Components S.A.',
    domain: 'glasstechcomponents.pl',
    city: 'Łódź',
    region: 'Łódzkie',
    industry: 'Komponenty szklane dla produkcji',
    sales_eur: 4860,
    employees_total: 130,
  },
  {
    duns: '690337514',
    company_name: 'Nord Energy Systems Sp. z o.o.',
    domain: 'nordenergysystems.pl',
    city: 'Gdynia',
    region: 'Pomorskie',
    industry: 'Systemy energetyczne B2B',
    sales_eur: 1720,
    employees_total: 42,
  },
];

const people = [
  {
    duns: '812450991',
    first_name: 'Magdalena',
    last_name: 'Sikora',
    title: 'Dyrektor Operacyjna',
    email: 'm.sikora@energiadlaprzemyslu.pl',
    icp_profile: 'Operacje',
    ready_reason: 'gotowa: decydent operacyjny + mail osobisty',
  },
  {
    duns: '745019283',
    first_name: 'Paweł',
    last_name: 'Krawczyk',
    title: 'Kierownik ds. Zakupów Energii',
    email: 'p.krawczyk@glasstechcomponents.pl',
    icp_profile: 'Zakupy',
    ready_reason: 'gotowy: profil zakupowy + mail osobisty',
  },
  {
    duns: '690337514',
    first_name: 'Agnieszka',
    last_name: 'Rutkowska',
    title: 'Członek Zarządu ds. Finansów',
    email: 'a.rutkowska@nordenergysystems.pl',
    icp_profile: 'Finanse',
    ready_reason: 'gotowa: zarząd + mail osobisty',
  },
];

const insertCompany = db.prepare(`
  INSERT OR IGNORE INTO companies
    (duns, company_name, domain, city, region, country, industry, sales_eur,
     employees_total, employees_reliable, source, updated_by)
  VALUES
    (@duns, @company_name, @domain, @city, @region, 'PL', @industry, @sales_eur,
     @employees_total, 1, 'analyst_demo', 'ai')
`);

const insertPerson = db.prepare(`
  INSERT OR IGNORE INTO people
    (duns, first_name, last_name, title, email, email_type, contactability,
     source, is_dnb_anchor, icp_profile, apollo_status, ready_for_outreach,
     ready_reason, assessed_at, selected_for_outreach, optout, status, updated_by)
  VALUES
    (@duns, @first_name, @last_name, @title, @email, 'personal', 'A',
     'apollo', 0, @icp_profile, 'matched', 1,
     @ready_reason, datetime('now'), 0, 0, 'enriched', 'ai')
`);

const personId = db.prepare(`
  SELECT id
  FROM people
  WHERE duns=@duns AND first_name=@first_name AND last_name=@last_name AND title=@title
`);

const hasAnalystEvent = db.prepare(`
  SELECT COUNT(*) n
  FROM events
  WHERE entity_type='person' AND entity_id=? AND event_type='analyst_added'
`);

const insertEvent = db.prepare(`
  INSERT INTO events(entity_type, entity_id, event_type, actor, payload)
  VALUES('person', ?, 'analyst_added', 'ai', ?)
`);

const tx = db.transaction(() => {
  companies.forEach((company) => insertCompany.run(company));
  people.forEach((person) => {
    insertPerson.run(person);
    const row = personId.get(person);
    if (row && hasAnalystEvent.get(String(row.id)).n === 0) {
      insertEvent.run(String(row.id), JSON.stringify({
        label: 'Dodany przez Analityka',
        readyReason: person.ready_reason,
      }));
    }
  });
});

tx();

const after = {
  companies: db.prepare('SELECT COUNT(*) n FROM companies').get().n,
  people: db.prepare('SELECT COUNT(*) n FROM people').get().n,
};

console.log(JSON.stringify({ dbPath, before, after }, null, 2));
db.close();
