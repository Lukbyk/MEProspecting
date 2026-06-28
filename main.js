// =====================================================================
// Proces główny Electron. Otwiera okno z GUI operatora, inicjalizuje
// lokalną bazę SQLite i wystawia kanały IPC, przez które renderer
// (GUI) czyta i pisze do bazy — bez bezpośredniego dostępu do dysku.
//
// Ścieżka do bazy jest KONFIGUROWALNA (przenosiny na inny komputer):
//   • zmienna środowiskowa PROSPECTING_DB ma pierwszeństwo
//   • inaczej: katalog userData aplikacji
// mcp-server-sqlite na maszynie operatora MUSI wskazywać TEN SAM plik.
// =====================================================================
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { openDatabase } = require('./db/db');

let db = null;
let dbPath = null;

function resolveDbPath() {
  // 1) jawna ścieżka przez PROSPECTING_DB ma pierwszeństwo (override).
  if (process.env.PROSPECTING_DB) return process.env.PROSPECTING_DB;
  // 2) DOMYŚLNIE baza leży W KATALOGU PROJEKTU (prospecting.sqlite). Jest gitignored,
  //    więc git push/pull NIGDY jej nie rusza — aktualizacja kodu nie nadpisuje danych.
  //    Każda maszyna trzyma własną bazę lokalnie, obok kodu.
  // 3) W spakowanej apce katalog to read-only asar → wtedy spadamy na userData.
  if (app.isPackaged) return path.join(app.getPath('userData'), 'prospecting.sqlite');
  return path.join(app.getAppPath(), 'prospecting.sqlite');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    title: 'Prospecting — Media Energetyczne',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function seedDemoData(db) {
  if (process.env.PROSPECTING_SEED_DEMO !== '1') return;
  const hasData = db.prepare('SELECT COUNT(*) n FROM companies').get().n > 0 ||
    db.prepare('SELECT COUNT(*) n FROM people').get().n > 0;
  if (hasData) {
    console.log('[DB] seed demo: pominięty, baza ma firmy lub osoby');
    return;
  }

  const insertCompany = db.prepare(`
    INSERT OR IGNORE INTO companies
      (duns, company_name, domain, city, region, industry, sales_eur,
       employees_total, employees_reliable, branch_flag, blocked, source)
    VALUES
      (@duns, @company_name, @domain, @city, @region, @industry, @sales_eur,
       @employees_total, @employees_reliable, @branch_flag, @blocked, 'demo')
  `);
  const insertCampaign = db.prepare(`
    INSERT OR IGNORE INTO campaigns(id, name, date_from, date_to, goal, status, updated_by)
    VALUES(@id, @name, @date_from, @date_to, @goal, @status, 'ai')
  `);
  const insertPerson = db.prepare(`
    INSERT OR IGNORE INTO people
      (id, duns, first_name, last_name, title, email, email_type, contactability,
       source, is_dnb_anchor, icp_profile, ready_for_outreach, ready_reason,
       selected_for_outreach, campaign_id, optout, status, created_at, updated_by)
    VALUES
      (@id, @duns, @first_name, @last_name, @title, @email, @email_type, @contactability,
       @source, @is_dnb_anchor, @icp_profile, @ready_for_outreach, @ready_reason,
       @selected_for_outreach, @campaign_id, @optout, @status, @created_at, @updated_by)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO events(entity_type, entity_id, event_type, actor, payload, at)
    VALUES('person', @entity_id, @event_type, @actor, @payload, @at)
  `);

  const tx = db.transaction(() => {
    [
      { duns: '849693443', company_name: 'Świat Szkła Sp. z o.o.', domain: 'swiat-szkla.com.pl', city: 'Bielsko-Biała', region: 'Śląskie', industry: 'Produkcja szkła płaskiego', sales_eur: 630, employees_total: null, employees_reliable: 0, branch_flag: 0, blocked: 0 },
      { duns: '522817543', company_name: 'Prolinea Sp. z o.o.', domain: 'prolinea.eu', city: 'Wrocław', region: 'Dolnośląskie', industry: 'Produkcja szkła płaskiego', sales_eur: 251, employees_total: 5, employees_reliable: 1, branch_flag: 0, blocked: 0 },
      { duns: '369417940', company_name: 'Huta Szkła Biaglass Łużyce', domain: 'luzyce.pl', city: 'Pieńsk', region: 'Dolnośląskie', industry: 'Produkcja szkła gospodarczego', sales_eur: 180, employees_total: null, employees_reliable: 0, branch_flag: 0, blocked: 0 },
      { duns: '989510751', company_name: 'Innovaglass Solution Sp. z o.o.', domain: 'innovaglasssolution.com', city: 'Warszawa', region: 'Mazowieckie', industry: 'Obróbka szkła', sales_eur: 61, employees_total: null, employees_reliable: 0, branch_flag: 0, blocked: 0 },
      { duns: '675248111', company_name: 'Photonroof P.S.A.', domain: 'misspv1.pl', city: 'Zaczernie', region: 'Podkarpackie', industry: 'Fotowoltaika / szkło', sales_eur: 121, employees_total: null, employees_reliable: 0, branch_flag: 0, blocked: 0 },
      { duns: '731904882', company_name: 'Energo-Szkło Technology Sp. z o.o.', domain: 'energoszklo.pl', city: 'Poznań', region: 'Wielkopolskie', industry: 'Szkło techniczne dla energetyki', sales_eur: 1840, employees_total: 76, employees_reliable: 1, branch_flag: 0, blocked: 0 },
      { duns: '614280337', company_name: 'TermoGlass Polska S.A.', domain: 'termoglass.pl', city: 'Gdańsk', region: 'Pomorskie', industry: 'Izolacje szklane / przemysł', sales_eur: 3920, employees_total: 144, employees_reliable: 1, branch_flag: 0, blocked: 0 },
    ].forEach(row => insertCompany.run(row));

    [
      { id: 1, name: 'Szkło H1 — Śląsk + Dolny Śląsk', date_from: '2026-06-12', date_to: '2026-06-30', status: 'aktywna', goal: 'Producenci szkła płaskiego, okno przed wakacjami' },
      { id: 2, name: 'Producenci szkła — Dolny Śląsk + Mazowsze', date_from: '2026-06-23', date_to: '2026-07-11', status: 'zaproponowana', goal: 'Kandydaci z mailem osobistym, gotowi do kontaktu. Okno przed sezonem letnim.' },
    ].forEach(row => insertCampaign.run(row));

    [
      { id: 1, duns: '849693443', first_name: 'Tomasz Edward', last_name: 'Olek', title: 'Prezes Zarządu', email: 't.olek@swiat-szkla.com.pl', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 0, campaign_id: 1, optout: 0, status: 'sent', created_at: '2026-06-11 17:35', updated_by: 'operator' },
      { id: 2, duns: '849693443', first_name: 'Anna', last_name: 'Nowak', title: 'Dyrektor Operacyjny', email: 'a.nowak@swiat-szkla.com.pl', email_type: 'personal', contactability: 'A', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Operacje', ready_for_outreach: 1, ready_reason: 'gotowa: decydent operacyjny + mail osobisty', selected_for_outreach: 0, campaign_id: 2, optout: 0, status: 'awaiting_selection', created_at: '2026-06-12 02:14', updated_by: 'ai' },
      { id: 3, duns: '522817543', first_name: 'Mirosław Jan', last_name: 'Piększa', title: 'Prezes Zarządu', email: 'm.pienksza@prolinea.eu', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 0, campaign_id: 1, optout: 0, status: 'sent', created_at: '2026-06-11 17:35', updated_by: 'operator' },
      { id: 4, duns: '369417940', first_name: 'Joanna', last_name: 'Lewandowska', title: 'Dyrektor Sprzedaży', email: 'j.lewandowska@luzyce.pl', email_type: 'personal', contactability: 'A', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Sprzedaż', ready_for_outreach: 1, ready_reason: 'gotowa: profil sprzedażowy + mail osobisty', selected_for_outreach: 0, campaign_id: 2, optout: 0, status: 'awaiting_selection', created_at: '2026-06-12 02:30', updated_by: 'ai' },
      { id: 5, duns: '989510751', first_name: 'Jacek Paweł', last_name: 'Witt', title: 'Prezes Zarządu', email: 'j.witt@innovaglasssolution.com', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 0, campaign_id: 1, optout: 0, status: 'replied', created_at: '2026-06-11 17:35', updated_by: 'ai' },
      { id: 6, duns: '675248111', first_name: 'Dawid', last_name: 'Cycoń', title: 'Prezes Zarządu', email: 'd.cycon@misspv1.pl', email_type: 'personal', contactability: 'A', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 1, ready_reason: 'mail osobisty z D&B', selected_for_outreach: 1, campaign_id: 1, optout: 0, status: 'selected', created_at: '2026-06-11 17:35', updated_by: 'operator' },
      { id: 7, duns: '731904882', first_name: 'Katarzyna', last_name: 'Kubiak', title: 'Dyrektor Operacyjna', email: 'k.kubiak@energoszklo.pl', email_type: 'personal', contactability: 'A', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Operacje', ready_for_outreach: 1, ready_reason: 'gotowa: decydent operacyjny + mail osobisty', selected_for_outreach: 0, campaign_id: null, optout: 0, status: 'enriched', created_at: '2026-06-22 08:10', updated_by: 'ai' },
      { id: 8, duns: '731904882', first_name: 'Robert', last_name: 'Maj', title: 'Prezes Zarządu', email: 'biuro@energoszklo.pl', email_type: 'generic', contactability: 'D', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 0, ready_reason: 'kotwica D&B; mail generyczny, do Apollo', selected_for_outreach: 0, campaign_id: null, optout: 0, status: 'sourced', created_at: '2026-06-22 08:11', updated_by: 'ai' },
      { id: 9, duns: '614280337', first_name: 'Michał', last_name: 'Wrona', title: 'Kierownik ds. Zakupów Energii', email: 'm.wrona@termoglass.pl', email_type: 'personal', contactability: 'A', source: 'apollo', is_dnb_anchor: 0, icp_profile: 'Zakupy', ready_for_outreach: 1, ready_reason: 'gotowy: profil zakupowy + mail osobisty', selected_for_outreach: 0, campaign_id: null, optout: 0, status: 'enriched', created_at: '2026-06-22 08:22', updated_by: 'ai' },
      { id: 10, duns: '614280337', first_name: 'Ewa', last_name: 'Lis', title: 'Członek Zarządu', email: null, email_type: 'none', contactability: 'B', source: 'dnb', is_dnb_anchor: 1, icp_profile: null, ready_for_outreach: 0, ready_reason: 'brak maila; wymaga wzbogacenia', selected_for_outreach: 0, campaign_id: null, optout: 0, status: 'sourced', created_at: '2026-06-22 08:23', updated_by: 'ai' },
    ].forEach(row => insertPerson.run(row));

    [
      { entity_id: '1', event_type: 'sent', actor: 'operator', payload: '{"label":"Wysłany mail #1 (kampania H1)"}', at: '2026-06-13 09:12' },
      { entity_id: '3', event_type: 'sent', actor: 'operator', payload: '{"label":"Mail #1 wysłany"}', at: '2026-06-12 08:40' },
      { entity_id: '3', event_type: 'followup_1', actor: 'operator', payload: '{"label":"Follow-up #1"}', at: '2026-06-16 09:05' },
      { entity_id: '3', event_type: 'followup_2_silence', actor: 'operator', payload: '{"label":"Follow-up #2 — cisza"}', at: '2026-06-23 09:10' },
      { entity_id: '5', event_type: 'sent', actor: 'operator', payload: '{"label":"Mail #1 wysłany"}', at: '2026-06-12 08:42' },
      { entity_id: '5', event_type: 'replied', actor: 'ai', payload: '{"label":"ODPOWIEDŹ — zainteresowany"}', at: '2026-06-13 14:08' },
    ].forEach(row => insertEvent.run(row));
  });

  tx();
  console.log('[DB] seed demo: dodano firmy, osoby, kampanie i eventy');
}

// ── kanały IPC: warstwa danych pod GUI ──
function registerIpc() {
  // diagnostyka: gdzie leży baza (operator wskazuje tym mcp-sqlite)
  ipcMain.handle('app:dbPath', () => dbPath);

  // dokument procesu widoczny w zakładce "Proces"
  ipcMain.handle('app:processDoc', () => {
    const docPath = path.join(__dirname, 'docs', 'proces-operacyjny.md');
    return fs.readFileSync(docPath, 'utf8');
  });

  // licznik rekordów — dymny test, że baza żyje
  ipcMain.handle('db:stats', () => ({
    companies: db.prepare('SELECT COUNT(*) n FROM companies').get().n,
    people:    db.prepare('SELECT COUNT(*) n FROM people').get().n,
    campaigns: db.prepare('SELECT COUNT(*) n FROM campaigns').get().n,
  }));

  // ODCZYT: osoby + nazwa firmy, najnowsze wg daty dodania (jak "Baza osób")
  ipcMain.handle('db:people', () =>
    db.prepare(`
      SELECT p.*, c.company_name, c.region, c.city
      FROM people p JOIN companies c ON c.duns = p.duns
      ORDER BY p.created_at DESC
    `).all()
  );

  // ODCZYT: status firm z widoku (status liczony z osób)
  ipcMain.handle('db:companies', () =>
    db.prepare(`
      SELECT c.*, cs.*
      FROM companies c
      LEFT JOIN company_status cs ON cs.duns = c.duns
      ORDER BY c.company_name
    `).all()
  );

  // ODCZYT: kampanie do dashboardu i kontrolek dostępu
  ipcMain.handle('db:campaigns', () =>
    db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC, id DESC').all()
  );

  // ODCZYT: historia zdarzeń dla kart osób i etapów kontaktu w kampanii
  ipcMain.handle('db:events', () =>
    db.prepare(`
      SELECT *
      FROM events
      WHERE entity_type='person'
      ORDER BY at ASC, id ASC
    `).all()
  );

  // ZAPIS (przykład wzorca): zmiana dostępu do kampanii + wpis do events.
  // Cała operacja w transakcji. To pokazuje, jak akcje GUI zejdą do bazy.
  ipcMain.handle('db:setCampaignAccess', (_e, { id, campaignId }) => {
    try {
      let changed = 0;
      const tx = db.transaction(() => {
        if (campaignId) {
          changed = db.prepare(`
            UPDATE people
            SET campaign_id = ?,
                status = CASE WHEN status IN ('sourced','enriched','awaiting_selection')
                              THEN 'selected' ELSE status END,
                updated_by = 'operator'
            WHERE id = ?`).run(campaignId, id).changes;
          db.prepare(`UPDATE campaigns SET status='aktywna' WHERE id=? AND status='zaproponowana'`)
            .run(campaignId);
        } else {
          changed = db.prepare(`
            UPDATE people
            SET campaign_id = NULL,
                status = CASE WHEN status IN ('selected','awaiting_selection')
                              THEN 'enriched' ELSE status END,
                updated_by = 'operator'
            WHERE id = ?`).run(id).changes;
        }
        db.prepare(`
          INSERT INTO events(entity_type, entity_id, event_type, actor, payload)
          VALUES('person', ?, ?, 'operator', ?)`)
          .run(String(id), campaignId ? 'campaign_access_set' : 'campaign_access_cleared',
               JSON.stringify({ campaignId: campaignId || null }));
      });
      tx();
      return { ok: true, changed };
    } catch (err) {
      console.error('[db:setCampaignAccess]', err);
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('db:confirmCampaignPerson', (_e, { id }) => {
    try {
      let changed = 0;
      const tx = db.transaction(() => {
        const p = db.prepare('SELECT campaign_id FROM people WHERE id=?').get(id);
        changed = db.prepare(`
          UPDATE people
          SET status='selected',
              selected_for_outreach=1,
              updated_by='operator'
          WHERE id=? AND status='awaiting_selection' AND campaign_id IS NOT NULL
        `).run(id).changes;
        if (changed === 0) return;   // guard nie trafił → nie udawaj zmiany, nie pisz eventu
        if (p?.campaign_id) {
          db.prepare(`UPDATE campaigns SET status='aktywna' WHERE id=? AND status='zaproponowana'`)
            .run(p.campaign_id);
        }
        db.prepare(`
          INSERT INTO events(entity_type, entity_id, event_type, actor, payload)
          VALUES('person', ?, 'campaign_confirmed', 'operator', ?)
        `).run(String(id), JSON.stringify({ campaignId: p?.campaign_id || null }));
      });
      tx();
      return { ok: true, changed };
    } catch (err) {
      console.error('[db:confirmCampaignPerson]', err);
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('db:rejectCampaignPerson', (_e, { id }) => {
    try {
      let changed = 0;
      const tx = db.transaction(() => {
        const p = db.prepare('SELECT campaign_id, status FROM people WHERE id=?').get(id);
        changed = db.prepare(`
          UPDATE people
          SET status='rejected',
              selected_for_outreach=0,
              updated_by='operator'
          WHERE id=? AND campaign_id IS NOT NULL AND status IN ('awaiting_selection','selected','sent')
        `).run(id).changes;
        if (changed === 0) return;   // guard nie trafił → nie udawaj zmiany, nie pisz eventu
        db.prepare(`
          INSERT INTO events(entity_type, entity_id, event_type, actor, payload)
          VALUES('person', ?, 'campaign_rejected', 'operator', ?)
        `).run(String(id), JSON.stringify({ campaignId: p?.campaign_id || null, previousStatus: p?.status || null }));
      });
      tx();
      return { ok: true, changed };
    } catch (err) {
      console.error('[db:rejectCampaignPerson]', err);
      return { ok: false, error: String(err?.message || err) };
    }
  });
}

app.whenReady().then(() => {
  dbPath = resolveDbPath();
  const opened = openDatabase(dbPath);
  db = opened.db;
  seedDemoData(db);
  console.log(`[DB] plik: ${dbPath}`);
  console.log(`[DB] nowa=${opened.fresh}  wersja=${opened.migration.version}  ` +
              `migracje=${opened.migration.applied.join(', ') || '(brak nowych)'}` +
              (opened.backup ? `  backup=${opened.backup}` : ''));

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Bazę zamykamy przy wyjściu z aplikacji, NIE przy zamknięciu okna.
// Na macOS zamknięcie okna nie kończy procesu — operator może otworzyć okno
// ponownie (activate), a handlery IPC potrzebują żywego uchwytu. Zamknięcie
// bazy przy oknie = pewny crash zapytań po reaktywacji.
app.on('before-quit', () => {
  if (db) { db.close(); db = null; }
});
