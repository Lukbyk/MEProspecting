// =====================================================================
// Warstwa bazy. Otwiera lokalny plik SQLite (WAL) i domiguje go do
// najnowszej wersji. Dyscyplina migracji:
//   • migracje to pliki db/migrations/NNN_nazwa.sql (NNN = 001, 002, ...)
//   • 001_initial_schema.sql = wersja BAZOWA (== schema.sql)
//   • każda zmiana struktury = NOWY plik o wyższym numerze
//   • NIGDY nie edytujemy migracji, która już poszła na bazę operatora
//   • aplikujemy tylko BRAKUJĄCE migracje (licznik PRAGMA user_version)
//   • przed migracją istniejącej bazy robimy kopię (backups/)
// =====================================================================
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const MIGRATION_RE = /^(\d{3})_.*\.sql$/;   // tylko pliki NNN_*.sql są migracjami

function listMigrations(dir) {
  return fs.readdirSync(dir)
    .filter(f => MIGRATION_RE.test(f))
    .sort();                                 // 001, 002, 003 ... porządek leksykalny = numeryczny
}

function versionOf(file) {
  return parseInt(file.match(MIGRATION_RE)[1], 10);
}

// kopia bezpieczeństwa pliku bazy przed migracją (tania polisa)
function backup(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  const dir = path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `prospecting-${stamp}.sqlite`);
  fs.copyFileSync(dbPath, dest);
  // W trybie WAL najświeższe zapisy mogą leżeć w plikach -wal/-shm, nie w
  // głównym pliku. Kopiujemy je razem — inaczej backup gubi ostatnie zmiany.
  for (const ext of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, dest + ext);
  }
  return dest;
}

// aplikuje brakujące migracje; każda w transakcji (porażka = rollback, wersja bez zmian)
function runMigrations(db, migrationsDir) {
  const files = listMigrations(migrationsDir);
  const current = db.pragma('user_version', { simple: true });
  const pending = files.filter(f => versionOf(f) > current);
  const applied = [];
  for (const f of pending) {
    const v = versionOf(f);
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${v}`);
    });
    tx();
    applied.push(f);
  }
  return { applied, version: db.pragma('user_version', { simple: true }) };
}

// Otwiera bazę i doprowadza ją do najnowszej wersji.
// Zwraca { db, fresh, backup, migration:{applied, version} }.
function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const fresh = !fs.existsSync(dbPath);
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = listMigrations(migrationsDir);
  const latest = files.length ? versionOf(files[files.length - 1]) : 0;

  // podejrzyj wersję bez trzymania uchwytu rw, żeby bezpiecznie zrobić backup
  let current = 0;
  if (!fresh) {
    const peek = new Database(dbPath, { readonly: true });
    current = peek.pragma('user_version', { simple: true });
    peek.close();
  }
  let backupPath = null;
  if (!fresh && latest > current) backupPath = backup(dbPath);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');   // równoległy odczyt+zapis: GUI czyta, loader/AI pisze
  db.pragma('foreign_keys = ON');
  const migration = runMigrations(db, migrationsDir);
  return { db, fresh, backup: backupPath, migration };
}

module.exports = { openDatabase };
