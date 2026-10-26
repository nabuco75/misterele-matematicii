# Misterele Matematicii — aplicație de înscriere

Aplicație web pentru înscrierea elevilor (clasele IV–VII) la concursul „Misterele Matematicii”,
organizat de Școala Gimnazială „Ștefan cel Mare” Vaslui.

**Tehnologii:** React + Vite, Firebase (Hosting, Firestore, Authentication), EmailJS.

## Funcționalități

- **Public:** alegere județ → localitate → școală, cod de acces profesor, înscriere max. 5 elevi/clasă/școală
  (școlile „VIP” și adminul nu au limită), email de confirmare.
- **Admin (`/admin`):** CRUD școli, import școli din Excel (fără dubluri), statistici, editare/ștergere elevi,
  înscriere suplimentară, exporturi Excel, repartizare automată în săli.
- **Deschidere/închidere înscrieri:** documentul Firestore `config/appStatus` (`isActive`, `message`).
  Pe localhost se poate testa cu `?force=true`.

## Comenzi

```bash
npm install
npm run dev       # server local
npm run build     # build în dist/
firebase deploy --only hosting
```

## Colecții Firestore

| Colecție | Conținut |
|---|---|
| `schools` | `name`, `county`, `locality` |
| `registration` | `schoolId`, `school`, `class`, `students[]`, `profesorIndrumatorEmail` (**numele** profesorului — denumire istorică), `profesorEmail` (emailul), `telefon`, `createdAt` |
| `rooms` | `name`, `floor`, `seats`, `rows`, `cols` |
| `config/appStatus` | `isActive`, `message` |

## Schimbarea codului de acces pentru profesori

Codul nu este stocat în clar, ci ca amprentă SHA-256 în `src/ClassForm.jsx` (`ACCESS_CODE_HASH`):

```bash
node -e "console.log(require('crypto').createHash('sha256').update('COD_NOU').digest('hex'))"
```

Înlocuiți valoarea `ACCESS_CODE_HASH` cu rezultatul, apoi build + deploy.

## Securitate — de verificat în Firebase Console

1. **Authentication → Settings → User actions:** dezactivați „Enable create (sign-up)”, ca nimeni să nu-și poată
   crea singur cont (orice cont autentificat are acces la `/admin`).
2. **Firestore → Rules:** scrierea/ștergerea în `schools`, `rooms`, `config` și modificarea/ștergerea în
   `registration` ar trebui permise doar utilizatorilor autentificați.
