# Prospecting — aplikacja operatora

GUI operatora systemu prospectingowego Media Energetyczne, opakowane w aplikację
desktopową (Electron). Odpala się z ikony (bez `localhost`), czyta i pisze do
**lokalnego pliku SQLite** przez sterownik natywny z trybem WAL — więc loader/AI
mogą pisać do tej samej bazy równolegle.

To jest **szkielet**: kontener + warstwa bazy + system migracji działają.
GUI w `renderer/index.html` na razie chodzi na danych demonstracyjnych —
podpięcie go do realnej bazy (przez `window.api`) to następny krok (patrz niżej).

---

## Wymagania

- **Node.js LTS** (20+) — https://nodejs.org
- System: Windows / macOS / Linux

## Uruchomienie (maszyna testowa)

```bash
cd prospecting-app
npm install        # pobiera Electron + better-sqlite3 i przebudowuje moduł natywny
npm start          # otwiera okno aplikacji — bez localhost
```

Przy starcie konsola wypisze, gdzie leży baza i jaką ma wersję:

```
[DB] plik: /Users/ty/Library/Application Support/Prospecting/prospecting.sqlite
[DB] nowa=true  wersja=1  migracje=001_initial_schema.sql
```

## Budowa instalatora (na maszynę operatora)

```bash
npm run dist       # tworzy instalator w dist/
```

W `dist/` powstaje plik (Windows `.exe` NSIS, macOS `.dmg`, Linux `.AppImage`).
Kopiujesz go na komputer operatora (USB / chmura) i instalujesz. To jest Twoje
„przenieś na inny komputer".

> Native module: `better-sqlite3` jest kompilowany pod ABI Electrona przez
> `electron-builder install-app-deps` (skrypt `postinstall`). Dlatego po `npm install`
> moduł działa w zbudowanej aplikacji bez ręcznego rebuildu.

---

## Gdzie leży baza (model: kod przez GitHub, dane lokalnie)

**Baza to plik `prospecting.sqlite` w katalogu projektu** — leży obok kodu, na każdej
maszynie własna. Domyślnie aplikacja sama go tworzy/otwiera (logika: `resolveDbPath()`
w `main.js`). Override: zmienna `PROSPECTING_DB` na jawną ścieżkę; w spakowanej apce
(asar read-only) baza spada na `userData`.

**Baza NIE trafia do Gita.** `.gitignore` wyklucza `*.sqlite` / `*.sqlite-wal` /
`*.sqlite-shm` oraz `backups/`. Dzięki temu aktualizacja kodu nie dotyka danych:

- Deweloper wysyła **kod** na GitHub (`git push`).
- Druga maszyna (operator) ściąga projekt (`git clone` / `git pull`) — dostaje **sam
  kod**, bez cudzej bazy.
- Przy pierwszym uruchomieniu aplikacja tworzy pustą bazę w swoim katalogu projektu;
  operator ładuje własne dane.
- Kolejne `git pull` aktualizują **kod**, a lokalna baza (gitignored) **zostaje
  nietknięta** — update nie nadpisuje danych operatora.

Każdy komputer ma więc własny `prospecting.sqlite` w swoim katalogu projektu; te bazy
nie są synchronizowane przez Git. `mcp-server-sqlite` (jeśli używany) musi wskazywać
TEN SAM plik co aplikacja.

---

## Aktualizacje

Aktualizacja to dwie osobne rzeczy:

### 1. Kod aplikacji — łatwe
Budujesz nowy instalator (`npm run dist`), kopiujesz na maszynę operatora,
instalujesz. Nadpisuje aplikację. Baza zostaje nietknięta (leży osobno).

### 2. Struktura bazy — przez migracje
Gdy zmieniasz strukturę (kolumna, tabela, indeks), **nie podmieniasz pliku bazy** —
piszesz **migrację**. Aplikacja przy starcie sama wykryje brakujące migracje,
zrobi kopię bazy do `backups/` i je wykona. Dane operatora zostają.

Mechanizm:

- `db/migrations/001_initial_schema.sql` — wersja **bazowa** (== `schema.sql` z `prospecting-baza/`).
- Każda zmiana = nowy plik `NNN_opis.sql` (002, 003, ...). Wzorzec: `db/migrations/_TEMPLATE.sql`.
- Aplikacja czyta `PRAGMA user_version`, widzi, na której wersji jest baza, i dokłada
  **tylko** migracje o wyższym numerze — każdą w transakcji (porażka = rollback).

**Dwie żelazne zasady:**
1. Migracje są **append-only i uporządkowane** — nigdy nie edytujesz migracji, która
   już poszła na bazę operatora. Robisz następną.
2. Testujesz nową migrację u siebie na **kopii realnych danych**, zanim zbudujesz instalator.

### Twój cykl w praktyce
```
poprawka na maszynie testowej
   → (jeśli zmiana struktury) dopisz db/migrations/NNN_opis.sql
   → npm run dist
   → skopiuj instalator na komputer operatora
   → zainstaluj
aplikacja przy pierwszym starcie sama domiguje bazę, zachowując dane.
```

---

## Następny krok: podpięcie GUI do bazy

Dziś GUI (`renderer/index.html`) chodzi na zaszytych tablicach `companies`/`people`/
`campaigns`. Most do realnej bazy jest już gotowy — w `preload.js` wystawione jest
`window.api`:

| Funkcja | Co robi |
|---|---|
| `window.api.dbPath()` | ścieżka do pliku bazy (diagnostyka) |
| `window.api.stats()` | liczniki firm / osób / kampanii |
| `window.api.people()` | osoby + firma, najnowsze wg `created_at` |
| `window.api.companies()` | status firm z widoku `company_status` |
| `window.api.setCampaignAccess(id, campaignId)` | zmiana dostępu do kampanii + wpis do `events` |

Podpięcie = zamiana zaszytych tablic na `await window.api.people()` itd., a akcji
(potwierdź/odrzuć, zmiana dostępu, optout) na wywołania `window.api.*`. Logika i wygląd
GUI zostają — zmienia się tylko źródło danych. To bounded krok, do zrobienia po
wypełnieniu bazy realnymi danymi (loader D&B + Apollo).

## Struktura projektu

```
prospecting-app/
  package.json          skrypty start/dist + electron-builder
  main.js               proces główny: okno, init bazy, kanały IPC (odczyt+zapis)
  preload.js            most contextBridge → window.api
  db/
    db.js               otwarcie SQLite (WAL) + runner migracji z backupem
    migrations/
      001_initial_schema.sql   wersja bazowa (== schema.sql)
      _TEMPLATE.sql            szablon kolejnej migracji (nie uruchamiany)
  renderer/
    index.html          GUI operatora (na razie dane demo)
```
