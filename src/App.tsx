/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLightingSocket } from './hooks/useLightingSocket.ts';
import { ConsoleHeader } from './components/ConsoleHeader.tsx';
import { MasterControlBar } from './components/MasterControlBar.tsx';
import { LiveShowView } from './components/LiveShowView.tsx';
import { FixtureProgrammerView } from './components/FixtureProgrammerView.tsx';
import { StageVisualizer } from './components/StageVisualizer.tsx';
import { DmxUniverseInspector } from './components/DmxUniverseInspector.tsx';
import { FixtureTypeBuilderModal } from './components/FixtureTypeBuilderModal.tsx';
import { FirstLaunchSetup } from './components/FirstLaunchSetup.tsx';
import { PinLoginScreen } from './components/PinLoginScreen.tsx';
import { ConsoleSettingsModal } from './components/ConsoleSettingsModal.tsx';
import { Radio } from 'lucide-react';
import type { AuthStatus } from './types/lighting.ts';

const AUTH_TOKEN_KEY = 'lumennet_auth_token';

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const checkAuthStatus = useCallback(async (tokenToUse: string | null) => {
    try {
      const headers: Record<string, string> = {};
      if (tokenToUse) {
        headers['Authorization'] = `Bearer ${tokenToUse}`;
      }
      const res = await fetch('/api/auth/status', { headers });
      if (res.ok) {
        const data: AuthStatus = await res.json();
        setAuth(data);
        if (!data.authenticated && tokenToUse) {
          try {
            localStorage.removeItem(AUTH_TOKEN_KEY);
          } catch {
            // ignore storage errors
          }
          setAuthToken(null);
        }
      }
    } catch (err) {
      console.warn('[Auth] Failed to fetch auth status:', err);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus(authToken);
  }, [checkAuthStatus, authToken]);

  const handleAuthSuccess = useCallback((token: string, nextAuth: AuthStatus) => {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } catch {
      // ignore storage errors
    }
    setAuthToken(token);
    setAuth(nextAuth);
  }, []);

  const handleLockConsole = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch {
      // ignore storage errors
    }
    setAuthToken(null);
    setShowSettings(false);
    setAuth((prev) => (prev ? { ...prev, authenticated: false } : prev));
  }, []);

  const canConnectConsole = Boolean(auth?.setupCompleted && auth?.authenticated);

  const {
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
    locateFixtures,
  } = useLightingSocket({ enabled: canConnectConsole, token: authToken });

  const [activeTab, setActiveTab] = useState<'live' | 'fixtures' | 'visualizer' | 'dmx'>('live');
  const [showTypeBuilder, setShowTypeBuilder] = useState(false);

  // Keyboard shortcut listener for live show control (only active when unlocked)
  useEffect(() => {
    if (!canConnectConsole) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        cueGo();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        toggleBlackout();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        cueGo();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        cueBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canConnectConsole, cueGo, cueBack, toggleBlackout]);

  if (authLoading || !auth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 font-sans">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-3">
          <Radio className="w-5 h-5 text-amber-400" />
        </div>
        <p className="text-xs text-slate-400">Initializing LumenNet Console...</p>
      </div>
    );
  }

  if (!auth.setupCompleted) {
    return <FirstLaunchSetup onComplete={handleAuthSuccess} />;
  }

  if (auth.pinEnabled && !auth.authenticated) {
    return <PinLoginScreen consoleName={auth.consoleName} onUnlock={handleAuthSuccess} />;
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 font-sans">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-3">
          <Radio className="w-5 h-5 text-amber-400" />
        </div>
        <h1 className="text-sm font-bold text-white mb-1">{auth.consoleName}</h1>
        <p className="text-xs text-slate-400">Syncing DMX universes and Art-Net output...</p>
      </div>
    );
  }

  const activeScene = state.scenes.find((s) => s.id === state.activeSceneId);
  const fixtureTypes = state.fixtureTypes || [];
  const universes = state.artnet.universes || [];
  const cuelists = state.cuelists || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Top 3-Zone Header */}
      <ConsoleHeader
        consoleName={auth.consoleName}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        connected={connected}
        blackout={state.blackout}
        onToggleBlackout={toggleBlackout}
        pinEnabled={auth.pinEnabled}
        onOpenSettings={() => setShowSettings(true)}
        onLockConsole={handleLockConsole}
      />

      {/* Global Master Control Bar */}
      <MasterControlBar
        grandMaster={state.grandMaster}
        onGrandMasterChange={setGrandMaster}
        artnet={state.artnet}
        onConfigureArtNet={configureArtNet}
        onSendUniverseTestPacket={sendUniverseTestPacket}
        onOpenUniversesTab={() => setActiveTab('dmx')}
        activeSceneName={activeScene?.name || 'Manual Preset'}
      />

      {/* Main Workspace View */}
      <main className="flex-1 overflow-auto bg-slate-950">
        {activeTab === 'live' && (
          <LiveShowView
            scenes={state.scenes}
            activeSceneId={state.activeSceneId}
            onTriggerScene={triggerScene}
            onSaveScene={saveScene}
            onDeleteScene={deleteScene}
            cuelist={state.cuelist}
            cuelists={cuelists}
            activeCuelistId={state.activeCuelistId}
            activeCueIndex={state.activeCueIndex}
            cuePlaying={state.cuePlaying}
            cueProgress={state.cueProgress}
            onCueGo={cueGo}
            onCuePause={cuePause}
            onCueBack={cueBack}
            onCueJump={cueJump}
            onSelectCuelist={selectCuelist}
            onCreateCuelist={createCuelist}
            onUpdateCuelistMeta={updateCuelistMeta}
            onDeleteCuelist={deleteCuelist}
            onSaveCue={saveCue}
            onDeleteCue={deleteCue}
            onDuplicateCue={duplicateCue}
            onReorderCues={reorderCues}
            dmxUniverse={state.dmxUniverse}
            dmxUniverses={state.dmxUniverses}
            sceneFaders={state.sceneFaders || {}}
            faderBlendMode={state.faderBlendMode || 'htp'}
            baseLookMix={state.baseLookMix ?? 0}
            onSetSceneFader={setSceneFader}
            onSetSceneFaders={setSceneFaders}
            onFlashSceneFader={flashSceneFader}
            onSetFaderBlendMode={setFaderBlendMode}
            onSetBaseLookMix={setBaseLookMix}
            onClearAllSceneFaders={clearAllSceneFaders}
          />
        )}

        {activeTab === 'fixtures' && (
          <FixtureProgrammerView
            fixtures={state.fixtures}
            fixtureTypes={fixtureTypes}
            universes={universes}
            dmxUniverse={state.dmxUniverse}
            dmxUniverses={state.dmxUniverses}
            onSetChannel={setChannel}
            onSetChannels={setChannels}
            onLocateFixtures={locateFixtures}
            onOpenTypeBuilder={() => setShowTypeBuilder(true)}
          />
        )}

        {activeTab === 'visualizer' && (
          <StageVisualizer
            fixtures={state.fixtures}
            fixtureTypes={fixtureTypes}
            dmxUniverse={state.dmxUniverse}
            dmxUniverses={state.dmxUniverses}
            grandMaster={state.grandMaster}
            blackout={state.blackout}
          />
        )}

        {activeTab === 'dmx' && (
          <DmxUniverseInspector
            dmxUniverse={state.dmxUniverse}
            dmxUniverses={state.dmxUniverses}
            universes={universes}
            fixtures={state.fixtures}
            fixtureTypes={fixtureTypes}
            onSetChannel={setChannel}
            onUpdateFixtures={updateFixtures}
            onSaveFixtureType={saveFixtureType}
            onDeleteFixtureType={deleteFixtureType}
            onSaveUniverseConfig={saveUniverseConfig}
            onDeleteUniverseConfig={deleteUniverseConfig}
            onSendUniverseTestPacket={sendUniverseTestPacket}
          />
        )}
      </main>

      {/* Custom Fixture Type Builder Modal */}
      {showTypeBuilder && (
        <FixtureTypeBuilderModal
          fixtureTypes={fixtureTypes}
          onSaveFixtureType={saveFixtureType}
          onDeleteFixtureType={deleteFixtureType}
          onClose={() => setShowTypeBuilder(false)}
        />
      )}

      {/* Console & PIN Settings Modal */}
      {showSettings && (
        <ConsoleSettingsModal
          auth={auth}
          token={authToken}
          onUpdated={handleAuthSuccess}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Keyboard Shortcuts Footer */}
      <footer className="px-6 py-2 bg-slate-950 border-t border-slate-900 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono">
        <div className="flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">Space</kbd> GO
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">Esc</kbd> Blackout
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">←</kbd>{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">→</kbd> Step Cues
          </span>
        </div>

        <div className="text-slate-500">
          {universes.filter((u) => u.enabled).length} active universes · {state.fixtures.length} fixtures
        </div>
      </footer>
    </div>
  );
}
