import { firestore, FieldValue, seedReady } from "./firebase";

/**
 * Generic in-memory cache for a Firestore collection.
 * Loads all docs ONCE at boot, then serves all reads from memory.
 * All writes go to Firestore AND update the cache atomically in JS,
 * so reads stay correct without re-reading from Firestore.
 *
 * This is the key technique that lets the app survive on Firebase's
 * free tier: 1 read per collection per server boot, then 0 reads forever.
 */
export class CollectionCache {
  private map: Map<number, any> | null = null;
  private loading: Promise<Map<number, any>> | null = null;

  constructor(public readonly name: string) {
    // warm cache on construction (non-blocking) — wait for seed to complete first
    seedReady
      .then(() => this.load())
      .catch((e) =>
        console.error(`[cache:${this.name}] initial load failed:`, e?.message ?? e),
      );
  }

  private async load(): Promise<Map<number, any>> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        await seedReady;
        const snap = await firestore.collection(this.name).get();
        const m = new Map<number, any>();
        for (const doc of snap.docs) {
          const idNum = parseInt(doc.id, 10);
          if (!Number.isFinite(idNum)) continue;
          m.set(idNum, doc.data());
        }
        this.map = m;
        console.log(`[cache:${this.name}] loaded ${m.size} docs`);
        return m;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async ready(): Promise<Map<number, any>> {
    if (this.map) return this.map;
    return this.load();
  }

  invalidate() {
    this.map = null;
  }

  /** Synchronous getter — only safe to call after `ready()` resolved at least once */
  unsafeMap(): Map<number, any> | null {
    return this.map;
  }

  async get(id: number): Promise<any | undefined> {
    const m = await this.ready();
    return m.get(id);
  }

  async all(): Promise<Array<{ id: number; data: any }>> {
    const m = await this.ready();
    return Array.from(m.entries()).map(([id, data]) => ({ id, data }));
  }

  async filter(predicate: (data: any, id: number) => boolean): Promise<Array<{ id: number; data: any }>> {
    const m = await this.ready();
    const out: Array<{ id: number; data: any }> = [];
    for (const [id, data] of m.entries()) if (predicate(data, id)) out.push({ id, data });
    return out;
  }

  async findOne(predicate: (data: any, id: number) => boolean): Promise<{ id: number; data: any } | undefined> {
    const m = await this.ready();
    for (const [id, data] of m.entries()) if (predicate(data, id)) return { id, data };
    return undefined;
  }

  /** Write a full document (set). Updates Firestore and the cache. */
  async set(id: number, data: any): Promise<void> {
    await firestore.collection(this.name).doc(String(id)).set(data);
    if (this.map) this.map.set(id, data);
  }

  /**
   * Partial update. Merges into both Firestore and the cache.
   * Handles FieldValue.increment by computing the result locally too.
   */
  async update(id: number, updates: Record<string, any>): Promise<any | undefined> {
    await firestore.collection(this.name).doc(String(id)).update(updates);
    if (!this.map) return undefined;
    const existing = this.map.get(id);
    if (!existing) return undefined;
    const merged: any = { ...existing };
    for (const [k, v] of Object.entries(updates)) {
      // FieldValue.increment instances expose `.operand` (admin SDK) — fall back to leaving the
      // existing value alone if we can't compute it locally; cache will be re-merged next boot.
      const anyV = v as any;
      if (anyV && typeof anyV === "object" && typeof anyV.operand === "number") {
        merged[k] = (Number(merged[k] ?? 0) || 0) + anyV.operand;
      } else {
        merged[k] = v;
      }
    }
    this.map.set(id, merged);
    return merged;
  }

  async delete(id: number): Promise<void> {
    await firestore.collection(this.name).doc(String(id)).delete();
    if (this.map) this.map.delete(id);
  }
}

export { FieldValue };

// Singleton caches — created once, shared across routes.
export const usersCache = new CollectionCache("users");
export const customersCache = new CollectionCache("customers");
export const salesCache = new CollectionCache("sales");
export const shortagesCache = new CollectionCache("shortages");
export const expensesCache = new CollectionCache("expenses");
export const advancesCache = new CollectionCache("advances");
export const shiftsCache = new CollectionCache("shifts");
export const tasksCache = new CollectionCache("tasks");
export const salariesCache = new CollectionCache("salaries");
export const onlineOrdersCache = new CollectionCache("online_orders");
export const distributorOffersCache = new CollectionCache("distributor_offers");
