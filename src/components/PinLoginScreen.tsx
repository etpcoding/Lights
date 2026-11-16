import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Delete, ArrowRight } from 'lucide-react';
import type { AuthStatus } from '../types/lighting.ts';

interface PinLoginScreenProps {
  consoleName: string;
  onUnlock: (token: string, auth: AuthStatus) => void;
}

export const PinLoginScreen: React.FC<PinLoginScreenProps> = ({ consoleName, onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const attemptLogin = useCallback(
    async (pinValue: string) => {
      if (pinValue.length < 4 || submitting) {
        if (pinValue.length < 4) setError('Enter at least 4 digits.');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: pinValue }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Incorrect PIN.');
          setPin('');
          return;
        }
        onUnlock(data.token, data.auth);
      } catch {
        setError('Unable to reach server.');
      } finally {
        setSubmitting(false);
      }
    },
    [onUnlock, submitting]
  );

  const appendDigit = useCallback((digit: string) => {
    setError(null);
    setPin((prev) => (prev.length < 8 ? prev + digit : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError(null);
    setPin('');
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        attemptLogin(pin);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [appendDigit, handleBackspace, handleClear, attemptLogin, pin]);

  const slotCount = Math.max(4, pin.length);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans antialiased select-none">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">{consoleName}</h1>
            <p className="text-xs text-slate-400">Enter your console PIN to unlock</p>
          </div>
        </div>

        {/* Masked PIN Dots */}
        <div className="flex items-center justify-center gap-2.5 py-2">
          {Array.from({ length: slotCount }).map((_, idx) => {
            const filled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                  filled
                    ? 'bg-amber-400 border-amber-400'
                    : 'bg-slate-950 border-slate-700'
                }`}
              />
            );
          })}
        </div>

        {error && (
          <div className="px-3 py-2 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 text-center">
            {error}
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => appendDigit(d)}
              className="py-3 bg-slate-950 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-lg font-mono text-base font-semibold text-white transition-colors"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="py-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => appendDigit('0')}
            className="py-3 bg-slate-950 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-lg font-mono text-base font-semibold text-white transition-colors"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="py-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            title="Backspace"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => attemptLogin(pin)}
          disabled={pin.length < 4 || submitting}
          className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>{submitting ? 'Unlocking...' : 'Unlock Console'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
