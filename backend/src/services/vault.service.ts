import axios, { AxiosInstance } from 'axios';
import { config } from '../config/env';

export interface VaultHealthStatus {
  initialized: boolean;
  sealed: boolean;
  standby: boolean;
  serverTimeUtc?: number;
  version?: string;
  clusterName?: string;
  statusCode: number;
  statusText: 'Healthy' | 'Warning' | 'Unavailable';
  lastChecked: Date;
  details?: string;
}

export interface VaultAuthStatus {
  authMethod: 'approle' | 'token' | 'none';
  authenticated: boolean;
  expiresAt: Date | null;
  renewable: boolean;
}

export class VaultService {
  private client: AxiosInstance;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private isRenewable: boolean = false;
  private authMethod: 'approle' | 'token' | 'none' = 'none';
  private readonly tokenRenewalMarginMs = 60_000; // Auto-renew / refresh 60s before expiry

  constructor() {
    this.client = axios.create({
      baseURL: `${config.vaultAddr}/v1`,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Dynamic token interceptor: attaches active token to all non-health requests
    this.client.interceptors.request.use(async (reqConfig) => {
      // /sys/health does not require an authentication token
      if (reqConfig.url?.includes('/sys/health')) {
        return reqConfig;
      }

      const token = await this.getActiveToken();
      if (token && reqConfig.headers) {
        reqConfig.headers['X-Vault-Token'] = token;
      }
      return reqConfig;
    });

    // Response interceptor: invalidates cached token on authentication failures (403/expired)
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 403 && this.authMethod === 'approle') {
          console.warn('[VaultService] Received 403 from Vault. Invalidating cached AppRole token for re-authentication.');
          this.cachedToken = null;
          this.tokenExpiresAt = 0;
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Acquire a valid Vault client token.
   * Prefers AppRole authentication with short-lived tokens and automatic renewal/re-login.
   * Falls back to VAULT_APP_TOKEN when AppRole credentials are not provided.
   */
  async getActiveToken(): Promise<string> {
    const hasAppRole = Boolean(config.vaultRoleId && config.vaultSecretId);

    if (hasAppRole) {
      const now = Date.now();
      // 1. If we have a cached token that is comfortably within its TTL, reuse it
      if (this.cachedToken && now < this.tokenExpiresAt - this.tokenRenewalMarginMs) {
        return this.cachedToken;
      }

      // 2. If token is near expiration but renewable, attempt renewal first
      if (this.cachedToken && this.isRenewable && now < this.tokenExpiresAt) {
        try {
          const renewed = await this.renewToken();
          if (renewed.renewed) {
            return this.cachedToken;
          }
        } catch (renewError: any) {
          console.warn('[VaultService] Token renewal attempt failed; falling back to AppRole re-login.');
        }
      }

      // 3. Otherwise, re-authenticate via AppRole
      return this.authenticateAppRole();
    }

    if (config.vaultAppToken) {
      this.cachedToken = config.vaultAppToken;
      this.authMethod = 'token';
      return config.vaultAppToken;
    }

    throw new Error(
      'Vault access failed closed: Neither AppRole credentials (VAULT_ROLE_ID/VAULT_SECRET_ID) nor VAULT_APP_TOKEN are configured.'
    );
  }

  /**
   * Authenticate against Vault using AppRole credentials
   */
  async authenticateAppRole(): Promise<string> {
    if (!config.vaultRoleId || !config.vaultSecretId) {
      throw new Error('Vault access failed closed: AppRole role_id or secret_id missing.');
    }

    try {
      const res = await axios.post(
        `${config.vaultAddr}/v1/auth/approle/login`,
        {
          role_id: config.vaultRoleId,
          secret_id: config.vaultSecretId,
        },
        {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const authData = res.data?.auth;
      if (!authData || !authData.client_token) {
        throw new Error('Vault AppRole login did not return a valid client_token.');
      }

      this.cachedToken = authData.client_token;
      const leaseDurationSec = authData.lease_duration || 3600;
      this.tokenExpiresAt = Date.now() + leaseDurationSec * 1000;
      this.isRenewable = Boolean(authData.renewable);
      this.authMethod = 'approle';

      return authData.client_token;
    } catch (error: any) {
      const sanitizedError = error.response?.data?.errors?.[0] || error.message || 'Unknown error';
      console.error('[VaultService] AppRole authentication failure:', sanitizedError);
      this.cachedToken = null;
      this.tokenExpiresAt = 0;
      throw new Error(`Vault AppRole authentication failed: ${sanitizedError}`);
    }
  }

  /**
   * Renew the currently active Vault token
   */
  async renewToken(): Promise<{ renewed: boolean; ttl: number }> {
    const activeToken: string = this.cachedToken || config.vaultAppToken || '';
    if (!activeToken) {
      throw new Error('Vault token renewal failed: No active token available to renew.');
    }

    try {
      const res = await axios.post(
        `${config.vaultAddr}/v1/auth/token/renew-self`,
        {},
        {
          timeout: 5000,
          headers: {
            'X-Vault-Token': activeToken,
            'Content-Type': 'application/json',
          },
        }
      );

      const authData = res.data?.auth;
      const leaseDurationSec = authData?.lease_duration || 3600;
      this.tokenExpiresAt = Date.now() + leaseDurationSec * 1000;
      this.isRenewable = Boolean(authData?.renewable);

      return {
        renewed: true,
        ttl: leaseDurationSec,
      };
    } catch (error: any) {
      const sanitizedError = error.response?.data?.errors?.[0] || error.message || 'Renewal rejected';
      console.warn('[VaultService] Token renewal rejected by Vault:', sanitizedError);
      throw new Error(`Vault token renewal failed: ${sanitizedError}`);
    }
  }

  /**
   * Return non-sensitive metadata about the active authentication state
   */
  getAuthStatus(): VaultAuthStatus {
    const hasAuth = Boolean(
      this.cachedToken ||
      config.vaultAppToken ||
      (config.vaultRoleId && config.vaultSecretId)
    );

    return {
      authMethod: this.authMethod,
      authenticated: hasAuth,
      expiresAt: this.tokenExpiresAt ? new Date(this.tokenExpiresAt) : null,
      renewable: this.isRenewable,
    };
  }

  /**
   * Health check on Vault sys/health and seal-status (Public, token-free probe)
   */
  async getHealth(): Promise<VaultHealthStatus> {
    const now = new Date();
    try {
      // sys/health returns 200 (healthy active), 429 (unsealed standby), 503 (sealed), 501 (not initialized)
      const res = await this.client.get('/sys/health', {
        validateStatus: (status) => status < 600, // Do not throw for 429/503/501
      });

      const data = res.data;
      let statusText: 'Healthy' | 'Warning' | 'Unavailable' = 'Unavailable';

      if (res.status === 200 && !data.sealed && data.initialized) {
        statusText = 'Healthy';
      } else if (data.sealed || res.status === 429) {
        statusText = 'Warning';
      }

      return {
        initialized: Boolean(data.initialized),
        sealed: Boolean(data.sealed),
        standby: Boolean(data.standby),
        serverTimeUtc: data.server_time_utc,
        version: data.version,
        clusterName: data.cluster_name,
        statusCode: res.status,
        statusText,
        lastChecked: now,
      };
    } catch (error: any) {
      return {
        initialized: false,
        sealed: true,
        standby: false,
        statusCode: 0,
        statusText: 'Unavailable',
        lastChecked: now,
        details: error.message || 'Cannot connect to Vault server',
      };
    }
  }

  /**
   * Store privileged credentials in Vault KV v2 engine
   * Path example: accounts/{accountId}
   */
  async storeSecret(secretSubPath: string, payload: Record<string, any>): Promise<{ version: number }> {
    try {
      const url = `/${config.vaultKvMount}/data/${secretSubPath}`;
      const res = await this.client.post(url, {
        data: payload,
      });
      return {
        version: res.data?.data?.version || 1,
      };
    } catch (error: any) {
      console.error('[Vault] Error storing secret:', error.response?.data || error.message);
      throw new Error(`Vault error storing secret: ${error.response?.data?.errors?.[0] || error.message}`);
    }
  }

  /**
   * Retrieve privileged credentials from Vault KV v2 engine
   */
  async getSecret(secretSubPath: string): Promise<Record<string, any>> {
    try {
      const url = `/${config.vaultKvMount}/data/${secretSubPath}`;
      const res = await this.client.get(url);
      const data = res.data?.data?.data;
      if (!data) {
        throw new Error('No secret data returned by Vault');
      }
      return data;
    } catch (error: any) {
      console.error('[Vault] Error retrieving secret:', error.response?.data || error.message);
      throw new Error(`Vault error retrieving secret: ${error.response?.data?.errors?.[0] || error.message}`);
    }
  }

  /**
   * Permanently delete secret metadata and all versions
   */
  async deleteSecret(secretSubPath: string): Promise<boolean> {
    try {
      const url = `/${config.vaultKvMount}/metadata/${secretSubPath}`;
      await this.client.delete(url);
      return true;
    } catch (error: any) {
      console.error('[Vault] Error deleting secret:', error.response?.data || error.message);
      throw new Error(`Vault error deleting secret: ${error.response?.data?.errors?.[0] || error.message}`);
    }
  }

  /**
   * Verify token status
   */
  async verifyToken(): Promise<{ valid: boolean; policies: string[]; ttl: number }> {
    try {
      const res = await this.client.get('/auth/token/lookup-self');
      const data = res.data?.data;
      return {
        valid: true,
        policies: data?.policies || [],
        ttl: data?.ttl || 0,
      };
    } catch (error: any) {
      return {
        valid: false,
        policies: [],
        ttl: 0,
      };
    }
  }

  /**
   * Reset internal cached state (used for testing token lifecycle)
   */
  _resetCachedStateForTesting(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
    this.isRenewable = false;
    this.authMethod = 'none';
  }

  /**
   * Inject mock token expiry for testing automatic expiration & renewal
   */
  _setTokenExpiryForTesting(expiresAtTimestampMs: number): void {
    this.tokenExpiresAt = expiresAtTimestampMs;
  }
}

export const vaultService = new VaultService();
