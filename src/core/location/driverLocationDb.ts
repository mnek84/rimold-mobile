import { randomUUID } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import type { PendingLocation } from './driverLocationTypes';

const DB_NAME = 'driver_location_queue.db';

let dbPromise: Promise<SQLiteDatabase | null> | null = null;

async function getDb(): Promise<SQLiteDatabase | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (dbPromise === null) {
    dbPromise = (async () => {
      const db = await openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS pending_locations (
          id TEXT PRIMARY KEY NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          heading REAL,
          speed REAL,
          accuracy REAL,
          timestamp INTEGER NOT NULL,
          synced INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_retry_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_pending_sync ON pending_locations (synced, next_retry_at, timestamp);
      `);
      return db;
    })();
  }
  return dbPromise;
}

export type PendingLocationRow = PendingLocation & {
  attempts: number;
  next_retry_at: number | null;
};

function rowToPending(r: {
  id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  timestamp: number;
  synced: number;
  attempts: number;
  next_retry_at: number | null;
}): PendingLocationRow {
  return {
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    heading: r.heading ?? undefined,
    speed: r.speed ?? undefined,
    accuracy: r.accuracy ?? undefined,
    timestamp: r.timestamp,
    synced: r.synced === 1,
    attempts: r.attempts,
    next_retry_at: r.next_retry_at,
  };
}

/**
 * Persist a fix locally, then callers should invoke the sync worker when online.
 */
export async function insertPendingLocation(input: Omit<PendingLocation, 'id' | 'synced'>): Promise<void> {
  const db = await getDb();
  if (db === null) {
    return;
  }
  const id = randomUUID();
  await db.runAsync(
    `INSERT INTO pending_locations (id, lat, lng, heading, speed, accuracy, timestamp, synced, attempts, next_retry_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)`,
    id,
    input.lat,
    input.lng,
    input.heading ?? null,
    input.speed ?? null,
    input.accuracy ?? null,
    input.timestamp,
  );
}

/** Oldest unsynced rows ready for upload (respects exponential backoff). */
export async function selectPendingBatchForSync(nowMs: number, limit: number): Promise<PendingLocationRow[]> {
  const db = await getDb();
  if (db === null) {
    return [];
  }
  const rows = await db.getAllAsync<{
    id: string;
    lat: number;
    lng: number;
    heading: number | null;
    speed: number | null;
    accuracy: number | null;
    timestamp: number;
    synced: number;
    attempts: number;
    next_retry_at: number | null;
  }>(
    `SELECT id, lat, lng, heading, speed, accuracy, timestamp, synced, attempts, next_retry_at
     FROM pending_locations
     WHERE synced = 0 AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY timestamp ASC
     LIMIT ?`,
    nowMs,
    limit,
  );
  return rows.map(rowToPending);
}

export async function deletePendingByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  if (db === null) {
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM pending_locations WHERE id IN (${placeholders})`, ...ids);
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;

export async function markPendingBatchFailed(ids: string[], attemptsById: Record<string, number>): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  if (db === null) {
    return;
  }
  const now = Date.now();
  for (const id of ids) {
    const prev = attemptsById[id] ?? 0;
    const nextAttempts = prev + 1;
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(prev, 16));
    const nextRetryAt = now + backoff;
    await db.runAsync(
      `UPDATE pending_locations SET attempts = ?, next_retry_at = ? WHERE id = ?`,
      nextAttempts,
      nextRetryAt,
      id,
    );
  }
}

/** Approximate count of rows waiting to sync (for debugging / UI). */
export async function countUnsyncedPending(): Promise<number> {
  const db = await getDb();
  if (db === null) {
    return 0;
  }
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM pending_locations WHERE synced = 0`,
  );
  return row?.c ?? 0;
}
