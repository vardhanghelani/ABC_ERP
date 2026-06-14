const POS_IDEMPOTENCY_STORAGE_KEY = 'abc_erp_pos_idempotency_key';
const POS_SUBMIT_LOCK_KEY = 'abc_erp_pos_submit_lock';
const POS_SUBMIT_LOCK_AT = 'abc_erp_pos_submit_lock_at';
const STALE_LOCK_MS = 2 * 60 * 1000;

export function getOrCreatePosIdempotencyKey(): string {
  const existing = sessionStorage.getItem(POS_IDEMPOTENCY_STORAGE_KEY);
  if (existing && existing.length >= 8) return existing;
  const key = crypto.randomUUID();
  sessionStorage.setItem(POS_IDEMPOTENCY_STORAGE_KEY, key);
  return key;
}

export function clearPosIdempotencyKey(): void {
  sessionStorage.removeItem(POS_IDEMPOTENCY_STORAGE_KEY);
}

export function isPosSubmitLocked(): boolean {
  if (sessionStorage.getItem(POS_SUBMIT_LOCK_KEY) !== '1') return false;
  const lockedAt = Number(sessionStorage.getItem(POS_SUBMIT_LOCK_AT) || 0);
  if (!lockedAt || Date.now() - lockedAt > STALE_LOCK_MS) {
    unlockPosSubmit();
    return false;
  }
  return true;
}

export function lockPosSubmit(): void {
  sessionStorage.setItem(POS_SUBMIT_LOCK_KEY, '1');
  sessionStorage.setItem(POS_SUBMIT_LOCK_AT, String(Date.now()));
}

export function unlockPosSubmit(): void {
  sessionStorage.removeItem(POS_SUBMIT_LOCK_KEY);
  sessionStorage.removeItem(POS_SUBMIT_LOCK_AT);
}

/** Clear stale locks when POS opens (e.g. after browser crash mid-sale). */
export function reconcilePosSubmitLock(): void {
  if (!isPosSubmitLocked()) unlockPosSubmit();
}
