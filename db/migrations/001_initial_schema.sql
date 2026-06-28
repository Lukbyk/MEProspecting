-- =====================================================================
-- Blok 1 — schema bazy v2.  Skala: ~15k osób, dwóch aktorów (operator + AI).
-- Model: FIRMA (1) ──< OSOBY (N).
-- Zasady kluczowe:
--   • status FIRMY jest LICZONY (VIEW), nie zapisywany → brak konfliktu zapisu
--   • każdy rekord wie, kto go ruszył (updated_by) → konflikty są widoczne
--   • status osoby = maszyna stanów (dozwolone tylko zdefiniowane wartości)
--   • GOTOWOŚĆ do kampanii = JAWNA flaga ustawiana przez AI (Analityk), nie wyliczana
--   • optout na poziomie OSOBY/maila (decyzja projektowa); blokada firmy = wyjątek
--   • events = append-only historia kontaktu (kto/co/kiedy)
-- Próg migracji do Postgres: wejście DRUGIEGO operatora. Do tego SQLite+WAL wystarcza.
-- =====================================================================

-- Uwaga: PRAGMA journal_mode/foreign_keys ustawia db.js przy otwarciu połączenia.
-- W migracji ich nie ma — journal_mode nie może być zmieniany wewnątrz transakcji,
-- a runner aplikuje każdą migrację w transakcji.

-- ---------------------------------------------------------------------
-- companies — fakty o firmie. Klucz: DUNS. Bez statusu (status to VIEW).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  duns                    TEXT PRIMARY KEY,
  nip                     TEXT,
  company_name            TEXT NOT NULL,
  tradestyle              TEXT,
  domain                  TEXT,
  city                    TEXT,
  region                  TEXT,
  postal_code             TEXT,
  country                 TEXT,
  industry                TEXT,
  pkd                     TEXT,
  sales_eur               REAL,
  employees_total         INTEGER,
  employees_reliable      INTEGER DEFAULT 1,        -- 0 = wartość podejrzana (1 przy dużym przychodzie)
  is_headquarters         INTEGER,
  business_desc           TEXT,
  branch_group            TEXT,                      -- grupa możliwych oddziałów
  branch_flag             INTEGER DEFAULT 0,         -- 1 = do rozstrzygnięcia przez operatora
  branch_resolved         INTEGER DEFAULT 0,         -- 1 = operator już zdecydował
  blocked                 INTEGER DEFAULT 0,         -- WYJĄTEK: cała firma prosi o brak kontaktu
  blocked_reason          TEXT,
  direct_marketing_optout INTEGER,
  source                  TEXT DEFAULT 'dnb',
  imported_at             TEXT DEFAULT (datetime('now')),
  updated_by              TEXT DEFAULT 'import',     -- 'ai' | 'operator' | 'import'
  updated_at              TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comp_industry ON companies(industry);
CREATE INDEX IF NOT EXISTS idx_comp_region   ON companies(region);
CREATE INDEX IF NOT EXISTS idx_comp_branch   ON companies(branch_flag) WHERE branch_flag=1;

-- ---------------------------------------------------------------------
-- campaigns — partia wysyłkowa: nazwa + okno czasowe (MIĘKKA rama).
-- AI PROPONUJE kampanię (status 'zaproponowana') z gotowym składem + nazwą +
-- oknem + uzasadnieniem; OPERATOR ją potwierdza/edytuje → 'aktywna'.
-- Tentatywny skład propozycji: people.campaign_id ustawione, status osoby bez
-- zmian; potwierdzenie flipuje kampanię na 'aktywna' i osoby na 'selected'.
-- Osoba należy do jednej kampanii. Rama NIE blokuje wysyłki — tylko podpowiada.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  date_from   TEXT,                                  -- okno: od
  date_to     TEXT,                                  -- okno: do (miękka rama, tylko podpowiedź)
  goal        TEXT,                                  -- cel / uzasadnienie partii (od AI)
  status      TEXT NOT NULL DEFAULT 'zaproponowana'
              CHECK(status IN ('zaproponowana','planowana','aktywna','zamknieta')),
  created_at  TEXT DEFAULT (datetime('now')),
  updated_by  TEXT DEFAULT 'operator'
);

-- ---------------------------------------------------------------------
-- people — kandydaci (N na firmę). Łączy osoby z D&B i Apollo.
-- "Lead" w kampanii = osoba ze statusem >= selected. Status = pełny cykl życia.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS people (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  duns                    TEXT NOT NULL REFERENCES companies(duns),
  first_name              TEXT,
  last_name               TEXT,
  title                   TEXT,
  contact_level           TEXT,
  job_function            TEXT,
  email                   TEXT,
  email_type              TEXT CHECK(email_type IN ('personal','generic','none')),
  contactability          TEXT CHECK(contactability IN ('A','B','C','D')),
  phone                   TEXT,
  source                  TEXT CHECK(source IN ('dnb','apollo')),
  is_dnb_anchor           INTEGER DEFAULT 0,         -- prezes z D&B = kotwica, nie auto-target
  icp_profile             TEXT,                      -- profil stanowiskowy z ICP (po Apollo)
  apollo_status           TEXT CHECK(apollo_status IN ('pending','matched','not_found','skipped')),
  -- ── WERDYKT ANALITYKA: czy rekord nadaje się do przekazania człowiekowi ──
  -- AI (Analityk) buduje bazę i STEMPLUJE gotowość. GUI tylko czyta tę flagę.
  -- To NIE jest wyliczane z email_type — Analityk waży mail osobisty + dopasowanie
  -- stanowiska do ICP + sensowność firmy i podejmuje jawną decyzję.
  ready_for_outreach      INTEGER DEFAULT 0,         -- 1 = gotowy, wpuszczany do kolejki/kampanii
  ready_reason            TEXT,                      -- czemu tak/nie (np. 'brak maila osobistego')
  assessed_at             TEXT,                      -- kiedy Analityk ostatnio ocenił rekord
  selected_for_outreach   INTEGER DEFAULT 0,         -- ← JAWNY WYBÓR OPERATORA
  campaign_id             INTEGER REFERENCES campaigns(id),  -- partia, do której trafia (1 naraz)
  optout                  INTEGER DEFAULT 0,         -- ← optout na poziomie osoby
  -- pełny cykl życia: budowanie bazy → kampania (Blok 3-5)
  status                  TEXT NOT NULL DEFAULT 'sourced' CHECK(status IN (
                            'sourced','enriched','awaiting_selection','selected',
                            'sent','replied','qualified','booked',
                            'won','lost','nurture','rejected','suppressed')),
  last_touch_at           TEXT,
  followups_sent          INTEGER DEFAULT 0 CHECK(followups_sent <= 2),
  created_at              TEXT DEFAULT (datetime('now')),
  updated_by              TEXT DEFAULT 'import',     -- 'ai' | 'operator' | 'import'
  updated_at              TEXT DEFAULT (datetime('now')),
  UNIQUE(duns, last_name, first_name, title)         -- miękka ochrona przed duplikatem osoby
);

CREATE INDEX IF NOT EXISTS idx_people_duns     ON people(duns);
CREATE INDEX IF NOT EXISTS idx_people_status   ON people(status);
CREATE INDEX IF NOT EXISTS idx_people_selected ON people(selected_for_outreach) WHERE selected_for_outreach=1;
CREATE INDEX IF NOT EXISTS idx_people_email    ON people(email);
CREATE INDEX IF NOT EXISTS idx_people_contact  ON people(contactability);
CREATE INDEX IF NOT EXISTS idx_people_campaign ON people(campaign_id);
CREATE INDEX IF NOT EXISTS idx_people_ready    ON people(ready_for_outreach) WHERE ready_for_outreach=1;

-- auto-aktualizacja updated_at (recursive_triggers off = brak pętli)
CREATE TRIGGER IF NOT EXISTS people_touch AFTER UPDATE ON people
BEGIN UPDATE people SET updated_at=datetime('now') WHERE id=NEW.id; END;
CREATE TRIGGER IF NOT EXISTS comp_touch AFTER UPDATE ON companies
BEGIN UPDATE companies SET updated_at=datetime('now') WHERE duns=NEW.duns; END;

-- ---------------------------------------------------------------------
-- VIEW company_status — status firmy LICZONY z osób. Nikt go nie zapisuje.
--   nowa        : nikt jeszcze nie zaczepiony
--   napoczeta   : ktoś zaczepiony, ale są jeszcze niewykorzystani kandydaci
--   wyczerpana  : wszyscy kandydaci zaczepieni, brak pozytywu, brak rezerwy
--   w_grze      : ktoś odpowiedział / rozmowa w toku
--   klient      : wygrana
--   zablokowana : firma na blokadzie (wyjątek)
-- ---------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS company_status AS
WITH agg AS (
  SELECT duns,
    COUNT(*) AS n_people,
    SUM(CASE WHEN status IN ('sent','replied','qualified','booked','won','lost','nurture')
             THEN 1 ELSE 0 END) AS n_contacted,
    SUM(CASE WHEN status IN ('sourced','enriched','awaiting_selection','selected')
             AND optout=0 THEN 1 ELSE 0 END) AS n_available,
    SUM(CASE WHEN status IN ('sourced','enriched','awaiting_selection','selected')
             AND optout=0 AND ready_for_outreach=1 THEN 1 ELSE 0 END) AS n_ready,
    SUM(CASE WHEN status IN ('replied','qualified','booked','won')
             THEN 1 ELSE 0 END) AS n_positive,
    SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) AS n_won,
    SUM(CASE WHEN selected_for_outreach=1 THEN 1 ELSE 0 END) AS n_selected
  FROM people GROUP BY duns
)
SELECT
  c.duns, c.company_name, c.industry, c.region, c.branch_flag,
  COALESCE(a.n_people,0)    AS n_people,
  COALESCE(a.n_contacted,0) AS n_contacted,
  COALESCE(a.n_available,0) AS n_available,    -- ilu kandydatów jeszcze w rezerwie
  COALESCE(a.n_ready,0)     AS n_ready,        -- z rezerwy: ilu GOTOWYCH (werdykt Analityka)
  COALESCE(a.n_positive,0)  AS n_positive,
  COALESCE(a.n_selected,0)  AS n_selected,
  CASE
    WHEN c.blocked=1                      THEN 'zablokowana'
    WHEN COALESCE(a.n_won,0)      > 0      THEN 'klient'
    WHEN COALESCE(a.n_positive,0) > 0      THEN 'w_grze'
    WHEN COALESCE(a.n_contacted,0)= 0      THEN 'nowa'
    WHEN COALESCE(a.n_available,0)> 0      THEN 'napoczeta'   -- ← są jeszcze kandydaci
    ELSE 'wyczerpana'                                          -- ← rezerwa pusta
  END AS company_status
FROM companies c LEFT JOIN agg a ON a.duns=c.duns;

-- ---------------------------------------------------------------------
-- events — append-only historia kontaktu (kto/co/kiedy) per firma i osoba
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('company','person')),
  entity_id   TEXT NOT NULL,                          -- duns lub people.id
  event_type  TEXT NOT NULL,                          -- 'imported','enriched','selected',
                                                       -- 'sent','replied','optout','status_change'...
  actor       TEXT CHECK(actor IN ('ai','operator','system')),
  payload     TEXT,                                   -- JSON z detalami
  at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_type, entity_id, at);

-- ---------------------------------------------------------------------
-- suppression — optout na poziomie maila (sprawdzane przed każdą wysyłką)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppression (
  email      TEXT PRIMARY KEY,
  reason     TEXT,
  added_by   TEXT,
  added_at   TEXT DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------
-- staging + audyt importu
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_import (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id TEXT NOT NULL, row_json TEXT NOT NULL,
  imported_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, import_id TEXT NOT NULL, file_name TEXT,
  rows_in_file INTEGER, companies_new INTEGER, companies_dup INTEGER,
  people_new INTEGER, people_dup INTEGER,
  state_a INTEGER, state_b INTEGER, state_c INTEGER, state_d INTEGER,
  branch_flags INTEGER, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
);
