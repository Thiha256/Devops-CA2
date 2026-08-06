"# Devops-CA2" 

# Ansible — Server Provisioning & Configuration (IaC)
**Owner: Lin Htut Win — DevOps component (Infrastructure as Code)**

This folder uses **Ansible** to automatically turn a fresh AWS EC2 server into a
fully configured, Docker-ready environment for the RP Resource Centre app —
**repeatably, idempotently, and documented**. It covers **server setup +
configuration**. Deploying/running the app is a separate component that runs on
the server this prepares.

## What it does
- Installs **Docker Engine + Docker Compose** (`docker` role)
- Configures the server: **timezone, a dedicated app user, the app directory**,
  and a **secure `.env` generated from Vault-encrypted secrets** (`common` role)
- Everything is **idempotent** — re-running only changes what isn't already correct

## Structure
```
ansible/
  ansible.cfg                     Ansible settings (inventory, roles path, sudo)
  inventory/
    aws_prod                      the target EC2 (IP + SSH key)
    group_vars/all/
      vars.yml                    non-secret config (app dir, port, timezone, packages)
      vault.yml                   ENCRYPTED secrets (Ansible Vault)
  roles/
    common/                       base config + secure .env from Vault
      tasks/main.yml
      templates/env.j2
    docker/                       Docker Engine + Compose install
      tasks/main.yml
      handlers/main.yml           restart docker only when something changed
  playbooks/
    provision.yml                 runs the roles → full server setup
    verify.yml                    asserts the setup is correct (Docker, service, env)
```

## Design choices (the "why")
- **Roles** keep the automation modular and reusable (`docker` could provision any host).
- **group_vars** centralise configuration so every run is consistent — change once, applies everywhere.
- **Ansible Vault** keeps secrets (DB password, tokens) encrypted at rest; they're
  only decrypted in memory at run time. This is why plaintext `.env` is never committed.
- **Handlers** restart Docker only on change (efficient, idempotent).
- **`verify.yml`** proves the environment is correct — the functionality check.

## Prerequisites
1. A running **AWS EC2** instance (Ubuntu, e.g. `t3.micro` Free Tier), security
   group allowing inbound **SSH (22)**.
2. The **`.pem` SSH key** from AWS.
3. **Ansible on Linux** — it does not run natively on Windows; use **WSL**.

### Install Ansible via WSL (Windows)
```bash
wsl --install            # in PowerShell (once), then restart & open Ubuntu
sudo apt update && sudo apt install -y ansible
ansible --version
```

## Set up your secrets (Ansible Vault)
```bash
# 1. Put real values into inventory/group_vars/all/vault.yml, then encrypt it:
ansible-vault encrypt inventory/group_vars/all/vault.yml
# (edit later with:  ansible-vault edit inventory/group_vars/all/vault.yml)
```

## How to run
```bash
# From the ansible/ folder, in your WSL/Linux terminal:

# 1. Put your EC2 IP + key path into inventory/aws_prod
# 2. Test connectivity
ansible aws -m ping
# 3. Provision + configure the server (prompts for the vault password)
ansible-playbook playbooks/provision.yml --ask-vault-pass
# 4. Verify it worked
ansible-playbook playbooks/verify.yml
```

## Security notes
- The **`.pem` key** is gitignored (`*.pem`) — never commit it.
- **`vault.yml`** must be **encrypted** before committing (it becomes AES-256 ciphertext).
- Secrets are rendered into the server `.env` with `no_log: true`, so they never
  appear in Ansible's console output.


# CI/CD Pipeline and Trivy Security Scanning

**Owner: Thiha Aung — DevOps component (CI/CD and security scanning)**

This project uses **GitHub Actions** to automatically check, test, scan, build, and deploy the RP Resource Centre application. The pipeline prevents code with failed tests, syntax errors, serious security vulnerabilities, or Docker build problems from being deployed.

## What it does

### Continuous Integration

The CI pipeline runs when:

- Code is pushed to configured branches, including `main`
- A pull request targets `main`
- The workflow is manually started using `workflow_dispatch`

The pipeline performs the following operations:

1. Checks out the repository.
2. Configures Node.js 20 with npm caching.
3. Checks that the required GitHub secret is available.
4. Installs exact dependencies using `npm ci`.
5. checks JavaScript syntax using `npm run check`.
6. scans the repository using Trivy.
7. Runs automated tests using `npm test`.
8. Validates `docker-compose.yml`.
9. Builds the application Docker image.
10. Starts the application and MySQL containers.
11. Performs an HTTP health check on port `3001`.
12. Displays Docker logs if the pipeline fails.
13. Stops and removes the CI containers after testing.

### Trivy Security Scan

The CI pipeline uses the official `aquasecurity/trivy-action` to scan the project filesystem and its dependencies.

```yaml
scan-type: fs
scan-ref: .
severity: HIGH,CRITICAL
ignore-unfixed: true
exit-code: "1"
```

The pipeline fails when Trivy detects a fixable **HIGH** or **CRITICAL** vulnerability. Unfixed vulnerabilities are reported but ignored to prevent failures caused by issues that currently have no available patch.

### Continuous Deployment

The CD pipeline runs after the CI pipeline succeeds on the `main` branch. It can also be started manually from the GitHub Actions page.

The deployment pipeline:

1. Connects securely to the AWS EC2 instance through SSH.
2. Initialises the application Git repository if it does not already exist.
3. Fetches the latest `main` branch.
4. Synchronises the server with `origin/main`.
5. Rebuilds and restarts the Docker Compose services.
6. Removes orphaned containers.
7. Displays the running container status.
8. Repeatedly checks the application health endpoint.
9. Shows the latest Docker logs if deployment fails.

A deployment is considered successful only when the application responds successfully at:

```text
http://localhost:3001/
```

## Structure

```text
.github/
  workflows/
    ci.yml            installs, checks, scans, tests and builds the project
    cd.yml            deploys successful main-branch builds to AWS EC2
