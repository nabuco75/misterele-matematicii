// Repartizarea elevilor pe săli: câte 2 clase în fiecare sală, aproximativ jumătate-jumătate.
//
// 1. Elevii se grupează pe clase, iar clasele se ordonează descrescător după numărul de elevi.
// 2. Șirul obținut (clasa cea mai numeroasă prima) se taie în două „fluxuri”: prima jumătate a elevilor
//    ocupă prima jumătate a fiecărei săli, a doua jumătate a elevilor ocupă cealaltă jumătate.
//    Astfel, în fiecare sală se întâlnesc două clase diferite (de ex. V cu VI, apoi V cu VII ...).
// 3. Sălile se umplu complet, în ordine; locurile libere rămân în ultima sală folosită.
// 4. Împărțirea între cele două jumătăți poate varia de la o sală la alta (cel mult 20%), aleasă pentru
//    toate sălile odată, astfel încât cât mai multe săli să aibă exact 2 clase.
//    Ultima sală poate fi „mozaic” (mai multe clase), dacă e cazul.
// 5. În fiecare clasă, elevii se iau alfabetic, în continuare de la o sală la alta.

export const CLASS_ORDER = ["a IV-a", "a V-a", "a VI-a", "a VII-a"];
const MAX_SHIFT_RATIO = 0.2; // cât se poate abate o sală de la „jumătate-jumătate” (20% din locuri)

// ordinea etajelor: Parter, Etaj I (1), Etaj II (2) ...; etajul necunoscut la final
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
export const floorRank = (floor) => {
  const f = String(floor || "").trim().toUpperCase();
  if (!f || f === "NESPECIFICAT") return 99;
  if (f.startsWith("PARTER") || f === "P") return 0;
  if (f.startsWith("DEMISOL") || f.startsWith("SUBSOL")) return -1;
  const arabic = f.match(/\d+/);
  if (arabic) return parseInt(arabic[0], 10);
  const roman = f.match(/\b(I{1,3}|IV|V|VI)\b/);
  if (roman) return ROMAN[roman[1]];
  return 98;
};

// numărul din numele sălii („Sala 10” → 10); sălile fără număr vin după cele numerotate
const roomNumber = (name) => {
  const m = String(name || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : Infinity;
};

// sălile în ordinea repartizării: pe etaje (de la parter), apoi după număr (Sala 1, Sala 2, ... Sala 10)
export const sortRooms = (rooms) =>
  [...rooms].sort(
    (a, b) =>
      floorRank(a.floor) - floorRank(b.floor) ||
      roomNumber(a.name) - roomNumber(b.name) ||
      String(a.name).localeCompare(String(b.name), "ro", { numeric: true })
  );

const classRank = (cls) => {
  const i = CLASS_ORDER.indexOf(cls);
  return i === -1 ? CLASS_ORDER.length : i;
};

const seatsOf = (room) => Math.max(0, parseInt(room.seats) || 0);

// numele de sală folosite de mai multe ori („Sala 6” de două ori): repartizarea se face
// după nume, deci elevii ar apărea de două ori. Întoarce numele duplicate (gol = în regulă).
export const duplicateRoomNames = (rooms) => {
  const seen = new Map();
  const dup = new Set();
  rooms.forEach((r) => {
    const k = String(r.name || "").trim().toLocaleLowerCase("ro");
    if (seen.has(k)) dup.add(seen.get(k));
    else seen.set(k, String(r.name || "").trim());
  });
  return [...dup];
};

// Când sunt mai mulți elevi decât locuri, fiecare clasă cedează proporțional (cei de la
// sfârșitul listei alfabetice), în loc să rămână pe dinafară clase întregi.
// Întoarce { kept, left } (left = elevii fără loc).
const trimToSeats = (students, totalSeats) => {
  if (students.length <= totalSeats) return { kept: students, left: [] };
  const groups = {};
  students.forEach((s) => (groups[s.clasa] = groups[s.clasa] || []).push(s));
  const ratio = totalSeats / students.length;
  // metoda celor mai mari resturi: cote întregi care adună exact totalSeats
  const quotas = Object.entries(groups).map(([cls, list]) => {
    const exact = list.length * ratio;
    return { cls, n: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let extra = totalSeats - quotas.reduce((n, q) => n + q.n, 0);
  [...quotas]
    .sort((a, b) => b.rest - a.rest || classRank(a.cls) - classRank(b.cls))
    .forEach((q) => {
      if (extra > 0) {
        q.n++;
        extra--;
      }
    });
  const keep = new Set();
  quotas.forEach((q) => groups[q.cls].slice(0, q.n).forEach((s) => keep.add(s)));
  return { kept: students.filter((s) => keep.has(s)), left: students.filter((s) => !keep.has(s)) };
};

export function allocateByClassPairs(allStudents, rooms) {
  const { kept: students, left: unplacedStudents } = trimToSeats(
    allStudents,
    rooms.reduce((n, r) => n + seatsOf(r), 0)
  );
  // grupare pe clase, păstrând ordinea alfabetică primită
  const groups = {};
  students.forEach((s) => {
    (groups[s.clasa] = groups[s.clasa] || []).push(s);
  });
  const classes = Object.keys(groups).sort(
    (a, b) => groups[b].length - groups[a].length || classRank(a) - classRank(b)
  );
  const sequence = classes.flatMap((cls) => groups[cls].map(() => cls));
  const N = sequence.length;

  // câți elevi intră în fiecare sală: sălile se umplu complet, în ordine; ultima folosită poate rămâne parțială
  let left = N;
  const roomCounts = rooms.map((room) => {
    const n = Math.min(seatsOf(room), left);
    left -= n;
    return n;
  });
  const lastUsed = roomCounts.reduce((last, n, i) => (n > 0 ? i : last), -1);

  const classesIn = (from, to, set) => {
    for (let i = from; i < to; i++) set.add(sequence[i]);
    return set;
  };

  // costul unei săli: o clasă în plus față de 2 costă mult (la ultima sală – mozaic – mai puțin),
  // o singură clasă în toată sala la fel, iar abaterea de la jumătate-jumătate puțin
  const roomCost = (p1, a, p2, b, isLast) => {
    const distinct = classesIn(p2, p2 + b, classesIn(p1, p1 + a, new Set())).size;
    const c = a + b;
    let cost = (a - c / 2) ** 2;
    if (distinct > 2) cost += (distinct - 2) * (isLast ? 100 : 1000);
    if (distinct === 1 && c > 1) cost += isLast ? 50 : 500;
    return cost;
  };

  // pentru un punct de tăiere end1 al șirului, alegem (programare dinamică) câți elevi din primul flux
  // intră în fiecare sală, astfel încât costul total să fie minim
  const solve = (end1) => {
    let states = new Map([[0, { cost: 0, path: [] }]]);
    let placedBefore = 0;
    roomCounts.forEach((c, i) => {
      if (c === 0) return;
      const next = new Map();
      const isLast = i === lastUsed;
      states.forEach((st, p1) => {
        const p2 = end1 + (placedBefore - p1);
        const lo = Math.max(0, c - (N - p2));
        const hi = Math.min(c, end1 - p1);
        const limit = isLast ? c : Math.max(2, Math.round(c * MAX_SHIFT_RATIO));
        let from = Math.max(lo, Math.ceil(c / 2 - limit));
        let to = Math.min(hi, Math.floor(c / 2 + limit));
        if (from > to) {
          from = lo;
          to = hi;
        }
        for (let a = from; a <= to; a++) {
          const cost = st.cost + roomCost(p1, a, p2, c - a, isLast);
          const key = p1 + a;
          const prev = next.get(key);
          if (!prev || cost < prev.cost) next.set(key, { cost, path: [...st.path, a] });
        }
      });
      states = next;
      placedBefore += c;
    });
    let best = null;
    states.forEach((st) => {
      if (!best || st.cost < best.cost) best = st;
    });
    return best && { ...best, end1 };
  };

  let best = null;
  const mid = Math.ceil(N / 2);
  for (let end1 = Math.max(0, mid - 15); end1 <= Math.min(N, mid + 15); end1++) {
    const res = solve(end1);
    if (res && (!best || res.cost < best.cost - 1e-9 ||
      (Math.abs(res.cost - best.cost) < 1e-9 && Math.abs(end1 - mid) < Math.abs(best.end1 - mid)))) {
      best = res;
    }
  }

  // reconstruim: câți elevi din fiecare clasă intră în fiecare sală
  let p1 = 0;
  let p2 = best ? best.end1 : 0;
  let step = 0;
  const countsByRoom = roomCounts.map((c) => {
    const counts = {};
    if (c === 0 || !best) return counts;
    const a = best.path[step++];
    [...sequence.slice(p1, p1 + a), ...sequence.slice(p2, p2 + c - a)].forEach((cls) => {
      counts[cls] = (counts[cls] || 0) + 1;
    });
    p1 += a;
    p2 += c - a;
    return counts;
  });

  // elevii fiecărei clase se împart alfabetic, în ordinea sălilor (Sala 6, 7, 8 ...)
  const offset = {};
  const data = [];
  const roomSummaries = [];
  rooms.forEach((room, i) => {
    const perClass = countsByRoom[i];
    const placed = [];
    Object.keys(perClass)
      .sort((x, y) => classRank(x) - classRank(y))
      .forEach((cls) => {
        const from = offset[cls] || 0;
        placed.push(...groups[cls].slice(from, from + perClass[cls]));
        offset[cls] = from + perClass[cls];
      });
    if (placed.length === 0) return;

    // în listă: pe clase (IV, V, VI, VII), apoi alfabetic
    placed.sort(
      (x, y) =>
        classRank(x.clasa) - classRank(y.clasa) ||
        x.nume.localeCompare(y.nume, "ro", { sensitivity: "base" })
    );
    placed.forEach((student, idx) => {
      data.push({ ...student, sala: room.name, etaj: room.floor || "", loc_in_sala: idx + 1 });
    });
    roomSummaries.push({
      room,
      seats: seatsOf(room),
      count: placed.length,
      perClass,
      mosaic: Object.keys(perClass).length > 2,
    });
  });

  const placedIds = new Set(data.map((d) => d.id));
  return {
    data,
    roomSummaries,
    allocated: data.length,
    unallocated: allStudents.length - data.length,
    // cine a rămas fără loc (pentru mesaj): cei tăiați proporțional + eventualii nepuși
    unplacedStudents: [
      ...unplacedStudents,
      ...students.filter((s) => !placedIds.has(s.id)),
    ],
  };
}

// Repartizare „păstrată”: elevii care au deja cod rămân în sala în care au primit codul,
// iar elevii noi (fără cod) se pun pe locurile libere, începând cu ultima sală folosită,
// apoi sălile de după ea, apoi (dacă tot nu ajung locurile) sălile dinainte, de la coadă.
// Dacă nu mai e niciun loc liber, cei rămași intră tot în ultima sală (peste capacitate).
//   saved: Map id elev → sală, din repartizarea salvată (are prioritate față de sala de la cod)
//   placeNew: false → elevii noi nu se așază (doar se numără), la reafișarea repartizării salvate
export function allocateKeepingCodes(students, rooms, { saved = new Map(), placeNew = true } = {}) {
  const byRoom = new Map(rooms.map((r) => [r.name, []]));
  const newcomers = [];
  students.forEach((s) => {
    const sala = saved.get(s.id) || (s.cod && s.salaCod) || "";
    if (sala && byRoom.has(sala)) byRoom.get(sala).push(s);
    else newcomers.push(s);
  });
  const toPlace = placeNew ? newcomers : [];

  const lastUsed = rooms.reduce((last, r, i) => (byRoom.get(r.name).length > 0 ? i : last), 0);
  const order = [
    ...rooms.slice(lastUsed),
    ...rooms.slice(0, lastUsed).reverse(),
  ];
  const placedNew = new Map(); // sala → elevii noi puși acolo
  let k = 0;
  for (const room of order) {
    while (k < toPlace.length && byRoom.get(room.name).length < seatsOf(room)) {
      byRoom.get(room.name).push(toPlace[k]);
      placedNew.set(room.name, (placedNew.get(room.name) || 0) + 1);
      k++;
    }
  }
  let overflow = 0;
  if (k < toPlace.length && rooms.length > 0) {
    const target = rooms[lastUsed].name;
    while (k < toPlace.length) {
      byRoom.get(target).push(toPlace[k++]);
      placedNew.set(target, (placedNew.get(target) || 0) + 1);
      overflow++;
    }
  }

  const data = [];
  const roomSummaries = [];
  rooms.forEach((room) => {
    const placed = byRoom.get(room.name);
    if (placed.length === 0) return;
    placed.sort(
      (x, y) =>
        classRank(x.clasa) - classRank(y.clasa) ||
        x.nume.localeCompare(y.nume, "ro", { sensitivity: "base" })
    );
    const perClass = {};
    placed.forEach((student, idx) => {
      perClass[student.clasa] = (perClass[student.clasa] || 0) + 1;
      data.push({ ...student, sala: room.name, etaj: room.floor || "", loc_in_sala: idx + 1 });
    });
    roomSummaries.push({
      room,
      seats: seatsOf(room),
      count: placed.length,
      perClass,
      mosaic: Object.keys(perClass).length > 2,
    });
  });

  return {
    data,
    roomSummaries,
    allocated: data.length,
    unallocated: 0,
    newcomers: newcomers.length,
    placedNewCount: toPlace.length,
    overflow,
    placedNew: [...placedNew.entries()],
  };
}

// statistica unei repartizări (pentru afișare și jurnal)
export function allocationStats(roomSummaries, rooms) {
  const usedNames = new Set(roomSummaries.map((x) => x.room.name));
  const emptyRooms = rooms.filter((r) => !usedNames.has(r.name));
  const last = roomSummaries[roomSummaries.length - 1] || null;
  const freeUsed = roomSummaries.reduce((sum, x) => sum + Math.max(0, x.seats - x.count), 0);
  return {
    placed: roomSummaries.reduce((sum, x) => sum + x.count, 0),
    roomsUsed: roomSummaries.length,
    lastRoom: last ? `${last.room.name}${last.room.floor ? ` (${last.room.floor})` : ""}` : "",
    lastCount: last ? last.count : 0,
    lastSeats: last ? last.seats : 0,
    emptyRooms: emptyRooms.map((r) => `${r.name}${r.floor ? ` (${r.floor})` : ""}`),
    freeEmpty: emptyRooms.reduce((sum, r) => sum + seatsOf(r), 0),
    freeUsed,
    over: roomSummaries.filter((x) => x.count > x.seats).map((x) => `${x.room.name} (${x.count}/${x.seats})`),
  };
}
