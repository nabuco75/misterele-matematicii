// Codurile de anonimizare date de pe mai multe calculatoare: niciun cod dublu, niciun elev cu două coduri.
import { beforeEach, describe, expect, it, vi } from "vitest";

// o bază de date în memorie, cu tranzacții executate pe rând (cum le serializează serverul)
const store = new Map();
vi.mock("../src/firebase", () => ({ db: {}, auth: {} }));
vi.mock("firebase/firestore", () => {
  const doc = (_db, col, id) => ({ path: `${col}/${id}` });
  return {
    doc,
    collection: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    deleteDoc: vi.fn(),
    deleteField: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    writeBatch: vi.fn(),
    serverTimestamp: vi.fn(),
    onSnapshot: vi.fn(),
    runTransaction: async (_db, fn) => {
      const writes = [];
      const tx = {
        get: async (ref) => ({
          exists: () => store.has(ref.path),
          data: () => store.get(ref.path),
        }),
        set: (ref, data) => writes.push([ref.path, data]),
      };
      const out = await fn(tx);
      writes.forEach(([p, d]) => store.set(p, d));
      return out;
    },
  };
});

const { reserveCodes } = await import("../src/studentSync");

beforeEach(() => store.clear());

describe("reserveCodes", () => {
  it("dă numere consecutive elevilor noi", async () => {
    const r = await reserveCodes(["a|ana", "a|ion", "b|maria"]);
    expect([...r.values()].map((x) => x.n)).toEqual([1, 2, 3]);
    expect([...r.values()].every((x) => x.nou)).toBe(true);
  });

  it("al doilea calculator primește ACELAȘI cod pentru același elev, nu un al doilea", async () => {
    const first = await reserveCodes(["a|ana"]);
    // primul calculator a scris și documentul de cod
    store.set("codes/MMVS_01", { n: 1, regId: "a", nume: "Ana" }); // cheia „a|ana”
    const second = await reserveCodes(["a|ana", "a|ion"]);
    expect(second.get("a|ana")).toEqual({ n: first.get("a|ana").n, nou: false });
    expect(second.get("a|ion").n).toBe(2);
  });

  it("dacă primul calculator încă n-a scris codul, al doilea îl scrie cu același număr", async () => {
    await reserveCodes(["a|ana"]);
    const second = await reserveCodes(["a|ana"]);
    expect(second.get("a|ana")).toEqual({ n: 1, nou: true });
  });

  it("un cod retras nu se refolosește", async () => {
    await reserveCodes(["a|ana"]);
    store.set("codes/MMVS_01", { n: 1, retras: true });
    const again = await reserveCodes(["a|ana"]);
    expect(again.get("a|ana").n).toBe(2);
  });

  it("după o corectare de nume, un elev nou cu numele vechi NU primește codul celui redenumit", async () => {
    await reserveCodes(["a|ana pop"]);
    // codul MMVS_01 a fost dat Anei, apoi numele a fost corectat în „Ion Ion”
    store.set("codes/MMVS_01", { n: 1, regId: "a", nume: "Ion Ion" });
    const r = await reserveCodes(["a|ana pop"]);
    expect(r.get("a|ana pop")).toEqual({ n: 2, nou: true });
  });

  it("pornește după cel mai mare cod existent (date vechi, fără contor)", async () => {
    const r = await reserveCodes(["x|y"], 247);
    expect(r.get("x|y").n).toBe(248);
  });
});
