# Prospecting — aplikacja operatora (Media Energetyczne)

GUI operatora półautomatycznego systemu cold outreach B2B, opakowane w aplikację
desktopową (Electron) z lokalną bazą SQLite. **Cały projekt po polsku.** Łukasz jest
implementatorem; aplikacja docelowo trafia na osobny komputer operatora — na maszynie
deweloperskiej są tylko testy.

## System agentów (skille)
Workflow obsługuje 7 wyspecjalizowanych agentów (Strateg, Analityk, Autor treści,
Prowadzący, Opiekun, Kwalifikator, Mentor). Mapa całości — kto czym włada, jak kontakt
wędruje przez statusy, punkty przekazania — w [docs/instrukcje-projektu-prospecting.md](docs/instrukcje-projektu-prospecting.md).
Skille leżą spakowane w `.claude/skills/*.skill` (wersjonowane w Gicie, jadą na maszynę
operatora przez `git pull`). Aby Codex je uruchamiał, trzeba je rozpakować do
katalogów `.claude/skills/<nazwa>/` — spakowane `.skill` są przechowywane, nie ładowane.

## Stack
- Electron (proces główny + renderer), uruchamiane z ikony — bez `localhost`
- better-sqlite3, tryb WAL (równoległy odczyt GUI + zapis loadera/AI)
- System migracji (`PRAGMA user_version`), kopia bazy przed migracją
- GUI: jeden plik HTML (Inter + IBM Plex Mono, akcent teal), bez frameworka

## Komendy
- `npm install` — pobiera Electron + better-sqlite3 (`postinstall` rebuilduje moduł natywny pod ABI Electrona)
- `npm start` — okno aplikacji
- `npm run dist` — instalator w `dist/` (Windows `.exe` / macOS `.dmg` / Linux `.AppImage`) → kopiujesz na maszynę operatora

## Struktura
```
main.js            proces główny: okno, init bazy, kanały IPC (odczyt + przykład zapisu)
preload.js         most contextBridge → window.api
db/db.js           otwarcie SQLite (WAL) + runner migracji z backupem
db/migrations/
  001_initial_schema.sql   wersja BAZOWA schematu
  _TEMPLATE.sql            szablon kolejnej migracji (NIE uruchamiany)
renderer/index.html        GUI operatora (NA RAZIE dane demo)
```

## Gdzie leży baza (model: kod przez GitHub, dane lokalnie)
- DOMYŚLNIE: **`prospecting.sqlite` w katalogu projektu** (obok kodu), na każdej maszynie własna. Override: env `PROSPECTING_DB`; w spakowanej apce (asar read-only) → `userData`. Logika: `resolveDbPath()` w `main.js`.
- **Baza NIE idzie do Gita** — `.gitignore` wyklucza `*.sqlite`/`-wal`/`-shm` oraz `backups/`.
- **Wdrożenie:** deweloper `git push` kod na GitHub → druga maszyna (operator) `git pull` i dostaje SAM kod. Aplikacja przy pierwszym starcie tworzy własną pustą bazę w swoim katalogu projektu. Kolejne `git pull` aktualizują KOD; lokalna baza zostaje nietknięta — update NIE nadpisuje danych operatora.
- Każda maszyna ma własny `prospecting.sqlite`; te bazy nie są synchronizowane przez Git.
- `mcp-server-sqlite` (jeśli używany) musi wskazywać TEN SAM plik co aplikacja.

## Dyscyplina migracji (WAŻNE)
- `001` = baseline. Każda zmiana struktury = nowy plik `db/migrations/NNN_opis.sql` (trzy cyfry).
- **NIGDY nie edytuj migracji, która już poszła na bazę operatora** — rób następną.
- Aplikacja przy starcie sama wykrywa brakujące migracje, robi backup do `backups/` i je aplikuje (każda w transakcji).
- W migracjach **tylko DDL** — żadnych `PRAGMA journal_mode/foreign_keys` (te ustawia `db.js` przy otwarciu; nie wolno ich zmieniać wewnątrz transakcji).

## Model danych (skrót — pełny opis w `../prospecting-baza/architektura-bazy.md`)
`FIRMA (1) ──< OSOBY (N) ──> KAMPANIA (1 naraz)`

Kluczowe decyzje:
- **Status firmy to WIDOK** (`company_status`), nie kolumna — liczony z osób, brak konfliktu zapisu.
- **Gotowość do kampanii = JAWNA flaga** `ready_for_outreach`, ustawiana przez AI (Analityk), nie wyliczana z maila (+ `ready_reason`, `assessed_at`).
- **Kampania = partia** z nazwą i miękkim oknem; AI proponuje (`zaproponowana`), operator potwierdza w kolejce (→ `aktywna`).
- Status osoby = maszyna stanów: `sourced → enriched → awaiting_selection → selected → sent → ...`
- Optout na poziomie osoby/maila; blokada firmy = wyjątek.
- Próg migracji do Postgres: drugi operator.

## Most GUI ↔ baza (`preload.js`, `window.api`)
- odczyt: `window.api.people()` / `companies()` / `stats()` / `dbPath()`
- zapis: `window.api.setCampaignAccess(id, campaignId)` (UPDATE + wpis do `events`)

## Stan i następne kroki
**ZROBIONE:** szkielet Electron + warstwa bazy + migracje (zweryfikowane). GUI działa na danych demo.

**NASTĘPNE:**
1. **Loader D&B** — moduły 1–3 gotowe i przetestowane w `../prospecting-baza/scripts/load_classify.py`. Załaduj firmy + kotwice do SQLite, żeby baza nie była pusta.
2. **Przepięcie GUI** z zaszytych tablic na `window.api` — bounded krok: logika i wygląd zostają, zmienia się tylko źródło danych.
3. **Moduł Apollo** (wzbogacanie) — zależny od ICP z Bloku 0.

**GATE WARTOŚCI:** Blok 0 (warsztat ICP) realizowany na osobnym czacie — daje Analitykowi kryteria gotowości i Apollo profile stanowiskowe do szukania. Bez niego AI nie wie, kogo stemplować gotowym ani kogo szukać.

## Konwencje
- Po polsku. Komentarze w kodzie zwięzłe.
- Walidatory to fizyczny mechanizm egzekwowania, nie dokumentacja.
- Korekty w trakcie traktujemy jako trwałe decyzje architektoniczne, nie jednorazowe.

## Dyscyplina kodu — YAGNI z granicami
Drabina przed pisaniem kodu — zatrzymaj się na pierwszym szczeblu, który trzyma (PO zrozumieniu problemu, nie zamiast):
1. Czy to w ogóle musi powstać? (YAGNI)
2. Czy już jest w tym kodzie? Użyj ponownie, nie przepisuj.
3. Czy robi to biblioteka standardowa? Użyj.
4. Czy pokrywa to natywna funkcja platformy (Electron / SQLite / better-sqlite3)? Użyj — np. `db.backup()` zamiast własnego kopiowania pliku.
5. Czy rozwiązuje to już zainstalowana zależność? Użyj.
6. Czy to jedna linijka? Zrób jedną linijką.
7. Dopiero wtedy: minimum własnego kodu.

Fix = przyczyna, nie objaw: zgrepuj wszystkich wywołujących ruszaną funkcję i napraw wspólne miejsce raz, zamiast guard per wywołanie.

Świadomy skrót oznacz komentarzem, który nazywa sufit i ścieżkę wyjścia (jak `-- miękka ochrona przed duplikatem` w schemacie).

### Czego NIE upraszczać nigdy
Bycie zwięzłym ≠ niedbałym. Nigdy nie pomijaj:
- **zrozumienia problemu** — przeczytaj kod i prześledź realny flow, zanim wybierzesz szczebel; mały diff, którego nie rozumiesz, to nie oszczędność, tylko lenistwo w przebraniu;
- **walidacji na granicy zaufania** — dane z D&B / Apollo / AI są niezaufane: escapuj przed wstawieniem do DOM, parametryzuj SQL;
- **obsługi błędów chroniącej przed utratą danych** — try/catch w handlerach IPC, spójny backup (WAL!);
- **bezpieczeństwa** i rzeczy, o których utrzymanie user prosił wprost.
