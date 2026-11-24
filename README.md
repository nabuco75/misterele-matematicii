# Misterele Matematicii — aplicație de înscriere

Aplicație web pentru înscrierea elevilor (clasele IV–VII) la concursul „Misterele Matematicii”,
organizat de Școala Gimnazială „Ștefan cel Mare” Vaslui.

**Tehnologii:** React + Vite, Firebase (Hosting, Firestore, Authentication), EmailJS.

## Funcționalități

- **Public:** alegere județ → localitate → școală, cod de acces profesor, înscriere max. 5 elevi/clasă/școală
  (școlile marcate „fără limită” și adminul nu au limită), email de confirmare (sau confirmare descărcabilă).
  Limita e verificată și pe server (regulile Firestore), nu doar în browser.
- **Admin (`/admin`):** doar conturile din colecția `admins`. CRUD școli (cu bifa „fără limită”), import școli din
  Excel, statistici, editare/ștergere/mutare elevi și înscrieri, căutare profesori, înscriere suplimentară, exporturi.
- **Etapele concursului:** Săli → Repartizare → Coduri (anonimizare MMVS_xx) → Tipărire (liste pe uși, bilețele,
  borderouri, prezență, situații pentru raportare, premii în bani) → Notare (punctaje, premii, clasament, exporturi).
- **Repartizare în săli** (`src/allocation.js`): sălile se umplu complet, în ordine (locurile libere rămân
  în ultima sală); câte 2 clase în fiecare sală, aproximativ jumătate-jumătate; dacă locurile sunt la limită,
  ultima sală poate fi „mozaic”. Elevii sunt alfabetic, în continuare de la o sală la alta. Dacă nu ajung locurile,
  fiecare clasă cedează proporțional (ultimii alfabetic), iar cei rămași fără loc sunt afișați pe nume.
- **Mai multe calculatoare deodată:** repartizarea, elevii veniți pe loc, tranșele de coduri, antetul și sumele
  premiilor se salvează în baza de date pornind de la datele proaspete (tranzacții). Codurile se dau atomic
  (`config/codeCounter` ține ultimul număr și ce număr a primit fiecare elev), deci două calculatoare nu pot da
  același cod și nici două coduri aceluiași elev. Așezarea unui elev venit pe loc verifică locurile pe datele
  proaspete (o sală nu trece de capacitate dacă două calculatoare așază în același timp).
- **Săli:** o sală cu elevi repartizați nu se poate redenumi, șterge sau micșora sub numărul lor.
- **Deschidere/închidere înscrieri:** documentul Firestore `config/appStatus` (`isActive`, `message`), schimbat
  din consola Firebase. Pe localhost se poate testa cu `?force=true`.

## Comenzi

```bash
npm install
npm run dev       # server local
npm test          # testele (repartizare, note, premii, coduri)
npm run lint      # verificarea codului
npm run build     # build în dist/
```

> Nu rulați `npm audit fix --force`: ar coborî Firebase la o versiune veche. Vulnerabilitățile rămase sunt în
> părțile de server ale pachetelor (nu ajung în site); trecerea la Firebase 12 se face separat, testat.

**Publicarea site-ului:** prin `git push` pe `main`. GitHub Actions rulează lint + teste + build și, doar dacă
toate trec, publică pe Firebase Hosting. **Regulile Firestore NU se publică automat:** după orice schimbare în
`firestore.rules`, conținutul se lipește în consolă (Firestore → Rules → Publish).

## Ediție nouă (o dată pe an)

1. Panoul de admin → **Zonă periculoasă → Pregătește ediția nouă**.
2. **Descărcați copia completă** (un Excel de citit + un fișier JSON cu tot). Păstrați-le în siguranță: conțin
   date personale ale elevilor și profesorilor.
3. Scrieți `EDITIE NOUA` și apăsați **Golește datele**. Se șterg, în ordine: notele, codurile, înscrierile,
   repartizarea pe săli și contorul de coduri; locurile libere ale școlilor se recalculează. Rămân școlile,
   sălile, antetul și sumele premiilor. Dacă se oprește la mijloc (conexiune), se apasă din nou.
4. La **Tipărire › Antet**: ediția și data noi.
5. Dacă e cazul, schimbați codul de acces pentru profesori (mai jos) și verificați sălile.
6. Deschideți înscrierile: Firestore → `config/appStatus` → `isActive: true`. Faceți o înscriere de probă și
   ștergeți-o.

## Adăugarea unui admin

1. Authentication → Users → **Add user** (email + parolă).
2. Copiați **User UID** al contului.
3. Firestore → Data → colecția `admins` → **Add document**, cu Document ID = UID-ul copiat
   (un câmp oarecare, ex. `nume`).

## Colecții Firestore

| Colecție / document | Conținut | Cine citește |
|---|---|---|
| `schools` | `name`, `county`, `locality`, `vip` (fără limita de 5) | public |
| `registration` | `schoolId`, `school`, `class`, `students[]`, `profesorIndrumatorEmail` (**numele** profesorului — denumire istorică), `profesorEmail` (emailul), `telefon`, `createdAt` | doar admin |
| `classCounts/{schoolId}` | `IV`, `V`, `VI`, `VII` (elevi înscriși pe clasă), `seq` — contorul public pentru limita de 5 | public (doar numere) |
| `admins/{uid}` | conturile de admin (se creează manual din consolă) | fiecare cont doar pe al lui |
| `rooms` | `name`, `floor`, `seats`, `rows`, `cols` | admin |
| `codes/{MMVS_xx}` | codul de anonimizare: `n`, `regId`, `nume`, `clasa`, `scoala`, `profesor`, `salaLaAtribuire`, `retras` | admin |
| `grades/{cod sau elev_…}` | `s1`, `s2`, `s3`, `absent`, `premiu` | admin |
| `config/appStatus` | `isActive`, `message` | public |
| `config/allocation` | repartizarea (`assignments`), jurnalul, elevii veniți pe loc, tranșele de coduri | admin |
| `config/codeCounter` | ultimul număr de cod (`n`) și ce număr a primit fiecare elev (`keys`: înscriere + nume) | admin |
| `config/settings` | antetul listelor (ediția, data) și sumele premiilor în bani | admin |

Înscrierile publice au ID-ul `{schoolId}_{seq}_{clasă}` și se scriu în aceeași tranzacție cu `classCounts`
(vezi `src/classCounts.js` și `firestore.rules`). Orice modificare a adminului recalculează contoarele.

## Schimbarea codului de acces pentru profesori

Codul nu este stocat în clar, ci ca amprentă SHA-256 în `src/ClassForm.jsx` (`ACCESS_CODE_HASH`):

```bash
node -e "console.log(require('crypto').createHash('sha256').update('COD_NOU').digest('hex'))"
```

Înlocuiți valoarea `ACCESS_CODE_HASH` cu rezultatul, apoi build + deploy.

## Securitate — de verificat în Firebase Console

1. **Firestore → Data → `admins`:** câte un document pentru fiecare cont de admin, cu ID-ul = User UID din
   Authentication → Users. Fără el, contul nu are acces la panou (și regulile îl refuză).
2. **Firestore → Rules:** conținutul fișierului `firestore.rules` (se lipește în consolă și se publică).
3. **Authentication → Settings → User actions:** dezactivați „Enable create (sign-up)”.
4. **Recomandat — App Check** (oprește înscrierile false trimise de programe): Firebase Console → App Check →
   înregistrați aplicația web cu reCAPTCHA v3 (sau Enterprise), puneți cheia de site în `src/firebase.js`
   (`RECAPTCHA_SITE_KEY`), publicați, verificați câteva zile în „Metrics” că cererile reale sunt verificate,
   apoi apăsați **Enforce** pentru Firestore. Fără cheie, aplicația funcționează ca înainte.
5. Colecțiile `users` și `quotas` din reguli nu sunt folosite de aplicație (rămân închise, doar admin).
