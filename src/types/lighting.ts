/**
 * Core type definitions for LumenNet Art-Net Lighting Console
 */

export type BuiltInFixtureType = 'moving_head' | 'rgbw_par' | 'strobe' | 'dimmer';
export type FixtureType = BuiltInFixtureType | string;

export type ChannelCapability =
  | 'dimmer'
  | 'pan'
  | 'pan_fine'
  | 'tilt'
  | 'tilt_fine'
  | 'red'
  | 'green'
  | 'blue'
  | 'white'
  | 'amber'
  | 'uv'
  | 'shutter'
  | 'gobo'
  | 'prism'
  | 'zoom'
  | 'focus'
  | 'speed'
  | 'macro'
  | 'generic';

export interface FixtureChannelDef {
  offset: number; // 0-indexed relative to start channel
  name: string;
  capability: ChannelCapability;
  defaultValue?: number;
}

export interface CustomFixtureType {
  id: string;
  name: string;
  category: 'moving_head' | 'wash' | 'strobe' | 'laser' | 'effect' | 'blinder' | 'dimmer' | 'other';
  channelCount: number;
  channels: FixtureChannelDef[];
  beamStyle?: 'spot' | 'wash' | 'strobe' | 'laser' | 'point';
  isBuiltIn?: boolean;
  description?: string;
}

export interface Fixture {
  id: string;
  name: string;
  type: FixtureType;
  typeId?: string; // Links to CustomFixtureType.id
  universe: number;
  startChannel: number; // 1-512
  channelCount: number;
  position: { x: number; y: number; z: number }; // 2D/3D visualizer coordinates (-100 to 100)
  tags: string[];
}

export interface Scene {
  id: string;
  name: string;
  colorSwatch: string;
  fadeTimeMs: number;
  channelValues: Record<number, number>; // 1-indexed DMX channel -> value 0-255 (Universe 0)
  universeChannelValues?: Record<number, Record<number, number>>; // Multi-universe: universe -> (1-512) -> value
  category?: string;
}

export interface Cue {
  id: string;
  cueNumber: number;
  name: string;
  sceneId: string;
  fadeInMs: number;
  holdTimeMs: number; // 0 = manual advance with GO
  description: string;
}

export interface UniverseConfig {
  id: string;
  universe: number; // Logical DMX universe index: 0, 1, 2, 3...
  name: string; // e.g. "Universe 0 - Front Truss", "Universe 1 - Back Wash"
  targetIp: string; // e.g. "192.168.1.101", "255.255.255.255", "127.0.0.1"
  targetPort: number; // default 6454
  subnet: number; // 0-15
  net: number; // 0-127
  artnetUniverse: number; // 0-15 Art-Net SubUni address
  enabled: boolean;
  packetCount: number;
  lastSentTime?: number;
  description?: string;
}

export interface ArtNetConfig {
  targetIp: string;
  targetPort: number;
  subnet: number;
  universe: number;
  net: number;
  enabled: boolean;
  fps: number;
  packetCount: number;
  lastSentTime?: number;
  universes: UniverseConfig[]; // Multi-universe Art-Net routing table!
}

export interface Cuelist {
  id: string;
  name: string;
  description?: string;
  cues: Cue[];
  activeCueIndex: number;
  isLooping?: boolean;
}

export interface ShowState {
  artnet: ArtNetConfig;
  grandMaster: number; // 0-255
  blackout: boolean;
  activeSceneId: string | null;
  activeCueIndex: number;
  cuePlaying: boolean;
  cueProgress: number; // 0 to 1
  dmxUniverse: number[]; // 512 channels, 0-255 (active universe)
  dmxUniverses?: Record<number, number[]>; // Multi-universe buffers: universe index -> 512 channels
  fixtures: Fixture[];
  fixtureTypes: CustomFixtureType[];
  scenes: Scene[];
  cuelist: Cue[];
  cuelists: Cuelist[]; // Multiple cue lists / stacks!
  activeCuelistId: string;
  sceneFaders: Record<string, number>; // sceneId -> fader level 0-255
  faderBlendMode: 'htp' | 'latest' | 'additive';
  baseLookMix: number; // 0-255 (0 = pure faders submasters, 255 = full base cue/programmer blend)
  clientCount: number;
}

export type WSClientMessage =
  | { type: 'set_channel'; channel: number; value: number; universe?: number }
  | { type: 'set_channels'; updates: Record<number, number>; universe?: number }
  | { type: 'set_grand_master'; value: number }
  | { type: 'toggle_blackout' }
  | { type: 'trigger_scene'; sceneId: string; fadeTimeMs?: number }
  | { type: 'set_scene_fader'; sceneId: string; value: number }
  | { type: 'set_scene_faders'; updates: Record<string, number> }
  | { type: 'flash_scene_fader'; sceneId: string; active: boolean }
  | { type: 'set_fader_blend_mode'; mode: 'htp' | 'latest' | 'additive' }
  | { type: 'set_base_look_mix'; value: number }
  | { type: 'clear_all_scene_faders' }
  | { type: 'save_scene'; scene: Scene }
  | { type: 'delete_scene'; sceneId: string }
  | { type: 'cue_go' }
  | { type: 'cue_pause' }
  | { type: 'cue_back' }
  | { type: 'cue_jump'; index: number }
  | { type: 'update_cuelist'; cuelist: Cue[] }
  | { type: 'select_cuelist'; cuelistId: string }
  | { type: 'create_cuelist'; name: string; description?: string }
  | { type: 'update_cuelist_meta'; cuelistId: string; name: string; isLooping?: boolean; description?: string }
  | { type: 'delete_cuelist'; cuelistId: string }
  | { type: 'save_cue'; cuelistId?: string; cue: Cue }
  | { type: 'delete_cue'; cuelistId?: string; cueId: string }
  | { type: 'duplicate_cue'; cuelistId?: string; cueId: string }
  | { type: 'reorder_cues'; cuelistId?: string; cueIds: string[] }
  | { type: 'update_fixtures'; fixtures: Fixture[] }
  | { type: 'save_fixture_type'; fixtureType: CustomFixtureType }
  | { type: 'delete_fixture_type'; typeId: string }
  | { type: 'configure_artnet'; config: Partial<ArtNetConfig> }
  | { type: 'save_universe_config'; universe: UniverseConfig }
  | { type: 'delete_universe_config'; universeId: string }
  | { type: 'send_universe_test_packet'; universeNumber: number }
  | { type: 'send_test_packet' }
  | { type: 'locate_fixtures'; fixtureIds: string[] };

export type WSServerMessage =
  | { type: 'init'; state: ShowState }
  | { type: 'dmx_update'; dmxUniverse: number[]; universe?: number; dmxUniverses?: Record<number, number[]> }
  | { type: 'show_state'; state: Partial<ShowState> }
  | { type: 'client_count'; count: number }
  | { type: 'artnet_stats'; packetCount: number; lastSentTime: number; universes?: UniverseConfig[] };

export interface AuthStatus {
  setupCompleted: boolean;
  pinEnabled: boolean;
  authenticated: boolean;
  consoleName: string;
}

