
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">
        <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 sm:p-8 max-h-[85vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost' }> = ({ 
  children, 
  className = "", 
  variant = 'primary', 
  ...props 
}) => {
  const baseClasses = "px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-200 active:scale-95 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100",
    secondary: "bg-slate-900 text-white hover:bg-black shadow-lg",
    danger: "bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-100",
    outline: "border-2 border-slate-100 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-200",
    ghost: "text-slate-600 hover:bg-slate-50"
  };

  return (
    <button className={`${baseClasses} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className = "", ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">{label}</label>}
    <input 
      className={`px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/30 focus:bg-white transition-all text-sm font-medium ${className}`}
      {...props}
    />
  </div>
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }> = ({ label, className = "", children, ...props }) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">{label}</label>}
    <select 
      className={`px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500/30 focus:bg-white transition-all text-sm font-medium ${className}`}
      {...props}
    >
      {children}
    </select>
  </div>
);
