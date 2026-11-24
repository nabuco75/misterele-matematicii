// Teste pentru logica pură: repartizare, note, premii, profesori, contoare.
// Rulare: npm test
import { describe, expect, it, vi } from "vitest";

// modulele importă Firebase; în teste nu avem nevoie de baza de date
vi.mock("../src/firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  onSnapshot: vi.fn(),
}));

const { allocateByClassPairs, allocateKeepingCodes, duplicateRoomNames } = await import("../src/allocation");
const { buildResults, parseScore, formatSuma, nameGradeId } = await import("../src/grading");
const { prizeRows, prizeSummary, prizeClasses, PRIZE_AMOUNTS } = await import("../src/prizeMoney");
const { teacherKey } = await import("../src/teachers");
const { countsFromDoc, legacyVipByName } = await import("../src/classCounts");

const CLASSES = ["a IV-a", "a V-a", "a VI-a", "a VII-a"];
const makeStudents = (n, clasa = null) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i % 7}-Elev ${i}`,
    regId: `r${i % 7}`,
    nume: `Elev ${String(i).padStart(3, "0")}`,
    clasa: clasa || CLASSES[i % 4],
    scoala: "Școala X",
    profesor: "Pop Ana",
  }));
const makeRooms = (n, seats = 25) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `Sala ${i + 1}`, floor: "Parter", seats }));

describe("repartizare", () => {
  it("fiecare elev ajunge într-o singură sală și nicio sală nu trece de locuri", () => {
    const students = makeStudents(247);
    const rooms = makeRooms(11);
    const r = allocateByClassPairs(students, rooms);
    expect(r.data).toHaveLength(247);
    expect(new Set(r.data.map((s) => s.id)).size).toBe(247);
    rooms.forEach((room) => {
      expect(r.data.filter((s) => s.sala === room.name).length).toBeLessThanOrEqual(room.seats);
    });
  });

  it("locuri insuficiente: se pun exact câte locuri sunt, restul sunt raportați", () => {
    const r = allocateByClassPairs(makeStudents(60), makeRooms(2, 25));
    expect(r.data).toHaveLength(50);
    expect(r.unplacedStudents).toHaveLength(10);
  });

  it("zero elevi sau săli de 0 locuri nu strică nimic", () => {
    expect(allocateByClassPairs([], makeRooms(3)).data).toHaveLength(0);
    expect(allocateByClassPairs(makeStudents(5), makeRooms(2, 0)).data).toHaveLength(0);
  });

  it("repartizarea păstrată: elevii salvați rămân în sala lor, cei noi nu se pierd", () => {
    const students = makeStudents(30);
    const rooms = makeRooms(2, 25);
    const saved = new Map(students.slice(0, 20).map((s) => [s.id, "Sala 2"]));
    const r = allocateKeepingCodes(students, rooms, { saved });
    students.slice(0, 20).forEach((s) => expect(r.data.find((d) => d.id === s.id).sala).toBe("Sala 2"));
    expect(r.data).toHaveLength(30);
    expect(r.newcomers).toBe(10);
  });

  it("nume de sală repetate sunt detectate", () => {
    expect(duplicateRoomNames([{ name: "Sala 6" }, { name: " sala 6 " }, { name: "Sala 7" }])).toHaveLength(1);
  });
});

describe("note și rezultate", () => {
  it("parseScore acceptă virgulă, respinge texte și valori în afara 0–10", () => {
    expect(parseScore("8,5").value).toBe(8.5);
    expect(parseScore("").value).toBe(null);
    expect(parseScore("abc").error).toBeTruthy();
    expect(parseScore("11").error).toBeTruthy();
  });

  it("suma apare doar cu toate 3 notele; absentul nu are sumă; locul ține cont de egalități", () => {
    const st = makeStudents(4, "a V-a");
    const g = {
      [nameGradeId(st[0])]: { s1: 10, s2: 9.5, s3: 0.25 },
      [nameGradeId(st[1])]: { s1: 10, s2: 9.5, s3: 0.25 },
      [nameGradeId(st[2])]: { s1: 5, s2: 5 },
      [nameGradeId(st[3])]: { absent: true, s1: 7, s2: 7, s3: 7 },
    };
    const rows = buildResults(st, g);
    expect(rows[0].suma).toBe(19.75);
    expect(formatSuma(rows[0].suma)).toBe("19,75");
    expect(rows[0].loc).toBe(1);
    expect(rows[1].loc).toBe(1);
    expect(rows[2].suma).toBe(null);
    expect(rows[2].stare).toBe("incomplet");
    expect(rows[3].stare).toBe("absent");
    expect(rows[3].suma).toBe(null);
  });

  it("nota pusă pe cod are prioritate față de cea pusă pe nume", () => {
    const [s] = makeStudents(1);
    const withCode = { ...s, cod: "MMVS_01" };
    const rows = buildResults([withCode], {
      [nameGradeId(s)]: { s1: 1, s2: 1, s3: 1 },
      MMVS_01: { s1: 9, s2: 9, s3: 9 },
    });
    expect(rows[0].suma).toBe(27);
  });
});

describe("premii în bani", () => {
  const rows = [
    { nume: "a b", clasa: "a V-a", premiu: "I", stare: "notat", suma: 30 },
    { nume: "c d", clasa: "a V-a", premiu: "M3", stare: "notat", suma: 20 },
    { nume: "e f", clasa: "a IV-a", premiu: "SSMR", stare: "notat", suma: 19 },
    { nume: "g h", clasa: "a IV-a", premiu: "II", stare: "incomplet", suma: null },
    { nume: "i j", clasa: "a VI-a", premiu: "M", stare: "notat", suma: 15 },
  ];
  it("doar premiile cu bani, la elevi notați complet; totalurile pe clase dau totalul", () => {
    const list = prizeRows(rows);
    expect(list.map((r) => r.premiu)).toEqual(["I", "M3"]);
    const sum = prizeSummary(list);
    expect(sum.total).toBe(PRIZE_AMOUNTS.I + PRIZE_AMOUNTS.M3);
    expect(prizeClasses(list).reduce((n, c) => n + c.total, 0)).toBe(sum.total);
  });
  it("un premiu cu suma 0 nu apare", () => {
    expect(prizeRows(rows, { ...PRIZE_AMOUNTS, M3: 0 }).map((r) => r.premiu)).toEqual(["I"]);
  });
});

describe("profesori și contoare", () => {
  it("același profesor scris diferit are aceeași cheie", () => {
    expect(teacherKey("POPESCU maria-ELENA")).toBe(teacherKey("Maria Elena Popescu"));
    expect(teacherKey("Ștefan Ion")).toBe(teacherKey("stefan ion"));
    expect(teacherKey("Pop Ana")).not.toBe(teacherKey("Pop Ioana"));
  });
  it("contorul ignoră valori greșite", () => {
    expect(countsFromDoc({ IV: 3, V: -1, VI: "2", seq: 4 })).toEqual({ IV: 3, V: 0, VI: 0, VII: 0, seq: 4 });
    expect(countsFromDoc(null)).toEqual({ IV: 0, V: 0, VI: 0, VII: 0, seq: 0 });
  });
  it("școlile VIP vechi sunt recunoscute după nume", () => {
    expect(legacyVipByName("Școala Gimnazială „Ștefan cel Mare” Vaslui")).toBe(true);
    expect(legacyVipByName("Școala Gimnazială nr. 2 Târgu Ocna")).toBe(false);
  });
});
