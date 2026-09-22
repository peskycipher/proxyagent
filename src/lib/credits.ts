import { getDb, newId } from "@/lib/db";

/** Atomically add seconds to a user's balance. Never negative totals. */
export function credit(userId: string, deltaSeconds: number, reason: string, ref?: string): void {
  if (!Number.isInteger(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error("credit delta must be a positive integer");
  }
  const db = getDb();
  const txn = db.transaction(() => {
    db.prepare("UPDATE users SET balance_seconds = balance_seconds + ? WHERE id = ?").run(deltaSeconds, userId);
    db.prepare("INSERT INTO credit_txns (id, user_id, delta_seconds, reason, ref, created_at) VALUES (?,?,?,?,?,?)").run(
      newId("txn"), userId, deltaSeconds, reason, ref ?? null, Date.now(),
    );
  });
  txn();
}

/** Atomically debit seconds; throws if the balance would go negative. */
export function debit(userId: string, deltaSeconds: number, reason: string, ref?: string): void {
  if (!Number.isInteger(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error("debit delta must be a positive integer");
  }
  const db = getDb();
  const txn = db.transaction(() => {
    const res = db
      .prepare("UPDATE users SET balance_seconds = balance_seconds - ? WHERE id = ? AND balance_seconds >= ?")
      .run(deltaSeconds, userId, deltaSeconds);
    if (res.changes === 0) {
      throw new Error("insufficient credits");
    }
    db.prepare("INSERT INTO credit_txns (id, user_id, delta_seconds, reason, ref, created_at) VALUES (?,?,?,?,?,?)").run(
      newId("txn"), userId, -deltaSeconds, reason, ref ?? null, Date.now(),
    );
  });
  txn(); // better-sqlite3 transactions are synchronous; serialized per connection
}

export function balanceSeconds(userId: string): number {
  const row = getDb().prepare("SELECT balance_seconds FROM users WHERE id = ?").get(userId) as
    | { balance_seconds: number }
    | undefined;
  if (!row) throw new Error("user not found");
  return row.balance_seconds;
}

export function txnsFor(userId: string): Array<{ delta_seconds: number; reason: string; created_at: number }> {
  return getDb()
    .prepare("SELECT delta_seconds, reason, created_at FROM credit_txns WHERE user_id = ? ORDER BY created_at ASC")
    .all(userId) as Array<{ delta_seconds: number; reason: string; created_at: number }>;
}