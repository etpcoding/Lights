import React, { useState } from 'react';
import { Send, Sliders, Wifi, ChevronDown, ChevronUp, Network } from 'lucide-react';
import type { ArtNetConfig } from '../types/lighting.ts';

interface MasterControlBarProps {
  grandMaster: number;
  onGrandMasterChange: (val: number) => void;
  artnet: ArtNetConfig;
  onConfigureArtNet: (config: Partial<ArtNetConfig>) => void;
  onSendUniverseTestPacket: (universeNumber: number) => void;
  onOpenUniversesTab: () => void;
  activeSceneName: string;
}

export const MasterControlBar: React.FC<MasterControlBarProps> = ({
  grandMaster,
  onGrandMasterChange,
  artnet,
  onConfigureArtNet,
  onSendUniverseTestPacket,
  onOpenUniversesTab,
  activeSceneName,
}) => {
  const [showNetworkSummary, setShowNetworkSummary] = useState(false);
  const [testSentFeedback, setTestSentFeedback] = useState(false);

  const gmPercent = Math.round((grandMaster / 255) * 100);
  const universes = artnet.universes || [];
  const enabledCount = universes.filter((u) => u.enabled).length;

  const handleTestAll = () => {
    for (const u of universes) {
      if (u.enabled) {
        onSendUniverseTestPacket(u.universe);
      }
    }
    setTestSentFeedback(true);
    setTimeout(() => setTestSentFeedback(false), 800);
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Grand Master Slider & Quick Presets */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">
              Grand Master
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="255"
              value={grandMaster}
              onChange={(e) => onGrandMasterChange(parseInt(e.target.value, 10))}
              className="w-36 md:w-52 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="font-mono tabular-nums text-xs font-bold text-amber-400 w-10 text-right">
              {gmPercent}%
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onGrandMasterChange(255)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                grandMaster === 255
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              100%
            </button>
            <button
              onClick={() => onGrandMasterChange(128)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                grandMaster === 128
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              50%
            </button>
            <button
              onClick={() => onGrandMasterChange(0)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors ${
                grandMaster === 0
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              0%
            </button>
          </div>
        </div>

        {/* Center: Active Look */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
          <span>Active Look:</span>
          <span className="font-semibold text-amber-300 truncate max-w-[180px]">
            {activeSceneName || 'Manual'}
          </span>
        </div>

        {/* Right: Art-Net Output Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowNetworkSummary(!showNetworkSummary)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Wifi className={`w-3.5 h-3.5 ${artnet.enabled ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span className="font-mono tabular-nums">
              {enabledCount}/{universes.length} Universes
            </span>
            {showNetworkSummary ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={handleTestAll}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              testSentFeedback
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Send className="w-3 h-3" />
            <span>{testSentFeedback ? 'Packets Sent' : 'Ping Art-Net'}</span>
          </button>
        </div>
      </div>

      {/* Expandable Multi-Universe Art-Net Quick Panel */}
      {showNetworkSummary && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col gap-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onConfigureArtNet({ enabled: !artnet.enabled })}
                className={`px-3 py-1.5 rounded-lg font-medium border transition-colors ${
                  artnet.enabled
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700'
                    : 'bg-rose-950/70 text-rose-300 border-rose-800'
                }`}
              >
                {artnet.enabled ? 'Art-Net Output Active (40 Hz)' : 'Art-Net Output Paused'}
              </button>
              <span className="text-slate-400 font-mono tabular-nums">
                Total packets sent: {artnet.packetCount.toLocaleString()}
              </span>
            </div>

            <button
              onClick={() => {
                setShowNetworkSummary(false);
                onOpenUniversesTab();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg transition-colors"
            >
              <Network className="w-3.5 h-3.5" />
              <span>Edit Universe IPs</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {universes.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-200 truncate">
                    Uni {u.universe} · {u.name.replace(/^Universe \d+\s*-\s*/i, '')}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {u.targetIp}:{u.targetPort}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono font-semibold ml-2 ${
                    u.enabled ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  {u.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
