import React, { useState } from 'react';
import { Plus, Trash2, Sliders, Box, X, Wand2 } from 'lucide-react';
import type { CustomFixtureType, ChannelCapability, FixtureChannelDef } from '../types/lighting.ts';

interface FixtureTypeBuilderModalProps {
  fixtureTypes: CustomFixtureType[];
  onSaveFixtureType: (fixtureType: CustomFixtureType) => void;
  onDeleteFixtureType: (typeId: string) => void;
  onClose: () => void;
}

const CAPABILITIES: { value: ChannelCapability; label: string }[] = [
  { value: 'dimmer', label: 'Dimmer (Intensity)' },
  { value: 'pan', label: 'Pan (Coarse)' },
  { value: 'pan_fine', label: 'Pan Fine' },
  { value: 'tilt', label: 'Tilt (Coarse)' },
  { value: 'tilt_fine', label: 'Tilt Fine' },
  { value: 'red', label: 'Red Color' },
  { value: 'green', label: 'Green Color' },
  { value: 'blue', label: 'Blue Color' },
  { value: 'white', label: 'White Color' },
  { value: 'amber', label: 'Amber Color' },
  { value: 'uv', label: 'UV (Ultra-Violet)' },
  { value: 'shutter', label: 'Shutter / Strobe' },
  { value: 'gobo', label: 'Gobo Wheel' },
  { value: 'prism', label: 'Prism Effect' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'focus', label: 'Focus' },
  { value: 'speed', label: 'Motor / FX Speed' },
  { value: 'macro', label: 'Internal Macro' },
  { value: 'generic', label: 'Generic Parameter' },
];

export const FixtureTypeBuilderModal: React.FC<FixtureTypeBuilderModalProps> = ({
  fixtureTypes,
  onSaveFixtureType,
  onDeleteFixtureType,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');

  // Builder form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CustomFixtureType['category']>('moving_head');
  const [beamStyle, setBeamStyle] = useState<CustomFixtureType['beamStyle']>('spot');
  const [description, setDescription] = useState('');
  const [channels, setChannels] = useState<FixtureChannelDef[]>([
    { offset: 0, name: 'Dimmer', capability: 'dimmer', defaultValue: 255 },
    { offset: 1, name: 'Red', capability: 'red', defaultValue: 255 },
    { offset: 2, name: 'Green', capability: 'green', defaultValue: 255 },
    { offset: 3, name: 'Blue', capability: 'blue', defaultValue: 255 },
  ]);

  const handleAddChannel = () => {
    const newOffset = channels.length;
    setChannels([
      ...channels,
      {
        offset: newOffset,
        name: `Channel ${newOffset + 1}`,
        capability: 'generic',
        defaultValue: 0,
      },
    ]);
  };

  const handleRemoveChannel = (index: number) => {
    if (channels.length <= 1) return;
    const filtered = channels.filter((_, i) => i !== index);
    // Re-index offsets
    setChannels(filtered.map((ch, idx) => ({ ...ch, offset: idx })));
  };

  const handleChannelChange = (
    index: number,
    field: keyof FixtureChannelDef,
    val: string | number
  ) => {
    setChannels((prev) =>
      prev.map((ch, idx) => (idx === index ? { ...ch, [field]: val } : ch))
    );
  };

  // Quick Preset Templates
  const applyTemplate = (templateType: 'laser' | 'rgbwauv' | 'fog' | 'sunstrip') => {
    if (templateType === 'laser') {
      setName('Laser Array Bar 8-Ch');
      setCategory('laser');
      setBeamStyle('laser');
      setDescription('8-channel multi-beam aerial laser system with motor tilt');
      setChannels([
        { offset: 0, name: 'Master Dimmer', capability: 'dimmer', defaultValue: 255 },
        { offset: 1, name: 'Red Laser', capability: 'red', defaultValue: 255 },
        { offset: 2, name: 'Green Laser', capability: 'green', defaultValue: 255 },
        { offset: 3, name: 'Blue Laser', capability: 'blue', defaultValue: 255 },
        { offset: 4, name: 'Strobe Shutter', capability: 'shutter', defaultValue: 0 },
        { offset: 5, name: 'Pattern Gobo', capability: 'gobo', defaultValue: 10 },
        { offset: 6, name: 'Motor Tilt', capability: 'tilt', defaultValue: 128 },
        { offset: 7, name: 'Rotation Speed', capability: 'speed', defaultValue: 0 },
      ]);
    } else if (templateType === 'rgbwauv') {
      setName('RGBAW+UV Wash Par 6-Ch');
      setCategory('wash');
      setBeamStyle('wash');
      setDescription('6-channel deep wash fixture with Amber and UV emitters');
      setChannels([
        { offset: 0, name: 'Red', capability: 'red', defaultValue: 255 },
        { offset: 1, name: 'Green', capability: 'green', defaultValue: 255 },
        { offset: 2, name: 'Blue', capability: 'blue', defaultValue: 255 },
        { offset: 3, name: 'Amber', capability: 'amber', defaultValue: 128 },
        { offset: 4, name: 'White', capability: 'white', defaultValue: 0 },
        { offset: 5, name: 'UV Blacklight', capability: 'uv', defaultValue: 0 },
      ]);
    } else if (templateType === 'fog') {
      setName('Atmospheric Haze/Fog 2-Ch');
      setCategory('effect');
      setBeamStyle('point');
      setDescription('Stage fog / haze generator with fluid pump and fan speed');
      setChannels([
        { offset: 0, name: 'Haze Density / Pump', capability: 'dimmer', defaultValue: 128 },
        { offset: 1, name: 'Blower Fan Speed', capability: 'speed', defaultValue: 180 },
      ]);
    } else if (templateType === 'sunstrip') {
      setName('Sunstrip Halogen Bar 10-Ch');
      setCategory('blinder');
      setBeamStyle('wash');
      setDescription('10-lamp warm halogen blinder strip');
      setChannels(
        Array.from({ length: 10 }).map((_, i) => ({
          offset: i,
          name: `Lamp ${i + 1} Dimmer`,
          capability: 'dimmer',
          defaultValue: 0,
        }))
      );
    }
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newType: CustomFixtureType = {
      id: `type-${Date.now()}`,
      name: name.trim(),
      category,
      channelCount: channels.length,
      channels,
      beamStyle,
      isBuiltIn: false,
      description: description.trim() || `${channels.length}-channel custom fixture profile`,
    };

    onSaveFixtureType(newType);
    setActiveTab('list');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Box className="w-5 h-5 text-amber-400" />
              <span>Fixture Personality & Type Builder</span>
            </h2>
            <p className="text-xs text-slate-400">
              Create your own fixture types with custom DMX channel footprints and parameter mappings
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/70 px-5 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('create')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'create'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            + New Fixture Type
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'list'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            Profile Catalog ({fixtureTypes.length})
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'create' && (
            <form onSubmit={handleSaveSubmit} className="space-y-6">
              {/* Quick Template Presets */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  Quick Starter Templates
                </span>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => applyTemplate('laser')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-200"
                  >
                    Laser Array Bar (8 Ch)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('rgbwauv')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-200"
                  >
                    RGBAW+UV Wash (6 Ch)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('fog')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-200"
                  >
                    Fog/Haze Generator (2 Ch)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate('sunstrip')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-200"
                  >
                    Sunstrip Active (10 Ch)
                  </button>
                </div>
              </div>

              {/* Basic Profile Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Fixture Type Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Solar Spot 14-Ch"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CustomFixtureType['category'])}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="moving_head">Moving Head</option>
                    <option value="wash">Wash / LED Par</option>
                    <option value="strobe">Strobe</option>
                    <option value="laser">Laser System</option>
                    <option value="effect">Atmospheric Effect / Fog</option>
                    <option value="dimmer">Dimmer / Spot</option>
                    <option value="other">Other Multi-Channel</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Beam Visualizer Style
                  </label>
                  <select
                    value={beamStyle}
                    onChange={(e) => setBeamStyle(e.target.value as CustomFixtureType['beamStyle'])}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="spot">Spot Cone</option>
                    <option value="wash">Wide Wash</option>
                    <option value="strobe">Strobe Flash</option>
                    <option value="laser">Tight Laser Beam</option>
                    <option value="point">Point Glow</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description / Model Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. 14-channel profile with CMY mixing and dual prism"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
              </div>

              {/* Channel Map Designer */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>DMX Channel Footprint ({channels.length} Channels)</span>
                  </h3>

                  <button
                    type="button"
                    onClick={handleAddChannel}
                    className="flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Channel</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {channels.map((ch, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-3 items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs"
                    >
                      <div className="col-span-1 font-mono font-bold text-amber-400 text-center">
                        +{ch.offset + 1}
                      </div>

                      <div className="col-span-4">
                        <input
                          type="text"
                          required
                          value={ch.name}
                          onChange={(e) => handleChannelChange(idx, 'name', e.target.value)}
                          placeholder="Parameter Name"
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>

                      <div className="col-span-4">
                        <select
                          value={ch.capability}
                          onChange={(e) =>
                            handleChannelChange(
                              idx,
                              'capability',
                              e.target.value as ChannelCapability
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                        >
                          {CAPABILITIES.map((cap) => (
                            <option key={cap.value} value={cap.value}>
                              {cap.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          min="0"
                          max="255"
                          value={ch.defaultValue ?? 0}
                          onChange={(e) =>
                            handleChannelChange(
                              idx,
                              'defaultValue',
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono text-center"
                          title="Default Value"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveChannel(idx)}
                          disabled={channels.length <= 1}
                          className="text-slate-500 hover:text-rose-400 disabled:opacity-30 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-md shadow-amber-500/20"
                >
                  Save Fixture Personality
                </button>
              </div>
            </form>
          )}

          {activeTab === 'list' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">
                  Registered personalities available when patching fixtures into the DMX universe:
                </span>
                <button
                  onClick={() => setActiveTab('create')}
                  className="flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Build New Type</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fixtureTypes.map((type) => (
                  <div
                    key={type.id}
                    className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-white">{type.name}</span>
                        <span className="font-mono text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded">
                          {type.channelCount} Ch
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 mb-3">
                        {type.description || `${type.channelCount} DMX channels · ${type.category}`}
                      </p>

                      <div className="flex flex-wrap gap-1 mb-2">
                        {type.channels.map((ch, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono"
                          >
                            +{idx + 1}: {ch.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
                      <span className="text-[11px] text-slate-500 capitalize">
                        Style: {type.beamStyle || 'Spot'} · {type.category}
                      </span>
                      {!type.isBuiltIn && (
                        <button
                          onClick={() => onDeleteFixtureType(type.id)}
                          className="text-slate-500 hover:text-rose-400 flex items-center gap-1 text-[11px]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
