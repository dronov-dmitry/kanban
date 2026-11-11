import Dexie, { type Table } from 'dexie';

export interface OutboxItem {
  id: string;
  path: string;
  method: string;
  body: unknown;
  createdAt: number;
  attempts: number;
}

interface SnapshotRow {
  key: string;
  data: unknown;
  updatedAt: number;
}

class KanbanDatabase extends Dexie {
  snapshots!: Table<SnapshotRow, string>;
  outbox!: Table<OutboxItem, string>;

  constructor() {
    super('kanban-offline');
    this.version(1).stores({
      snapshots: 'key',
      outbox: 'id, createdAt',
    });
  }
}

export const db = new KanbanDatabase();

export async function cacheSnapshot(key: string, data: unknown): Promise<void> {
  try {
    await db.snapshots.put({ key, data, updatedAt: Date.now() });
  } catch {
    // private mode or quota exceeded: offline cache is best-effort
  }
}

export async function readSnapshot<T>(key: string): Promise<{ data: T; updatedAt: number } | null> {
  try {
    const row = await db.snapshots.get(key);
    if (!row) return null;
    return { data: row.data as T, updatedAt: row.updatedAt };
  } catch {
    return null;
  }
}

export async function enqueueMutation(item: OutboxItem): Promise<void> {
  await db.outbox.put(item);
  window.dispatchEvent(new CustomEvent('kanban:outbox'));
}

export async function outboxCount(): Promise<number> {
  try {
    return await db.outbox.count();
  } catch {
    return 0;
  }
}

export async function clearOfflineData(): Promise<void> {
  try {
    await db.snapshots.clear();
    await db.outbox.clear();
  } catch {
    // ignore
  }
}
