# Deployment Architecture

**Contributor:** May Poe Khitt
**Deployment part of RP Resource Centre Laptop Loaning System — DevOps CA2**

Live URL: **https://rp-loans-may.duckdns.org** 🔒

> *The instance is stopped when not in use to preserve AWS credits.
> If the link is offline, contact me to bring it up (~90 seconds to boot).*

---

## Architecture Overview

```
              ┌─────────────────────────────────────────────┐
              │                Internet                     │
              └─────────────────────┬───────────────────────┘
                                    │
                                    ▼
                        https://rp-loans-may.duckdns.org
                                    │
                                    │  (Let's Encrypt SSL)
                                    ▼
              ┌─────────────────────────────────────────────┐
              │       AWS EC2  (Singapore, t3.micro)        │
              │       Ubuntu 24.04 LTS                      │
              │  ┌────────────────────────────────────────┐ │
              │  │   Caddy (reverse proxy, HTTPS)         │ │
              │  └────────────────┬───────────────────────┘ │
              │                   ▼ localhost:3001          │
              │  ┌────────────────────────────────────────┐ │
              │  │       Docker Compose network           │ │
              │  │   ┌──────────────┐  ┌──────────────┐   │ │
              │  │   │   app        │  │     db       │   │ │
              │  │   │ Node.js/EJS  │──│  MySQL 8     │   │ │
              │  │   │  Port 3001   │  │  Port 3306   │   │ │
              │  │   └──────────────┘  └──────────────┘   │ │
              │  └────────────────────────────────────────┘ │
              └─────────────────────────────────────────────┘
```

---

## Design Choices & Why

| Component | Choice | Why |
|---|---|---|
| Cloud | **AWS EC2** | Named as an L4 example in the rubric ("Well-Configured Cloud Deployment"). Free tier + $100 credits cover the whole CA period. |
| OS | **Ubuntu 24.04 LTS** | Long-term support, huge ecosystem, familiar tooling. |
| Instance | **t3.micro** | Free-plan eligible. 1 vCPU / 1 GiB is enough for a Node.js app + MySQL for a demo audience. |
| Orchestration | **Docker Compose** (team's) | Uses the same `docker-compose.yml` the team runs locally → "images run consistently across environments" (rubric wording). |
| Database | **MySQL 8** (containerized) | Same version as local dev. Schema auto-loaded via `sql/setup_db_v3.sql` on first boot. |
| Domain | **DuckDNS** (free) | Real domain name instead of raw IP. Free, dynamic-DNS ready. |
| DNS auto-update | **cron + curl** | AWS reassigns the public IP on every reboot; a cron job pushes the new IP to DuckDNS on `@reboot` and every 5 min. |
| HTTPS | **Caddy + Let's Encrypt** | Automatic cert provisioning and 60-day renewal. Reverse-proxies to the app on port 3001 so the browser sees a clean `https://` URL. |
| Secrets | **.env file** (server-only) | Never in git (`.env` is `.gitignore`-d). Injected into containers by Docker Compose. |
| SSH auth | **RSA key pair** (`rp-cicd-key.pem`) | No password login. Key is on the maintainer's local machine only. |
| Firewall | **AWS Security Group** | Least-privilege: 22 (SSH), 80 (HTTP), 443 (HTTPS), 3001 (app for direct testing). |

---

## Environment Variables

Stored in `/home/ubuntu/Devops-CA2/.env` on the server.
**Never committed to git.**

```env
# Database (points to the MySQL container inside Docker Compose)
DB_HOST=db
DB_USER=root
DB_DATABASE=resource_centre_db
DB_PASSWORD=<team-shared-secret>

# Notifications (n8n workflow)
N8N_WEBHOOK_URL=https://n8ngc.codeblazar.org/webhook/rp-notify
CRON_SECRET=<team-shared-secret>

# Business rules
FINE_RATE_PER_DAY=1
DUE_SOON_DAYS=2

# AI Reviewer
GEMINI_API_KEY=<team-shared-secret>
```

Note: `DB_HOST=db` (Docker service name), **not** `127.0.0.1`.
Inside Docker Compose, containers reach each other by service name.

---

## How the Live URL Stays Alive Across Reboots

AWS gives the instance a new public IP on every stop/start. Without automation
the domain would break every restart. The following runs on the server:

```
/opt/duckdns/token           (chmod 600 — DuckDNS token)
/opt/duckdns/update.sh       (curls DuckDNS with the current public IP)
```

Cron entries (`sudo crontab -l`):

```
*/5 * * * * /opt/duckdns/update.sh
@reboot   sleep 30 && /opt/duckdns/update.sh
```

Result: after any instance restart, within ~90 seconds the DNS record points
to the new IP and the URL works again — no manual intervention.

---

## Security Layers

| Layer | Protection |
|---|---|
| SSH | Key-only (no passwords), specific `.pem` file required |
| AWS Security Group | Only ports 22 / 80 / 443 / 3001 open |
| HTTPS | Let's Encrypt certificate, auto-renewal via Caddy |
| Secrets | `.env` file `chmod 600` on server, not in git, MFA on AWS root account |
| Database | Container only reachable from the app container, not the public internet |

---

## Reproducing This Deployment (Runbook)

For a maintainer with the `.pem` key and DuckDNS token.

### 1. Launch instance

- EC2 → Launch instance
- Ubuntu Server 24.04 LTS, t3.micro
- Key pair: `rp-cicd-key`
- Security group: allow inbound TCP 22, 80, 443, 3001 from 0.0.0.0/0

### 2. SSH in

```bash
ssh -i rp-cicd-key.pem ubuntu@<public-ip>
```

### 3. Install Docker

```bash
sudo apt update
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit  # re-SSH so group membership takes effect
```

### 4. Clone repo & set env

```bash
sudo apt install -y gh
gh auth login                         # device flow
git clone https://github.com/Thiha256/Devops-CA2.git
cd Devops-CA2
nano .env                             # paste the shared env values
```

### 5. Start the app

```bash
docker compose up -d
docker compose ps
```

### 6. Install Caddy for HTTPS

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
rp-loans-may.duckdns.org {
    reverse_proxy localhost:3001
}
```

Reload:

```bash
sudo systemctl reload caddy
```

Wait ~30 seconds — Let's Encrypt issues the cert automatically.

### 7. DuckDNS auto-updater

```bash
sudo mkdir -p /opt/duckdns
echo "<your-duckdns-token>" | sudo tee /opt/duckdns/token
sudo chmod 600 /opt/duckdns/token
sudo tee /opt/duckdns/update.sh > /dev/null << 'EOF'
#!/bin/bash
TOKEN=$(cat /opt/duckdns/token)
DOMAIN=rp-loans-may
mkdir -p /var/log/duckdns
echo | curl -k "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=" \
  >/var/log/duckdns/duck.log 2>&1
echo " -- $(date)" >> /var/log/duckdns/duck.log
EOF
sudo chmod +x /opt/duckdns/update.sh
(sudo crontab -l 2>/dev/null; \
  echo "*/5 * * * * /opt/duckdns/update.sh"; \
  echo "@reboot sleep 30 && /opt/duckdns/update.sh") | sudo crontab -
```

---

## Updating the Live App (After Code Changes)

Every time the team merges to `main`, redeploying takes two commands:

```bash
cd ~/Devops-CA2
git pull
docker compose up -d --build
```

This is the exact hook a CI/CD pipeline (e.g. Wang Lin's GitHub Actions
workflow) can automate later — SSH in, run those two lines.

---

## Operating Commands

**Check container status**
```bash
docker compose ps
```

**View app logs**
```bash
docker compose logs -f app
```

**View database logs**
```bash
docker compose logs -f db
```

**Restart everything**
```bash
docker compose restart
```

**Check Caddy status**
```bash
sudo systemctl status caddy
```

**Manually force DuckDNS to refresh (if URL isn't resolving)**
```bash
sudo /opt/duckdns/update.sh
cat /var/log/duckdns/duck.log
```

---

## Cost Management

- Instance is **stopped** whenever it isn't needed. Running t3.micro costs
  ~$0.30/day of credits; stopped costs only ~$0.03/day for the EBS volume.
- $100 AWS Free-plan credits cover 300+ days of running time.

---

## Deployment Story

The deployment surfaced one real production issue: the `getMostBorrowedModels`
query in `models/reportModel.js` used `LIMIT ?` with a bound parameter, which
the mysql2 driver rejects (`Incorrect arguments to mysqld_stmt_execute`). The
fix (`LIMIT ${Number(limit)}`) is on branch `maypoe-fix-reports`, hot-fixed on
the live server and pushed back to the repo so the whole team gets the
correction.

This confirmed the value of a real deployment as part of the CA — the app
works locally *and* in production, and the deploy step caught a bug the local
dev environment hid.
