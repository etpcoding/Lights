import React, { useRef, useEffect, useState } from 'react';
import { Eye, Layers, Wind, Rotate3d, Compass } from 'lucide-react';
import type { Fixture, CustomFixtureType } from '../types/lighting.ts';

interface StageVisualizerProps {
  fixtures: Fixture[];
  fixtureTypes: CustomFixtureType[];
  dmxUniverse: number[];
  dmxUniverses?: Record<number, number[]>;
  grandMaster: number;
  blackout: boolean;
}

export const StageVisualizer: React.FC<StageVisualizerProps> = ({
  fixtures,
  fixtureTypes,
  dmxUniverse,
  dmxUniverses,
  grandMaster,
  blackout,
}) => {
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [hazeDensity, setHazeDensity] = useState(0.65);
  const [camYaw, setCamYaw] = useState(0);
  const [camPitch, setCamPitch] = useState(30);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, yaw: 0, pitch: 0 });

  // Helper to extract fixture colors and intensity
  const getFixtureState = (fixture: Fixture, timeMs: number) => {
    const uniBuf = (dmxUniverses && dmxUniverses[fixture.universe ?? 0]) || dmxUniverse;
    let r = 255, g = 255, b = 255, w = 0, dimmer = 0, pan = 128, tilt = 128, strobeRate = 0;

    const cType = fixtureTypes.find(
      (t) => t.id === fixture.typeId || t.id === fixture.type || t.name === fixture.type
    );

    if (cType) {
      for (const ch of cType.channels) {
        const val = uniBuf[fixture.startChannel + ch.offset - 1] ?? ch.defaultValue ?? 0;
        if (ch.capability === 'dimmer') dimmer = val;
        else if (ch.capability === 'pan') pan = val;
        else if (ch.capability === 'tilt') tilt = val;
        else if (ch.capability === 'red') r = val;
        else if (ch.capability === 'green') g = val;
        else if (ch.capability === 'blue') b = val;
        else if (ch.capability === 'white') w = val;
        else if (ch.capability === 'shutter') strobeRate = val;
      }
    } else if (fixture.type === 'moving_head') {
      pan = uniBuf[fixture.startChannel - 1] ?? 128;
      tilt = uniBuf[fixture.startChannel + 1] ?? 128;
      dimmer = uniBuf[fixture.startChannel + 3] ?? 0;
      strobeRate = uniBuf[fixture.startChannel + 4] ?? 0;
      r = uniBuf[fixture.startChannel + 5] ?? 255;
      g = uniBuf[fixture.startChannel + 6] ?? 255;
      b = uniBuf[fixture.startChannel + 7] ?? 255;
      w = uniBuf[fixture.startChannel + 8] ?? 0;
    } else if (fixture.type === 'rgbw_par') {
      dimmer = uniBuf[fixture.startChannel - 1] ?? 0;
      r = uniBuf[fixture.startChannel] ?? 255;
      g = uniBuf[fixture.startChannel + 1] ?? 255;
      b = uniBuf[fixture.startChannel + 2] ?? 255;
      w = uniBuf[fixture.startChannel + 3] ?? 0;
    } else if (fixture.type === 'strobe') {
      dimmer = uniBuf[fixture.startChannel - 1] ?? 0;
      strobeRate = uniBuf[fixture.startChannel + 1] ?? 0;
      r = 255; g = 255; b = 255;
    } else if (fixture.type === 'dimmer') {
      dimmer = uniBuf[fixture.startChannel - 1] ?? 0;
      r = 255; g = 220; b = 180;
    }

    if (blackout) dimmer = 0;

    // Apply Strobe Flash Blink if strobe is active
    let strobeVisible = true;
    if (strobeRate > 15) {
      const frequency = (strobeRate / 255) * 25; // up to 25 Hz
      const period = 1000 / frequency;
      strobeVisible = (timeMs % period) < period * 0.4;
    }

    if (!strobeVisible) dimmer = 0;

    // Blend white into RGB
    if (w > 0) {
      r = Math.min(255, Math.round(r + (w * (255 - r)) / 255));
      g = Math.min(255, Math.round(g + (w * (255 - g)) / 255));
      b = Math.min(255, Math.round(b + (w * (255 - b)) / 255));
    }

    const intensity = (dimmer / 255) * (grandMaster / 255);

    return {
      r,
      g,
      b,
      intensity,
      panAngle: ((pan - 128) / 128) * 90, // -90 to +90 degrees deflection
      tiltAngle: ((tilt - 128) / 128) * 60, // -60 to +60 degrees
    };
  };

  // Rendering Loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = (canvas.width = canvas.parentElement?.clientWidth || 900);
      const height = (canvas.height = canvas.parentElement?.clientHeight || 560);
      const now = performance.now();

      // Clear dark stage background
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, width, height);

      if (viewMode === '2d') {
        render2D(ctx, width, height, now);
      } else {
        render3D(ctx, width, height, now);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [viewMode, fixtures, fixtureTypes, dmxUniverse, dmxUniverses, grandMaster, blackout, hazeDensity, camYaw, camPitch]);

  // ---------------- Render 2D Top-Down Rig Plot ----------------
  const render2D = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeMs: number
  ) => {
    const cx = width / 2;
    const cy = height / 2 + 20;
    const scale = Math.min(width, height) / 260;

    // Draw Stage Floor Rectangle
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 100 * scale, cy - 80 * scale, 200 * scale, 150 * scale);

    ctx.fillStyle = '#0f172a33';
    ctx.fillRect(cx - 100 * scale, cy - 80 * scale, 200 * scale, 150 * scale);

    // Front of stage marker
    ctx.fillStyle = '#475569';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('DOWNSTAGE / AUDIENCE', cx, cy + 95 * scale);
    ctx.fillText('UPSTAGE BACKDROP', cx, cy - 90 * scale);

    // Draw Trusses
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4;
    // Back truss
    ctx.beginPath();
    ctx.moveTo(cx - 90 * scale, cy - 50 * scale);
    ctx.lineTo(cx + 90 * scale, cy - 50 * scale);
    ctx.stroke();

    // Mid/Front truss
    ctx.beginPath();
    ctx.moveTo(cx - 75 * scale, cy + 30 * scale);
    ctx.lineTo(cx + 75 * scale, cy + 30 * scale);
    ctx.stroke();

    // Render fixtures & beam projections
    for (const fix of fixtures) {
      const state = getFixtureState(fix, timeMs);
      const fx = cx + fix.position.x * scale;
      const fy = cy + fix.position.y * scale;

      if (state.intensity > 0.02) {
        // Draw 2D beam projection cone
        const beamLength = 90 * scale * state.intensity;
        const angleRad = (state.panAngle * Math.PI) / 180 + Math.PI / 2;
        const spreadRad = fix.type === 'moving_head' ? 0.35 : 0.65;

        const grad = ctx.createRadialGradient(fx, fy, 4, fx, fy, beamLength);
        grad.addColorStop(0, `rgba(${state.r}, ${state.g}, ${state.b}, ${0.8 * state.intensity})`);
        grad.addColorStop(0.6, `rgba(${state.r}, ${state.g}, ${state.b}, ${0.35 * state.intensity * hazeDensity})`);
        grad.addColorStop(1, `rgba(${state.r}, ${state.g}, ${state.b}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.arc(fx, fy, beamLength, angleRad - spreadRad, angleRad + spreadRad);
        ctx.closePath();
        ctx.fill();
      }

      // Draw Fixture Symbol
      ctx.beginPath();
      ctx.arc(fx, fy, 6 * scale, 0, Math.PI * 2);
      ctx.fillStyle = state.intensity > 0.05
        ? `rgb(${state.r}, ${state.g}, ${state.b})`
        : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(fix.name.split(' ')[0], fx, fy - 9 * scale);
    }
  };

  // ---------------- Render 3D Volumetric Stage Simulation ----------------
  const render3D = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeMs: number
  ) => {
    const cx = width / 2;
    const cy = height / 2 + 50;

    const radYaw = (camYaw * Math.PI) / 180;
    const radPitch = (camPitch * Math.PI) / 180;
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);

    // 3D Projection math
    const project = (x: number, y: number, z: number) => {
      // Rotate around Y (Yaw)
      const x1 = x * cosY - y * sinY;
      const y1 = x * sinY + y * cosY;
      // Rotate around X (Pitch)
      const y2 = y1 * cosP - z * sinP;
      const z2 = y1 * sinP + z * cosP;

      const fov = 380;
      const depth = z2 + 280;
      const pScale = fov / Math.max(80, depth);

      return {
        px: cx + x1 * pScale,
        py: cy - y2 * pScale,
        scale: pScale,
        depth,
      };
    };

    // 1. Draw 3D Stage Platform Floor
    const corners = [
      project(-100, -80, 0),
      project(100, -80, 0),
      project(100, 80, 0),
      project(-100, 80, 0),
    ];

    ctx.beginPath();
    ctx.moveTo(corners[0].px, corners[0].py);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].px, corners[i].py);
    ctx.closePath();
    ctx.fillStyle = '#0d1322';
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Stage Grid Lines
    for (let gx = -80; gx <= 80; gx += 40) {
      const p1 = project(gx, -80, 0);
      const p2 = project(gx, 80, 0);
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.strokeStyle = '#162032';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 2. Draw Overhead Trusses
    const truss1A = project(-90, -50, 90);
    const truss1B = project(90, -50, 90);
    ctx.beginPath();
    ctx.moveTo(truss1A.px, truss1A.py);
    ctx.lineTo(truss1B.px, truss1B.py);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4 * truss1A.scale;
    ctx.stroke();

    const truss2A = project(-75, 30, 80);
    const truss2B = project(75, 30, 80);
    ctx.beginPath();
    ctx.moveTo(truss2A.px, truss2A.py);
    ctx.lineTo(truss2B.px, truss2B.py);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 4 * truss2A.scale;
    ctx.stroke();

    // 3. Render Volumetric Light Cones & Floor Spots
    // Sort fixtures from back to front for proper alpha blending
    const sortedFixtures = [...fixtures].map((f) => {
      const p = project(f.position.x, f.position.y, f.position.z);
      return { fixture: f, ...p };
    }).sort((a, b) => b.depth - a.depth);

    for (const item of sortedFixtures) {
      const fix = item.fixture;
      const state = getFixtureState(fix, timeMs);
      const origin = project(fix.position.x, fix.position.y, fix.position.z);

      if (state.intensity > 0.02) {
        // Calculate floor intersection point based on Pan/Tilt angles
        const panOffset = Math.sin((state.panAngle * Math.PI) / 180) * 60;
        const tiltOffset = Math.sin((state.tiltAngle * Math.PI) / 180) * 70;

        const floorTarget = project(
          fix.position.x + panOffset,
          fix.position.y + tiltOffset,
          0
        );

        // Volumetric Cone
        const beamSpread = fix.type === 'moving_head' ? 18 * floorTarget.scale : 28 * floorTarget.scale;

        const beamGrad = ctx.createLinearGradient(origin.px, origin.py, floorTarget.px, floorTarget.py);
        beamGrad.addColorStop(
          0,
          `rgba(${state.r}, ${state.g}, ${state.b}, ${0.9 * state.intensity})`
        );
        beamGrad.addColorStop(
          0.4,
          `rgba(${state.r}, ${state.g}, ${state.b}, ${0.35 * state.intensity * hazeDensity})`
        );
        beamGrad.addColorStop(
          1,
          `rgba(${state.r}, ${state.g}, ${state.b}, ${0.1 * state.intensity * hazeDensity})`
        );

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(origin.px, origin.py);
        ctx.lineTo(floorTarget.px - beamSpread, floorTarget.py);
        ctx.lineTo(floorTarget.px + beamSpread, floorTarget.py);
        ctx.closePath();
        ctx.fill();

        // Floor Light Pool
        const spotGrad = ctx.createRadialGradient(
          floorTarget.px,
          floorTarget.py,
          2,
          floorTarget.px,
          floorTarget.py,
          beamSpread * 1.5
        );
        spotGrad.addColorStop(
          0,
          `rgba(${state.r}, ${state.g}, ${state.b}, ${0.85 * state.intensity})`
        );
        spotGrad.addColorStop(
          1,
          `rgba(${state.r}, ${state.g}, ${state.b}, 0)`
        );

        ctx.fillStyle = spotGrad;
        ctx.beginPath();
        ctx.ellipse(
          floorTarget.px,
          floorTarget.py,
          beamSpread * 1.5,
          beamSpread * 0.7,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Draw Physical Fixture Housing Body
      const radius = 5 * origin.scale;
      ctx.beginPath();
      ctx.arc(origin.px, origin.py, radius, 0, Math.PI * 2);
      ctx.fillStyle = state.intensity > 0.05
        ? `rgb(${state.r}, ${state.g}, ${state.b})`
        : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  };

  // Pointer drag for 3D Camera Orbit
  const handlePointerDown = (e: React.PointerEvent) => {
    if (viewMode !== '3d') return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: camYaw,
      pitch: camPitch,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || viewMode !== '3d') return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    const newYaw = Math.max(-60, Math.min(60, dragStartRef.current.yaw + deltaX * 0.3));
    const newPitch = Math.max(10, Math.min(75, dragStartRef.current.pitch - deltaY * 0.3));

    setCamYaw(newYaw);
    setCamPitch(newPitch);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] p-6">
      {/* Top Visualizer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 p-3 rounded-xl border border-slate-800 mb-4 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('3d')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === '3d'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Rotate3d className="w-3.5 h-3.5" />
              <span>3D Volumetric Stage</span>
            </button>
            <button
              onClick={() => setViewMode('2d')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === '2d'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>2D Rig Plot</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{fixtures.length} fixtures</span>
          </div>
        </div>

        {/* Visualizer Controls */}
        <div className="flex items-center gap-4">
          {viewMode === '3d' && (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Wind className="w-3.5 h-3.5 text-amber-400" />
              <span>Haze</span>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={hazeDensity}
                onChange={(e) => setHazeDensity(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <span className="font-mono text-[11px] text-slate-400 w-8 tabular-nums">
                {Math.round(hazeDensity * 100)}%
              </span>
            </div>
          )}

          {viewMode === '3d' && (
            <button
              onClick={() => {
                setCamYaw(0);
                setCamPitch(30);
              }}
              className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded border border-slate-700"
            >
              Reset View
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Container */}
      <div
        className="flex-1 relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {viewMode === '3d' && (
          <div className="absolute bottom-3 left-3 pointer-events-none bg-slate-900/90 px-2.5 py-1 rounded-md border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>Drag to orbit</span>
          </div>
        )}
      </div>
    </div>
  );
};
