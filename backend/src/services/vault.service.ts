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

export class VaultService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.vaultAddr}/v1`,
      timeout: 5000,
      headers: {
        'X-Vault-Token': config.vaultAppToken,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Health check on Vault sys/health and seal-status
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
    if (!config.vaultAppToken) {
      throw new Error('Vault access failed closed: VAULT_APP_TOKEN is not configured.');
    }
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
    if (!config.vaultAppToken) {
      throw new Error('Vault access failed closed: VAULT_APP_TOKEN is not configured.');
    }
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
    if (!config.vaultAppToken) {
      throw new Error('Vault access failed closed: VAULT_APP_TOKEN is not configured.');
    }
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
}

export const vaultService = new VaultService();

