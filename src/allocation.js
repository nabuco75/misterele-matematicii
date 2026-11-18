// Repartizarea elevilor pe săli: câte 2 clase în fiecare sală, aproximativ jumătate-jumătate.
//
// Fiecare sală are două „jumătăți” (la sala cu număr impar de locuri, prima jumătate are un loc în plus).
// Fiecare clasă primește un număr întreg de jumătăți, suficient cât să-i încapă elevii, iar elevii ei
// se împart cât mai egal pe acestea (alfabetic, în continuare de la o sală la alta).
// Jumătățile se așază în ordinea claselor (cea mai numeroasă prima): primele R jumătăți merg în prima
// jumătate a sălilor 1..R, următoarele R în a doua jumătate. Astfel în fiecare sală se întâlnesc
// două clase diferite (de ex. a V-a cu a VI-a, apoi a V-a cu a VII-a ...).
// Dacă sălile nu ajung pentru această împărțire, elevii se pun în ordine, sală după sală (pot apărea 3 clase).

export const CLASS_ORDER = ["a IV-a", "a V-a", "a VI-a", "a VII-a"];

const classRank = (cls) => {
  const i = CLASS_ORDER.indexOf(cls);
  return i === -1 ? CLASS_ORDER.length : i;
};

const seatsOf = (room) => Math.max(0, parseInt(room.seats) || 0);

// capacitățile jumătăților pentru primele R săli: întâi primele jumătăți, apoi cele de-a doua
const halfSlots = (rooms, R) => {
  const first = rooms.slice(0, R).map((room, i) => ({ room: i, cap: Math.ceil(seatsOf(room) / 2) }));
  const second = rooms.slice(0, R).map((room, i) => ({ room: i, cap: Math.floor(seatsOf(room) / 2) }));
  return [...first, ...second];
};

// împarte n elevi cât mai egal pe jumătățile date, fără a depăși capacitatea fiecăreia
const spread = (n, caps) => {
  const counts = caps.map(() => 0);
  for (let s = 0; s < n; s++) {
    let best = -1;
    caps.forEach((cap, j) => {
      if (counts[j] < cap && (best === -1 || counts[j] < counts[best])) best = j;
    });
    if (best === -1) return null;
    counts[best]++;
  }
  return counts;
};

// încearcă împărțirea pe jumătăți; întoarce numărul de elevi pentru fiecare (sală, jumătate) sau null
const planByHalves = (classes, groups, rooms) => {
  const usableRooms = rooms.filter((r) => seatsOf(r) > 0);
  const allCaps = halfSlots(usableRooms, usableRooms.length).map((s) => s.cap);
  const avgHalf = allCaps.reduce((s, n) => s + n, 0) / (allCaps.length || 1);
  if (!avgHalf) return null;

  const k = {};
  classes.forEach((cls) => {
    k[cls] = Math.max(1, Math.ceil(groups[cls].length / avgHalf));
  });

  for (let attempt = 0; attempt < 100; attempt++) {
    let S = classes.reduce((s, cls) => s + k[cls], 0);
    // numărul de jumătăți trebuie să fie par, iar clasa cea mai numeroasă nu poate avea mai multe
    // jumătăți decât săli (altfel ar ajunge cu ea însăși în aceeași sală) → le dăm celorlalte câte una în plus
    const big = classes[0];
    const others = classes.slice(1);
    let turn = 0;
    while (S % 2 === 1 || (others.length && k[big] > S / 2)) {
      if (!others.length || (S % 2 === 1 && k[big] + 1 <= (S + 1) / 2)) {
        k[big]++;
      } else {
        k[others[turn % others.length]]++;
        turn++;
      }
      S++;
    }
    const R = S / 2;
    if (R > usableRooms.length) return null;

    const slots = halfSlots(usableRooms, R);
    // ordinea jumătăților în listă: 0..R-1 = prima jumătate a sălilor, R..2R-1 = a doua
    let cursor = 0;
    let overflow = null;
    const plan = [];
    for (const cls of classes) {
      const mine = slots.slice(cursor, cursor + k[cls]);
      const counts = spread(groups[cls].length, mine.map((s) => s.cap));
      if (!counts) {
        overflow = cls;
        break;
      }
      mine.forEach((slot, j) => plan.push({ cls, room: slot.room, half: cursor + j < R ? 0 : 1, count: counts[j] }));
      cursor += k[cls];
    }
    if (!overflow) return { plan, rooms: usableRooms };
    k[overflow]++;
  }
  return null;
};

export function allocateByClassPairs(students, rooms) {
  // grupare pe clase, păstrând ordinea alfabetică primită
  const groups = {};
  students.forEach((s) => {
    (groups[s.clasa] = groups[s.clasa] || []).push(s);
  });
  const classes = Object.keys(groups).sort(
    (a, b) => groups[b].length - groups[a].length || classRank(a) - classRank(b)
  );

  const byRoom = rooms.map(() => []);
  const result = planByHalves(classes, groups, rooms);

  if (result) {
    // elevii unei clase se împart alfabetic în ordinea sălilor (Sala 6, 7, 8 ...)
    const offset = {};
    [...result.plan].sort((a, b) => a.room - b.room).forEach(({ cls, room, count }) => {
      const from = offset[cls] || 0;
      const roomIndex = rooms.indexOf(result.rooms[room]);
      byRoom[roomIndex].push(...groups[cls].slice(from, from + count));
      offset[cls] = from + count;
    });
  } else {
    // nu ajung sălile pentru exact 2 clase/sală → elevii (clasele una după alta) umplu întâi prima
    // jumătate a tuturor sălilor, apoi a doua; unde se termină o clasă pot apărea 3 clase într-o sală
    const sequence = classes.flatMap((cls) => groups[cls]);
    let left = sequence.length;
    const counts = rooms.map((room) => {
      const n = Math.min(seatsOf(room), left);
      left -= n;
      return n;
    });
    const firstHalf = counts.map((n) => Math.ceil(n / 2));
    let c1 = 0;
    let c2 = firstHalf.reduce((s, n) => s + n, 0);
    rooms.forEach((room, i) => {
      byRoom[i] = [
        ...sequence.slice(c1, c1 + firstHalf[i]),
        ...sequence.slice(c2, c2 + counts[i] - firstHalf[i]),
      ];
      c1 += firstHalf[i];
      c2 += counts[i] - firstHalf[i];
    });
  }

  const data = [];
  const roomSummaries = [];
  rooms.forEach((room, i) => {
    const placed = byRoom[i];
    if (placed.length === 0) return;

    // în listă: pe clase (IV, V, VI, VII), apoi alfabetic
    placed.sort(
      (a, b) =>
        classRank(a.clasa) - classRank(b.clasa) ||
        a.nume.localeCompare(b.nume, "ro", { sensitivity: "base" })
    );

    const perClass = {};
    placed.forEach((student, idx) => {
      perClass[student.clasa] = (perClass[student.clasa] || 0) + 1;
      data.push({ ...student, sala: room.name, etaj: room.floor || "", loc_in_sala: idx + 1 });
    });
    roomSummaries.push({ room, seats: seatsOf(room), count: placed.length, perClass });
  });

  return {
    data,
    roomSummaries,
    allocated: data.length,
    unallocated: students.length - data.length,
    twoClassesPerRoom: Boolean(result),
  };
}
