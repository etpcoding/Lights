import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import express, { Request, Response } from 'express';
import dgram from 'dgram';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  Fixture,
  CustomFixtureType,
  Scene,
  Cue,
  Cuelist,
  UniverseConfig,
  ArtNetConfig,
  ShowState,
  WSClientMessage,
  WSServerMessage,
  AuthStatus,
} from './src/types/lighting.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.lumennet-data');
const STATE_FILE = path.join(DATA_DIR, 'show-state.json');
const AUTH_FILE = path.join(DATA_DIR, 'console-auth.json');

// Initialize Art-Net UDP Socket
const udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
let udpBound = false;

udpSocket.on('error', (err) => {
  console.error('[Art-Net UDP Error]:', err.message);
});

udpSocket.bind(0, () => {
  try {
    udpSocket.setBroadcast(true);
    udpBound = true;
    console.log('[Art-Net] UDP socket bound and broadcast enabled.');
  } catch (err) {
    console.warn('[Art-Net] Broadcast mode warning:', (err as Error).message);
    udpBound = true;
  }
});

// Art-Net 4 OpDmx packet builder (0x5000)
function buildArtDmxPacket(
  universe: number,
  subnet: number,
  net: number,
  sequence: number,
  data: Uint8Array
): Buffer {
  const packet = Buffer.alloc(18 + 512);
  // Header: 'Art-Net\0'
  packet.write('Art-Net\0', 0, 8, 'ascii');
  // OpCode: 0x5000 (OpDmx), little-endian
  packet.writeUInt16LE(0x5000, 8);
  // Protocol Version 14 (0x000E), big-endian
  packet.writeUInt16BE(14, 10);
  // Sequence (0 = disabled or incrementing 1-255)
  packet.writeUInt8(sequence & 0xff, 12);
  // Physical port input (0x00)
  packet.writeUInt8(0, 13);
  // SubUni: (Subnet [4 bits] << 4) | (Universe [4 bits])
  const subUni = ((subnet & 0x0f) << 4) | (universe & 0x0f);
  packet.writeUInt8(subUni, 14);
  // Net: 7 bits
  packet.writeUInt8(net & 0x7f, 15);
  // Length: 512 channels, big-endian
  packet.writeUInt16BE(512, 16);
  // Payload (512 bytes)
  Buffer.from(data.buffer, data.byteOffset, 512).copy(packet, 18);
  return packet;
}

// -------------------------------------------------------------
// Fixture Personalities & Types Catalog
// -------------------------------------------------------------
const defaultFixtureTypes: CustomFixtureType[] = [
  {
    id: 'type-mh-10ch',
    name: 'Moving Head Standard 10Ch',
    category: 'moving_head',
    channelCount: 10,
    beamStyle: 'spot',
    isBuiltIn: true,
    description: '10-channel moving head with Pan/Tilt, Dimmer, Shutter, and RGBW color engine',
    channels: [
      { offset: 0, name: 'Pan Coarse', capability: 'pan', defaultValue: 128 },
      { offset: 1, name: 'Pan Fine', capability: 'pan_fine', defaultValue: 0 },
      { offset: 2, name: 'Tilt Coarse', capability: 'tilt', defaultValue: 128 },
      { offset: 3, name: 'Tilt Fine', capability: 'tilt_fine', defaultValue: 0 },
      { offset: 4, name: 'Master Dimmer', capability: 'dimmer', defaultValue: 255 },
      { offset: 5, name: 'Shutter / Strobe', capability: 'shutter', defaultValue: 0 },
      { offset: 6, name: 'Red', capability: 'red', defaultValue: 255 },
      { offset: 7, name: 'Green', capability: 'green', defaultValue: 255 },
      { offset: 8, name: 'Blue', capability: 'blue', defaultValue: 255 },
      { offset: 9, name: 'White', capability: 'white', defaultValue: 0 },
    ],
  },
  {
    id: 'type-par-5ch',
    name: 'RGBW Par 5Ch',
    category: 'wash',
    channelCount: 5,
    beamStyle: 'wash',
    isBuiltIn: true,
    description: '5-channel LED Par with Dimmer and RGBW mix',
    channels: [
      { offset: 0, name: 'Master Dimmer', capability: 'dimmer', defaultValue: 255 },
      { offset: 1, name: 'Red', capability: 'red', defaultValue: 255 },
      { offset: 2, name: 'Green', capability: 'green', defaultValue: 255 },
      { offset: 3, name: 'Blue', capability: 'blue', defaultValue: 255 },
      { offset: 4, name: 'White', capability: 'white', defaultValue: 0 },
    ],
  },
  {
    id: 'type-strobe-3ch',
    name: 'High-Power Strobe 3Ch',
    category: 'strobe',
    channelCount: 3,
    beamStyle: 'strobe',
    isBuiltIn: true,
    description: 'Atomic strobe with intensity, flash duration, and pulse rate',
    channels: [
      { offset: 0, name: 'Flash Dimmer', capability: 'dimmer', defaultValue: 0 },
      { offset: 1, name: 'Flash Duration', capability: 'speed', defaultValue: 128 },
      { offset: 2, name: 'Strobe Rate', capability: 'shutter', defaultValue: 0 },
    ],
  },
  {
    id: 'type-dimmer-1ch',
    name: 'Single Dimmer 1Ch',
    category: 'dimmer',
    channelCount: 1,
    beamStyle: 'point',
    isBuiltIn: true,
    description: 'Single channel conventional fixture or pinspot',
    channels: [
      { offset: 0, name: 'Intensity', capability: 'dimmer', defaultValue: 0 },
    ],
  },
  {
    id: 'type-laser-bar-8ch',
    name: 'Laser Array Bar 8Ch',
    category: 'laser',
    channelCount: 8,
    beamStyle: 'laser',
    isBuiltIn: false,
    description: 'Multi-beam RGB laser bar with motor tilt and geometric pattern macros',
    channels: [
      { offset: 0, name: 'Master Dimmer', capability: 'dimmer', defaultValue: 255 },
      { offset: 1, name: 'Red Laser', capability: 'red', defaultValue: 255 },
      { offset: 2, name: 'Green Laser', capability: 'green', defaultValue: 255 },
      { offset: 3, name: 'Blue Laser', capability: 'blue', defaultValue: 255 },
      { offset: 4, name: 'Strobe Effect', capability: 'shutter', defaultValue: 0 },
      { offset: 5, name: 'Pattern Gobo', capability: 'gobo', defaultValue: 10 },
      { offset: 6, name: 'Motor Tilt', capability: 'tilt', defaultValue: 128 },
      { offset: 7, name: 'Rotation Speed', capability: 'speed', defaultValue: 0 },
    ],
  },
  {
    id: 'type-rgbwauv-6ch',
    name: 'RGBAW+UV Par 6Ch',
    category: 'wash',
    channelCount: 6,
    beamStyle: 'wash',
    isBuiltIn: false,
    description: 'Deep-saturation wash with Amber and Ultra-Violet channels',
    channels: [
      { offset: 0, name: 'Red', capability: 'red', defaultValue: 255 },
      { offset: 1, name: 'Green', capability: 'green', defaultValue: 255 },
      { offset: 2, name: 'Blue', capability: 'blue', defaultValue: 255 },
      { offset: 3, name: 'Amber', capability: 'amber', defaultValue: 128 },
      { offset: 4, name: 'White', capability: 'white', defaultValue: 0 },
      { offset: 5, name: 'UV Ultra-Violet', capability: 'uv', defaultValue: 0 },
    ],
  },
  {
    id: 'type-fazer-2ch',
    name: 'Atmospheric Fazer 2Ch',
    category: 'effect',
    channelCount: 2,
    beamStyle: 'point',
    isBuiltIn: false,
    description: 'Touring stage haze generator with independent fluid pump and fan speed',
    channels: [
      { offset: 0, name: 'Haze Pump Volume', capability: 'dimmer', defaultValue: 120 },
      { offset: 1, name: 'Blower Fan Speed', capability: 'speed', defaultValue: 180 },
    ],
  },
];

// -------------------------------------------------------------
// Pre-seeded Fixtures Rig
// -------------------------------------------------------------
const defaultFixtures: Fixture[] = [
  // Universe 0: 4 Moving Heads (Front/Mid Truss) - 10 Ch: Pan, PanFine, Tilt, TiltFine, Dimmer, Shutter, R, G, B, W
  { id: 'mh-1', name: 'Spot 1 (Downstage L)', type: 'moving_head', universe: 0, startChannel: 1, channelCount: 10, position: { x: -60, y: 30, z: 80 }, tags: ['moving_head', 'front'] },
  { id: 'mh-2', name: 'Spot 2 (Center L)', type: 'moving_head', universe: 0, startChannel: 11, channelCount: 10, position: { x: -20, y: 30, z: 80 }, tags: ['moving_head', 'front'] },
  { id: 'mh-3', name: 'Spot 3 (Center R)', type: 'moving_head', universe: 0, startChannel: 21, channelCount: 10, position: { x: 20, y: 30, z: 80 }, tags: ['moving_head', 'front'] },
  { id: 'mh-4', name: 'Spot 4 (Downstage R)', type: 'moving_head', universe: 0, startChannel: 31, channelCount: 10, position: { x: 60, y: 30, z: 80 }, tags: ['moving_head', 'front'] },

  // Universe 0: 4 Stage Pin Spots / Dimmers - 1 Ch: Dimmer
  { id: 'dim-1', name: 'Front Key L', type: 'dimmer', universe: 0, startChannel: 77, channelCount: 1, position: { x: -50, y: 70, z: 70 }, tags: ['dimmer', 'key'] },
  { id: 'dim-2', name: 'Center Vocalist', type: 'dimmer', universe: 0, startChannel: 78, channelCount: 1, position: { x: 0, y: 70, z: 70 }, tags: ['dimmer', 'key'] },
  { id: 'dim-3', name: 'Front Key R', type: 'dimmer', universe: 0, startChannel: 79, channelCount: 1, position: { x: 50, y: 70, z: 70 }, tags: ['dimmer', 'key'] },
  { id: 'dim-4', name: 'Drum Fill Spot', type: 'dimmer', universe: 0, startChannel: 80, channelCount: 1, position: { x: 0, y: -70, z: 80 }, tags: ['dimmer', 'back'] },

  // Universe 1: 6 RGBW Pars (Upstage Back Truss) - 5 Ch: Dimmer, R, G, B, W
  { id: 'par-1', name: 'Wash 1 (Far L)', type: 'rgbw_par', universe: 1, startChannel: 1, channelCount: 5, position: { x: -75, y: -50, z: 90 }, tags: ['par', 'wash', 'back'] },
  { id: 'par-2', name: 'Wash 2 (Mid L)', type: 'rgbw_par', universe: 1, startChannel: 6, channelCount: 5, position: { x: -45, y: -50, z: 90 }, tags: ['par', 'wash', 'back'] },
  { id: 'par-3', name: 'Wash 3 (Inner L)', type: 'rgbw_par', universe: 1, startChannel: 11, channelCount: 5, position: { x: -15, y: -50, z: 90 }, tags: ['par', 'wash', 'back'] },
  { id: 'par-4', name: 'Wash 4 (Inner R)', type: 'rgbw_par', universe: 1, startChannel: 16, channelCount: 5, position: { x: 15, y: -50, z: 90 }, tags: ['par', 'wash', 'back'] },
  { id: 'par-5', name: 'Wash 5 (Mid R)', type: 'rgbw_par', universe: 1, startChannel: 21, channelCount: 5, position: { x: 45, y: -50, z: 90 }, tags: ['par', 'wash', 'back'] },
  { id: 'par-6', name: 'Wash 6 (Far R)', type: 'rgbw_par', universe: 1, startChannel: 26, channelCount: 5, position: { x: 75, y: -50, z: 90 }, tags: ['par', 'wash', 'back'] },

  // Universe 1: 2 Strobes (Back Stage Truss) - 3 Ch: Dimmer, Duration, Rate
  { id: 'str-1', name: 'Atomic Strobe L', type: 'strobe', universe: 1, startChannel: 31, channelCount: 3, position: { x: -35, y: -60, z: 65 }, tags: ['strobe', 'fx'] },
  { id: 'str-2', name: 'Atomic Strobe R', type: 'strobe', universe: 1, startChannel: 34, channelCount: 3, position: { x: 35, y: -60, z: 65 }, tags: ['strobe', 'fx'] },

  // Universe 2: Floor FX & Laser Package
  { id: 'laser-1', name: 'Stage Center Laser Bar', type: 'type-laser-bar-8ch', universe: 2, startChannel: 1, channelCount: 8, position: { x: 0, y: -30, z: 30 }, tags: ['laser', 'floor'] },
  { id: 'fazer-1', name: 'Touring Atmospheric Haze', type: 'type-fazer-2ch', universe: 2, startChannel: 9, channelCount: 2, position: { x: -40, y: -40, z: 20 }, tags: ['effect', 'haze'] },
];

// Helper to construct channel maps for Universe 0 (backwards compatible)
function createChannelsForLook(config: {
  mhPan: number;
  mhTilt: number;
  mhDimmer: number;
  mhColor: [number, number, number, number];
  parDimmer: number;
  parColors: [number, number, number, number][];
  strobeDimmer?: number;
  strobeRate?: number;
  dimmers?: number[];
}): Record<number, number> {
  const map: Record<number, number> = {};

  // 4 Moving heads
  for (let i = 0; i < 4; i++) {
    const start = 1 + i * 10;
    const panOffset = (i - 1.5) * 20;
    map[start] = Math.max(0, Math.min(255, Math.round(config.mhPan + panOffset)));
    map[start + 1] = 0;
    map[start + 2] = config.mhTilt;
    map[start + 3] = 0;
    map[start + 4] = config.mhDimmer;
    map[start + 5] = 0;
    map[start + 6] = config.mhColor[0];
    map[start + 7] = config.mhColor[1];
    map[start + 8] = config.mhColor[2];
    map[start + 9] = config.mhColor[3];
  }

  // 6 Pars (also mapped on Ch 41-70 for single universe compatibility)
  for (let i = 0; i < 6; i++) {
    const start = 41 + i * 5;
    const col = config.parColors[i % config.parColors.length];
    map[start] = config.parDimmer;
    map[start + 1] = col[0];
    map[start + 2] = col[1];
    map[start + 3] = col[2];
    map[start + 4] = col[3];
  }

  // Strobes
  map[71] = config.strobeDimmer ?? 0;
  map[72] = config.strobeDimmer ? 128 : 0;
  map[73] = config.strobeRate ?? 0;
  map[74] = config.strobeDimmer ?? 0;
  map[75] = config.strobeDimmer ? 128 : 0;
  map[76] = config.strobeRate ?? 0;

  // Dimmers
  const dims = config.dimmers ?? [180, 220, 180, 150];
  map[77] = dims[0];
  map[78] = dims[1];
  map[79] = dims[2];
  map[80] = dims[3];

  return map;
}

// Helper to construct multi-universe channel tables
function buildMultiUniverseChannels(config: {
  mhPan: number;
  mhTilt: number;
  mhDimmer: number;
  mhColor: [number, number, number, number];
  parDimmer: number;
  parColors: [number, number, number, number][];
  strobeDimmer?: number;
  strobeRate?: number;
  dimmers?: number[];
}): Record<number, Record<number, number>> {
  const u0: Record<number, number> = {};
  const u1: Record<number, number> = {};
  const u2: Record<number, number> = {};
  const u3: Record<number, number> = {};

  // Universe 0: 4 Moving Heads (Ch 1-40) & 4 Key Dimmers (Ch 77-80)
  for (let i = 0; i < 4; i++) {
    const start = 1 + i * 10;
    const panOffset = (i - 1.5) * 20;
    u0[start] = Math.max(0, Math.min(255, Math.round(config.mhPan + panOffset)));
    u0[start + 1] = 0;
    u0[start + 2] = config.mhTilt;
    u0[start + 3] = 0;
    u0[start + 4] = config.mhDimmer;
    u0[start + 5] = 0;
    u0[start + 6] = config.mhColor[0];
    u0[start + 7] = config.mhColor[1];
    u0[start + 8] = config.mhColor[2];
    u0[start + 9] = config.mhColor[3];
  }
  const dims = config.dimmers ?? [180, 220, 180, 150];
  u0[77] = dims[0];
  u0[78] = dims[1];
  u0[79] = dims[2];
  u0[80] = dims[3];

  // Universe 1: 6 Pars (Ch 1-30) & 2 Strobes (Ch 31-36)
  for (let i = 0; i < 6; i++) {
    const start = 1 + i * 5;
    const col = config.parColors[i % config.parColors.length];
    u1[start] = config.parDimmer;
    u1[start + 1] = col[0];
    u1[start + 2] = col[1];
    u1[start + 3] = col[2];
    u1[start + 4] = col[3];
  }
  u1[31] = config.strobeDimmer ?? 0;
  u1[32] = config.strobeDimmer ? 128 : 0;
  u1[33] = config.strobeRate ?? 0;
  u1[34] = config.strobeDimmer ?? 0;
  u1[35] = config.strobeDimmer ? 128 : 0;
  u1[36] = config.strobeRate ?? 0;

  // Universe 2: Laser Array (Ch 1-8) & Haze Fazer (Ch 9-10)
  u2[1] = Math.round(config.mhDimmer * 0.9);
  u2[2] = config.mhColor[0];
  u2[3] = config.mhColor[1];
  u2[4] = config.mhColor[2];
  u2[5] = config.strobeRate ?? 0;
  u2[6] = 20; // pattern
  u2[7] = 128; // tilt
  u2[8] = 0; // speed
  u2[9] = 100; // pump
  u2[10] = 160; // blower fan

  // Universe 3: Broadcast copy
  Object.assign(u3, u0);

  return { 0: u0, 1: u1, 2: u2, 3: u3 };
}

// -------------------------------------------------------------
// Pre-seeded Scenes (12 Production Looks)
// -------------------------------------------------------------
const defaultScenes: Scene[] = [
  {
    id: 'sc-1',
    name: 'Solar Flare',
    colorSwatch: '#f59e0b',
    fadeTimeMs: 1500,
    category: 'Chorus',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 160,
      mhDimmer: 255,
      mhColor: [255, 140, 0, 80],
      parDimmer: 240,
      parColors: [
        [255, 90, 0, 40],
        [255, 160, 0, 60],
        [255, 200, 10, 80],
        [255, 200, 10, 80],
        [255, 160, 0, 60],
        [255, 90, 0, 40],
      ],
      dimmers: [200, 255, 200, 180],
    }),
  },
  {
    id: 'sc-2',
    name: 'Cyber Neon',
    colorSwatch: '#06b6d4',
    fadeTimeMs: 1200,
    category: 'Verse',
    channelValues: createChannelsForLook({
      mhPan: 140,
      mhTilt: 190,
      mhDimmer: 255,
      mhColor: [0, 240, 255, 0],
      parDimmer: 220,
      parColors: [
        [180, 0, 255, 0],
        [0, 230, 255, 0],
        [180, 0, 255, 0],
        [0, 230, 255, 0],
        [180, 0, 255, 0],
        [0, 230, 255, 0],
      ],
      dimmers: [100, 180, 100, 120],
    }),
  },
  {
    id: 'sc-3',
    name: 'Arctic Aurora',
    colorSwatch: '#10b981',
    fadeTimeMs: 2000,
    category: 'Atmospheric',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 220,
      mhDimmer: 210,
      mhColor: [10, 240, 160, 40],
      parDimmer: 200,
      parColors: [
        [0, 180, 220, 30],
        [16, 185, 129, 40],
        [0, 220, 200, 50],
        [0, 220, 200, 50],
        [16, 185, 129, 40],
        [0, 180, 220, 30],
      ],
      dimmers: [140, 180, 140, 100],
    }),
  },
  {
    id: 'sc-4',
    name: 'Blood Moon',
    colorSwatch: '#ef4444',
    fadeTimeMs: 1800,
    category: 'Bridge',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 150,
      mhDimmer: 255,
      mhColor: [255, 10, 20, 0],
      parDimmer: 255,
      parColors: [
        [220, 0, 10, 0],
        [255, 30, 0, 0],
        [255, 0, 0, 0],
        [255, 0, 0, 0],
        [255, 30, 0, 0],
        [220, 0, 10, 0],
      ],
      dimmers: [60, 120, 60, 40],
    }),
  },
  {
    id: 'sc-5',
    name: 'Sunset Horizon',
    colorSwatch: '#ec4899',
    fadeTimeMs: 2500,
    category: 'Acoustic',
    channelValues: createChannelsForLook({
      mhPan: 120,
      mhTilt: 170,
      mhDimmer: 190,
      mhColor: [255, 70, 140, 40],
      parDimmer: 210,
      parColors: [
        [255, 100, 50, 60],
        [240, 50, 140, 20],
        [180, 40, 220, 0],
        [180, 40, 220, 0],
        [240, 50, 140, 20],
        [255, 100, 50, 60],
      ],
      dimmers: [180, 220, 180, 150],
    }),
  },
  {
    id: 'sc-6',
    name: 'Acid Strobe',
    colorSwatch: '#84cc16',
    fadeTimeMs: 400,
    category: 'Drop',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 190,
      mhDimmer: 255,
      mhColor: [160, 255, 0, 0],
      parDimmer: 255,
      parColors: [
        [190, 255, 0, 0],
        [255, 230, 0, 0],
        [190, 255, 0, 0],
        [255, 230, 0, 0],
        [190, 255, 0, 0],
        [255, 230, 0, 0],
      ],
      strobeDimmer: 255,
      strobeRate: 190,
      dimmers: [0, 0, 0, 0],
    }),
  },
  {
    id: 'sc-7',
    name: 'Monochrome Drama',
    colorSwatch: '#f8fafc',
    fadeTimeMs: 1500,
    category: 'Solo',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 200,
      mhDimmer: 255,
      mhColor: [255, 255, 255, 255],
      parDimmer: 0,
      parColors: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      dimmers: [0, 255, 0, 0],
    }),
  },
  {
    id: 'sc-8',
    name: 'Electric Blue',
    colorSwatch: '#3b82f6',
    fadeTimeMs: 1200,
    category: 'Main',
    channelValues: createChannelsForLook({
      mhPan: 135,
      mhTilt: 165,
      mhDimmer: 240,
      mhColor: [0, 90, 255, 20],
      parDimmer: 230,
      parColors: [
        [0, 60, 255, 0],
        [0, 140, 255, 20],
        [0, 60, 255, 0],
        [0, 140, 255, 20],
        [0, 60, 255, 0],
        [0, 140, 255, 20],
      ],
      dimmers: [150, 200, 150, 120],
    }),
  },
  {
    id: 'sc-9',
    name: 'Warm Tungsten 3200K',
    colorSwatch: '#d97706',
    fadeTimeMs: 2000,
    category: 'Acoustic',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 180,
      mhDimmer: 160,
      mhColor: [255, 147, 41, 180],
      parDimmer: 160,
      parColors: [
        [255, 147, 41, 150],
        [255, 147, 41, 150],
        [255, 147, 41, 150],
        [255, 147, 41, 150],
        [255, 147, 41, 150],
        [255, 147, 41, 150],
      ],
      dimmers: [220, 255, 220, 200],
    }),
  },
  {
    id: 'sc-10',
    name: 'Festival Blast',
    colorSwatch: '#a855f7',
    fadeTimeMs: 600,
    category: 'Climax',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 230,
      mhDimmer: 255,
      mhColor: [230, 0, 255, 50],
      parDimmer: 255,
      parColors: [
        [255, 200, 0, 0],
        [200, 0, 255, 0],
        [0, 230, 255, 0],
        [255, 200, 0, 0],
        [200, 0, 255, 0],
        [0, 230, 255, 0],
      ],
      strobeDimmer: 200,
      strobeRate: 140,
      dimmers: [100, 180, 100, 100],
    }),
  },
  {
    id: 'sc-11',
    name: 'Walk-In Pre-Show',
    colorSwatch: '#ca8a04',
    fadeTimeMs: 3000,
    category: 'House',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 130,
      mhDimmer: 80,
      mhColor: [255, 160, 60, 120],
      parDimmer: 90,
      parColors: [
        [255, 140, 50, 100],
        [255, 140, 50, 100],
        [255, 140, 50, 100],
        [255, 140, 50, 100],
        [255, 140, 50, 100],
        [255, 140, 50, 100],
      ],
      dimmers: [120, 140, 120, 100],
    }),
  },
  {
    id: 'sc-12',
    name: 'Full Blind Whiteout',
    colorSwatch: '#ffffff',
    fadeTimeMs: 200,
    category: 'Climax',
    channelValues: createChannelsForLook({
      mhPan: 128,
      mhTilt: 180,
      mhDimmer: 255,
      mhColor: [255, 255, 255, 255],
      parDimmer: 255,
      parColors: [
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
      ],
      strobeDimmer: 255,
      strobeRate: 230,
      dimmers: [255, 255, 255, 255],
    }),
  },
];

// -------------------------------------------------------------
// Pre-seeded Cue Lists & Multiple Cue Stacks
// -------------------------------------------------------------
const defaultCuelist: Cue[] = [
  { id: 'cue-1', cueNumber: 1.0, name: 'House Walk-In', sceneId: 'sc-11', fadeInMs: 3000, holdTimeMs: 0, description: 'Audience entrance warm look' },
  { id: 'cue-2', cueNumber: 2.0, name: 'Intro Dark Suspense', sceneId: 'sc-7', fadeInMs: 1500, holdTimeMs: 4000, description: 'Single center spotlight' },
  { id: 'cue-3', cueNumber: 3.0, name: 'Verse 1 - Arctic Aurora', sceneId: 'sc-3', fadeInMs: 2000, holdTimeMs: 0, description: 'Band intro cool teal sweep' },
  { id: 'cue-4', cueNumber: 4.0, name: 'Chorus 1 - Cyber Neon', sceneId: 'sc-2', fadeInMs: 1000, holdTimeMs: 0, description: 'Cyan & Magenta beam cross' },
  { id: 'cue-5', cueNumber: 5.0, name: 'Verse 2 - Electric Blue', sceneId: 'sc-8', fadeInMs: 1500, holdTimeMs: 0, description: 'Calm ocean wash' },
  { id: 'cue-6', cueNumber: 6.0, name: 'Bridge - Blood Moon', sceneId: 'sc-4', fadeInMs: 2500, holdTimeMs: 0, description: 'Dramatic deep crimson' },
  { id: 'cue-7', cueNumber: 7.0, name: 'Guitar Solo - Solar Flare', sceneId: 'sc-1', fadeInMs: 1200, holdTimeMs: 0, description: 'Blazing golden moving heads' },
  { id: 'cue-8', cueNumber: 8.0, name: 'Climax Drop - Acid Strobe', sceneId: 'sc-6', fadeInMs: 400, holdTimeMs: 6000, description: 'High-speed lime strobes' },
  { id: 'cue-9', cueNumber: 9.0, name: 'Festival Finale', sceneId: 'sc-10', fadeInMs: 800, holdTimeMs: 0, description: 'All fixtures full spectrum sweep' },
  { id: 'cue-10', cueNumber: 10.0, name: 'Outro - Sunset Fade', sceneId: 'sc-5', fadeInMs: 4000, holdTimeMs: 0, description: 'Gentle warm exit look' },
];

const defaultCuelists: Cuelist[] = [
  {
    id: 'cuelist-main',
    name: 'Main Festival Setlist',
    description: 'Primary 10-cue live concert stack with walk-in, verses, drops, and outro',
    activeCueIndex: 0,
    isLooping: false,
    cues: [...defaultCuelist],
  },
  {
    id: 'cuelist-acoustic',
    name: 'Acoustic / Intimate Set',
    description: 'Warm tungsten, subtle amber glows, and gentle slow fades',
    activeCueIndex: 0,
    isLooping: false,
    cues: [
      { id: 'cue-ac-1', cueNumber: 1.0, name: 'Warm Intro 3200K', sceneId: 'sc-9', fadeInMs: 2500, holdTimeMs: 0, description: 'Low warm tungsten stage fill' },
      { id: 'cue-ac-2', cueNumber: 2.0, name: 'Lead Vocal Solo', sceneId: 'sc-7', fadeInMs: 1500, holdTimeMs: 0, description: 'Center pin spot only' },
      { id: 'cue-ac-3', cueNumber: 3.0, name: 'Sunset Warmth Sweep', sceneId: 'sc-5', fadeInMs: 3000, holdTimeMs: 0, description: 'Golden hour amber wash' },
      { id: 'cue-ac-4', cueNumber: 4.0, name: 'Gentle Blue Mood', sceneId: 'sc-8', fadeInMs: 2000, holdTimeMs: 0, description: 'Soft deep blue backlight' },
    ],
  },
  {
    id: 'cuelist-b-roll',
    name: 'House & Preshow Stacks',
    description: 'Walk-in, intermissions, and emergency house lights',
    activeCueIndex: 0,
    isLooping: true,
    cues: [
      { id: 'cue-br-1', cueNumber: 1.0, name: 'Doors Open / Walk-In', sceneId: 'sc-11', fadeInMs: 4000, holdTimeMs: 15000, description: 'Inviting pre-show ambient' },
      { id: 'cue-br-2', cueNumber: 2.0, name: 'Teaser Blackout', sceneId: 'sc-7', fadeInMs: 1000, holdTimeMs: 5000, description: 'Lights down for show warning' },
      { id: 'cue-br-3', cueNumber: 3.0, name: 'Full House White', sceneId: 'sc-12', fadeInMs: 500, holdTimeMs: 0, description: 'Emergency / Exit bright' },
    ],
  },
];

// Ensure all scenes have universeChannelValues populated
for (const sc of defaultScenes) {
  if (!sc.universeChannelValues) {
    const u0: Record<number, number> = {};
    const u1: Record<number, number> = {};
    const u2: Record<number, number> = {};
    const u3: Record<number, number> = {};

    for (let ch = 1; ch <= 40; ch++) {
      if (sc.channelValues[ch] !== undefined) u0[ch] = sc.channelValues[ch];
    }
    for (let ch = 77; ch <= 80; ch++) {
      if (sc.channelValues[ch] !== undefined) u0[ch] = sc.channelValues[ch];
    }

    for (let i = 0; i < 30; i++) {
      const srcCh = 41 + i;
      const targetCh = 1 + i;
      if (sc.channelValues[srcCh] !== undefined) u1[targetCh] = sc.channelValues[srcCh];
    }
    for (let i = 0; i < 6; i++) {
      const srcCh = 71 + i;
      const targetCh = 31 + i;
      if (sc.channelValues[srcCh] !== undefined) u1[targetCh] = sc.channelValues[srcCh];
    }

    u2[1] = u0[5] ?? 200;
    u2[2] = u0[7] ?? 255;
    u2[3] = u0[8] ?? 200;
    u2[4] = u0[9] ?? 50;
    u2[5] = u1[33] ?? 0;
    u2[6] = 20;
    u2[7] = 128;
    u2[8] = 0;
    u2[9] = 110;
    u2[10] = 170;

    Object.assign(u3, sc.channelValues);
    sc.universeChannelValues = { 0: u0, 1: u1, 2: u2, 3: u3 };
  }
}

// -------------------------------------------------------------
// Multi-Universe Art-Net Routing Table & Node Destinations
// -------------------------------------------------------------
const defaultUniverses: UniverseConfig[] = [
  {
    id: 'uni-0',
    universe: 0,
    name: 'Universe 0 - Front Truss & Spots',
    targetIp: '192.168.1.100',
    targetPort: 6454,
    subnet: 0,
    net: 0,
    artnetUniverse: 0,
    enabled: true,
    packetCount: 0,
    description: 'FOH Moving heads, downstage spots, and main key dimmers',
  },
  {
    id: 'uni-1',
    universe: 1,
    name: 'Universe 1 - Back Truss & Wash',
    targetIp: '192.168.1.101',
    targetPort: 6454,
    subnet: 0,
    net: 0,
    artnetUniverse: 1,
    enabled: true,
    packetCount: 0,
    description: 'Upstage RGBW wash pars and atomic strobes node',
  },
  {
    id: 'uni-2',
    universe: 2,
    name: 'Universe 2 - Floor FX & Lasers',
    targetIp: '192.168.1.102',
    targetPort: 6454,
    subnet: 0,
    net: 0,
    artnetUniverse: 2,
    enabled: true,
    packetCount: 0,
    description: 'Stage floor package, laser arrays, and atmospheric fazers',
  },
  {
    id: 'uni-3',
    universe: 3,
    name: 'Universe 3 - Broadcast / Visualizer',
    targetIp: '255.255.255.255',
    targetPort: 6454,
    subnet: 0,
    net: 0,
    artnetUniverse: 3,
    enabled: true,
    packetCount: 0,
    description: 'Subnet broadcast for 3D visualizers and media servers',
  },
];

const MAX_UNIVERSES = 8;
const authoritativeUniverses: Float32Array[] = [];
const targetUniverses: Float32Array[] = [];
const initialUniverses: Float32Array[] = [];

for (let u = 0; u < MAX_UNIVERSES; u++) {
  authoritativeUniverses.push(new Float32Array(512));
  targetUniverses.push(new Float32Array(512));
  initialUniverses.push(new Float32Array(512));
}

// Initial scene channels across universes
const initialScene = defaultScenes[10];
for (let u = 0; u < MAX_UNIVERSES; u++) {
  const uVals = initialScene.universeChannelValues?.[u] || (u === 0 ? initialScene.channelValues : {});
  for (let ch = 1; ch <= 512; ch++) {
    const val = uVals[ch] ?? (u === 0 ? (initialScene.channelValues[ch] ?? 0) : 0);
    authoritativeUniverses[u][ch - 1] = val;
    targetUniverses[u][ch - 1] = val;
    initialUniverses[u][ch - 1] = val;
  }
}

let grandMaster = 255;
let blackout = false;
let activeSceneId: string | null = initialScene.id;
let activeCueIndex = 0;
let cuePlaying = false;
let cueProgress = 0;
let crossfadeStartTime = 0;
let crossfadeDuration = 0;
let autoFollowTimeout: NodeJS.Timeout | null = null;

const artnetConfig: ArtNetConfig = {
  targetIp: '255.255.255.255',
  targetPort: 6454,
  subnet: 0,
  universe: 0,
  net: 0,
  enabled: true,
  fps: 40,
  packetCount: 0,
  lastSentTime: Date.now(),
  universes: [...defaultUniverses],
};

let fixtures = [...defaultFixtures];
let fixtureTypes = [...defaultFixtureTypes];
let scenes = [...defaultScenes];
let cuelists: Cuelist[] = [...defaultCuelists];
let activeCuelistId = 'cuelist-main';
let cuelist = [...cuelists[0].cues];

// Scene Faders State (Mix & Match)
let sceneFaders: Record<string, number> = {};
let flashedSceneFaders: Record<string, boolean> = {};
let faderBlendMode: 'htp' | 'latest' | 'additive' = 'htp';
let baseLookMix = 0;
let artnetSequence = 0;

// Optional persistent state loading/saving for Docker deployments
let persistTimer: NodeJS.Timeout | null = null;
function schedulePersistState() {
  if (!STATE_FILE) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      const payload = {
        fixtures,
        fixtureTypes,
        scenes,
        cuelists,
        activeCuelistId,
        activeCueIndex,
        activeSceneId,
        grandMaster,
        sceneFaders,
        faderBlendMode,
        baseLookMix,
        universes: artnetConfig.universes.map((u) => ({ ...u, packetCount: 0 })),
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[Persistence] Failed to save show state:', (err as Error).message);
    }
  }, 500);
}

function loadPersistedState() {
  if (!STATE_FILE || !fs.existsSync(STATE_FILE)) return;
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.fixtures)) fixtures = saved.fixtures;
    if (Array.isArray(saved.fixtureTypes)) fixtureTypes = saved.fixtureTypes;
    if (Array.isArray(saved.scenes)) scenes = saved.scenes;
    if (Array.isArray(saved.cuelists) && saved.cuelists.length > 0) cuelists = saved.cuelists;
    if (typeof saved.activeCuelistId === 'string') activeCuelistId = saved.activeCuelistId;
    if (typeof saved.activeCueIndex === 'number') activeCueIndex = saved.activeCueIndex;
    if (typeof saved.activeSceneId === 'string') activeSceneId = saved.activeSceneId;
    if (typeof saved.grandMaster === 'number') grandMaster = saved.grandMaster;
    if (saved.sceneFaders && typeof saved.sceneFaders === 'object') sceneFaders = saved.sceneFaders;
    if (saved.faderBlendMode) faderBlendMode = saved.faderBlendMode;
    if (typeof saved.baseLookMix === 'number') baseLookMix = saved.baseLookMix;
    if (Array.isArray(saved.universes) && saved.universes.length > 0) {
      artnetConfig.universes = saved.universes;
    }
    const activeCl = cuelists.find((c) => c.id === activeCuelistId) || cuelists[0];
    if (activeCl) cuelist = activeCl.cues;
    console.log(`[Persistence] Loaded saved show state from ${STATE_FILE}`);
  } catch (err) {
    console.warn('[Persistence] Could not load saved state:', (err as Error).message);
  }
}
loadPersistedState();

// -------------------------------------------------------------
// First-Launch Setup & PIN Authentication State
// -------------------------------------------------------------
interface ConsoleAuthRecord {
  setupCompleted: boolean;
  consoleName: string;
  pinEnabled: boolean;
  pinHash: string;
  pinSalt: string;
  sessionSecret: string;
  tokenEpoch: number;
}

const SESSION_COOKIE = 'lumennet_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let failedPinAttempts = 0;
let pinLockoutUntil = 0;

function loadConsoleAuth(): ConsoleAuthRecord {
  const fallback: ConsoleAuthRecord = {
    setupCompleted: false,
    consoleName: 'LumenNet Console',
    pinEnabled: false,
    pinHash: '',
    pinSalt: '',
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    tokenEpoch: 1,
  };

  try {
    if (fs.existsSync(AUTH_FILE)) {
      const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        setupCompleted: Boolean(parsed.setupCompleted),
        consoleName: typeof parsed.consoleName === 'string' && parsed.consoleName.trim()
          ? parsed.consoleName.trim()
          : 'LumenNet Console',
        pinEnabled: Boolean(parsed.pinEnabled),
        pinHash: typeof parsed.pinHash === 'string' ? parsed.pinHash : '',
        pinSalt: typeof parsed.pinSalt === 'string' ? parsed.pinSalt : '',
        sessionSecret:
          typeof parsed.sessionSecret === 'string' && parsed.sessionSecret
            ? parsed.sessionSecret
            : fallback.sessionSecret,
        tokenEpoch: typeof parsed.tokenEpoch === 'number' ? parsed.tokenEpoch : 1,
      };
    }
  } catch (err) {
    console.warn('[Auth] Could not load auth config:', (err as Error).message);
  }
  return fallback;
}

let consoleAuth: ConsoleAuthRecord = loadConsoleAuth();

function saveConsoleAuth() {
  try {
    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(consoleAuth, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Auth] Failed to save auth config:', (err as Error).message);
  }
}

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}

function verifyPin(pin: string): boolean {
  if (!consoleAuth.pinHash || !consoleAuth.pinSalt) return false;
  const candidate = Buffer.from(hashPin(pin, consoleAuth.pinSalt), 'hex');
  const stored = Buffer.from(consoleAuth.pinHash, 'hex');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

function createSessionToken(): string {
  const payload = `${Date.now()}.${consoleAuth.tokenEpoch}.${crypto.randomBytes(12).toString('hex')}`;
  const sig = crypto
    .createHmac('sha256', consoleAuth.sessionSecret)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [tsStr, epochStr, nonce, sig] = parts;
  const ts = parseInt(tsStr, 10);
  const epoch = parseInt(epochStr, 10);
  if (!Number.isFinite(ts) || !Number.isFinite(epoch) || !nonce || !sig) return false;
  if (epoch !== consoleAuth.tokenEpoch) return false;
  if (Date.now() - ts > SESSION_TTL_MS) return false;

  const expectedSig = crypto
    .createHmac('sha256', consoleAuth.sessionSecret)
    .update(`${tsStr}.${epochStr}.${nonce}`)
    .digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const key = part.slice(0, eqIdx).trim();
      const val = decodeURIComponent(part.slice(eqIdx + 1).trim());
      cookies[key] = val;
    }
  }
  return cookies;
}

function extractTokenFromIncoming(
  authHeader: string | undefined,
  cookieHeader: string | undefined,
  queryToken?: string | null
): string | undefined {
  if (queryToken) return queryToken;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE];
}

function isTokenAuthorized(token: string | undefined): boolean {
  if (!consoleAuth.setupCompleted) return false;
  if (!consoleAuth.pinEnabled) return true;
  return verifyToken(token);
}

function isRequestAuthenticated(req: Request): boolean {
  const token = extractTokenFromIncoming(req.headers.authorization, req.headers.cookie);
  return isTokenAuthorized(token);
}

function getAuthStatus(req: Request): AuthStatus {
  return {
    setupCompleted: consoleAuth.setupCompleted,
    pinEnabled: consoleAuth.pinEnabled,
    authenticated: isRequestAuthenticated(req),
    consoleName: consoleAuth.consoleName,
  };
}

function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function getActiveCuelist(): Cuelist {
  return cuelists.find((cl) => cl.id === activeCuelistId) || cuelists[0];
}

// Check if a channel in a specific universe is a dimmer or intensity channel
function isDimmerOrIntensityChannel(chNumber: number, uni: number = 0): boolean {
  for (const fix of fixtures) {
    if ((fix.universe ?? 0) === uni && chNumber >= fix.startChannel && chNumber < fix.startChannel + fix.channelCount) {
      const offset = chNumber - fix.startChannel;
      if (fix.type === 'moving_head' && offset === 4) return true;
      if (fix.type === 'rgbw_par' && offset === 0) return true;
      if (fix.type === 'strobe' && offset === 0) return true;
      if (fix.type === 'dimmer' && offset === 0) return true;

      const customType = fixtureTypes.find(
        (t) => t.id === fix.typeId || t.id === fix.type || t.name === fix.type
      );
      if (customType) {
        const chDef = customType.channels.find((c) => c.offset === offset);
        if (chDef && chDef.capability === 'dimmer') return true;
      }
    }
  }
  return false;
}

// Check if a channel in a specific universe is a color channel
function isColorChannel(chNumber: number, uni: number = 0): boolean {
  for (const fix of fixtures) {
    if ((fix.universe ?? 0) === uni && chNumber >= fix.startChannel && chNumber < fix.startChannel + fix.channelCount) {
      const offset = chNumber - fix.startChannel;
      if (fix.type === 'moving_head' && offset >= 6 && offset <= 9) return true;
      if (fix.type === 'rgbw_par' && offset >= 1 && offset <= 4) return true;

      const customType = fixtureTypes.find(
        (t) => t.id === fix.typeId || t.id === fix.type || t.name === fix.type
      );
      if (customType) {
        const chDef = customType.channels.find((c) => c.offset === offset);
        if (chDef && ['red', 'green', 'blue', 'white', 'amber', 'uv'].includes(chDef.capability)) {
          return true;
        }
      }
    }
  }
  return false;
}

// Compute the current physical 512 DMX output buffer for any universe
function computeOutputDmx(uniIndex: number = 0): Uint8Array {
  const out = new Uint8Array(512);
  const gmFactor = grandMaster / 255;
  const authUni = authoritativeUniverses[uniIndex] || authoritativeUniverses[0];

  const activeFaders: { scene: Scene; factor: number }[] = [];
  for (const scene of scenes) {
    const isFlashed = flashedSceneFaders[scene.id];
    const rawFader = isFlashed ? 255 : (sceneFaders[scene.id] ?? 0);
    if (rawFader > 0) {
      activeFaders.push({ scene, factor: rawFader / 255 });
    }
  }

  for (let i = 0; i < 512; i++) {
    const chNum = i + 1;
    let finalVal = 0;

    if (activeFaders.length === 0) {
      finalVal = authUni[i];
    } else {
      const baseContribution = authUni[i] * (baseLookMix / 255);

      if (faderBlendMode === 'htp') {
        let maxVal = baseContribution;
        for (const { scene, factor } of activeFaders) {
          const scVal = scene.universeChannelValues?.[uniIndex]?.[chNum] ?? (uniIndex === 0 ? scene.channelValues[chNum] : undefined);
          if (scVal !== undefined) {
            const scaled = scVal * factor;
            if (scaled > maxVal) maxVal = scaled;
          }
        }
        finalVal = maxVal;
      } else if (faderBlendMode === 'additive') {
        if (isColorChannel(chNum, uniIndex) || isDimmerOrIntensityChannel(chNum, uniIndex)) {
          let sum = baseContribution;
          for (const { scene, factor } of activeFaders) {
            const scVal = scene.universeChannelValues?.[uniIndex]?.[chNum] ?? (uniIndex === 0 ? scene.channelValues[chNum] : undefined);
            if (scVal !== undefined) {
              sum += scVal * factor;
            }
          }
          finalVal = Math.min(255, sum);
        } else {
          let weightedSum = baseContribution;
          let totalWeight = baseLookMix / 255;
          for (const { scene, factor } of activeFaders) {
            const scVal = scene.universeChannelValues?.[uniIndex]?.[chNum] ?? (uniIndex === 0 ? scene.channelValues[chNum] : undefined);
            if (scVal !== undefined) {
              weightedSum += scVal * factor;
              totalWeight += factor;
            }
          }
          finalVal = totalWeight > 0 ? weightedSum / totalWeight : baseContribution;
        }
      } else {
        let weightedSum = baseContribution;
        let totalWeight = baseLookMix / 255;
        for (const { scene, factor } of activeFaders) {
          const scVal = scene.universeChannelValues?.[uniIndex]?.[chNum] ?? (uniIndex === 0 ? scene.channelValues[chNum] : undefined);
          if (scVal !== undefined) {
            weightedSum += scVal * factor;
            totalWeight += factor;
          }
        }
        finalVal = totalWeight > 0 ? weightedSum / totalWeight : baseContribution;
      }
    }

    if (blackout) {
      if (isDimmerOrIntensityChannel(chNum, uniIndex)) {
        finalVal = 0;
      }
    } else {
      if (isDimmerOrIntensityChannel(chNum, uniIndex)) {
        finalVal = Math.round(finalVal * gmFactor);
      }
    }

    out[i] = Math.max(0, Math.min(255, Math.round(finalVal)));
  }
  return out;
}

// -------------------------------------------------------------
// WebSocket Server & Broadcast
// -------------------------------------------------------------
const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      const token = extractTokenFromIncoming(
        request.headers.authorization,
        request.headers.cookie,
        url.searchParams.get('token')
      );
      if (!isTokenAuthorized(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch (err) {
    console.error('[WebSocket Upgrade Error]:', err);
  }
});

function getFullShowState(): ShowState {
  const dmxArray = Array.from(computeOutputDmx(0));
  const activeList = getActiveCuelist();
  const dmxUniverses: Record<number, number[]> = {};
  for (const uni of artnetConfig.universes) {
    dmxUniverses[uni.universe] = Array.from(computeOutputDmx(uni.universe));
  }

  return {
    artnet: { ...artnetConfig },
    grandMaster,
    blackout,
    activeSceneId,
    activeCueIndex: activeList ? activeList.activeCueIndex : activeCueIndex,
    cuePlaying,
    cueProgress,
    dmxUniverse: dmxArray,
    dmxUniverses,
    fixtures,
    fixtureTypes,
    scenes,
    cuelist: activeList ? activeList.cues : cuelist,
    cuelists,
    activeCuelistId,
    sceneFaders: { ...sceneFaders },
    faderBlendMode,
    baseLookMix,
    clientCount: wss.clients.size,
  };
}

function broadcast(msg: WSServerMessage) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Start crossfade to a specific scene across all universes
function startTransitionToScene(sceneId: string, durationMs: number) {
  const found = scenes.find((s) => s.id === sceneId);
  if (!found) return;

  activeSceneId = sceneId;
  crossfadeDuration = durationMs;
  crossfadeStartTime = Date.now();

  for (let u = 0; u < MAX_UNIVERSES; u++) {
    const auth = authoritativeUniverses[u];
    const init = initialUniverses[u];
    const targ = targetUniverses[u];
    const uMap = found.universeChannelValues?.[u] || (u === 0 ? found.channelValues : {});

    for (let i = 0; i < 512; i++) {
      init[i] = auth[i];
      const target = uMap[i + 1] ?? (u === 0 ? (found.channelValues[i + 1] ?? 0) : 0);
      targ[i] = target;
    }

    if (durationMs <= 20) {
      for (let i = 0; i < 512; i++) {
        auth[i] = targ[i];
      }
    }
  }

  if (durationMs <= 20) {
    cueProgress = 1.0;
    cuePlaying = false;
  } else {
    cuePlaying = true;
    cueProgress = 0.0;
  }

  broadcast({
    type: 'show_state',
    state: {
      activeSceneId,
      cuePlaying,
      cueProgress,
    },
  });
}

function executeCue(index: number) {
  const currentList = getActiveCuelist();
  if (!currentList || !currentList.cues || currentList.cues.length === 0) return;

  if (index < 0) index = 0;
  if (index >= currentList.cues.length) {
    if (currentList.isLooping) {
      index = 0;
    } else {
      return;
    }
  }

  currentList.activeCueIndex = index;
  activeCueIndex = index;
  const cue = currentList.cues[index];
  startTransitionToScene(cue.sceneId, cue.fadeInMs);

  if (autoFollowTimeout) {
    clearTimeout(autoFollowTimeout);
    autoFollowTimeout = null;
  }

  if (cue.holdTimeMs > 0) {
    const hasNext = index + 1 < currentList.cues.length || currentList.isLooping;
    if (hasNext) {
      autoFollowTimeout = setTimeout(() => {
        executeCue(index + 1);
      }, cue.fadeInMs + cue.holdTimeMs);
    }
  }

  broadcast({
    type: 'show_state',
    state: {
      activeCueIndex,
      cuelists,
      cuelist: currentList.cues,
    },
  });
}

// -------------------------------------------------------------
// Real-Time Frame Engine (40 Hz = 25ms tick)
// -------------------------------------------------------------
let lastBroadcastTime = 0;
let channelChanged = true;

setInterval(() => {
  const now = Date.now();

  // If cue is transitioning, interpolate channels across all universes
  if (cuePlaying && crossfadeDuration > 0) {
    const elapsed = now - crossfadeStartTime;
    const progress = Math.min(1.0, elapsed / crossfadeDuration);
    cueProgress = progress;

    const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    for (let u = 0; u < MAX_UNIVERSES; u++) {
      const auth = authoritativeUniverses[u];
      const init = initialUniverses[u];
      const targ = targetUniverses[u];
      for (let i = 0; i < 512; i++) {
        const from = init[i];
        const to = targ[i];
        auth[i] = from + (to - from) * ease;
      }
    }
    channelChanged = true;

    if (progress >= 1.0) {
      cuePlaying = false;
      cueProgress = 1.0;
      for (let u = 0; u < MAX_UNIVERSES; u++) {
        const auth = authoritativeUniverses[u];
        const targ = targetUniverses[u];
        for (let i = 0; i < 512; i++) {
          auth[i] = targ[i];
        }
      }
    }
  }

  // Send Art-Net packets over UDP to each configured universe at its target IP
  if (artnetConfig.enabled && udpBound) {
    artnetSequence = (artnetSequence + 1) % 256;
    for (const uniConf of artnetConfig.universes) {
      if (!uniConf.enabled) continue;
      const outDmx = computeOutputDmx(uniConf.universe);
      const packet = buildArtDmxPacket(
        uniConf.artnetUniverse ?? uniConf.universe,
        uniConf.subnet,
        uniConf.net,
        artnetSequence,
        outDmx
      );

      udpSocket.send(
        packet,
        0,
        packet.length,
        uniConf.targetPort || 6454,
        uniConf.targetIp,
        (err) => {
          if (!err) {
            uniConf.packetCount = (uniConf.packetCount || 0) + 1;
            uniConf.lastSentTime = now;
            artnetConfig.packetCount++;
            artnetConfig.lastSentTime = now;
          }
        }
      );
    }
  }

  // Periodic broadcast to WebSockets
  if (channelChanged || cuePlaying || now - lastBroadcastTime > 800) {
    const dmxSlice = Array.from(computeOutputDmx(0));
    const dmxUniverses: Record<number, number[]> = {};
    for (const uni of artnetConfig.universes) {
      dmxUniverses[uni.universe] = Array.from(computeOutputDmx(uni.universe));
    }
    broadcast({
      type: 'dmx_update',
      dmxUniverse: dmxSlice,
      dmxUniverses,
    });
    if (cuePlaying) {
      broadcast({
        type: 'show_state',
        state: {
          cuePlaying,
          cueProgress,
        },
      });
    }
    lastBroadcastTime = now;
    channelChanged = false;
  }
}, 25); // 40 Hz standard DMX frame rate

// -------------------------------------------------------------
// WebSocket Connection & Dispatcher
// -------------------------------------------------------------
wss.on('connection', (ws) => {
  console.log(`[WebSocket] Client connected. Total: ${wss.clients.size}`);

  const initState: WSServerMessage = {
    type: 'init',
    state: getFullShowState(),
  };
  ws.send(JSON.stringify(initState));

  broadcast({
    type: 'client_count',
    count: wss.clients.size,
  });

  ws.on('message', (raw) => {
    try {
      const msg: WSClientMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'set_channel': {
          const u = msg.universe ?? 0;
          if (u >= 0 && u < MAX_UNIVERSES && msg.channel >= 1 && msg.channel <= 512) {
            authoritativeUniverses[u][msg.channel - 1] = Math.max(0, Math.min(255, msg.value));
            targetUniverses[u][msg.channel - 1] = authoritativeUniverses[u][msg.channel - 1];
            channelChanged = true;
          }
          break;
        }

        case 'set_channels': {
          const u = msg.universe ?? 0;
          if (u >= 0 && u < MAX_UNIVERSES) {
            for (const [chStr, val] of Object.entries(msg.updates)) {
              const ch = parseInt(chStr, 10);
              if (ch >= 1 && ch <= 512) {
                authoritativeUniverses[u][ch - 1] = Math.max(0, Math.min(255, val));
                targetUniverses[u][ch - 1] = authoritativeUniverses[u][ch - 1];
              }
            }
            channelChanged = true;
          }
          break;
        }

        case 'set_grand_master': {
          grandMaster = Math.max(0, Math.min(255, msg.value));
          channelChanged = true;
          broadcast({
            type: 'show_state',
            state: { grandMaster },
          });
          break;
        }

        case 'toggle_blackout': {
          blackout = !blackout;
          channelChanged = true;
          broadcast({
            type: 'show_state',
            state: { blackout },
          });
          break;
        }

        case 'trigger_scene': {
          const sc = scenes.find((s) => s.id === msg.sceneId);
          if (sc) {
            const fade = msg.fadeTimeMs !== undefined ? msg.fadeTimeMs : sc.fadeTimeMs;
            startTransitionToScene(sc.id, fade);
          }
          break;
        }

        case 'set_scene_fader': {
          sceneFaders[msg.sceneId] = Math.max(0, Math.min(255, msg.value));
          channelChanged = true;
          broadcast({
            type: 'show_state',
            state: { sceneFaders: { ...sceneFaders } },
          });
          break;
        }

        case 'set_scene_faders': {
          Object.assign(sceneFaders, msg.updates);
          channelChanged = true;
          broadcast({
            type: 'show_state',
            state: { sceneFaders: { ...sceneFaders } },
          });
          break;
        }

        case 'flash_scene_fader': {
          flashedSceneFaders[msg.sceneId] = msg.active;
          channelChanged = true;
          const dmxUniverses: Record<number, number[]> = {};
          for (const uni of artnetConfig.universes) {
            dmxUniverses[uni.universe] = Array.from(computeOutputDmx(uni.universe));
          }
          broadcast({
            type: 'dmx_update',
            dmxUniverse: Array.from(computeOutputDmx(0)),
            dmxUniverses,
          });
          break;
        }

        case 'set_fader_blend_mode': {
          faderBlendMode = msg.mode;
          channelChanged = true;
          broadcast({
            type: 'show_state',
            state: { faderBlendMode },
          });
          break;
        }

        case 'set_base_look_mix': {
          baseLookMix = Math.max(0, Math.min(255, msg.value));
          channelChanged = true;
          broadcast({
            type: 'show_state',
            state: { baseLookMix },
          });
          break;
        }

        case 'clear_all_scene_faders': {
          sceneFaders = {};
          flashedSceneFaders = {};
          channelChanged = true;
          broadcast({
            type: 'show_state',
            state: { sceneFaders: {} },
          });
          break;
        }

        case 'save_scene': {
          const existingIdx = scenes.findIndex((s) => s.id === msg.scene.id);
          if (existingIdx >= 0) {
            scenes[existingIdx] = msg.scene;
          } else {
            scenes.push(msg.scene);
          }
          broadcast({
            type: 'show_state',
            state: { scenes },
          });
          break;
        }

        case 'delete_scene': {
          scenes = scenes.filter((s) => s.id !== msg.sceneId);
          broadcast({
            type: 'show_state',
            state: { scenes },
          });
          break;
        }

        // Multi-Cuelists & Cues Dispatch
        case 'select_cuelist': {
          const found = cuelists.find((cl) => cl.id === msg.cuelistId);
          if (found) {
            activeCuelistId = found.id;
            activeCueIndex = found.activeCueIndex || 0;
            cuelist = found.cues;
            if (found.cues[activeCueIndex]) {
              startTransitionToScene(found.cues[activeCueIndex].sceneId, 800);
            }
            broadcast({
              type: 'show_state',
              state: {
                activeCuelistId,
                activeCueIndex,
                cuelist: found.cues,
              },
            });
          }
          break;
        }

        case 'create_cuelist': {
          const newCuelist: Cuelist = {
            id: `cuelist-${Date.now()}`,
            name: msg.name.trim() || `Cuelist ${cuelists.length + 1}`,
            description: msg.description || 'Custom show cue stack',
            activeCueIndex: 0,
            isLooping: false,
            cues: [
              {
                id: `cue-${Date.now()}`,
                cueNumber: 1.0,
                name: 'Opening Cue',
                sceneId: scenes[0]?.id || 'sc-1',
                fadeInMs: 1500,
                holdTimeMs: 0,
                description: 'Starting state',
              },
            ],
          };
          cuelists.push(newCuelist);
          activeCuelistId = newCuelist.id;
          activeCueIndex = 0;
          cuelist = newCuelist.cues;
          broadcast({
            type: 'show_state',
            state: {
              cuelists,
              activeCuelistId,
              activeCueIndex,
              cuelist: newCuelist.cues,
            },
          });
          break;
        }

        case 'update_cuelist_meta': {
          const target = cuelists.find((cl) => cl.id === msg.cuelistId);
          if (target) {
            if (msg.name) target.name = msg.name.trim();
            if (msg.description !== undefined) target.description = msg.description;
            if (msg.isLooping !== undefined) target.isLooping = msg.isLooping;
            broadcast({
              type: 'show_state',
              state: { cuelists },
            });
          }
          break;
        }

        case 'delete_cuelist': {
          if (cuelists.length <= 1) break;
          cuelists = cuelists.filter((cl) => cl.id !== msg.cuelistId);
          if (activeCuelistId === msg.cuelistId) {
            activeCuelistId = cuelists[0].id;
            activeCueIndex = cuelists[0].activeCueIndex || 0;
            cuelist = cuelists[0].cues;
          }
          broadcast({
            type: 'show_state',
            state: {
              cuelists,
              activeCuelistId,
              activeCueIndex,
              cuelist: getActiveCuelist().cues,
            },
          });
          break;
        }

        case 'save_cue': {
          const list = msg.cuelistId ? cuelists.find((cl) => cl.id === msg.cuelistId) : getActiveCuelist();
          if (list) {
            const existingIdx = list.cues.findIndex((c) => c.id === msg.cue.id);
            if (existingIdx >= 0) {
              list.cues[existingIdx] = msg.cue;
            } else {
              list.cues.push(msg.cue);
            }
            list.cues.sort((a, b) => a.cueNumber - b.cueNumber);
            broadcast({
              type: 'show_state',
              state: {
                cuelists,
                cuelist: getActiveCuelist().cues,
              },
            });
          }
          break;
        }

        case 'delete_cue': {
          const list = msg.cuelistId ? cuelists.find((cl) => cl.id === msg.cuelistId) : getActiveCuelist();
          if (list && list.cues.length > 1) {
            list.cues = list.cues.filter((c) => c.id !== msg.cueId);
            if (list.activeCueIndex >= list.cues.length) {
              list.activeCueIndex = Math.max(0, list.cues.length - 1);
            }
            activeCueIndex = list.activeCueIndex;
            broadcast({
              type: 'show_state',
              state: {
                cuelists,
                cuelist: getActiveCuelist().cues,
                activeCueIndex,
              },
            });
          }
          break;
        }

        case 'duplicate_cue': {
          const list = msg.cuelistId ? cuelists.find((cl) => cl.id === msg.cuelistId) : getActiveCuelist();
          if (list) {
            const original = list.cues.find((c) => c.id === msg.cueId);
            if (original) {
              const newCue: Cue = {
                ...original,
                id: `cue-${Date.now()}`,
                cueNumber: Math.round((original.cueNumber + 0.1) * 10) / 10,
                name: `${original.name} (Copy)`,
              };
              list.cues.push(newCue);
              list.cues.sort((a, b) => a.cueNumber - b.cueNumber);
              broadcast({
                type: 'show_state',
                state: {
                  cuelists,
                  cuelist: getActiveCuelist().cues,
                },
              });
            }
          }
          break;
        }

        case 'reorder_cues': {
          const list = msg.cuelistId ? cuelists.find((cl) => cl.id === msg.cuelistId) : getActiveCuelist();
          if (list && msg.cueIds) {
            const reordered: Cue[] = [];
            for (const id of msg.cueIds) {
              const c = list.cues.find((x) => x.id === id);
              if (c) reordered.push(c);
            }
            list.cues = reordered;
            broadcast({
              type: 'show_state',
              state: {
                cuelists,
                cuelist: getActiveCuelist().cues,
              },
            });
          }
          break;
        }

        case 'cue_go': {
          const activeList = getActiveCuelist();
          let nextIdx = activeCueIndex + 1;
          if (nextIdx >= activeList.cues.length) {
            nextIdx = activeList.isLooping ? 0 : activeList.cues.length - 1;
          }
          executeCue(nextIdx);
          break;
        }

        case 'cue_back': {
          const activeList = getActiveCuelist();
          let prevIdx = activeCueIndex - 1;
          if (prevIdx < 0) prevIdx = activeList.cues.length - 1;
          executeCue(prevIdx);
          break;
        }

        case 'cue_pause': {
          cuePlaying = false;
          if (autoFollowTimeout) {
            clearTimeout(autoFollowTimeout);
            autoFollowTimeout = null;
          }
          broadcast({
            type: 'show_state',
            state: { cuePlaying },
          });
          break;
        }

        case 'cue_jump': {
          executeCue(msg.index);
          break;
        }

        case 'update_cuelist': {
          const currentList = getActiveCuelist();
          currentList.cues = msg.cuelist;
          cuelist = msg.cuelist;
          broadcast({
            type: 'show_state',
            state: {
              cuelists,
              cuelist: msg.cuelist,
            },
          });
          break;
        }

        // Multi-Universe ArtNet Configuration
        case 'save_universe_config': {
          const existingIdx = artnetConfig.universes.findIndex(
            (u) => u.id === msg.universe.id || u.universe === msg.universe.universe
          );
          if (existingIdx >= 0) {
            artnetConfig.universes[existingIdx] = msg.universe;
          } else {
            artnetConfig.universes.push(msg.universe);
          }
          broadcast({
            type: 'show_state',
            state: { artnet: { ...artnetConfig } },
          });
          break;
        }

        case 'delete_universe_config': {
          if (artnetConfig.universes.length <= 1) break;
          artnetConfig.universes = artnetConfig.universes.filter((u) => u.id !== msg.universeId);
          broadcast({
            type: 'show_state',
            state: { artnet: { ...artnetConfig } },
          });
          break;
        }

        case 'send_universe_test_packet': {
          const targetUni = artnetConfig.universes.find((u) => u.universe === msg.universeNumber) || artnetConfig.universes[0];
          if (targetUni) {
            const testDmx = computeOutputDmx(targetUni.universe);
            artnetSequence = (artnetSequence + 1) % 256;
            const packet = buildArtDmxPacket(
              targetUni.artnetUniverse ?? targetUni.universe,
              targetUni.subnet,
              targetUni.net,
              artnetSequence,
              testDmx
            );
            udpSocket.send(
              packet,
              0,
              packet.length,
              targetUni.targetPort || 6454,
              targetUni.targetIp,
              () => {
                targetUni.packetCount = (targetUni.packetCount || 0) + 1;
                targetUni.lastSentTime = Date.now();
                artnetConfig.packetCount++;
                artnetConfig.lastSentTime = Date.now();
                broadcast({
                  type: 'artnet_stats',
                  packetCount: artnetConfig.packetCount,
                  lastSentTime: artnetConfig.lastSentTime,
                  universes: [...artnetConfig.universes],
                });
              }
            );
          }
          break;
        }

        case 'update_fixtures': {
          fixtures = msg.fixtures;
          broadcast({
            type: 'show_state',
            state: { fixtures },
          });
          break;
        }

        case 'save_fixture_type': {
          const existingIdx = fixtureTypes.findIndex((t) => t.id === msg.fixtureType.id);
          if (existingIdx >= 0) {
            fixtureTypes[existingIdx] = msg.fixtureType;
          } else {
            fixtureTypes.push(msg.fixtureType);
          }
          broadcast({
            type: 'show_state',
            state: { fixtureTypes },
          });
          break;
        }

        case 'delete_fixture_type': {
          fixtureTypes = fixtureTypes.filter((t) => t.id !== msg.typeId || t.isBuiltIn);
          broadcast({
            type: 'show_state',
            state: { fixtureTypes },
          });
          break;
        }

        case 'configure_artnet': {
          Object.assign(artnetConfig, msg.config);
          broadcast({
            type: 'show_state',
            state: { artnet: { ...artnetConfig } },
          });
          break;
        }

        case 'send_test_packet': {
          const testDmx = computeOutputDmx(0);
          artnetSequence = (artnetSequence + 1) % 256;
          const packet = buildArtDmxPacket(
            artnetConfig.universe,
            artnetConfig.subnet,
            artnetConfig.net,
            artnetSequence,
            testDmx
          );
          udpSocket.send(
            packet,
            0,
            packet.length,
            artnetConfig.targetPort,
            artnetConfig.targetIp,
            () => {
              artnetConfig.packetCount++;
              artnetConfig.lastSentTime = Date.now();
              broadcast({
                type: 'artnet_stats',
                packetCount: artnetConfig.packetCount,
                lastSentTime: artnetConfig.lastSentTime,
                universes: [...artnetConfig.universes],
              });
            }
          );
          break;
        }

        case 'locate_fixtures': {
          for (const fixId of msg.fixtureIds) {
            const fix = fixtures.find((f) => f.id === fixId);
            if (!fix) continue;

            const u = fix.universe ?? 0;
            const authUni = authoritativeUniverses[u] || authoritativeUniverses[0];

            const cType = fixtureTypes.find(
              (t) => t.id === fix.typeId || t.id === fix.type || t.name === fix.type
            );

            if (cType) {
              for (const chDef of cType.channels) {
                const absCh = fix.startChannel + chDef.offset;
                if (absCh >= 1 && absCh <= 512) {
                  if (chDef.capability === 'dimmer') {
                    authUni[absCh - 1] = 255;
                  } else if (chDef.capability === 'pan' || chDef.capability === 'tilt') {
                    authUni[absCh - 1] = 128;
                  } else if (['red', 'green', 'blue', 'white'].includes(chDef.capability)) {
                    authUni[absCh - 1] = 255;
                  } else if (chDef.capability === 'shutter') {
                    authUni[absCh - 1] = 0;
                  } else if (chDef.defaultValue !== undefined) {
                    authUni[absCh - 1] = chDef.defaultValue;
                  }
                }
              }
            } else if (fix.type === 'moving_head') {
              authUni[fix.startChannel - 1] = 128; // Pan Center
              authUni[fix.startChannel] = 0;
              authUni[fix.startChannel + 1] = 128; // Tilt Center
              authUni[fix.startChannel + 2] = 0;
              authUni[fix.startChannel + 3] = 255; // Dimmer 100%
              authUni[fix.startChannel + 4] = 0;   // Shutter open
              authUni[fix.startChannel + 5] = 255; // R
              authUni[fix.startChannel + 6] = 255; // G
              authUni[fix.startChannel + 7] = 255; // B
              authUni[fix.startChannel + 8] = 255; // W
            } else if (fix.type === 'rgbw_par') {
              authUni[fix.startChannel - 1] = 255; // Dimmer
              authUni[fix.startChannel] = 255;     // R
              authUni[fix.startChannel + 1] = 255; // G
              authUni[fix.startChannel + 2] = 255; // B
              authUni[fix.startChannel + 3] = 255; // W
            } else if (fix.type === 'strobe') {
              authUni[fix.startChannel - 1] = 255; // Dimmer
              authUni[fix.startChannel] = 128;     // Duration
              authUni[fix.startChannel + 1] = 200; // Rate
            } else if (fix.type === 'dimmer') {
              authUni[fix.startChannel - 1] = 255;
            }
          }
          channelChanged = true;
          break;
        }
      }
      schedulePersistState();
    } catch (e) {
      console.error('[WebSocket] Failed to handle message:', e);
    }
  });

  ws.on('close', () => {
    broadcast({
      type: 'client_count',
      count: wss.clients.size,
    });
  });
});

// -------------------------------------------------------------
// REST API Endpoints
// -------------------------------------------------------------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
  });
});

app.get('/api/auth/status', (req: Request, res: Response) => {
  res.json(getAuthStatus(req));
});

app.post('/api/auth/setup', (req: Request, res: Response) => {
  if (consoleAuth.setupCompleted && !isRequestAuthenticated(req)) {
    return res.status(403).json({ error: 'Setup already completed.' });
  }

  const {
    consoleName,
    pinEnabled,
    pin,
    universe0Ip,
    universe0Port,
    artnetEnabled,
  } = req.body || {};

  const enablePin = Boolean(pinEnabled);
  if (enablePin) {
    if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 4 to 8 digits.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    consoleAuth.pinSalt = salt;
    consoleAuth.pinHash = hashPin(pin, salt);
    consoleAuth.pinEnabled = true;
  } else {
    consoleAuth.pinEnabled = false;
    consoleAuth.pinSalt = '';
    consoleAuth.pinHash = '';
  }

  consoleAuth.consoleName =
    typeof consoleName === 'string' && consoleName.trim()
      ? consoleName.trim().slice(0, 48)
      : 'LumenNet Console';
  consoleAuth.setupCompleted = true;
  consoleAuth.tokenEpoch += 1;
  saveConsoleAuth();

  if (typeof artnetEnabled === 'boolean') {
    artnetConfig.enabled = artnetEnabled;
  }
  if (artnetConfig.universes[0]) {
    if (typeof universe0Ip === 'string' && universe0Ip.trim()) {
      artnetConfig.universes[0].targetIp = universe0Ip.trim();
    }
    if (typeof universe0Port === 'number' && universe0Port > 0 && universe0Port <= 65535) {
      artnetConfig.universes[0].targetPort = universe0Port;
    }
  }
  schedulePersistState();

  const token = createSessionToken();
  setSessionCookie(res, token);
  res.json({
    ok: true,
    token,
    auth: {
      setupCompleted: consoleAuth.setupCompleted,
      pinEnabled: consoleAuth.pinEnabled,
      authenticated: true,
      consoleName: consoleAuth.consoleName,
    },
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  if (!consoleAuth.setupCompleted) {
    return res.status(400).json({ error: 'Initial setup has not been completed.' });
  }

  if (!consoleAuth.pinEnabled) {
    const token = createSessionToken();
    setSessionCookie(res, token);
    return res.json({
      ok: true,
      token,
      auth: {
        setupCompleted: true,
        pinEnabled: false,
        authenticated: true,
        consoleName: consoleAuth.consoleName,
      },
    });
  }

  const now = Date.now();
  if (now < pinLockoutUntil) {
    const waitSec = Math.ceil((pinLockoutUntil - now) / 1000);
    return res.status(429).json({
      error: `Too many incorrect attempts. Try again in ${waitSec}s.`,
    });
  }

  const { pin } = req.body || {};
  if (typeof pin !== 'string' || !verifyPin(pin)) {
    failedPinAttempts += 1;
    if (failedPinAttempts >= 5) {
      pinLockoutUntil = Date.now() + 15000;
      failedPinAttempts = 0;
    }
    return res.status(401).json({ error: 'Incorrect PIN.' });
  }

  failedPinAttempts = 0;
  pinLockoutUntil = 0;
  const token = createSessionToken();
  setSessionCookie(res, token);
  res.json({
    ok: true,
    token,
    auth: {
      setupCompleted: true,
      pinEnabled: true,
      authenticated: true,
      consoleName: consoleAuth.consoleName,
    },
  });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/auth/change-pin', (req: Request, res: Response) => {
  if (!isRequestAuthenticated(req)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { currentPin, newPin, pinEnabled, consoleName } = req.body || {};

  if (consoleAuth.pinEnabled) {
    if (typeof currentPin !== 'string' || !verifyPin(currentPin)) {
      return res.status(401).json({ error: 'Current PIN is incorrect.' });
    }
  }

  if (typeof consoleName === 'string' && consoleName.trim()) {
    consoleAuth.consoleName = consoleName.trim().slice(0, 48);
  }

  const nextPinEnabled = typeof pinEnabled === 'boolean' ? pinEnabled : consoleAuth.pinEnabled;
  if (nextPinEnabled) {
    if (typeof newPin === 'string' && newPin.length > 0) {
      if (!/^\d{4,8}$/.test(newPin)) {
        return res.status(400).json({ error: 'New PIN must be 4 to 8 digits.' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      consoleAuth.pinSalt = salt;
      consoleAuth.pinHash = hashPin(newPin, salt);
      consoleAuth.tokenEpoch += 1;
    } else if (!consoleAuth.pinHash) {
      return res.status(400).json({ error: 'Please provide a 4 to 8 digit PIN.' });
    }
    consoleAuth.pinEnabled = true;
  } else {
    consoleAuth.pinEnabled = false;
    consoleAuth.pinHash = '';
    consoleAuth.pinSalt = '';
    consoleAuth.tokenEpoch += 1;
  }

  saveConsoleAuth();
  const token = createSessionToken();
  setSessionCookie(res, token);

  res.json({
    ok: true,
    token,
    auth: {
      setupCompleted: consoleAuth.setupCompleted,
      pinEnabled: consoleAuth.pinEnabled,
      authenticated: true,
      consoleName: consoleAuth.consoleName,
    },
  });
});

app.get('/api/status', (req: Request, res: Response) => {
  if (!isRequestAuthenticated(req)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  res.json({
    status: 'ok',
    state: getFullShowState(),
  });
});

app.post('/api/artnet/test', (req: Request, res: Response) => {
  if (!isRequestAuthenticated(req)) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const testDmx = computeOutputDmx();
  artnetSequence = (artnetSequence + 1) % 256;
  const packet = buildArtDmxPacket(
    artnetConfig.universe,
    artnetConfig.subnet,
    artnetConfig.net,
    artnetSequence,
    testDmx
  );
  udpSocket.send(
    packet,
    0,
    packet.length,
    artnetConfig.targetPort,
    artnetConfig.targetIp,
    (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      artnetConfig.packetCount++;
      artnetConfig.lastSentTime = Date.now();
      res.json({ success: true, packetSize: packet.length, target: `${artnetConfig.targetIp}:${artnetConfig.targetPort}` });
    }
  );
});

// -------------------------------------------------------------
// Dev & Production Vite Middleware
// -------------------------------------------------------------
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.resolve(__dirname, 'dist'))
      ? path.resolve(__dirname, 'dist')
      : path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[LumenNet Server] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[Art-Net UDP] Routing ${artnetConfig.universes.length} universes at ${artnetConfig.fps} Hz`);
  });
}

startServer();
