# ==============================================================================
# VaultGuard - HashiCorp Vault Community Edition Configuration (Native Windows)
# ==============================================================================
# Configures persistent integrated Raft storage and secure local TCP listener
# for native Windows execution via bin/vault.exe.
# In-memory dev mode is strictly disabled.
# ==============================================================================

storage "raft" {
  path    = "d:/Vault_guard/vault/data"
  node_id = "vaultguard_local_node1"
}

listener "tcp" {
  address       = "127.0.0.1:8200"
  tls_disable   = 1
}

api_addr      = "http://127.0.0.1:8200"
cluster_addr  = "http://127.0.0.1:8201"
ui            = true
disable_mlock = true
log_level     = "info"

