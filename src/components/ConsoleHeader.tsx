import React from 'react';
import { Radio, ShieldAlert, Settings, Lock } from 'lucide-react';

interface ConsoleHeaderProps {
  consoleName?: string;
  activeTab: 'live' | 'fixtures' | 'visualizer' | 'dmx';
  onTabChange: (tab: 'live' | 'fixtures' | 'visualizer' | 'dmx') => void;
  connected: boolean;
  blackout: boolean;
  onToggleBlackout: () => void;
  pinEnabled: boolean;
  onOpenSettings: () => void;
  onLockConsole: () => void;
}

export const ConsoleHeader: React.FC<ConsoleHeaderProps> = ({
  consoleName = 'LumenNet',
  activeTab,
  onTabChange,
  connected,
  blackout,
  onToggleBlackout,
  pinEnabled,
  onOpenSettings,
  onLockConsole,
}) => {
  return (
    <header className="flex items-center justify-between gap-6 px-6 py-3 bg-slate-950 border-b border-slate-800 select-none">
      {/* Zone 1: Brand */}
      <div className="flex items-center gap-2.5 shrink-0 min-w-0">
        <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center text-slate-950 shrink-0">
          <Radio className="w-4 h-4 text-slate-950" />
        </div>
        <span className="text-base font-bold tracking-tight text-white whitespace-nowrap truncate max-w-[200px]">
          {consoleName}
        </span>
      </div>

      {/* Zone 2: Navigation */}
      <nav className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => onTabChange('live')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'live'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          Live Playback
        </button>
        <button
          onClick={() => onTabChange('fixtures')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'fixtures'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          Channels
        </button>
        <button
          onClick={() => onTabChange('visualizer')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'visualizer'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          Stage View
        </button>
        <button
          onClick={() => onTabChange('dmx')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'dmx'
              ? 'bg-amber-500 text-slate-950 font-semibold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          Universes &amp; Patch
        </button>
      </nav>

      {/* Zone 3: Connection, Settings, Lock, Blackout */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap mr-1">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400' : 'bg-rose-500'
            }`}
          />
          <span>{connected ? 'Connected' : 'Reconnecting'}</span>
        </span>

        <button
          onClick={onOpenSettings}
          title="Console & PIN Settings"
          className="p-2 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {pinEnabled && (
          <button
            onClick={onLockConsole}
            title="Lock Console"
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lock</span>
          </button>
        )}

        <button
          onClick={onToggleBlackout}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            blackout
              ? 'bg-rose-600 text-white'
              : 'bg-slate-900 hover:bg-rose-950 text-rose-300 border border-rose-900/50'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>{blackout ? 'BLACKOUT ON' : 'Blackout'}</span>
        </button>
      </div>
    </header>
  );
};
