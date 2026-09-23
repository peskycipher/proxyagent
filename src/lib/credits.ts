import { getDb, newId } from "@/lib/db";

/** Atomically add seconds to a user's balance. Never negative totals. */
export async function credit(userId: string, deltaSeconds: number, reason: string, ref?: string): Promise<void> {
  if (!Number.isInteger(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error("credit delta must be a positive integer");
  }
  const db = await getDb();
  await db.batch([
    { sql: "UPDATE users SET balance_seconds = balance_seconds + ? WHERE id = ?", params: [deltaSeconds, userId] },
    {
      sql: "INSERT INTO credit_txns (id, user_id, delta_seconds, reason, ref, created_at) VALUES (?,?,?,?,?,?)",
      params: [newId("txn"), userId, deltaSeconds, reason, ref ?? null, Date.now()],
    },
  ]);
}

/**
 * Atomically debit seconds; throws if the balance would go negative.
 * The check-and-decrement is one guarded SQL statement, so it stays atomic
 * under concurrency (the guarded UPDATE either applies or changes 0 rows).
 */
export async function debit(userId: string, deltaSeconds: number, reason: string, ref?: string): Promise<void> {
  if (!Number.isInteger(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error("debit delta must be a positive integer");
  }
  const db = await getDb();
  const res = await db.run(
    "UPDATE users SET balance_seconds = balance_seconds - ? WHERE id = ? AND balance_seconds >= ?",
    deltaSeconds, userId, deltaSeconds,
  );
  if (res.changes === 0) {
    throw new Error("insufficient credits");
  }
  await db.run(
    "INSERT INTO credit_txns (id, user_id, delta_seconds, reason, ref, created_at) VALUES (?,?,?,?,?,?)",
    newId("txn"), userId, -deltaSeconds, reason, ref ?? null, Date.now(),
  );
}

export async function balanceSeconds(userId: string): Promise<number> {
  const row = await (await getDb()).get<{ balance_seconds: number }>(
    "SELECT balance_seconds FROM users WHERE id = ?",
    userId,
  );
  if (!row) throw new Error("user not found");
  return row.balance_seconds;
}

export async function txnsFor(userId: string): Promise<Array<{ delta_seconds: number; reason: string; created_at: number }>> {
  return (await getDb())
    .all<{ delta_seconds: number; reason: string; created_at: number }>(
      "SELECT delta_seconds, reason, created_at FROM credit_txns WHERE user_id = ? ORDER BY created_at ASC",
      userId,
    );
}