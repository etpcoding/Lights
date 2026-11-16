import React, { useMemo, useState } from 'react';
import { Target, CheckSquare, Square, Box, RotateCcw, Sliders, Link2 } from 'lucide-react';
import type { Fixture, CustomFixtureType, UniverseConfig } from '../types/lighting.ts';

interface FixtureProgrammerViewProps {
  fixtures: Fixture[];
  fixtureTypes: CustomFixtureType[];
  universes: UniverseConfig[];
  dmxUniverse: number[];
  dmxUniverses?: Record<number, number[]>;
  onSetChannel: (channel: number, value: number, universe?: number) => void;
  onSetChannels: (updates: Record<number, number>, universe?: number) => void;
  onLocateFixtures: (ids: string[]) => void;
  onOpenTypeBuilder?: () => void;
}

interface ResolvedChannel {
  offset: number;
  dmxChannel: number;
  name: string;
  defaultValue: number;
}

function resolveFixtureChannels(
  fixture: Fixture,
  fixtureTypes: CustomFixtureType[]
): ResolvedChannel[] {
  const cType = fixtureTypes.find(
    (t) => t.id === fixture.typeId || t.id === fixture.type || t.name === fixture.type
  );
  if (cType && cType.channels.length > 0) {
    return [...cType.channels]
      .sort((a, b) => a.offset - b.offset)
      .map((ch) => ({
        offset: ch.offset,
        dmxChannel: fixture.startChannel + ch.offset,
        name: ch.name,
        defaultValue: ch.defaultValue ?? 0,
      }));
  }

  if (fixture.type === 'moving_head') {
    const names = [
      'Pan Coarse',
      'Pan Fine',
      'Tilt Coarse',
      'Tilt Fine',
      'Master Dimmer',
      'Shutter / Strobe',
      'Red',
      'Green',
      'Blue',
      'White',
    ];
    return Array.from({ length: fixture.channelCount }).map((_, idx) => ({
      offset: idx,
      dmxChannel: fixture.startChannel + idx,
      name: names[idx] || `Channel ${idx + 1}`,
      defaultValue: idx === 0 || idx === 2 ? 128 : 0,
    }));
  }

  if (fixture.type === 'rgbw_par') {
    const names = ['Master Dimmer', 'Red', 'Green', 'Blue', 'White'];
    return Array.from({ length: fixture.channelCount }).map((_, idx) => ({
      offset: idx,
      dmxChannel: fixture.startChannel + idx,
      name: names[idx] || `Channel ${idx + 1}`,
      defaultValue: 0,
    }));
  }

  if (fixture.type === 'strobe') {
    const names = ['Flash Dimmer', 'Flash Duration', 'Strobe Rate'];
    return Array.from({ length: fixture.channelCount }).map((_, idx) => ({
      offset: idx,
      dmxChannel: fixture.startChannel + idx,
      name: names[idx] || `Channel ${idx + 1}`,
      defaultValue: 0,
    }));
  }

  if (fixture.type === 'dimmer') {
    return [
      {
        offset: 0,
        dmxChannel: fixture.startChannel,
        name: 'Intensity',
        defaultValue: 0,
      },
    ];
  }

  return Array.from({ length: fixture.channelCount }).map((_, idx) => ({
    offset: idx,
    dmxChannel: fixture.startChannel + idx,
    name: `Channel ${idx + 1}`,
    defaultValue: 0,
  }));
}

export const FixtureProgrammerView: React.FC<FixtureProgrammerViewProps> = ({
  fixtures,
  fixtureTypes,
  universes,
  dmxUniverse,
  dmxUniverses,
  onSetChannel,
  onSetChannels,
  onLocateFixtures,
  onOpenTypeBuilder,
}) => {
  const [selectedFixtureIds, setSelectedFixtureIds] = useState<string[]>(
    fixtures.slice(0, 4).map((f) => f.id)
  );
  const [universeFilter, setUniverseFilter] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'fixtures' | 'raw'>('fixtures');
  const [linkMatchingNames, setLinkMatchingNames] = useState(false);

  // Raw 512 channel bank state
  const [rawUniverse, setRawUniverse] = useState<number>(0);
  const [rawPage, setRawPage] = useState<number>(0); // 0..15 (32 channels per page)

  const getUniverseBuffer = (uni: number): number[] => {
    if (dmxUniverses && dmxUniverses[uni]) return dmxUniverses[uni];
    return uni === 0 ? dmxUniverse : [];
  };

  const availableUniverses = useMemo(() => {
    const set = new Set<number>();
    universes.forEach((u) => set.add(u.universe));
    fixtures.forEach((f) => set.add(f.universe ?? 0));
    return Array.from(set).sort((a, b) => a - b);
  }, [universes, fixtures]);

  const filteredFixtures = useMemo(() => {
    if (universeFilter === 'all') return fixtures;
    return fixtures.filter((f) => (f.universe ?? 0) === universeFilter);
  }, [fixtures, universeFilter]);

  const selectedFixtures = useMemo(
    () => fixtures.filter((f) => selectedFixtureIds.includes(f.id)),
    [fixtures, selectedFixtureIds]
  );

  const toggleSelectFixture = (id: string) => {
    setSelectedFixtureIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllVisible = () => {
    setSelectedFixtureIds(filteredFixtures.map((f) => f.id));
  };

  const clearSelection = () => {
    setSelectedFixtureIds([]);
  };

  const zeroSelectedChannels = () => {
    const byUniverse: Record<number, Record<number, number>> = {};
    for (const fix of selectedFixtures) {
      const uni = fix.universe ?? 0;
      if (!byUniverse[uni]) byUniverse[uni] = {};
      for (let i = 0; i < fix.channelCount; i++) {
        byUniverse[uni][fix.startChannel + i] = 0;
      }
    }
    for (const [uniStr, updates] of Object.entries(byUniverse)) {
      onSetChannels(updates, parseInt(uniStr, 10));
    }
  };

  // Linked channels grouped by parameter name across all selected fixtures
  const linkedChannelGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        targets: { universe: number; dmxChannel: number }[];
        averageValue: number;
      }
    >();

    for (const fix of selectedFixtures) {
      const uni = fix.universe ?? 0;
      const buf = getUniverseBuffer(uni);
      const resolved = resolveFixtureChannels(fix, fixtureTypes);
      for (const ch of resolved) {
        const val = buf[ch.dmxChannel - 1] ?? 0;
        const existing = map.get(ch.name);
        if (!existing) {
          map.set(ch.name, {
            name: ch.name,
            targets: [{ universe: uni, dmxChannel: ch.dmxChannel }],
            averageValue: val,
          });
        } else {
          existing.targets.push({ universe: uni, dmxChannel: ch.dmxChannel });
        }
      }
    }

    for (const group of map.values()) {
      let sum = 0;
      for (const t of group.targets) {
        sum += getUniverseBuffer(t.universe)[t.dmxChannel - 1] ?? 0;
      }
      group.averageValue = Math.round(sum / group.targets.length);
    }

    return Array.from(map.values());
  }, [selectedFixtures, fixtureTypes, dmxUniverse, dmxUniverses]);

  const handleLinkedChannelChange = (
    targets: { universe: number; dmxChannel: number }[],
    value: number
  ) => {
    const byUni: Record<number, Record<number, number>> = {};
    for (const t of targets) {
      if (!byUni[t.universe]) byUni[t.universe] = {};
      byUni[t.universe][t.dmxChannel] = value;
    }
    for (const [uniStr, updates] of Object.entries(byUni)) {
      onSetChannels(updates, parseInt(uniStr, 10));
    }
  };

  const getChannelOwnerLabel = (uni: number, chNum: number): string => {
    for (const fix of fixtures) {
      if ((fix.universe ?? 0) === uni && chNum >= fix.startChannel && chNum < fix.startChannel + fix.channelCount) {
        const resolved = resolveFixtureChannels(fix, fixtureTypes);
        const found = resolved.find((r) => r.dmxChannel === chNum);
        return `${fix.name} · ${found?.name || `Ch ${chNum}`}`;
      }
    }
    return 'Unpatched';
  };

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
      {/* Left 4 cols: Fixture Selection */}
      <div className="xl:col-span-4 flex flex-col gap-4 bg-slate-900/60 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Fixtures</h2>
            <p className="text-xs text-slate-400">
              Select fixtures to adjust their DMX channels
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenTypeBuilder && (
              <button
                onClick={onOpenTypeBuilder}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Box className="w-3.5 h-3.5 text-amber-400" />
                <span>Types</span>
              </button>
            )}

            <button
              onClick={() => onLocateFixtures(selectedFixtureIds)}
              disabled={selectedFixtureIds.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
            >
              <Target className="w-3.5 h-3.5" />
              <span>Locate</span>
            </button>
          </div>
        </div>

        {/* Universe Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setUniverseFilter('all')}
            className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
              universeFilter === 'all'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          {availableUniverses.map((u) => (
            <button
              key={u}
              onClick={() => setUniverseFilter(u)}
              className={`px-2.5 py-1 rounded-md font-mono font-medium transition-colors ${
                universeFilter === u
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Uni {u}
            </button>
          ))}
        </div>

        {/* Selection Quick Actions */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={selectAllVisible}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={clearSelection}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-md border border-slate-800 transition-colors"
            >
              Clear
            </button>
          </div>
          <span className="font-mono text-slate-400 tabular-nums">
            {selectedFixtures.length} selected
          </span>
        </div>

        {/* Fixtures List */}
        <div className="overflow-y-auto max-h-[540px] space-y-1.5 pr-1">
          {filteredFixtures.map((fixture) => {
            const isSelected = selectedFixtureIds.includes(fixture.id);
            const uni = fixture.universe ?? 0;
            const cType = fixtureTypes.find(
              (t) => t.id === fixture.typeId || t.id === fixture.type || t.name === fixture.type
            );

            return (
              <div
                key={fixture.id}
                onClick={() => toggleSelectFixture(fixture.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between select-none ${
                  isSelected
                    ? 'bg-slate-800 border-amber-500/70'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-xs text-white truncate">
                      {fixture.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                      Uni {uni} · Ch {fixture.startChannel}–{fixture.startChannel + fixture.channelCount - 1} · {cType ? cType.name : fixture.type}
                    </div>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFixtureIds([fixture.id]);
                  }}
                  className="ml-2 px-2 py-1 text-[10px] font-mono text-slate-400 hover:text-amber-300 bg-slate-900 border border-slate-800 rounded shrink-0"
                  title="Select only this fixture"
                >
                  Solo
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right 8 cols: Direct Channel Faders */}
      <div className="xl:col-span-8 flex flex-col gap-4 bg-slate-900/60 p-5 rounded-xl border border-slate-800">
        {/* Top Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode('fixtures')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'fixtures'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Fixture Channels</span>
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  viewMode === 'raw'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <span>Raw 512 Channels</span>
              </button>
            </div>
          </div>

          {viewMode === 'fixtures' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLinkMatchingNames(!linkMatchingNames)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                  linkMatchingNames
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/60'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
                title="Control channels with the same name across all selected fixtures together"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{linkMatchingNames ? 'Grouped by Name' : 'Per-Fixture Channels'}</span>
              </button>

              <button
                onClick={zeroSelectedChannels}
                disabled={selectedFixtures.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Zero Selected</span>
              </button>
            </div>
          )}

          {viewMode === 'raw' && (
            <div className="flex items-center gap-2">
              <select
                value={rawUniverse}
                onChange={(e) => setRawUniverse(parseInt(e.target.value, 10))}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
              >
                {availableUniverses.map((u) => (
                  <option key={u} value={u}>
                    Universe {u}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Mode 1: Direct Fixture Channel Strips */}
        {viewMode === 'fixtures' && (
          <>
            {selectedFixtures.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-xl">
                Select one or more fixtures from the list on the left to control each channel directly.
              </div>
            ) : linkMatchingNames ? (
              <div className="space-y-2 overflow-y-auto max-h-[580px] pr-1">
                {linkedChannelGroups.map((group) => {
                  const pct = Math.round((group.averageValue / 255) * 100);
                  return (
                    <div
                      key={group.name}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 p-3 bg-slate-950 border border-slate-800 rounded-lg"
                    >
                      <div className="min-w-[170px]">
                        <div className="text-xs font-semibold text-white">{group.name}</div>
                        <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {group.targets.length} {group.targets.length === 1 ? 'fixture' : 'fixtures'}
                        </div>
                      </div>

                      <div className="flex-1 flex items-center gap-3 min-w-[200px]">
                        <input
                          type="range"
                          min="0"
                          max="255"
                          value={group.averageValue}
                          onChange={(e) =>
                            handleLinkedChannelChange(group.targets, parseInt(e.target.value, 10))
                          }
                          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="255"
                          value={group.averageValue}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                            handleLinkedChannelChange(group.targets, val);
                          }}
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-amber-400 text-right tabular-nums"
                        />
                        <span className="w-10 text-right font-mono text-[11px] text-slate-400 tabular-nums">
                          {pct}%
                        </span>
                        <button
                          onClick={() => handleLinkedChannelChange(group.targets, 0)}
                          className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded"
                        >
                          0
                        </button>
                        <button
                          onClick={() => handleLinkedChannelChange(group.targets, 128)}
                          className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded"
                        >
                          128
                        </button>
                        <button
                          onClick={() => handleLinkedChannelChange(group.targets, 255)}
                          className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 rounded"
                        >
                          255
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-[580px] pr-1">
                {selectedFixtures.map((fix) => {
                  const uni = fix.universe ?? 0;
                  const buf = getUniverseBuffer(uni);
                  const channels = resolveFixtureChannels(fix, fixtureTypes);

                  return (
                    <div
                      key={fix.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold text-white">{fix.name}</span>
                          <span className="text-slate-600">·</span>
                          <span className="font-mono text-amber-400 tabular-nums">
                            Uni {uni} · Ch {fix.startChannel}–{fix.startChannel + fix.channelCount - 1}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const updates: Record<number, number> = {};
                            channels.forEach((ch) => {
                              updates[ch.dmxChannel] = 0;
                            });
                            onSetChannels(updates, uni);
                          }}
                          className="text-[11px] font-mono text-slate-400 hover:text-white"
                        >
                          Zero Fixture
                        </button>
                      </div>

                      <div className="divide-y divide-slate-900">
                        {channels.map((ch) => {
                          const val = buf[ch.dmxChannel - 1] ?? 0;
                          const pct = Math.round((val / 255) * 100);
                          return (
                            <div
                              key={ch.dmxChannel}
                              className="px-4 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-900/40"
                            >
                              <div className="flex items-center gap-3 min-w-[190px]">
                                <span className="font-mono text-[11px] text-slate-500 w-12 tabular-nums">
                                  Ch {ch.dmxChannel}
                                </span>
                                <span className="text-xs font-medium text-slate-200 truncate">
                                  {ch.name}
                                </span>
                              </div>

                              <div className="flex-1 flex items-center min-w-[180px]">
                                <input
                                  type="range"
                                  min="0"
                                  max="255"
                                  value={val}
                                  onChange={(e) =>
                                    onSetChannel(ch.dmxChannel, parseInt(e.target.value, 10), uni)
                                  }
                                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                />
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <input
                                  type="number"
                                  min="0"
                                  max="255"
                                  value={val}
                                  onChange={(e) => {
                                    const next = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                                    onSetChannel(ch.dmxChannel, next, uni);
                                  }}
                                  className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-amber-400 text-right tabular-nums"
                                />
                                <span className="w-10 text-right font-mono text-[11px] text-slate-400 tabular-nums">
                                  {pct}%
                                </span>
                                <button
                                  onClick={() => onSetChannel(ch.dmxChannel, 0, uni)}
                                  className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded"
                                >
                                  0
                                </button>
                                <button
                                  onClick={() => onSetChannel(ch.dmxChannel, 128, uni)}
                                  className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 rounded"
                                >
                                  128
                                </button>
                                <button
                                  onClick={() => onSetChannel(ch.dmxChannel, 255, uni)}
                                  className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 rounded"
                                >
                                  255
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Mode 2: Raw 512 Channels Bank */}
        {viewMode === 'raw' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 16 }).map((_, pageIdx) => {
                const start = pageIdx * 32 + 1;
                const end = start + 31;
                return (
                  <button
                    key={pageIdx}
                    onClick={() => setRawPage(pageIdx)}
                    className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                      rawPage === pageIdx
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {start}–{end}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 overflow-y-auto max-h-[520px] pr-1">
              {Array.from({ length: 32 }).map((_, idx) => {
                const chNum = rawPage * 32 + idx + 1;
                const buf = getUniverseBuffer(rawUniverse);
                const val = buf[chNum - 1] ?? 0;
                const owner = getChannelOwnerLabel(rawUniverse, chNum);

                return (
                  <div
                    key={chNum}
                    className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                  >
                    <div className="min-w-[210px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400 tabular-nums">
                          Ch {chNum}
                        </span>
                        <span className="text-xs text-slate-300 truncate max-w-[160px]">
                          {owner}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 flex items-center min-w-[180px]">
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={val}
                        onChange={(e) =>
                          onSetChannel(chNum, parseInt(e.target.value, 10), rawUniverse)
                        }
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="255"
                        value={val}
                        onChange={(e) => {
                          const next = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                          onSetChannel(chNum, next, rawUniverse);
                        }}
                        className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-amber-400 text-right tabular-nums"
                      />
                      <button
                        onClick={() => onSetChannel(chNum, 0, rawUniverse)}
                        className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded"
                      >
                        0
                      </button>
                      <button
                        onClick={() => onSetChannel(chNum, 255, rawUniverse)}
                        className="px-2 py-1 text-[11px] font-mono bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 rounded"
                      >
                        255
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
