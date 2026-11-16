import React, { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  Plus,
  Trash2,
  Check,
  Sliders,
  LayoutGrid,
  SplitSquareVertical,
  Edit2,
  Copy,
  ArrowUp,
  ArrowDown,
  Repeat,
  ListOrdered,
} from 'lucide-react';
import type { Scene, Cue, Cuelist } from '../types/lighting.ts';
import { SceneFadersBank } from './SceneFadersBank.tsx';

interface LiveShowViewProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onTriggerScene: (sceneId: string, fadeTimeMs?: number) => void;
  onSaveScene: (scene: Scene) => void;
  onDeleteScene: (sceneId: string) => void;
  cuelist: Cue[];
  cuelists: Cuelist[];
  activeCuelistId: string;
  activeCueIndex: number;
  cuePlaying: boolean;
  cueProgress: number;
  onCueGo: () => void;
  onCuePause: () => void;
  onCueBack: () => void;
  onCueJump: (index: number) => void;
  onSelectCuelist: (cuelistId: string) => void;
  onCreateCuelist: (name: string, description?: string) => void;
  onUpdateCuelistMeta: (cuelistId: string, name: string, isLooping?: boolean, description?: string) => void;
  onDeleteCuelist: (cuelistId: string) => void;
  onSaveCue: (cue: Cue, cuelistId?: string) => void;
  onDeleteCue: (cueId: string, cuelistId?: string) => void;
  onDuplicateCue: (cueId: string, cuelistId?: string) => void;
  onReorderCues: (cueIds: string[], cuelistId?: string) => void;
  dmxUniverse: number[];
  dmxUniverses?: Record<number, number[]>;
  // Scene Faders
  sceneFaders: Record<string, number>;
  faderBlendMode: 'htp' | 'latest' | 'additive';
  baseLookMix: number;
  onSetSceneFader: (sceneId: string, value: number) => void;
  onSetSceneFaders: (updates: Record<string, number>) => void;
  onFlashSceneFader: (sceneId: string, active: boolean) => void;
  onSetFaderBlendMode: (mode: 'htp' | 'latest' | 'additive') => void;
  onSetBaseLookMix: (value: number) => void;
  onClearAllSceneFaders: () => void;
}

export const LiveShowView: React.FC<LiveShowViewProps> = ({
  scenes,
  activeSceneId,
  onTriggerScene,
  onSaveScene,
  onDeleteScene,
  cuelist,
  cuelists,
  activeCuelistId,
  activeCueIndex,
  cuePlaying,
  cueProgress,
  onCueGo,
  onCuePause,
  onCueBack,
  onCueJump,
  onSelectCuelist,
  onCreateCuelist,
  onUpdateCuelistMeta,
  onDeleteCuelist,
  onSaveCue,
  onDeleteCue,
  onDuplicateCue,
  onReorderCues,
  dmxUniverse,
  dmxUniverses,
  sceneFaders,
  faderBlendMode,
  baseLookMix,
  onSetSceneFader,
  onSetSceneFaders,
  onFlashSceneFader,
  onSetFaderBlendMode,
  onSetBaseLookMix,
  onClearAllSceneFaders,
}) => {
  const [sceneControlMode, setSceneControlMode] = useState<'faders' | 'pads' | 'split'>('faders');
  const [selectedFadeSec, setSelectedFadeSec] = useState<number | null>(null);

  // Store Look Modal
  const [showNewSceneModal, setShowNewSceneModal] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneCategory, setNewSceneCategory] = useState('Chorus');
  const [newSceneColor, setNewSceneColor] = useState('#f59e0b');
  const [newSceneFadeMs, setNewSceneFadeMs] = useState(1500);

  // Cue Create / Edit Modal
  const [showCueModal, setShowCueModal] = useState(false);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [cueNumberInput, setCueNumberInput] = useState('1.0');
  const [cueNameInput, setCueNameInput] = useState('');
  const [cueSceneIdInput, setCueSceneIdInput] = useState(scenes[0]?.id || '');
  const [cueFadeSecInput, setCueFadeSecInput] = useState(2.0);
  const [cueHoldSecInput, setCueHoldSecInput] = useState(0);

  // New Cue Stack Modal
  const [showNewStackModal, setShowNewStackModal] = useState(false);
  const [newStackName, setNewStackName] = useState('');
  const [newStackDescription, setNewStackDescription] = useState('');

  const activeCuelistObj = cuelists.find((c) => c.id === activeCuelistId) || cuelists[0];
  const displayCues = activeCuelistObj?.cues || cuelist;
  const activeCue = displayCues[activeCueIndex];
  const nextCue =
    displayCues[activeCueIndex + 1] ||
    (activeCuelistObj?.isLooping ? displayCues[0] : undefined);

  const handleTriggerScene = (scene: Scene) => {
    const fade = selectedFadeSec !== null ? selectedFadeSec * 1000 : scene.fadeTimeMs;
    onTriggerScene(scene.id, fade);
  };

  const handleCreateSceneFromCurrentDmx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSceneName.trim()) return;

    const channelMap: Record<number, number> = {};
    for (let i = 0; i < dmxUniverse.length; i++) {
      if (dmxUniverse[i] > 0) {
        channelMap[i + 1] = dmxUniverse[i];
      }
    }

    const universeMap: Record<number, Record<number, number>> = {};
    if (dmxUniverses) {
      for (const [uKey, buf] of Object.entries(dmxUniverses)) {
        const uNum = Number(uKey);
        const map: Record<number, number> = {};
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] > 0) {
            map[i + 1] = buf[i];
          }
        }
        if (Object.keys(map).length > 0 || uNum === 0) {
          universeMap[uNum] = map;
        }
      }
    } else {
      universeMap[0] = channelMap;
    }

    const createdScene: Scene = {
      id: `sc-custom-${Date.now()}`,
      name: newSceneName.trim(),
      colorSwatch: newSceneColor,
      fadeTimeMs: newSceneFadeMs,
      category: newSceneCategory,
      channelValues: channelMap,
      universeChannelValues: universeMap,
    };

    onSaveScene(createdScene);
    setShowNewSceneModal(false);
    setNewSceneName('');
  };

  const openAddCueModal = () => {
    const maxCueNum = displayCues.reduce((max, c) => Math.max(max, c.cueNumber), 0);
    setEditingCueId(null);
    setCueNumberInput((Math.round((maxCueNum + 1.0) * 10) / 10).toFixed(1));
    setCueNameInput('');
    setCueSceneIdInput(scenes[0]?.id || '');
    setCueFadeSecInput(2.0);
    setCueHoldSecInput(0);
    setShowCueModal(true);
  };

  const openEditCueModal = (cue: Cue) => {
    setEditingCueId(cue.id);
    setCueNumberInput(cue.cueNumber.toFixed(1));
    setCueNameInput(cue.name);
    setCueSceneIdInput(cue.sceneId);
    setCueFadeSecInput(cue.fadeInMs / 1000);
    setCueHoldSecInput(cue.holdTimeMs / 1000);
    setShowCueModal(true);
  };

  const handleSaveCueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cueNameInput.trim()) return;

    const existingCue = editingCueId
      ? displayCues.find((c) => c.id === editingCueId)
      : undefined;

    const parsedNum = parseFloat(cueNumberInput);
    const cuePayload: Cue = {
      id: editingCueId || `cue-${Date.now()}`,
      cueNumber: Number.isFinite(parsedNum) ? Math.round(parsedNum * 10) / 10 : 1.0,
      name: cueNameInput.trim(),
      sceneId: cueSceneIdInput || scenes[0]?.id || '',
      fadeInMs: Math.max(0, Math.round((Number.isFinite(cueFadeSecInput) ? cueFadeSecInput : 0) * 1000)),
      holdTimeMs: Math.max(0, Math.round((Number.isFinite(cueHoldSecInput) ? cueHoldSecInput : 0) * 1000)),
      description: existingCue?.description || 'Cue step',
    };

    onSaveCue(cuePayload, activeCuelistId);
    setShowCueModal(false);
  };

  const handleMoveCue = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= displayCues.length) return;
    const ids = displayCues.map((c) => c.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, moved);
    onReorderCues(ids, activeCuelistId);
  };

  const handleCreateStackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStackName.trim()) return;
    onCreateCuelist(newStackName.trim(), newStackDescription.trim() || undefined);
    setShowNewStackModal(false);
    setNewStackName('');
    setNewStackDescription('');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 p-5">
      {/* Left 7-8 cols: Scene Control (Submasters / Launchpads) */}
      <div className="xl:col-span-7 2xl:col-span-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 px-4 py-3 rounded-xl border border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">Live Scene Playback</h2>
            <p className="text-xs text-slate-400">
              Blend scenes with submaster faders or trigger instant looks
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setSceneControlMode('faders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  sceneControlMode === 'faders'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Scene Faders</span>
              </button>
              <button
                onClick={() => setSceneControlMode('pads')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  sceneControlMode === 'pads'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Launchpads</span>
              </button>
              <button
                onClick={() => setSceneControlMode('split')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors whitespace-nowrap ${
                  sceneControlMode === 'split'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
            </div>

            {sceneControlMode !== 'faders' && (
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <span className="text-[11px] font-medium text-slate-500 px-1.5">Fade</span>
                <button
                  onClick={() => setSelectedFadeSec(null)}
                  className={`px-2 py-1 rounded transition-colors ${
                    selectedFadeSec === null
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Auto
                </button>
                {[0, 0.5, 1, 2, 3].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setSelectedFadeSec(sec)}
                    className={`px-2 py-1 rounded font-mono transition-colors ${
                      selectedFadeSec === sec
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {sec === 0 ? 'Snap' : `${sec}s`}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowNewSceneModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Store Look</span>
            </button>
          </div>
        </div>

        {(sceneControlMode === 'faders' || sceneControlMode === 'split') && (
          <SceneFadersBank
            scenes={scenes}
            sceneFaders={sceneFaders}
            faderBlendMode={faderBlendMode}
            baseLookMix={baseLookMix}
            dmxUniverse={dmxUniverse}
            dmxUniverses={dmxUniverses}
            onSetSceneFader={onSetSceneFader}
            onSetSceneFaders={onSetSceneFaders}
            onFlashSceneFader={onFlashSceneFader}
            onSetFaderBlendMode={onSetFaderBlendMode}
            onSetBaseLookMix={onSetBaseLookMix}
            onClearAllSceneFaders={onClearAllSceneFaders}
            onSaveScene={onSaveScene}
          />
        )}

        {(sceneControlMode === 'pads' || sceneControlMode === 'split') && (
          <div className="flex flex-col gap-3 bg-slate-900/70 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white tracking-tight">Scene Launchpads</h3>
              <span className="text-xs text-slate-400 tabular-nums">{scenes.length} looks</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {scenes.map((scene) => {
                const isActive = activeSceneId === scene.id;
                return (
                  <div
                    key={scene.id}
                    onClick={() => handleTriggerScene(scene)}
                    style={{
                      borderColor: isActive ? scene.colorSwatch : undefined,
                    }}
                    className={`relative group p-3 rounded-lg border text-left cursor-pointer transition-colors select-none ${
                      isActive
                        ? 'bg-slate-800 border-2'
                        : 'bg-slate-950/70 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: scene.colorSwatch }}
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {(scene.fadeTimeMs / 1000).toFixed(1)}s
                        </span>
                        {scenes.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteScene(scene.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-opacity"
                            title="Delete Scene"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="font-semibold text-sm text-white truncate mb-0.5">
                      {scene.name}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{scene.category || 'Preset'}</span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-amber-400 font-semibold text-[11px]">
                          <Check className="w-3 h-3" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right 5 cols: Multi-Stack Cue Sequencer */}
      <div className="xl:col-span-5 2xl:col-span-4 flex flex-col gap-3 bg-slate-900/70 p-4 rounded-xl border border-slate-800">
        {/* Cue Stack Header & Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white tracking-tight">Cue Stacks</h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowNewStackModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              <span>New Stack</span>
            </button>
            <button
              onClick={openAddCueModal}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md transition-colors whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              <span>Add Cue</span>
            </button>
          </div>
        </div>

        {/* Active Stack Dropdown + Loop + Delete */}
        <div className="flex items-center gap-2">
          <select
            value={activeCuelistId}
            onChange={(e) => onSelectCuelist(e.target.value)}
            className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white focus:outline-none focus:border-amber-500"
          >
            {cuelists.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.name} ({cl.cues.length} cues)
              </option>
            ))}
          </select>

          {activeCuelistObj && (
            <>
              <button
                onClick={() =>
                  onUpdateCuelistMeta(
                    activeCuelistObj.id,
                    activeCuelistObj.name,
                    !activeCuelistObj.isLooping,
                    activeCuelistObj.description
                  )
                }
                title={activeCuelistObj.isLooping ? 'Looping Enabled' : 'Looping Off'}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                  activeCuelistObj.isLooping
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Repeat className="w-3.5 h-3.5" />
                <span>Loop</span>
              </button>

              {cuelists.length > 1 && (
                <button
                  onClick={() => onDeleteCuelist(activeCuelistObj.id)}
                  title="Delete Cue Stack"
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-rose-400 hover:border-rose-900/60 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Master Playback Transport */}
        <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] text-slate-500 block">Current Cue</span>
              <span className="text-sm font-bold text-amber-300 font-mono truncate block">
                {activeCue ? `Q${activeCue.cueNumber.toFixed(1)} · ${activeCue.name}` : 'Ready'}
              </span>
            </div>
            <div className="text-right min-w-0">
              <span className="text-[11px] text-slate-500 block">Next</span>
              <span className="text-xs font-mono text-slate-300 truncate block">
                {nextCue ? `Q${nextCue.cueNumber.toFixed(1)} · ${nextCue.name}` : 'End of stack'}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-75"
                style={{ width: `${Math.round(cueProgress * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
              <span>{cuePlaying ? 'Crossfading' : 'Holding'}</span>
              <span>{Math.round(cueProgress * 100)}%</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={onCueBack}
              className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors"
            >
              <SkipBack className="w-3.5 h-3.5" />
              <span>BACK</span>
            </button>
            <button
              onClick={onCuePause}
              className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>PAUSE</span>
            </button>
            <button
              onClick={onCueGo}
              className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>GO</span>
            </button>
          </div>
        </div>

        {/* Cue List Table */}
        <div className="overflow-y-auto max-h-[440px] rounded-lg border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] sticky top-0 border-b border-slate-800 z-10">
              <tr>
                <th className="py-2 px-2.5">Cue</th>
                <th className="py-2 px-2.5">Title & Look</th>
                <th className="py-2 px-2 text-right">Fade</th>
                <th className="py-2 px-2 text-right">Hold</th>
                <th className="py-2 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {displayCues.map((cue, idx) => {
                const isCurrent = idx === activeCueIndex;
                const linkedScene = scenes.find((s) => s.id === cue.sceneId);

                return (
                  <tr
                    key={cue.id}
                    className={`transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-amber-500/10 hover:bg-amber-500/15'
                        : 'hover:bg-slate-900/70'
                    }`}
                  >
                    <td
                      onClick={() => onCueJump(idx)}
                      className="py-2 px-2.5 font-mono tabular-nums font-bold text-slate-200 whitespace-nowrap"
                    >
                      <span className={isCurrent ? 'text-amber-400' : 'text-slate-300'}>
                        Q{cue.cueNumber.toFixed(1)}
                      </span>
                    </td>
                    <td onClick={() => onCueJump(idx)} className="py-2 px-2.5 min-w-0">
                      <div className="font-medium text-white truncate max-w-[130px]">
                        {cue.name}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate max-w-[130px]">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: linkedScene?.colorSwatch || '#64748b' }}
                        />
                        <span className="truncate">{linkedScene?.name || 'Manual'}</span>
                      </div>
                    </td>
                    <td
                      onClick={() => onCueJump(idx)}
                      className="py-2 px-2 font-mono tabular-nums text-right text-slate-300 whitespace-nowrap"
                    >
                      {(cue.fadeInMs / 1000).toFixed(1)}s
                    </td>
                    <td
                      onClick={() => onCueJump(idx)}
                      className="py-2 px-2 font-mono tabular-nums text-right text-slate-400 whitespace-nowrap"
                    >
                      {cue.holdTimeMs > 0 ? `${(cue.holdTimeMs / 1000).toFixed(1)}s` : 'Manual'}
                    </td>
                    <td className="py-2 px-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCue(idx, -1);
                          }}
                          disabled={idx === 0}
                          className="p-1 text-slate-500 hover:text-white disabled:opacity-25 rounded"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveCue(idx, 1);
                          }}
                          disabled={idx === displayCues.length - 1}
                          className="p-1 text-slate-500 hover:text-white disabled:opacity-25 rounded"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditCueModal(cue);
                          }}
                          className="p-1 text-slate-500 hover:text-amber-400 rounded"
                          title="Edit Cue"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateCue(cue.id, activeCuelistId);
                          }}
                          className="p-1 text-slate-500 hover:text-sky-400 rounded"
                          title="Duplicate Cue"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCue(cue.id, activeCuelistId);
                          }}
                          disabled={displayCues.length <= 1}
                          className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-25 rounded"
                          title="Delete Cue"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Store New Scene Modal */}
      {showNewSceneModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Store Current Output as Scene</h3>
            <p className="text-xs text-slate-400 mb-4">
              Captures all active channels across all configured DMX universes
            </p>

            <form onSubmit={handleCreateSceneFromCurrentDmx} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Scene Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electric Climax"
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
                  <select
                    value={newSceneCategory}
                    onChange={(e) => setNewSceneCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="Chorus">Chorus</option>
                    <option value="Verse">Verse</option>
                    <option value="Drop">Drop</option>
                    <option value="Solo">Solo</option>
                    <option value="Atmospheric">Atmospheric</option>
                    <option value="House">House</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Fade Time (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newSceneFadeMs / 1000}
                    onChange={(e) => setNewSceneFadeMs((parseFloat(e.target.value) || 0) * 1000)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tag Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newSceneColor}
                    onChange={(e) => setNewSceneColor(e.target.value)}
                    className="w-10 h-10 rounded border border-slate-700 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newSceneColor}
                    onChange={(e) => setNewSceneColor(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewSceneModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg"
                >
                  Save Look
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Cue Modal */}
      {showCueModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              {editingCueId ? 'Edit Cue' : 'Add Cue'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {activeCuelistObj ? `Stack: ${activeCuelistObj.name}` : 'Active Cue Stack'}
            </p>

            <form onSubmit={handleSaveCueSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cue #</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={cueNumberInput}
                    onChange={(e) => setCueNumberInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Cue Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chorus 2 Drop"
                    value={cueNameInput}
                    onChange={(e) => setCueNameInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Scene</label>
                <select
                  value={cueSceneIdInput}
                  onChange={(e) => setCueSceneIdInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                >
                  {scenes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category || 'Preset'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Fade In (s)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={cueFadeSecInput}
                    onChange={(e) => setCueFadeSecInput(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Auto-Hold (s, 0=Manual)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={cueHoldSecInput}
                    onChange={(e) => setCueHoldSecInput(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCueModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg"
                >
                  {editingCueId ? 'Save Changes' : 'Add Cue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Cue Stack Modal */}
      {showNewStackModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Create Cue Stack</h3>
            <p className="text-xs text-slate-400 mb-4">
              Organize separate sets, songs, or playback sequences
            </p>

            <form onSubmit={handleCreateStackSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Stack Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Encore Setlist"
                  value={newStackName}
                  onChange={(e) => setNewStackName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. High-energy closing sequence"
                  value={newStackDescription}
                  onChange={(e) => setNewStackDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewStackModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg"
                >
                  Create Stack
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
