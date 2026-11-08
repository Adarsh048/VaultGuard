import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Authentication failed. Invalid corporate credentials or inactive account.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 px-4 py-12 relative overflow-hidden">
      {/* Background architectural grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 shadow-xl shadow-sky-600/30 text-white mb-4">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">VaultGuard</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Privileged Access Management & Credential Governance
          </p>
        </div>

        {/* Login Box */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl border border-slate-200">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Sign In to PAM Portal</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Authenticate using your organizational credentials
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Corporate Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@vaultguard.local"
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>Enforce secure workstation binding</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-sky-700 transition disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating with Vault...' : 'Authenticate'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Enterprise Single Sign-On Option */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setError('Enterprise SAML / OIDC IdP federation is configured via corporate identity provider.');
              }}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <KeyRound className="h-3.5 w-3.5 text-slate-500" />
              <span>Sign in with Enterprise IdP (SSO)</span>
            </button>
          </div>
        </div>

        {/* Security Policy Notice */}
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-center text-[11px] text-slate-400 leading-relaxed">
          <div className="flex items-center justify-center gap-1.5 text-slate-300 font-semibold mb-1">
            <ShieldCheck className="h-4 w-4 text-sky-400" />
            <span>Authorized Corporate System</span>
          </div>
          All privileged operations, access grants, and secret retrievals are logged in HashiCorp Vault audit records in compliance with ISO/IEC 27001 and SOC 2 Type II controls.
        </div>
      </div>
    </div>
  );
};
