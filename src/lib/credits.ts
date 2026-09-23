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
 * One batch, two statements guarded by the same pre-state predicate, so the
 * balance move and the ledger row apply together or not at all — no crash or
 * error between them can debit without an audit row (or vice versa).
 * The ledger INSERT runs first with a WHERE guard (0 rows when unaffordable);
 * inside the batch both statements see the same pre-state, and results[0]
 * tells us whether the debit happened.
 */
export async function debit(userId: string, deltaSeconds: number, reason: string, ref?: string): Promise<void> {
  if (!Number.isInteger(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error("debit delta must be a positive integer");
  }
  const db = await getDb();
  const res = await db.batch([
    {
      sql: "INSERT INTO credit_txns (id, user_id, delta_seconds, reason, ref, created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND balance_seconds >= ?)",
      params: [newId("txn"), userId, -deltaSeconds, reason, ref ?? null, Date.now(), userId, deltaSeconds],
    },
    {
      sql: "UPDATE users SET balance_seconds = balance_seconds - ? WHERE id = ? AND balance_seconds >= ?",
      params: [deltaSeconds, userId, deltaSeconds],
    },
  ]);
  if ((res[0]?.changes ?? 0) === 0) {
    throw new Error("insufficient credits");
  }
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