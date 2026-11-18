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

const classRank = (cls) => {
  const i = CLASS_ORDER.indexOf(cls);
  return i === -1 ? CLASS_ORDER.length : i;
};

const seatsOf = (room) => Math.max(0, parseInt(room.seats) || 0);

export function allocateByClassPairs(students, rooms) {
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

  return {
    data,
    roomSummaries,
    allocated: data.length,
    unallocated: students.length - data.length,
  };
}
