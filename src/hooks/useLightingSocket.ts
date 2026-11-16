import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  ShowState,
  WSClientMessage,
  WSServerMessage,
  Fixture,
  CustomFixtureType,
  Scene,
  Cue,
  UniverseConfig,
  ArtNetConfig,
} from '../types/lighting.ts';

interface UseLightingSocketOptions {
  enabled?: boolean;
  token?: string | null;
}

export function useLightingSocket(options: UseLightingSocketOptions = {}) {
  const { enabled = true, token = null } = options;
  const [state, setState] = useState<ShowState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${protocol}//${window.location.host}/ws${qs}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSServerMessage = JSON.parse(event.data);
        if (msg.type === 'init') {
          setState(msg.state);
        } else if (msg.type === 'dmx_update') {
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  dmxUniverse: msg.dmxUniverse,
                  dmxUniverses: msg.dmxUniverses ?? prev.dmxUniverses,
                }
              : prev
          );
        } else if (msg.type === 'show_state') {
          setState((prev) => (prev ? { ...prev, ...msg.state } : prev));
        } else if (msg.type === 'client_count') {
          setState((prev) => (prev ? { ...prev, clientCount: msg.count } : prev));
        } else if (msg.type === 'artnet_stats') {
          setState((prev) =>
            prev
              ? {
                  ...prev,
                  artnet: {
                    ...prev.artnet,
                    packetCount: msg.packetCount,
                    lastSentTime: msg.lastSentTime,
                    universes: msg.universes ?? prev.artnet.universes,
                  },
                }
              : prev
          );
        }
      } catch (err) {
        console.error('[WebSocket] Parse error:', err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (enabled) {
        reconnectTimeoutRef.current = setTimeout(connect, 1500);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setState(null);
      return;
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch('/api/status', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.state) {
          setState((prev) => prev || data.state);
        }
      })
      .catch((e) => console.warn('[Hydration] Initial status fetch error:', e));

    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, token, connect]);

  const send = useCallback((msg: WSClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const setChannel = useCallback(
    (channel: number, value: number, universe?: number) => {
      send({ type: 'set_channel', channel, value, universe });
    },
    [send]
  );

  const setChannels = useCallback(
    (updates: Record<number, number>, universe?: number) => {
      send({ type: 'set_channels', updates, universe });
    },
    [send]
  );

  const setGrandMaster = useCallback(
    (value: number) => {
      send({ type: 'set_grand_master', value });
    },
    [send]
  );

  const toggleBlackout = useCallback(() => {
    send({ type: 'toggle_blackout' });
  }, [send]);

  const triggerScene = useCallback(
    (sceneId: string, fadeTimeMs?: number) => {
      send({ type: 'trigger_scene', sceneId, fadeTimeMs });
    },
    [send]
  );

  const setSceneFader = useCallback(
    (sceneId: string, value: number) => {
      send({ type: 'set_scene_fader', sceneId, value });
    },
    [send]
  );

  const setSceneFaders = useCallback(
    (updates: Record<string, number>) => {
      send({ type: 'set_scene_faders', updates });
    },
    [send]
  );

  const flashSceneFader = useCallback(
    (sceneId: string, active: boolean) => {
      send({ type: 'flash_scene_fader', sceneId, active });
    },
    [send]
  );

  const setFaderBlendMode = useCallback(
    (mode: 'htp' | 'latest' | 'additive') => {
      send({ type: 'set_fader_blend_mode', mode });
    },
    [send]
  );

  const setBaseLookMix = useCallback(
    (value: number) => {
      send({ type: 'set_base_look_mix', value });
    },
    [send]
  );

  const clearAllSceneFaders = useCallback(() => {
    send({ type: 'clear_all_scene_faders' });
  }, [send]);

  const saveScene = useCallback(
    (scene: Scene) => {
      send({ type: 'save_scene', scene });
    },
    [send]
  );

  const deleteScene = useCallback(
    (sceneId: string) => {
      send({ type: 'delete_scene', sceneId });
    },
    [send]
  );

  const cueGo = useCallback(() => {
    send({ type: 'cue_go' });
  }, [send]);

  const cuePause = useCallback(() => {
    send({ type: 'cue_pause' });
  }, [send]);

  const cueBack = useCallback(() => {
    send({ type: 'cue_back' });
  }, [send]);

  const cueJump = useCallback(
    (index: number) => {
      send({ type: 'cue_jump', index });
    },
    [send]
  );

  const updateCuelist = useCallback(
    (cuelist: Cue[]) => {
      send({ type: 'update_cuelist', cuelist });
    },
    [send]
  );

  const selectCuelist = useCallback(
    (cuelistId: string) => {
      send({ type: 'select_cuelist', cuelistId });
    },
    [send]
  );

  const createCuelist = useCallback(
    (name: string, description?: string) => {
      send({ type: 'create_cuelist', name, description });
    },
    [send]
  );

  const updateCuelistMeta = useCallback(
    (cuelistId: string, name: string, isLooping?: boolean, description?: string) => {
      send({ type: 'update_cuelist_meta', cuelistId, name, isLooping, description });
    },
    [send]
  );

  const deleteCuelist = useCallback(
    (cuelistId: string) => {
      send({ type: 'delete_cuelist', cuelistId });
    },
    [send]
  );

  const saveCue = useCallback(
    (cue: Cue, cuelistId?: string) => {
      send({ type: 'save_cue', cuelistId, cue });
    },
    [send]
  );

  const deleteCue = useCallback(
    (cueId: string, cuelistId?: string) => {
      send({ type: 'delete_cue', cuelistId, cueId });
    },
    [send]
  );

  const duplicateCue = useCallback(
    (cueId: string, cuelistId?: string) => {
      send({ type: 'duplicate_cue', cuelistId, cueId });
    },
    [send]
  );

  const reorderCues = useCallback(
    (cueIds: string[], cuelistId?: string) => {
      send({ type: 'reorder_cues', cuelistId, cueIds });
    },
    [send]
  );

  const updateFixtures = useCallback(
    (fixtures: Fixture[]) => {
      send({ type: 'update_fixtures', fixtures });
    },
    [send]
  );

  const saveFixtureType = useCallback(
    (fixtureType: CustomFixtureType) => {
      send({ type: 'save_fixture_type', fixtureType });
    },
    [send]
  );

  const deleteFixtureType = useCallback(
    (typeId: string) => {
      send({ type: 'delete_fixture_type', typeId });
    },
    [send]
  );

  const configureArtNet = useCallback(
    (config: Partial<ArtNetConfig>) => {
      send({ type: 'configure_artnet', config });
    },
    [send]
  );

  const saveUniverseConfig = useCallback(
    (universe: UniverseConfig) => {
      send({ type: 'save_universe_config', universe });
    },
    [send]
  );

  const deleteUniverseConfig = useCallback(
    (universeId: string) => {
      send({ type: 'delete_universe_config', universeId });
    },
    [send]
  );

  const sendUniverseTestPacket = useCallback(
    (universeNumber: number) => {
      send({ type: 'send_universe_test_packet', universeNumber });
    },
    [send]
  );

  const sendTestPacket = useCallback(() => {
    send({ type: 'send_test_packet' });
  }, [send]);

  const locateFixtures = useCallback(
    (fixtureIds: string[]) => {
      send({ type: 'locate_fixtures', fixtureIds });
    },
    [send]
  );

  return {
    state,
    connected,
    setChannel,
    setChannels,
    setGrandMaster,
    toggleBlackout,
    triggerScene,
    setSceneFader,
    setSceneFaders,
    flashSceneFader,
    setFaderBlendMode,
    setBaseLookMix,
    clearAllSceneFaders,
    saveScene,
    deleteScene,
    cueGo,
    cuePause,
    cueBack,
    cueJump,
    updateCuelist,
    selectCuelist,
    createCuelist,
    updateCuelistMeta,
    deleteCuelist,
    saveCue,
    deleteCue,
    duplicateCue,
    reorderCues,
    updateFixtures,
    saveFixtureType,
    deleteFixtureType,
    configureArtNet,
    saveUniverseConfig,
    deleteUniverseConfig,
    sendUniverseTestPacket,
    sendTestPacket,
    locateFixtures,
  };
}
