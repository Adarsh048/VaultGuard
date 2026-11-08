# ==============================================================================
# VaultGuard - HashiCorp Vault Community Edition Configuration (Docker)
# ==============================================================================
# Configures persistent integrated Raft storage and secure local TCP listener.
# In-memory dev mode is strictly disabled.
# ==============================================================================

storage "raft" {
  path    = "/vault/data"
  node_id = "vaultguard_raft_node1"
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_disable   = 1
}

api_addr      = "http://127.0.0.1:8200"
cluster_addr  = "http://127.0.0.1:8201"
ui            = true
disable_mlock = true
log_level     = "info"

