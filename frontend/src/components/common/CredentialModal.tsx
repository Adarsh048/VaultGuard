import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Eye, EyeOff, Copy, Check, ShieldAlert, Clock } from 'lucide-react';

interface CredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  credential: {
    accountName: string;
    accountType: string;
    hostname: string;
    username: string;
    password: string;
    expiresAt?: string | null;
  } | null;
}

export const CredentialModal: React.FC<CredentialModalProps> = ({
  isOpen,
  onClose,
  credential,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  useEffect(() => {
    if (!isOpen || !credential) {
      setSecondsRemaining(60);
      setShowPassword(false);
      setCopied(false);
      return;
    }

    setSecondsRemaining(60);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onClose(); // Automatically close modal when timer expires for security
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, credential, onClose]);

  if (!credential) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(credential.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Privileged Credential Retrieval" maxWidth="md">
      <div className="space-y-4">
        {/* Security Warning */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <span className="font-semibold">Security Audited Session:</span> This credential retrieval has been recorded in the immutable audit log and HashiCorp Vault access ledger. Do not store credentials in plaintext.
          </div>
        </div>

        {/* Account Details */}
        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 block">Privileged Account</span>
            <span className="font-semibold text-slate-800">{credential.accountName}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Account Type</span>
            <span className="font-semibold text-slate-800">{credential.accountType}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Target Host</span>
            <span className="font-mono text-slate-800">{credential.hostname}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Username</span>
            <span className="font-mono font-medium text-slate-800">{credential.username}</span>
          </div>
        </div>

        {/* Password Display Field */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Decrypted Secret (HashiCorp Vault KV v2)
          </label>
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              readOnly
              value={credential.password}
              className="w-full rounded-lg border border-slate-300 bg-slate-100 py-2.5 pl-3 pr-24 font-mono text-sm tracking-wider text-slate-900 select-all focus:outline-none"
            />
            <div className="absolute right-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                className="flex items-center gap-1 rounded bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-700 transition"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Auto-Clear Countdown */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1 text-slate-600">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>Auto-clearing in <strong className="text-sky-600">{secondsRemaining}s</strong></span>
          </div>
          {credential.expiresAt && (
            <span className="text-amber-700 font-medium">
              Grant expires: {new Date(credential.expiresAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Dismiss Button */}
        <button
          onClick={onClose}
          className="w-full mt-2 rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-900 transition"
        >
          Close & Clear Memory
        </button>
      </div>
    </Modal>
  );
};

