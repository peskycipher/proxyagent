/** Wall-clock usage meter for a chat request. */
export class Meter {
  private startedAt = Date.now();
  private stoppedAt: number | null = null;

  /** Seconds billed (minimum 1s), frozen after the first stop(). */
  stop(): number {
    if (this.stoppedAt === null) this.stoppedAt = Date.now();
    return Math.max(1, Math.ceil((this.stoppedAt - this.startedAt) / 1000));
  }
}