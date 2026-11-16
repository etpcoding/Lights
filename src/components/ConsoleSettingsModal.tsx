import React, { useState } from 'react';
import { X, Shield, Check } from 'lucide-react';
import type { AuthStatus } from '../types/lighting.ts';

interface ConsoleSettingsModalProps {
  auth: AuthStatus;
  token: string | null;
  onUpdated: (newToken: string, updatedAuth: AuthStatus) => void;
  onClose: () => void;
}

export const ConsoleSettingsModal: React.FC<ConsoleSettingsModalProps> = ({
  auth,
  token,
  onUpdated,
  onClose,
}) => {
  const [consoleName, setConsoleName] = useState(auth.consoleName);
  const [pinEnabled, setPinEnabled] = useState(auth.pinEnabled);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saving, setSaving] = useState(false);

  const sanitizePin = (val: string, setter: (v: string) => void) => {
    setter(val.replace(/\D/g, '').slice(0, 8));
    setError(null);
    setSavedNotice(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedNotice(false);

    if (auth.pinEnabled && !currentPin) {
      setError('Enter your current PIN to update settings.');
      return;
    }

    if (pinEnabled) {
      const changingPin = newPin.length > 0 || confirmNewPin.length > 0 || !auth.pinEnabled;
      if (changingPin) {
        if (!/^\d{4,8}$/.test(newPin)) {
          setError('New PIN must be 4 to 8 digits.');
          return;
        }
        if (newPin !== confirmNewPin) {
          setError('New PIN confirmation does not match.');
          return;
        }
      }
    }

    setSaving(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          consoleName: consoleName.trim(),
          pinEnabled,
          currentPin: auth.pinEnabled ? currentPin : undefined,
          newPin: pinEnabled && newPin ? newPin : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update settings.');
        return;
      }
      onUpdated(data.token, data.auth);
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      setSavedNotice(true);
    } catch {
      setError('Unable to reach server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Console &amp; PIN Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1.5">Console Name</label>
            <input
              type="text"
              required
              maxLength={48}
              value={consoleName}
              onChange={(e) => {
                setConsoleName(e.target.value);
                setError(null);
                setSavedNotice(false);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
            <span className="font-medium text-slate-200">PIN Lock Enabled</span>
            <input
              type="checkbox"
              checked={pinEnabled}
              onChange={(e) => {
                setPinEnabled(e.target.checked);
                setError(null);
                setSavedNotice(false);
              }}
              className="accent-amber-500 w-4 h-4"
            />
          </label>

          {auth.pinEnabled && (
            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                Current PIN (Required to verify changes)
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={currentPin}
                onChange={(e) => sanitizePin(e.target.value, setCurrentPin)}
                placeholder="Enter current PIN"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          {pinEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  {auth.pinEnabled ? 'New PIN (Optional)' : 'Set PIN (4–8 digits)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={newPin}
                  onChange={(e) => sanitizePin(e.target.value, setNewPin)}
                  placeholder="••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300 mb-1.5">
                  Confirm New PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={confirmNewPin}
                  onChange={(e) => sanitizePin(e.target.value, setConfirmNewPin)}
                  placeholder="••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300">
              {error}
            </div>
          )}

          {savedNotice && (
            <div className="px-3 py-2 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-300 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>Settings saved.</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-medium text-slate-300 hover:text-white"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold rounded-lg"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
