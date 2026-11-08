import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  className = '',
}) => {
  const styles = {
    info: 'bg-sky-50 border-sky-200 text-sky-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    error: 'bg-rose-50 border-rose-200 text-rose-800',
  };

  const icons = {
    info: <Info className="h-5 w-5 text-sky-500 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />,
    error: <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />,
  };

  return (
    <div className={`flex gap-3 p-4 rounded-lg border ${styles[type]} ${className}`}>
      {icons[type]}
      <div className="text-sm">
        {title && <h5 className="font-semibold mb-1">{title}</h5>}
        <div>{children}</div>
      </div>
    </div>
  );
};

