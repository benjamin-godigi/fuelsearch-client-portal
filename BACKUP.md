# Backup & Restore Runbook

Three systems to cover: **Supabase** (data), **Vercel** (deployments), **GitHub** (code).

---

## 1. Supabase — database backups

### What needs backing up
- **Schema** is already version-controlled in `supabase/migrations/` — no extra work needed.
- **Data** (transactions, profiles, clients, depots) must be dumped separately.

### Running a manual backup
```bash
# Dump both staging and production
bash scripts/backup-db.sh

# Dump production only
bash scripts/backup-db.sh prod

# Dump staging only
bash scripts/backup-db.sh staging
```
Files land in `backups/prod/` and `backups/staging/` with timestamps. The `backups/` directory is gitignored — these stay local.

**First-time setup:** make sure the Supabase CLI is authenticated:
```bash
supabase login
```
One-time — the token is cached on the machine.

### Automated daily backup (Windows Task Scheduler)
1. Open **Task Scheduler** → **Create Basic Task**
2. Name: `FuelSearch DB Backup`
3. Trigger: **Daily** at a low-traffic time (e.g. 02:00)
4. Action: **Start a program**
   - Program: `C:\Program Files\Git\bin\bash.exe`
   - Arguments: `"C:\Users\Benjamin\Documents\Client portal for Allan\fuelsearch-client-portal-react\scripts\backup-db.sh"`
5. Finish. Test with **Run** to confirm it works.

Keep the last **3–5 production dumps**. Delete older files manually.

### Restore procedure

#### A — Schema only (no data loss, just re-apply migrations)
```bash
supabase db push --project-ref efjnltsombshrimuohtb   # prod
supabase db push --project-ref aykgexwofckejdozejoo   # staging
```

#### B — Restore data from a dump file
1. Get your **database connection string** from the Supabase dashboard:
   - Project → **Settings → Database → Connection string → URI**
   - Use the **Session mode (port 5432)** string, not the transaction pooler.
2. Run the restore:
   ```bash
   psql "postgresql://postgres.efjnltsombshrimuohtb:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres" \
     < backups/prod/prod_2026-06-10_02-00-00.sql
   ```
3. Verify row counts in the Supabase Table Editor after restore.

**Warning:** restoring data overwrites existing rows. Always target a fresh or test project first unless this is a genuine disaster recovery.

#### C — Point-in-time recovery (Pro plan)
If the Supabase project is on the **Pro plan**, Supabase keeps daily automated backups for 7 days with PITR available. Access them under:
**Supabase Dashboard → Project → Database → Backups**

---

## 2. Vercel — deployment backups

Every production deployment is an **immutable snapshot** preserved by Vercel indefinitely. No additional backup is needed.

See the rollback runbook in **`CLAUDE.md`** for how to re-promote any past deployment in ~10 seconds.

---

## 3. GitHub — code backups

The Git repo is inherently distributed — every developer machine that has cloned it holds a full copy. The `main` branch and all release tags are authoritative.

### Additional safeguard: off-site mirror
To protect against accidental repo deletion on GitHub, keep a local mirror on a separate drive or machine:
```bash
# Clone as a bare mirror (one-time)
git clone --mirror https://github.com/benjamin-godigi/fuelsearch-client-portal-react.git \
  /path/to/external-drive/fuelsearch-client-portal-react.git

# Update the mirror periodically
cd /path/to/external-drive/fuelsearch-client-portal-react.git
git fetch --all
```

### Release tags
After every prod promotion, tag `main` so you have a named baseline:
```bash
git fetch origin main
git tag release/YYYY-MM-DD origin/main
git push origin release/YYYY-MM-DD
```
Tags are listed at: **GitHub → Releases/Tags tab**.

---

## Backup schedule recommendation

| System        | Frequency          | How                                      |
| ------------- | ------------------ | ---------------------------------------- |
| Supabase prod | Daily (automated)  | Windows Task Scheduler → `backup-db.sh` |
| Supabase staging | On-demand       | `bash scripts/backup-db.sh staging`      |
| Vercel        | Continuous         | Every deployment is preserved            |
| GitHub        | Continuous         | Distributed git + periodic mirror update |
| Release tags  | After every prod push | `git tag release/YYYY-MM-DD && push`  |
