# CyclePlanner Deployment Guide (P6-2)

## Local Development

```bash
# 1. Copy and configure environment
cp .env.example .env

# 2. Install dependencies
pnpm install

# 3. Start development servers
pnpm dev
# → Frontend: http://localhost:5173
# → API:      http://localhost:3000
```

## Docker Compose (Local)

```bash
# Start all services (Valhalla + API + Caddy)
docker compose up -d
# → Web: http://localhost:8080

# Stop
docker compose down
```

## Server Deployment

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env:
HOST_BIND=0.0.0.0
DEPLOY_MODE=server
CADDY_HOSTNAME=radplaner.example.com
CADDY_TLS=                      # Empty = Let's Encrypt
CYCLEPLANNER_CREDENTIALS=admin $2a$14$hash...
```

### 2. Generate password hash

```bash
docker run --rm caddy:2-alpine caddy hash-password --plaintext "your-password"
```

### 3. Build frontend

```bash
pnpm build
# → apps/web/dist/
```

### 4. Start services

```bash
docker compose up -d
```

## Backup

SQLite database is a single file:

```bash
# Backup
cp data/cycleplanner.db "backups/cycleplanner-$(date +%Y%m%d).db"

# Restore
cp backup-file.db data/cycleplanner.db
```

## Monitoring

```bash
# View logs
docker compose logs -f

# Check Valhalla status
curl http://localhost:8002/status

# Check API health
curl http://localhost:3000/api/health
```

## Resource Requirements

| Setup | Storage | RAM | Build Time |
|---|---|---|---|
| Single state (Sachsen) | ~5 GB | 4 GB | ~15 min |
| Germany (all 16 states) | ~40 GB | 16 GB | ~2 h |
| Mid-Europe (DE+AT+CH+CZ+PL) | ~100 GB | 32 GB | ~6 h |
