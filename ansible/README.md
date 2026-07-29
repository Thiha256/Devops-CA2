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
