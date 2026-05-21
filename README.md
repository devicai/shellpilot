# ShellPilot

Governance and traceability layer for AI agents (Claude Code, Cursor, Codex...) executing CLIs.

ShellPilot sits between an agent and the real CLIs it invokes (`gh`, `stripe`, `gcloud`, `notion`...). For every command it:

1. **Authorizes** the invocation against a policy (`allow` / `deny` / `requires-approval`).
2. **Injects credentials Just-In-Time** — short-lived tokens (~60s) instead of long-lived ones living next to the agent.
3. **Audits** the call with human-readable context (decision, matched rule, redacted args).

This repository contains the **standalone OS module** (backend + frontend + nginx). A companion Go binary (the actual CLI router; not in this folder) consumes the API to enforce decisions on the developer's machine.

## Architecture

```
┌────────────────┐        ┌──────────────────────────────────────────┐
│ Agent          │        │ Developer machine                        │
│ (Claude Code,  │  exec  │  PATH shim → Go wrapper                  │
│  Cursor, …)    ├───────▶│  ├─ GET /clis     (catalog)              │
└────────────────┘        │  ├─ POST /rules/evaluate  (decision)     │
                          │  ├─ POST /credentials/issue + /verify    │
                          │  └─ POST /traces  (audit)                │
                          └───────────────┬──────────────────────────┘
                                          │ HTTPS
                                          ▼
                          ┌──────────────────────────────────────────┐
                          │ ShellPilot                               │
                          │  ┌──────────┐   ┌──────────┐             │
                          │  │ Backend  │◀──┤ Frontend │             │
                          │  │ (NestJS) │   │ (React)  │             │
                          │  └──┬───────┘   └──────────┘             │
                          │     │                                    │
                          │  ┌──▼──┐  ┌──────┐                       │
                          │  │Mongo│  │Redis │ (JIT, policy cache)   │
                          │  └─────┘  └──────┘                       │
                          └──────────────────────────────────────────┘
```

## Modules

| Module           | Purpose                                                            | Auth                |
| ---------------- | ------------------------------------------------------------------ | ------------------- |
| `auth`           | Email + password login → JWT                                       | Public (login), JWT |
| `users`          | Admin console operators                                            | JWT (admin)         |
| `api-keys`       | Tokens used by the Go wrapper                                      | JWT                 |
| `clis-catalog`   | Catalog of supported CLIs and install commands per OS              | JWT / API key       |
| `rules`          | Policies and rules (allow / deny / requires-approval) + evaluator  | JWT + API key       |
| `credentials`    | AES-256-GCM vault and JIT token issuer                             | JWT + API key       |
| `traces`         | Audit ingest + query + stats                                       | JWT + API key       |

## Quick start (local dev)

```bash
# 1. Bootstrap config
cp .env.example .env
# Generate a 32-byte master key and paste into SECRETS_MASTER_KEY
openssl rand -base64 32

# 2. Start Mongo + Redis
docker compose -f docker-compose.dev.yml up -d

# 3. Backend
cd backend
cp config.example.yml config.yml
yarn
yarn start:dev          # http://localhost:3100/api/v1/docs

# 4. Frontend (in another terminal)
cd ../frontend
yarn
yarn dev                # http://localhost:5173
```

Default admin user is created from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` on first boot if no users exist.

## End-to-end verification

```bash
BASE=http://localhost:3100/api/v1

# Login → JWT
JWT=$(curl -s -X POST $BASE/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@shellpilot.local","password":"changeme"}' | jq -r .accessToken)

# Add 'gh' to the catalog
curl -s -X POST $BASE/clis -H "authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"slug":"gh","name":"GitHub CLI","envVarHint":"GH_TOKEN","installCommands":{"mac":"brew install gh"}}'

# Create a policy and a deny rule
POLICY=$(curl -s -X POST $BASE/rules/policies -H "authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"name":"default","defaultEffect":"allow","enforcement":"warn","active":true}' | jq -r .id)
curl -s -X POST $BASE/rules/policies/$POLICY/rules -H "authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"cli":"gh","path":"repo delete *","effect":"deny","reason":"destructive"}'

# Create an API key (token is shown only once)
APIKEY=$(curl -s -X POST $BASE/api-keys -H "authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d '{"name":"wrapper-laptop","scopes":["rules:read","credentials:issue","traces:write"]}' | jq -r .token)

# Wrapper-style evaluate
curl -s -X POST $BASE/rules/evaluate -H "x-api-key: $APIKEY" -H 'content-type: application/json' \
  -d '{"cli":"gh","args":["repo","delete","my-repo"]}'
# → {"decision":"deny","matchedRule":{"path":"repo delete *",...},...}

# Store a credential, then issue + consume a JIT token
USER_ID=$(curl -s $BASE/auth/me -H "authorization: Bearer $JWT" | jq -r .id)
curl -s -X POST $BASE/credentials/store -H "authorization: Bearer $JWT" -H 'content-type: application/json' \
  -d "{\"cli\":\"gh\",\"envVar\":\"GH_TOKEN\",\"secret\":\"ghp_real_token_here\"}"
JIT=$(curl -s -X POST $BASE/credentials/issue -H "x-api-key: $APIKEY" -H 'content-type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"cli\":\"gh\"}" | jq -r .jitToken)
curl -s -X POST $BASE/credentials/verify -H "x-api-key: $APIKEY" -H 'content-type: application/json' \
  -d "{\"jitToken\":\"$JIT\"}"
# → {"envVar":"GH_TOKEN","secret":"ghp_..."}  -- single use

# Second verify must fail
curl -s -X POST $BASE/credentials/verify -H "x-api-key: $APIKEY" -H 'content-type: application/json' \
  -d "{\"jitToken\":\"$JIT\"}"
# → 404 Not Found
```

## Configuration

`backend/config.yml` (copy from `config.example.yml`). Supports `${ENV_VAR:-default}` substitution.

Key sections:
- `secrets.masterKey` — base64 of 32 bytes (AES-256-GCM master key). Required.
- `auth.jwt.secret` — JWT signing secret.
- `auth.bootstrap` — admin email/password seeded if no users exist.
- `extensions.properties` — empty by default (standalone). Add `clientUID` to scope all entities to a Devic tenant.

## Multi-tenancy (optional)

The code is wired for tenant scoping. To enable it, add to `config.yml`:

```yaml
extensions:
  properties:
    - name: clientUID
      type: string
      required: true
      index: true
      entities: "*"
      source: header
      headerName: x-client-uid
```

After enabling, every request must include `x-client-uid: <tenant>`. `BaseRepository` automatically filters queries by tenant and enriches creates.

## Out of scope (this version)

- Approval flow (push notification + resume) for `requires-approval` decisions.
- Webhooks (events stub is present; emission is not implemented).
- Auto-detect installation by OS in the wrapper (catalog stores commands but the wrapper picks one).
- Bridge to SuntropyAI for tenant sync.
- Security audit — addressed in a later phase.

## Follow-ups

- **Profiles** — group of CLIs + credentials + rules tied to a use case
  (`marketing`, `devops`, `qa`). A workstation auths with a profile and
  receives only that profile's catalog and policy. Models multi-team rollouts
  without exploding into one ShellPilot instance per team.
- **CLI catalog import/export from a central repo** — load `clis/*.yml`
  definitions from a shared registry (e.g. `devicai/cli-definitions`) so
  metadata (install commands, env var hints, logo URLs) is curated once and
  reused. Today every instance authors its own catalog.
- **Trace JIT issuance** — emit an audit trace when `/credentials/issue` runs
  (CLI, user, the triggering command path). Right now only `/verify` activity
  shows up because `/issue` is upstream of the wrapper's exec step.

## License

Apache 2.0
