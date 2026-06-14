# Production Hardening Plan — Jewellery ERP

**Goal:** Move from ~58/100 to 90+/100 production readiness before new features.  
**Scope:** Data integrity, financial accuracy, stock accuracy, security, stability, ops.

---

## Priority 1 Issue Register

### P1-01: Sale cancel does not reverse ledger

| Item | Detail |
|------|--------|
| **Root cause** | `cancelSale` sets `balanceDue = 0` before calling `postSaleReturnLedger`, which exits when `balanceDue <= 0`. ACC sales need full debit/credit reversal, not only remaining balance. |
| **Files** | `backend/src/controllers/saleController.ts`, `backend/src/services/ledgerService.ts` |
| **APIs** | `POST /api/sales/:id/cancel` (if exists) or cancel handler |
| **Collections** | `sales`, `ledgerentries`, `customers` |
| **Business risk** | Cancelled invoices leave customer outstanding and ledger wrong — legal/accounting liability. |
| **Fix** | New `reverseSaleLedger()` using original sale snapshot; call **before** mutating sale; transactional cancel. |

### P1-02: Sale + stock not atomic

| Item | Detail |
|------|--------|
| **Root cause** | `createSale` opens MongoDB session; `updateStock()` starts **separate** session/transaction each call. |
| **Files** | `saleController.ts`, `stockService.ts`, `purchaseController.ts` |
| **APIs** | `POST /api/sales`, purchase receive |
| **Collections** | `sales`, `products`, `inventorytransactions` |
| **Business risk** | Stock deducted without sale, or sale without stock — inventory untrustworthy. |
| **Fix** | Pass parent `session` into `updateStock`; skip nested transaction when session provided. |

### P1-03: Dual payment APIs (ledger bypass)

| Item | Detail |
|------|--------|
| **Root cause** | `POST /api/payments` updates `customer.outstandingAmount` without ledger or invoice allocation. |
| **Files** | `paymentController.ts` vs `creditController.ts` |
| **APIs** | `POST /payments` vs `POST /customers/:id/receive-payment` |
| **Collections** | `payments`, `customers`, `ledgerentries`, `sales` |
| **Business risk** | Two sources of truth; statements don't match outstanding. |
| **Fix** | Block customer **receipts** on generic `/payments`; force credit flow. Supplier payments may stay on `/payments` until supplier ledger phase. |

### P1-04: Advance balance never consumed

| Item | Detail |
|------|--------|
| **Root cause** | Stub in `receiveCustomerPayment`; advance incremented on overpay but not applied on new sales/payments. |
| **Files** | `creditController.ts`, `ledgerService.ts` |
| **APIs** | `POST /customers/:id/receive-payment`, sale create |
| **Collections** | `customers`, `payments`, `sales` |
| **Business risk** | Customer prepayments lost on books; manual reconciliation required. |
| **Fix** | Auto-apply advance FIFO before cash allocation; ledger `ADVANCE_ADJUSTMENT`. |

### P1-05: Opening balance overwrite

| Item | Detail |
|------|--------|
| **Root cause** | `setOpeningBalance` has no guard; `outstandingAmount` **set** not merged; negative not → advance. |
| **Files** | `ledgerService.ts`, `creditController.ts` |
| **APIs** | `POST /customers/:id/opening-balance` |
| **Collections** | `customers`, `ledgerentries` |
| **Business risk** | Duplicate OB corrupts entire account history. |
| **Fix** | Reject if OB ledger entry already exists; transaction wrapper. |

### P1-06: Ledger running balance race

| Item | Detail |
|------|--------|
| **Root cause** | `getLastBalance` + insert is read-modify-write without lock. |
| **Files** | `ledgerService.ts` |
| **APIs** | All ledger-posting endpoints |
| **Collections** | `ledgerentries`, `customers` |
| **Business risk** | Concurrent payments produce wrong running balance. |
| **Fix** | Post within MongoDB transaction; optional `validateLedgerIntegrity()`; document number atomic counter (P2). |

### P1-07: Direct stock mutation bypass

| Item | Detail |
|------|--------|
| **Root cause** | `updateProduct` accepts full `req.body` including `currentStock`; bulk import sets stock directly. |
| **Files** | `productController.ts`, `importExportController.ts` |
| **APIs** | `PUT /products/:id`, `POST /import/stock` |
| **Collections** | `products`, `inventorytransactions` |
| **Business risk** | Stock on screen ≠ physical stock; audit trail broken. |
| **Fix** | Field allowlist on product update; import via `updateStock`. |

### P1-08: PDF/export without auth

| Item | Detail |
|------|--------|
| **Root cause** | Frontend `window.open()` sends no Bearer token. |
| **Files** | `POSPage.tsx`, `SalesPage.tsx`, `CustomerDetailPage.tsx`, `ProductsPage.tsx` |
| **APIs** | PDF/export GET endpoints |
| **Collections** | N/A |
| **Business risk** | Broken UX; potential IDOR if URLs guessed (mitigated by auth when fixed). |
| **Fix** | Authenticated blob download helper (Phase C). |

### P1-09: Default JWT secrets

| Item | Detail |
|------|--------|
| **Root cause** | `env.ts` falls back to `'access-secret'`. |
| **Files** | `config/env.ts` |
| **APIs** | All authenticated routes |
| **Collections** | `users` |
| **Business risk** | Token forgery in production if env not set. |
| **Fix** | Fail fast in production without secrets; `.env.example`. |

### P1-10: No automated tests

| Item | Detail |
|------|--------|
| **Root cause** | No test framework configured. |
| **Files** | Entire repo |
| **Business risk** | Regressions on every change. |
| **Fix** | Vitest + integration tests for ledger, stock, payments (Phase E). |

---

## Implementation Phases

| Phase | Focus | Exit criteria |
|-------|-------|---------------|
| **A** | Financial integrity | Cancel reverses ledger; single payment path; advance + OB protected |
| **B** | Inventory integrity | Atomic sale/stock; no direct stock edits |
| **C** | Security | Env, JWT, rate limits, auth downloads |
| **D** | Production infra | Docker, CI, logging, backup docs |
| **E** | Testing | 80%+ business logic coverage target |

---

## After Each Fix Template

Document in PR/commit notes:
- Files changed
- Reason
- Risk eliminated
- Testing performed
- Remaining risks

---

## Hardening Implementation Log

### Phase A — Financial Integrity (completed)

| Fix | Files | Risk eliminated | Tests |
|-----|-------|-----------------|-------|
| Sale cancel ledger reversal | `ledgerService.ts`, `saleController.ts` | Cancelled ACC/short-term sales no longer leave wrong outstanding/ledger | Unit tests for reversal amounts |
| Atomic cancel transaction | `saleController.ts` | Partial cancel (stock reversed but ledger not) prevented | Build pass |
| Payment consistency | `paymentController.ts` | Generic `/payments` can no longer bypass ledger for customer receipts | Unit test for routing rule |
| Advance handling | `creditController.ts`, `ledgerService.ts` | Advance auto-applied FIFO; overpay only advances when explicit | Manual review |
| Opening balance protection | `ledgerService.ts` | Duplicate OB rejected; negative OB → advance | Build pass |
| Ledger validation | `ledgerService.ts`, `creditController.ts` | Post-payment sync check logs drift | Unit test tolerance logic |

### Phase B — Inventory Integrity (completed)

| Fix | Files | Risk eliminated | Tests |
|-----|-------|-----------------|-------|
| Atomic sale + stock | `stockService.ts`, `saleController.ts` | Sale/stock commit or rollback together | Build pass |
| Stock rollback on cancel | `saleController.ts` | Cancel restores stock in same transaction | Build pass |
| Block direct stock edit | `productController.ts` | PUT products cannot mutate `currentStock` | Build pass |
| Import via updateStock | `importExportController.ts` | Bulk import/adjust creates audit trail | Build pass |

### Phase C — Security (partial)

| Fix | Files | Risk eliminated | Remaining |
|-----|-------|-----------------|-----------|
| Env fail-fast | `env.ts`, `.env.example` | Default JWT secrets blocked in production | Rotate existing prod secrets |
| Login rate limit | `loginRateLimit.ts`, `routes/index.ts` | Brute-force login throttled | Add IP allowlist if needed |
| Auth downloads | `api.ts`, POS/Sales/Customer/Products pages | PDF/export work with Bearer token | — |
| Upload hardening | `upload.ts` | Explicit MIME allowlist | Virus scan (P2) |

### Phase D — Production Infrastructure (skeleton)

| Item | Files |
|------|-------|
| Docker | `backend/Dockerfile`, `frontend/Dockerfile` |
| Compose | `docker-compose.yml` |
| CI | `.github/workflows/ci.yml` |
| Logging | `utils/logger.ts` |
| Backup docs | `docs/BACKUP_STRATEGY.md` |

### Phase E — Testing (started)

| Item | Status |
|------|--------|
| Vitest setup | `vitest.config.ts`, `creditService.test.ts` |
| 80% business logic coverage | **Not yet** — foundation only; expand with integration tests |

### Estimated readiness score

| Before | After hardening pass |
|--------|---------------------|
| ~58/100 | ~72/100 |

Remaining to reach 90+: integration tests, purchase atomicity, supplier ledger, monitoring (APM), permission audit script, full ledger race serialization.

