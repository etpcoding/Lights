import React, { useState } from 'react';
import { Radio, ArrowRight, ArrowLeft, Check, Shield } from 'lucide-react';
import type { AuthStatus } from '../types/lighting.ts';

interface FirstLaunchSetupProps {
  onComplete: (token: string, auth: AuthStatus) => void;
}

export const FirstLaunchSetup: React.FC<FirstLaunchSetupProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [consoleName, setConsoleName] = useState('LumenNet Console');
  const [universe0Ip, setUniverse0Ip] = useState('192.168.1.100');
  const [universe0Port, setUniverse0Port] = useState(6454);
  const [artnetEnabled, setArtnetEnabled] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(true);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePinInput = (setter: (v: string) => void, val: string) => {
    const digitsOnly = val.replace(/\D/g, '').slice(0, 8);
    setter(digitsOnly);
    setError(null);
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!consoleName.trim()) {
        setError('Please enter a console name.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!universe0Ip.trim()) {
        setError('Please enter an Art-Net target IP address.');
        return;
      }
      setStep(3);
    }
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pinEnabled) {
      if (!/^\d{4,8}$/.test(pin)) {
        setError('PIN must be 4 to 8 digits.');
        return;
      }
      if (pin !== confirmPin) {
        setError('PIN entries do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consoleName: consoleName.trim(),
          universe0Ip: universe0Ip.trim(),
          universe0Port,
          artnetEnabled,
          pinEnabled,
          pin: pinEnabled ? pin : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save initial setup.');
        return;
      }
      onComplete(data.token, data.auth);
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans antialiased">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-amber-500 flex items-center justify-center text-slate-950">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">Initial Console Setup</h1>
              <p className="text-xs text-slate-400">Step {step} of 3</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 w-7 rounded-full transition-colors ${
                  s <= step ? 'bg-amber-500' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleFinish} className="p-6 space-y-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Console Identity</h2>
                <p className="text-xs text-slate-400">
                  Name this lighting console for your venue, rig, or FOH workstation.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Console Name
                </label>
                <input
                  type="text"
                  value={consoleName}
                  onChange={(e) => {
                    setConsoleName(e.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. Main Stage FOH"
                  maxLength={48}
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Primary Art-Net Output</h2>
                <p className="text-xs text-slate-400">
                  Set the default destination for Universe 0. Additional universes and IPs can be configured anytime in Universes &amp; Patch.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Universe 0 Target IP
                  </label>
                  <input
                    type="text"
                    value={universe0Ip}
                    onChange={(e) => {
                      setUniverse0Ip(e.target.value);
                      setError(null);
                    }}
                    placeholder="192.168.1.100"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    UDP Port
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={universe0Port}
                    onChange={(e) => setUniverse0Port(parseInt(e.target.value, 10) || 6454)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setUniverse0Ip('192.168.1.100')}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-md font-mono text-slate-300"
                >
                  192.168.1.100
                </button>
                <button
                  type="button"
                  onClick={() => setUniverse0Ip('255.255.255.255')}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-md font-mono text-slate-300"
                >
                  255.255.255.255 (Broadcast)
                </button>
                <button
                  type="button"
                  onClick={() => setUniverse0Ip('127.0.0.1')}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-md font-mono text-slate-300"
                >
                  127.0.0.1 (Local)
                </button>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={artnetEnabled}
                  onChange={(e) => setArtnetEnabled(e.target.checked)}
                  className="accent-amber-500"
                />
                <span>Start Art-Net 40 Hz UDP output immediately</span>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span>Console PIN Lock</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Require a numeric PIN (4–8 digits) to unlock this console. You can change or toggle this later in Settings.
                  </p>
                </div>
              </div>

              <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer">
                <span className="text-xs font-medium text-slate-200">Require PIN on login</span>
                <input
                  type="checkbox"
                  checked={pinEnabled}
                  onChange={(e) => {
                    setPinEnabled(e.target.checked);
                    setError(null);
                  }}
                  className="accent-amber-500 w-4 h-4"
                />
              </label>

              {pinEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Set PIN (4–8 digits)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={pin}
                      onChange={(e) => handlePinInput(setPin, e.target.value)}
                      placeholder="••••"
                      autoFocus
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Confirm PIN
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={confirmPin}
                      onChange={(e) => handlePinInput(setConfirmPin, e.target.value)}
                      placeholder="••••"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono tracking-widest text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Footer Navigation */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep((step - 1) as 1 | 2);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-950 border border-slate-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-lg transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{submitting ? 'Saving...' : 'Complete Setup'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
