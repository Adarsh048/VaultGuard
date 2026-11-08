# VaultGuard Least-Privilege Application Policy
# Restricts backend access strictly to the accounts data namespace within the KV v2 engine

# KV v2 data path for privileged accounts
# Allows creating, reading, updating (new version), and deleting secret versions
path "secret/data/accounts/*" {
  capabilities = ["create", "read", "update", "delete"]
}

# KV v2 metadata path for privileged accounts
# Allows reading version metadata, listing keys, and purging deleted versions
path "secret/metadata/accounts/*" {
  capabilities = ["read", "list", "delete"]
}

# System health monitoring (non-sensitive status code and seal state)
path "sys/health" {
  capabilities = ["read"]
}

# Active token self-verification (used for telemetry and startup verification)
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Active token renewal
path "auth/token/renew-self" {
  capabilities = ["update"]
}
