import React, { useRef, useState, useMemo } from 'react';
import {
  Zap,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  Search,
  HelpCircle,
} from 'lucide-react';
import type { Scene } from '../types/lighting.ts';

export interface SceneFadersBankProps {
  scenes: Scene[];
  sceneFaders: Record<string, number>;
  faderBlendMode: 'htp' | 'latest' | 'additive';
  baseLookMix: number;
  dmxUniverse: number[];
  dmxUniverses?: Record<number, number[]>;
  onSetSceneFader: (sceneId: string, value: number) => void;
  onSetSceneFaders: (updates: Record<string, number>) => void;
  onFlashSceneFader: (sceneId: string, active: boolean) => void;
  onSetFaderBlendMode: (mode: 'htp' | 'latest' | 'additive') => void;
  onSetBaseLookMix: (value: number) => void;
  onClearAllSceneFaders: () => void;
  onSaveScene: (scene: Scene) => void;
}

export const SceneFadersBank: React.FC<SceneFadersBankProps> = ({
  scenes,
  sceneFaders,
  faderBlendMode,
  baseLookMix,
  dmxUniverse,
  dmxUniverses,
  onSetSceneFader,
  onSetSceneFaders,
  onFlashSceneFader,
  onSetFaderBlendMode,
  onSetBaseLookMix,
  onClearAllSceneFaders,
  onSaveScene,
}) => {
  const [flashedIds, setFlashedIds] = useState<Record<string, boolean>>({});
  const [mutedStates, setMutedStates] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveMixModal, setShowSaveMixModal] = useState(false);
  const [mixSceneName, setMixSceneName] = useState('');
  const [mixSceneCategory, setMixSceneCategory] = useState('Mixed');
  const [mixSceneColor, setMixSceneColor] = useState('#ec4899');
  const [showBlendInfo, setShowBlendInfo] = useState(false);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    scenes.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set);
  }, [scenes]);

  // Filter scenes
  const filteredScenes = useMemo(() => {
    return scenes.filter((s) => {
      const matchesCat =
        selectedCategory === 'all' || s.category?.toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.category?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [scenes, selectedCategory, searchQuery]);

  // Active faders in mix
  const activeFaders = scenes.filter(
    (s) => (sceneFaders[s.id] ?? 0) > 0 || flashedIds[s.id]
  );

  const handleFlashDown = (sceneId: string) => {
    setFlashedIds((prev) => ({ ...prev, [sceneId]: true }));
    onFlashSceneFader(sceneId, true);
  };

  const handleFlashUp = (sceneId: string) => {
    setFlashedIds((prev) => ({ ...prev, [sceneId]: false }));
    onFlashSceneFader(sceneId, false);
  };

  const handleSolo = (sceneId: string) => {
    const updates: Record<string, number> = {};
    for (const sc of scenes) {
      updates[sc.id] = sc.id === sceneId ? 255 : 0;
    }
    onSetSceneFaders(updates);
  };

  const handleMuteToggle = (sceneId: string) => {
    const currentVal = sceneFaders[sceneId] ?? 0;
    if (currentVal > 0) {
      setMutedStates((prev) => ({ ...prev, [sceneId]: currentVal }));
      onSetSceneFader(sceneId, 0);
    } else {
      const restored = mutedStates[sceneId] || 255;
      onSetSceneFader(sceneId, restored);
    }
  };

  // Master scale for all active faders
  const handleScaleAll = (scaleFactor: number) => {
    const updates: Record<string, number> = {};
    for (const sc of scenes) {
      const current = sceneFaders[sc.id] ?? 0;
      if (current > 0) {
        updates[sc.id] = Math.max(0, Math.min(255, Math.round(current * scaleFactor)));
      }
    }
    if (Object.keys(updates).length > 0) {
      onSetSceneFaders(updates);
    }
  };

  // Tactile pointer drag on vertical fader track
  const handleTrackPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    sceneId: string
  ) => {
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();

    const calculateVal = (clientY: number) => {
      const fraction = Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
      return Math.round(fraction * 255);
    };

    onSetSceneFader(sceneId, calculateVal(e.clientY));

    const onPointerMove = (ev: PointerEvent) => {
      onSetSceneFader(sceneId, calculateVal(ev.clientY));
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Save current mixed look as new scene across all universes
  const handleSaveMixAsScene = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mixSceneName.trim()) return;

    const channelMap: Record<number, number> = {};
    for (let i = 0; i < dmxUniverse.length; i++) {
      if (dmxUniverse[i] > 0) {
        channelMap[i + 1] = dmxUniverse[i];
      }
    }

    const universeChannelValues: Record<number, Record<number, number>> = {};
    if (dmxUniverses) {
      for (const [uniStr, buf] of Object.entries(dmxUniverses)) {
        const uNum = parseInt(uniStr, 10);
        const uMap: Record<number, number> = {};
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] > 0) uMap[i + 1] = buf[i];
        }
        universeChannelValues[uNum] = uMap;
      }
    } else {
      universeChannelValues[0] = channelMap;
    }

    const newScene: Scene = {
      id: `sc-mix-${Date.now()}`,
      name: mixSceneName.trim(),
      colorSwatch: mixSceneColor,
      fadeTimeMs: 1500,
      category: mixSceneCategory.trim() || 'Mix',
      channelValues: channelMap,
      universeChannelValues,
    };

    onSaveScene(newScene);
    setShowSaveMixModal(false);
    setMixSceneName('');
  };

  return (
    <div className="flex flex-col gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
      {/* Top Header & Mixer Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 text-xs">
          <h3 className="text-sm font-bold text-white tracking-tight">
            Scene Submasters
          </h3>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-amber-400 tabular-nums">
            {activeFaders.length} active
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Blend Mode Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => onSetFaderBlendMode('htp')}
              className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                faderBlendMode === 'htp'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="HTP Merge: Highest channel value wins"
            >
              HTP
            </button>
            <button
              onClick={() => onSetFaderBlendMode('additive')}
              className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                faderBlendMode === 'additive'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Additive Color Mix: Sums RGBW channels"
            >
              Additive
            </button>
            <button
              onClick={() => onSetFaderBlendMode('latest')}
              className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                faderBlendMode === 'latest'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Weighted Morph across active scenes"
            >
              Weighted
            </button>
            <button
              onClick={() => setShowBlendInfo(!showBlendInfo)}
              className="p-1 text-slate-500 hover:text-slate-300"
              title="Blend mode details"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Base Look Level Fader */}
          <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs">
            <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
              Base Mix
            </span>
            <input
              type="range"
              min="0"
              max="255"
              value={baseLookMix}
              onChange={(e) => onSetBaseLookMix(parseInt(e.target.value, 10))}
              className="w-16 accent-amber-500 cursor-pointer"
            />
            <span className="font-mono text-[11px] text-amber-400 tabular-nums w-8 text-right">
              {Math.round((baseLookMix / 255) * 100)}%
            </span>
          </div>

          <button
            onClick={() => setShowSaveMixModal(true)}
            disabled={activeFaders.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Store Mix</span>
          </button>

          <button
            onClick={onClearAllSceneFaders}
            disabled={activeFaders.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Release</span>
          </button>
        </div>
      </div>

      {/* Blend Mode Explainer */}
      {showBlendInfo && (
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-300 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <span className="font-semibold text-amber-400 block mb-0.5">HTP Merge</span>
            <p className="text-slate-400 text-[11px]">
              Highest channel value wins across active faders.
            </p>
          </div>
          <div>
            <span className="font-semibold text-emerald-400 block mb-0.5">Additive</span>
            <p className="text-slate-400 text-[11px]">
              Sums color and dimmer channels together up to 255.
            </p>
          </div>
          <div>
            <span className="font-semibold text-cyan-400 block mb-0.5">Weighted</span>
            <p className="text-slate-400 text-[11px]">
              Proportional average across active fader levels.
            </p>
          </div>
        </div>
      )}

      {/* Active Mix Strip */}
      {activeFaders.length > 0 && (
        <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-medium">Mix:</span>
            {activeFaders.map((scene) => {
              const isFlashed = flashedIds[scene.id];
              const val = isFlashed ? 255 : (sceneFaders[scene.id] ?? 0);
              const pct = Math.round((val / 255) * 100);

              return (
                <div
                  key={scene.id}
                  className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md"
                >
                  <span
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: scene.colorSwatch }}
                  />
                  <span className="text-slate-200">{scene.name}</span>
                  <span className="font-mono text-amber-400 tabular-nums">
                    {isFlashed ? 'FLASH' : `${pct}%`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-1 font-mono text-[11px]">
            <button
              onClick={() => handleScaleAll(1.2)}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800"
            >
              +20%
            </button>
            <button
              onClick={() => handleScaleAll(0.8)}
              className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800"
            >
              -20%
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            All ({scenes.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                selectedCategory.toLowerCase() === cat.toLowerCase()
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-48">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Search scenes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Fader Console Strips Bank */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {filteredScenes.map((scene) => {
          const isFlashed = flashedIds[scene.id];
          const rawVal = isFlashed ? 255 : (sceneFaders[scene.id] ?? 0);
          const pct = Math.round((rawVal / 255) * 100);
          const isActive = rawVal > 0;

          return (
            <div
              key={scene.id}
              className={`p-3 rounded-xl border flex flex-col items-center justify-between select-none transition-colors ${
                isActive
                  ? 'bg-slate-900 border-amber-500/60'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Top color accent & Title */}
              <div className="w-full mb-1.5">
                <div
                  className="h-1 w-full rounded-full mb-2"
                  style={{ backgroundColor: scene.colorSwatch }}
                />
                <div
                  className="font-semibold text-xs text-white truncate text-center"
                  title={scene.name}
                >
                  {scene.name}
                </div>
                <div className="text-[10px] text-slate-500 text-center truncate">
                  {scene.category || 'Look'}
                </div>
              </div>

              {/* Readout */}
              <div className="flex items-baseline justify-center gap-1 my-1 font-mono">
                <span
                  className={`text-sm font-bold tabular-nums ${
                    isFlashed
                      ? 'text-amber-300'
                      : isActive
                      ? 'text-amber-400'
                      : 'text-slate-500'
                  }`}
                >
                  {isFlashed ? 'FLASH' : `${pct}%`}
                </span>
                <span className="text-[10px] text-slate-600 tabular-nums">
                  {rawVal}
                </span>
              </div>

              {/* Vertical Fader Track */}
              <div
                onPointerDown={(e) => handleTrackPointerDown(e, scene.id)}
                className="relative w-12 h-44 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg overflow-hidden flex flex-col justify-end p-1 my-1 cursor-ns-resize touch-none group"
                title={`${scene.name}: Drag to adjust (${pct}%)`}
              >
                <div
                  className="w-full rounded-sm transition-all duration-75 pointer-events-none"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: scene.colorSwatch,
                    opacity: isActive ? 0.75 : 0.15,
                  }}
                />

                <div
                  className={`absolute left-1 right-1 h-4 rounded border pointer-events-none transition-all duration-75 flex flex-col items-center justify-center ${
                    isActive
                      ? 'bg-amber-400 border-amber-300'
                      : 'bg-slate-400 border-slate-500'
                  }`}
                  style={{
                    bottom: `calc(${pct}% - 8px)`,
                  }}
                >
                  <div className="w-4 h-px bg-slate-950/70" />
                </div>
              </div>

              {/* Quick 0 / Full */}
              <div className="grid grid-cols-2 gap-1 w-full mt-1.5 text-[10px] font-mono">
                <button
                  onClick={() => onSetSceneFader(scene.id, 0)}
                  className="py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded border border-slate-800 transition-colors"
                >
                  0%
                </button>
                <button
                  onClick={() => onSetSceneFader(scene.id, 255)}
                  className={`py-1 rounded border font-semibold transition-colors ${
                    rawVal === 255
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-800'
                  }`}
                >
                  Full
                </button>
              </div>

              {/* Flash, Solo & Mute */}
              <div className="grid grid-cols-3 gap-1 w-full mt-1">
                <button
                  onPointerDown={() => handleFlashDown(scene.id)}
                  onPointerUp={() => handleFlashUp(scene.id)}
                  onPointerLeave={() => {
                    if (flashedIds[scene.id]) handleFlashUp(scene.id);
                  }}
                  className={`py-1 text-[10px] font-bold rounded transition-colors flex items-center justify-center ${
                    isFlashed
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800'
                  }`}
                  title="Hold to flash 100%"
                >
                  <Zap className="w-3 h-3 fill-current" />
                </button>

                <button
                  onClick={() => handleSolo(scene.id)}
                  className="py-1 text-[10px] font-semibold rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 transition-colors"
                  title="Solo this fader"
                >
                  Solo
                </button>

                <button
                  onClick={() => handleMuteToggle(scene.id)}
                  className={`py-1 text-[10px] font-semibold rounded border transition-colors flex items-center justify-center ${
                    rawVal === 0 && mutedStates[scene.id]
                      ? 'bg-rose-950/70 text-rose-300 border-rose-800'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800'
                  }`}
                  title={rawVal > 0 ? 'Mute' : 'Unmute'}
                >
                  {rawVal === 0 && mutedStates[scene.id] ? (
                    <VolumeX className="w-3 h-3" />
                  ) : (
                    <Volume2 className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Mixed Look as New Scene Modal */}
      {showSaveMixModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Store Current Mix as Scene</h3>
            <p className="text-xs text-slate-400 mb-4">
              Saves the blended output from all active scene faders as a new scene.
            </p>

            <form onSubmit={handleSaveMixAsScene} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Scene Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sunset Chorus Blend"
                  value={mixSceneName}
                  onChange={(e) => setMixSceneName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Category Tag
                  </label>
                  <input
                    type="text"
                    value={mixSceneCategory}
                    onChange={(e) => setMixSceneCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Color Tag
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={mixSceneColor}
                      onChange={(e) => setMixSceneColor(e.target.value)}
                      className="w-10 h-9 bg-transparent border-0 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={mixSceneColor}
                      onChange={(e) => setMixSceneColor(e.target.value)}
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-400">
                <span className="font-semibold text-amber-400 block mb-1">
                  Active Sources in this Mix:
                </span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {activeFaders.map((f) => (
                    <li key={f.id}>
                      {f.name} at {Math.round(((sceneFaders[f.id] ?? 0) / 255) * 100)}%
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSaveMixModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-md transition-colors"
                >
                  Save as New Scene
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
