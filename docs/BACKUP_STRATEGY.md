# MongoDB Backup Strategy — ABC ERP

Database: **ABC_ERP** on MongoDB Atlas (`vardhancluster`)

---

## 1. Atlas Cloud Backup (recommended — enable now)

1. Log in to [MongoDB Atlas](https://cloud.mongodb.com)
2. Select cluster **vardhancluster**
3. Go to **Backup** in the left menu
4. Enable **Cloud Backup** (M10+ tier) or **Shared cluster backup** if available
5. Turn on **Continuous Cloud Backup** for point-in-time recovery
6. Set retention: **minimum 7 days** (30 days recommended for business ERP)

### Restore test (monthly)

1. Atlas → Backup → **Restore**
2. Restore to a **new** cluster or database name `ABC_ERP_staging`
3. Point backend `.env` at staging URI temporarily
4. Run: `npx ts-node scripts/check-db.ts`
5. Verify `users`, `sales`, `ledgerentries` counts match expectations

---

## 2. Manual backup (mongodump)

Requires [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools) installed.

### Windows (PowerShell)

```powershell
cd e:\ABC_ERP\backend\scripts
.\backup-mongodb.ps1
```

Backups save to: `e:\ABC_ERP\backups\ABC_ERP-YYYYMMDD-HHmmss.gz`

### Manual command

```powershell
$env:MONGODB_URI = "your-atlas-uri-from-env"
mongodump --uri="$env:MONGODB_URI" --gzip --archive="..\backups\ABC_ERP-manual.gz"
```

---

## 3. Restore from manual backup

```powershell
cd e:\ABC_ERP\backend\scripts
.\restore-mongodb.ps1 -ArchivePath "..\..\backups\ABC_ERP-manual.gz" -TargetUri "mongodb+srv://..."
```

**Warning:** `--drop` removes existing data in target database. Always restore to staging first.

---

## 4. What to back up

| Item | Method |
|------|--------|
| MongoDB `ABC_ERP` | Atlas continuous + weekly mongodump |
| `backend/.env` | Password manager / secure vault — **never git** |
| Product images | Cloudinary dashboard backup |
| Code | Git repository |

---

## 5. Recovery targets

| Metric | Target |
|--------|--------|
| RPO (max data loss) | 24 hours without PITR; **minutes** with Atlas continuous backup |
| RTO (max downtime) | 4 hours |

---

## 6. Pre-production checklist

- [ ] Atlas backup enabled on `vardhancluster`
- [ ] Ran `backup-mongodb.ps1` successfully once
- [ ] Tested restore to staging database
- [ ] `.env` secrets stored outside git
- [ ] Atlas IP allowlist configured
- [ ] Database user has least-privilege (not root admin for app)

---

## 7. After major data operations

Run ledger validation on active accounts:

```
GET /api/customers/:id/ledger/validate
GET /api/suppliers/:id/ledger/validate
```

If `inSync: false`, investigate before taking next backup.
