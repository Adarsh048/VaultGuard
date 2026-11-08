import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ShieldCheck, ShieldAlert, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  const { user } = useAuth();
  const [vaultStatus, setVaultStatus] = useState<'Healthy' | 'Warning' | 'Unavailable' | 'Checking'>('Checking');
  const [checking, setChecking] = useState(false);

  const checkVaultHealth = async () => {
    setChecking(true);
    try {
      const res = await api.get('/monitoring/vault-health');
      if (res.data?.success) {
        setVaultStatus(res.data.monitoring.vault.status);
      } else {
        setVaultStatus('Unavailable');
      }
    } catch {
      setVaultStatus('Unavailable');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      checkVaultHealth();
      const interval = setInterval(checkVaultHealth, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [user]);

  const getStatusBadge = () => {
    switch (vaultStatus) {
      case 'Healthy':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Vault: Healthy (KV v2)</span>
          </div>
        );
      case 'Warning':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Vault: Warning (Sealed/Standby)</span>
          </div>
        );
      case 'Unavailable':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Vault: Offline (Fail-Closed)</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Connecting Vault...</span>
          </div>
        );
    }
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-8 flex items-center justify-between shrink-0 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {user?.role === 'ADMIN' && (
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <button
              onClick={checkVaultHealth}
              disabled={checking}
              title="Refresh Vault Health Check"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}
        {actions}
      </div>
    </header>
  );
};

