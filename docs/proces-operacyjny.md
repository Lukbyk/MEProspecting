# Proces operacyjny prospectingu

Ten dokument jest źródłem treści dla zakładki `Proces` w aplikacji. Aktualizuj go na bieżąco, gdy zmienia się sposób pracy Analityka, Prowadzącego kampanię albo Operatora.

## 1. Role

### Analityk

Analityk buduje bazę.

Odpowiada za:

- import firm z D&B,
- dodanie firm do `companies`,
- dodanie osób do `people`,
- oznaczenie kotwic D&B,
- wzbogacenie danych przez Apollo,
- ocenę `ready_for_outreach`,
- wpisanie `ready_reason`,
- pilnowanie deduplikacji i jakości danych.

Efekt pracy Analityka: rekordy są widoczne w `Baza osób` oraz `Firmy`, ale nie muszą jeszcze należeć do kampanii.

### Prowadzący kampanię

Prowadzący kampanię pracuje na gotowej puli z bazy.

Odpowiada za:

- wybór osób gotowych do konkretnej partii,
- przypisanie `campaign_id`,
- ustawienie `status = awaiting_selection`,
- przygotowanie sekwencji wysyłki,
- pilnowanie follow-upów,
- obsługę odpowiedzi i ciszy.

Efekt pracy Prowadzącego: rekordy pojawiają się w `Kolejka osób` oraz w dashboardzie `Kampanie`.

### Operator

Operator jest bramką decyzyjną.

Odpowiada za:

- zatwierdzanie osób zaproponowanych do kampanii,
- wycofywanie osób z kampanii,
- ręczną wysyłkę maili,
- obsługę odpowiedzi wymagających decyzji człowieka.

Żaden mail nie wychodzi bez decyzji Operatora.

## 2. Ładowanie rekordów do bazy

Rekordy do bazy dodaje Analityk.

Minimalny przepływ:

1. Załaduj firmę do `companies`.
2. Dodaj osobę albo osoby do `people`.
3. Ustaw źródło rekordu:
   - `source = dnb`, jeśli osoba pochodzi z D&B,
   - `source = apollo`, jeśli osoba została znaleziona przez Apollo.
4. Oznacz kotwicę D&B przez `is_dnb_anchor = 1`, jeśli rekord jest punktem zaczepienia, a nie automatycznym celem kampanii.
5. Ustaw `email_type`:
   - `personal`,
   - `generic`,
   - `none`.
6. Ustaw `contactability`:
   - `A` = osoba z mailem osobistym,
   - `B` = osoba bez maila,
   - `C` = firma bez osoby,
   - `D` = osoba z mailem generycznym.
7. Oceń gotowość:
   - `ready_for_outreach = 1`, jeśli rekord można pokazać Prowadzącemu kampanię,
   - `ready_for_outreach = 0`, jeśli rekord wymaga jeszcze pracy.
8. Wpisz `ready_reason`, czyli krótkie uzasadnienie decyzji Analityka.

Po tym kroku rekord powinien być widoczny w `Baza osób`.

## 3. Uruchamianie kampanii

Kampanię uruchamia Prowadzący kampanię.

Minimalny przepływ:

1. Wybierz kampanię albo utwórz nową w `campaigns`.
2. Wybierz osoby z `ready_for_outreach = 1`, które pasują do tej partii.
3. Ustaw im `campaign_id`.
4. Ustaw `status = awaiting_selection`.
5. Zostaw kampanię jako `zaproponowana`, dopóki Operator nie zatwierdzi pierwszych osób.

Po tym kroku osoby powinny pojawić się w `Kolejka osób` i w dashboardzie `Kampanie`.

## 4. Decyzje Operatora

Operator widzi osoby ze statusem `awaiting_selection`.

Może:

- zatwierdzić osobę do kampanii,
- wycofać osobę z kampanii.

Zatwierdzenie zmienia:

- `status = selected`,
- `selected_for_outreach = 1`,
- kampania może przejść na `aktywna`.

Wycofanie zmienia:

- `status = rejected`,
- `selected_for_outreach = 0`.

Wycofanie nie usuwa `campaign_id`. Rekord zostaje w dashboardzie kampanii jako ślad decyzji.

## 5. Prowadzenie kontaktu

Po zatwierdzeniu Prowadzący kampanię pilnuje etapów kontaktu.

Typowe etapy:

1. `Mail #1 wysłany`
2. `Follow-up #1`
3. `Follow-up #2 — cisza`
4. `Odpowiedź`

Etap kontaktu powinien być zapisywany w `events`, bo jest historią działań, a nie tylko statusem osoby.

Dashboard kampanii powinien pokazywać aktualny etap kontaktu na froncie listy.

## 6. Rozstrzygnięcie kontaktu

Aktywna kampania nie powinna zostawiać kontaktów w zawieszeniu.

Po odpowiedzi albo po ciszy po drugim follow-upie kontakt powinien trafić dalej:

- do kwalifikacji,
- do rozmowy,
- do uśpienia,
- do wykluczenia,
- do optout,
- do utraty.

## 7. Zasady bezpieczeństwa

- Nie wysyłamy maili automatycznie bez Operatora.
- Nie kasujemy historii z `events`.
- Nie edytujemy starych migracji.
- Nie czyścimy `campaign_id` przy wycofaniu z kampanii.
- Optout traktujemy jako trwały sygnał bezpieczeństwa.
- Dane operatora i baza SQLite zostają lokalnie na komputerze.

## 8. Aktualizacje aplikacji przez Git

Git służy do aktualizacji aplikacji, dokumentacji i migracji bazy. Git nie służy do przenoszenia danych operatora.

Do Gita trafiają:

- kod aplikacji,
- pliki w `renderer/`,
- pliki w `main.js` i `preload.js`,
- migracje w `db/migrations/`,
- dokumenty procesu w `docs/`,
- instrukcje.

Do Gita nigdy nie trafiają:

- plik bazy SQLite,
- pliki `*.sqlite-wal`,
- pliki `*.sqlite-shm`,
- backupy bazy,
- eksporty z danymi osobowymi.

Każdy komputer ma własny plik bazy.

Komputer deweloperski ma bazę testową. Komputer operatora ma bazę produkcyjną operatora. Te bazy nie są synchronizowane przez Git.

Jeśli zmienia się struktura bazy, deweloper dodaje nowy plik migracji w `db/migrations/`. Operator pobiera aktualizację aplikacji, uruchamia ją, a aplikacja przy starcie stosuje brakujące migracje na lokalnej bazie operatora.

Przed migracją istniejącej bazy aplikacja robi backup.

## 9. Ścieżka bazy

Najbezpieczniej, żeby baza operatora była w stałej lokalizacji poza katalogiem projektu.

Na macOS domyślna ścieżka aplikacji to:

`~/Library/Application Support/Prospecting/prospecting.sqlite`

Można też wskazać własną ścieżkę przez zmienną `PROSPECTING_DB`.

Ważne: jeśli AI albo `mcp-server-sqlite` mają dopisywać dane do tej samej bazy, muszą wskazywać dokładnie ten sam plik SQLite co aplikacja.

## 10. Dane demo

Dane demo są tylko dla dewelopera.

Demo seed nie uruchamia się automatycznie. Aby lokalnie wypełnić pustą bazę danymi testowymi, deweloper może uruchomić aplikację ze zmienną:

`PROSPECTING_SEED_DEMO=1`

Operator nie powinien uruchamiać aplikacji z tą zmienną.
