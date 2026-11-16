import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Box, Send, Edit2, Power, Network } from 'lucide-react';
import type { Fixture, FixtureType, CustomFixtureType, UniverseConfig } from '../types/lighting.ts';
import { FixtureTypeBuilderModal } from './FixtureTypeBuilderModal.tsx';

interface DmxUniverseInspectorProps {
  dmxUniverse: number[];
  dmxUniverses?: Record<number, number[]>;
  universes: UniverseConfig[];
  fixtures: Fixture[];
  fixtureTypes: CustomFixtureType[];
  onSetChannel: (channel: number, value: number, universe?: number) => void;
  onUpdateFixtures: (fixtures: Fixture[]) => void;
  onSaveFixtureType: (fixtureType: CustomFixtureType) => void;
  onDeleteFixtureType: (typeId: string) => void;
  onSaveUniverseConfig: (universe: UniverseConfig) => void;
  onDeleteUniverseConfig: (universeId: string) => void;
  onSendUniverseTestPacket: (universeNumber: number) => void;
}

export const DmxUniverseInspector: React.FC<DmxUniverseInspectorProps> = ({
  dmxUniverse,
  dmxUniverses,
  universes,
  fixtures,
  fixtureTypes,
  onSetChannel,
  onUpdateFixtures,
  onSaveFixtureType,
  onDeleteFixtureType,
  onSaveUniverseConfig,
  onDeleteUniverseConfig,
  onSendUniverseTestPacket,
}) => {
  const [selectedUniverse, setSelectedUniverse] = useState<number>(universes[0]?.universe ?? 0);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTypeBuilderModal, setShowTypeBuilderModal] = useState(false);

  // Universe Config Modal State
  const [showUniverseModal, setShowUniverseModal] = useState(false);
  const [editingUniverseId, setEditingUniverseId] = useState<string | null>(null);
  const [uniNumInput, setUniNumInput] = useState(0);
  const [uniNameInput, setUniNameInput] = useState('');
  const [uniIpInput, setUniIpInput] = useState('192.168.1.100');
  const [uniPortInput, setUniPortInput] = useState(6454);
  const [uniSubnetInput, setUniSubnetInput] = useState(0);
  const [uniNetInput, setUniNetInput] = useState(0);
  const [uniArtnetUniInput, setUniArtnetUniInput] = useState(0);
  const [uniEnabledInput, setUniEnabledInput] = useState(true);
  const [uniDescInput, setUniDescInput] = useState('');

  // New Fixture Form State
  const [newFixName, setNewFixName] = useState('');
  const [newFixType, setNewFixType] = useState<FixtureType>('type-mh-10ch');
  const [newFixUniverse, setNewFixUniverse] = useState<number>(selectedUniverse);
  const [newFixStartCh, setNewFixStartCh] = useState(1);

  const activeBuffer = useMemo(() => {
    if (dmxUniverses && dmxUniverses[selectedUniverse]) {
      return dmxUniverses[selectedUniverse];
    }
    return selectedUniverse === 0 ? dmxUniverse : new Array(512).fill(0);
  }, [dmxUniverses, dmxUniverse, selectedUniverse]);

  const channelCountForType = (typeIdOrName: string): number => {
    const custom = fixtureTypes.find((t) => t.id === typeIdOrName || t.name === typeIdOrName);
    if (custom) return custom.channelCount;
    if (typeIdOrName === 'moving_head') return 10;
    if (typeIdOrName === 'rgbw_par') return 5;
    if (typeIdOrName === 'strobe') return 3;
    if (typeIdOrName === 'dimmer') return 1;
    return 1;
  };

  const getChannelInfo = (channelNumber: number) => {
    for (const fix of fixtures) {
      if (
        (fix.universe ?? 0) === selectedUniverse &&
        channelNumber >= fix.startChannel &&
        channelNumber < fix.startChannel + fix.channelCount
      ) {
        const offset = channelNumber - fix.startChannel;
        let paramName = `Param ${offset + 1}`;

        const customType = fixtureTypes.find(
          (t) => t.id === fix.typeId || t.id === fix.type || t.name === fix.type
        );
        if (customType) {
          const chDef = customType.channels.find((c) => c.offset === offset);
          if (chDef) paramName = chDef.name;
        } else if (fix.type === 'moving_head') {
          const params = [
            'Pan',
            'Pan Fine',
            'Tilt',
            'Tilt Fine',
            'Dimmer',
            'Shutter/Strobe',
            'Red',
            'Green',
            'Blue',
            'White',
          ];
          paramName = params[offset] || paramName;
        } else if (fix.type === 'rgbw_par') {
          const params = ['Dimmer', 'Red', 'Green', 'Blue', 'White'];
          paramName = params[offset] || paramName;
        } else if (fix.type === 'strobe') {
          const params = ['Dimmer', 'Flash Duration', 'Flash Rate'];
          paramName = params[offset] || paramName;
        } else if (fix.type === 'dimmer') {
          paramName = 'Dimmer';
        }

        return {
          fixture: fix,
          paramName,
          isPatched: true,
        };
      }
    }
    return {
      fixture: null,
      paramName: 'Unpatched',
      isPatched: false,
    };
  };

  const getChannelTypeColor = (fix: Fixture | null) => {
    if (!fix) return 'border-slate-800/80 bg-slate-950/40 text-slate-500';
    if (fix.type === 'moving_head' || fix.type.includes('mh'))
      return 'border-cyan-800/60 bg-cyan-950/20 text-cyan-300';
    if (fix.type === 'rgbw_par' || fix.type.includes('par'))
      return 'border-purple-800/60 bg-purple-950/20 text-purple-300';
    if (fix.type === 'strobe')
      return 'border-rose-800/60 bg-rose-950/20 text-rose-300';
    if (fix.type.includes('laser'))
      return 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300';
    return 'border-amber-800/60 bg-amber-950/20 text-amber-300';
  };

  const openNewUniverseModal = () => {
    const nextNum = universes.reduce((max, u) => Math.max(max, u.universe), -1) + 1;
    setEditingUniverseId(null);
    setUniNumInput(Math.min(7, nextNum));
    setUniNameInput(`Universe ${nextNum} - Aux Node`);
    setUniIpInput(`192.168.1.${100 + nextNum}`);
    setUniPortInput(6454);
    setUniSubnetInput(0);
    setUniNetInput(0);
    setUniArtnetUniInput(nextNum % 16);
    setUniEnabledInput(true);
    setUniDescInput('');
    setShowUniverseModal(true);
  };

  const openEditUniverseModal = (u: UniverseConfig) => {
    setEditingUniverseId(u.id);
    setUniNumInput(u.universe);
    setUniNameInput(u.name);
    setUniIpInput(u.targetIp);
    setUniPortInput(u.targetPort);
    setUniSubnetInput(u.subnet);
    setUniNetInput(u.net);
    setUniArtnetUniInput(u.artnetUniverse);
    setUniEnabledInput(u.enabled);
    setUniDescInput(u.description || '');
    setShowUniverseModal(true);
  };

  const handleSaveUniverseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uniIpInput.trim()) return;
    const existing = universes.find((u) => u.id === editingUniverseId);
    const config: UniverseConfig = {
      id: editingUniverseId || `uni-${uniNumInput}-${Date.now()}`,
      universe: Math.max(0, Math.min(7, uniNumInput)),
      name: uniNameInput.trim() || `Universe ${uniNumInput}`,
      targetIp: uniIpInput.trim(),
      targetPort: uniPortInput || 6454,
      subnet: Math.max(0, Math.min(15, uniSubnetInput)),
      net: Math.max(0, Math.min(127, uniNetInput)),
      artnetUniverse: Math.max(0, Math.min(15, uniArtnetUniInput)),
      enabled: uniEnabledInput,
      packetCount: existing?.packetCount ?? 0,
      lastSentTime: existing?.lastSentTime,
      description: uniDescInput.trim(),
    };
    onSaveUniverseConfig(config);
    setSelectedUniverse(config.universe);
    setShowUniverseModal(false);
  };

  const handleAddFixtureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixName.trim()) return;

    const count = channelCountForType(newFixType);
    const selectedCustomType = fixtureTypes.find((t) => t.id === newFixType);

    const newFixture: Fixture = {
      id: `fix-${Date.now()}`,
      name: newFixName.trim(),
      type: selectedCustomType ? selectedCustomType.name : newFixType,
      typeId: selectedCustomType ? selectedCustomType.id : undefined,
      universe: newFixUniverse,
      startChannel: newFixStartCh,
      channelCount: count,
      position: { x: 0, y: 0, z: 70 },
      tags: [selectedCustomType ? selectedCustomType.category : 'custom'],
    };

    onUpdateFixtures([...fixtures, newFixture]);
    setShowAddModal(false);
    setNewFixName('');
    setNewFixStartCh(Math.min(512, newFixStartCh + count));
  };

  const handleDeleteFixture = (id: string) => {
    onUpdateFixtures(fixtures.filter((f) => f.id !== id));
  };

  const activeChannelVal = selectedChannel !== null ? activeBuffer[selectedChannel - 1] ?? 0 : 0;
  const activeChannelInfo = selectedChannel !== null ? getChannelInfo(selectedChannel) : null;

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Top Section: Multi-Universe Art-Net Routing Table */}
      <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Network className="w-4 h-4 text-amber-400" />
              <span>DMX Universes & Art-Net IP Routing</span>
            </h2>
            <p className="text-xs text-slate-400">
              Route each DMX universe (0–7) to its own Art-Net node IP address, port, and subnet
            </p>
          </div>

          <button
            onClick={openNewUniverseModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Universe</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {universes.map((u) => {
            const isSelected = selectedUniverse === u.universe;
            return (
              <div
                key={u.id}
                onClick={() => setSelectedUniverse(u.universe)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-colors flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-slate-800/90 border-amber-500/80'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-amber-400">
                      Universe {u.universe}
                    </span>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSaveUniverseConfig({ ...u, enabled: !u.enabled })}
                        className={`p-1 rounded border text-[10px] font-mono ${
                          u.enabled
                            ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-500'
                        }`}
                        title={u.enabled ? 'Disable Art-Net output' : 'Enable Art-Net output'}
                      >
                        <Power className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onSendUniverseTestPacket(u.universe)}
                        className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
                        title={`Send test ArtDmx packet to ${u.targetIp}`}
                      >
                        <Send className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => openEditUniverseModal(u)}
                        className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
                        title="Edit Universe IP & Settings"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {universes.length > 1 && (
                        <button
                          onClick={() => onDeleteUniverseConfig(u.id)}
                          className="p-1 rounded bg-slate-900 hover:bg-rose-950 border border-slate-800 text-slate-400 hover:text-rose-400"
                          title="Delete Universe"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-white truncate">
                    {u.name.replace(/^Universe \d+\s*-\s*/i, '')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 mt-1 tabular-nums">
                    {u.targetIp}:{u.targetPort}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
                  <span>
                    Net {u.net} · Sub {u.subnet} · Port {u.artnetUniverse}
                  </span>
                  <span className="tabular-nums">{u.packetCount.toLocaleString()} pkts</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Grid: 512 Matrix + Fixture Patch */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left 8 cols: 512-Channel Live Grid Matrix */}
        <div className="xl:col-span-8 flex flex-col gap-4 bg-slate-900/60 p-5 rounded-xl border border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Universe {selectedUniverse} DMX512 Matrix
              </h2>
              <p className="text-xs text-slate-400">
                Real-time channel levels (1–512)
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {universes.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUniverse(u.universe)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors ${
                    selectedUniverse === u.universe
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Uni {u.universe}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-8 sm:grid-cols-16 md:grid-cols-16 lg:grid-cols-32 gap-1 max-h-[440px] overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800 select-none">
            {Array.from({ length: 512 }).map((_, i) => {
              const ch = i + 1;
              const val = activeBuffer[i] ?? 0;
              const info = getChannelInfo(ch);
              const isSelected = selectedChannel === ch;
              const colorClass = getChannelTypeColor(info.fixture);

              return (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  className={`p-1 rounded text-center transition-all border font-mono ${colorClass} ${
                    isSelected
                      ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-950 font-bold z-10'
                      : 'hover:brightness-125'
                  }`}
                  title={`Uni ${selectedUniverse} · Ch ${ch}: ${val} (${info.paramName})`}
                >
                  <div className="text-[8px] opacity-60 leading-none">{ch}</div>
                  <div className="text-[10px] font-bold leading-tight tabular-nums">{val}</div>
                </button>
              );
            })}
          </div>

          {selectedChannel !== null && activeChannelInfo && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-sm font-bold text-amber-400 font-mono">
                    Uni {selectedUniverse} · Ch {selectedChannel}
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="font-semibold text-white">
                    {activeChannelInfo.paramName}
                  </span>
                  {activeChannelInfo.fixture && (
                    <span className="text-slate-400">
                      ({activeChannelInfo.fixture.name})
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  Byte: {activeChannelVal} / 255 (0x
                  {activeChannelVal.toString(16).padStart(2, '0').toUpperCase()})
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={activeChannelVal}
                  onChange={(e) =>
                    onSetChannel(selectedChannel, parseInt(e.target.value, 10), selectedUniverse)
                  }
                  className="w-48 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <span className="font-mono text-sm font-bold text-amber-400 w-10 text-right tabular-nums">
                  {activeChannelVal}
                </span>
                <button
                  onClick={() => onSetChannel(selectedChannel, 255, selectedUniverse)}
                  className="px-2 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                >
                  255
                </button>
                <button
                  onClick={() => onSetChannel(selectedChannel, 0, selectedUniverse)}
                  className="px-2 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                >
                  0
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right 4 cols: Fixture Patch Table */}
        <div className="xl:col-span-4 flex flex-col gap-4 bg-slate-900/60 p-5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Patch Schedule</h2>
              <p className="text-xs text-slate-400">
                Universes & start addresses
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowTypeBuilderModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Box className="w-3.5 h-3.5 text-amber-400" />
                <span>Types</span>
              </button>

              <button
                onClick={() => {
                  setNewFixUniverse(selectedUniverse);
                  setShowAddModal(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Patch</span>
              </button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[500px] space-y-2 pr-1">
            {fixtures.map((fixture) => {
              const endCh = fixture.startChannel + fixture.channelCount - 1;
              const uni = fixture.universe ?? 0;
              return (
                <div
                  key={fixture.id}
                  onClick={() => setSelectedUniverse(uni)}
                  className="p-3 bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-lg flex items-center justify-between cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-white truncate">
                      {fixture.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 tabular-nums">
                      <span className="text-amber-400 font-bold">Uni {uni}</span>
                      <span>·</span>
                      <span>
                        Ch {fixture.startChannel}–{endCh}
                      </span>
                      <span>·</span>
                      <span className="text-slate-300 truncate max-w-[110px]">
                        {fixture.type}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFixture(fixture.id);
                    }}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded shrink-0"
                    title="Unpatch Fixture"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add / Edit Universe Modal */}
      {showUniverseModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              {editingUniverseId ? 'Edit DMX Universe & Art-Net IP' : 'Add DMX Universe'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Assign a dedicated Art-Net IP address and port to this DMX universe
            </p>

            <form onSubmit={handleSaveUniverseSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Universe (0–7)</label>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={uniNumInput}
                    onChange={(e) => setUniNumInput(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-300 mb-1 font-medium">Universe Label</label>
                  <input
                    type="text"
                    required
                    value={uniNameInput}
                    onChange={(e) => setUniNameInput(e.target.value)}
                    placeholder="e.g. Back Truss Node"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-300 mb-1 font-medium">Target Art-Net IP</label>
                  <input
                    type="text"
                    required
                    value={uniIpInput}
                    onChange={(e) => setUniIpInput(e.target.value)}
                    placeholder="192.168.1.101 or 255.255.255.255"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">UDP Port</label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={uniPortInput}
                    onChange={(e) => setUniPortInput(parseInt(e.target.value, 10) || 6454)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Net (0–127)</label>
                  <input
                    type="number"
                    min="0"
                    max="127"
                    value={uniNetInput}
                    onChange={(e) => setUniNetInput(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Subnet (0–15)</label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={uniSubnetInput}
                    onChange={(e) => setUniSubnetInput(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Port Uni (0–15)</label>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    value={uniArtnetUniInput}
                    onChange={(e) => setUniArtnetUniInput(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uniEnabledInput}
                  onChange={(e) => setUniEnabledInput(e.target.checked)}
                  className="accent-amber-500"
                />
                <span>Enable 40 Hz Art-Net UDP output for this universe</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUniverseModal(false)}
                  className="px-4 py-2 font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg"
                >
                  Save Universe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patch Fixture Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Patch Fixture</h3>
            <p className="text-xs text-slate-400 mb-4">
              Select fixture personality, target universe, and start DMX address
            </p>

            <form onSubmit={handleAddFixtureSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Fixture Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Center Laser Bar 1"
                  value={newFixName}
                  onChange={(e) => setNewFixName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium">Fixture Type</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setShowTypeBuilderModal(true);
                    }}
                    className="text-amber-400 hover:underline text-[11px]"
                  >
                    + Create New Type
                  </button>
                </div>
                <select
                  value={newFixType}
                  onChange={(e) => setNewFixType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                >
                  {fixtureTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.channelCount} Ch)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">DMX Universe</label>
                  <select
                    value={newFixUniverse}
                    onChange={(e) => setNewFixUniverse(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  >
                    {universes.map((u) => (
                      <option key={u.id} value={u.universe}>
                        Uni {u.universe} ({u.targetIp})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">
                    Start Channel (1–512)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={512 - channelCountForType(newFixType) + 1}
                    value={newFixStartCh}
                    onChange={(e) => setNewFixStartCh(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <span className="text-[11px] text-slate-400 block font-mono">
                Assigns Uni {newFixUniverse} · Ch {newFixStartCh}–
                {newFixStartCh + channelCountForType(newFixType) - 1} (
                {channelCountForType(newFixType)} ch)
              </span>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 font-medium text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg"
                >
                  Patch Fixture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTypeBuilderModal && (
        <FixtureTypeBuilderModal
          fixtureTypes={fixtureTypes}
          onSaveFixtureType={onSaveFixtureType}
          onDeleteFixtureType={onDeleteFixtureType}
          onClose={() => setShowTypeBuilderModal(false)}
        />
      )}
    </div>
  );
};
