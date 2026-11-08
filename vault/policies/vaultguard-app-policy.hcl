# VaultGuard Least-Privilege Application Policy
# Grants access only to the accounts path in the KV v2 secrets engine

# KV v2 data path for privileged accounts
path "secret/data/accounts/*" {
  capabilities = ["create", "read", "update", "delete"]
}

# KV v2 metadata path for privileged accounts
path "secret/metadata/accounts/*" {
  capabilities = ["list", "read", "delete"]
}

# Health monitoring endpoints
path "sys/health" {
  capabilities = ["read"]
}

# Allow token self-lookup to verify active session
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Allow token renewal if token is periodic or renewable
path "auth/token/renew-self" {
  capabilities = ["update"]
}

