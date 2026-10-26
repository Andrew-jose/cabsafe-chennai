import React from 'react';
import {
  Play,
  Navigation,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  PlusCircle,
  Scale,
} from 'lucide-react';
import type { RideRecord, MatchExplanation } from '../types';

interface SimulationCardProps {
  activeRide: RideRecord | null;
  candidateRankings?: MatchExplanation[];
  onTriggerSimAction: (action: string, rideId?: string) => Promise<void>;
  simBusy: boolean;
  simStatusMessage: string | null;
}

export const SimulationCard: React.FC<SimulationCardProps> = ({
  activeRide,
  candidateRankings = [],
  onTriggerSimAction,
  simBusy,
  simStatusMessage,
}) => {
  const explanation =
    activeRide?.matchExplanation ||
    activeRide?.candidateRankings?.[0] ||
    candidateRankings[0] ||
    null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-slate-100 space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">
            [SIMULATION] Dispatch &amp; GPS Controls
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Clearly labelled test helpers for single-browser verification
          </p>
        </div>
        <span className="font-mono text-[11px] text-amber-400 whitespace-nowrap shrink-0">
          DEV HARNESS
        </span>
      </div>

      {simStatusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono"
        >
          {simStatusMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={simBusy || !activeRide || activeRide.status !== 'pending'}
          onClick={() => onTriggerSimAction('accept-ride', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Play className="w-3.5 h-3.5 shrink-0" />
          <span>Sim Captain Accept</span>
        </button>

        <button
          type="button"
          disabled={simBusy || !activeRide || activeRide.status !== 'accepted'}
          onClick={() => onTriggerSimAction('start-ride-otp', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0" />
          <span>Sim Verify OTP</span>
        </button>

        <button
          type="button"
          disabled={
            simBusy ||
            !activeRide ||
            !['accepted', 'ongoing'].includes(activeRide.status)
          }
          onClick={() => onTriggerSimAction('step-gps', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Navigation className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span>Step Captain GPS</span>
        </button>

        <button
          type="button"
          disabled={simBusy || !activeRide || activeRide.status !== 'ongoing'}
          onClick={() => onTriggerSimAction('complete-ride', activeRide?._id)}
          className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          <span>Sim Finish Ride</span>
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={simBusy}
          onClick={() => onTriggerSimAction('spawn-demo-ride')}
          className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          <PlusCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Spawn Demo Ride Offer</span>
        </button>
        <button
          type="button"
          disabled={simBusy}
          onClick={() => onTriggerSimAction('reset-demo')}
          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          title="Reset Demo Database"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>Reset Seed</span>
        </button>
      </div>

      {/* Explainable Multi-Factor Driver Matching Breakdown */}
      <div className="border-t border-slate-800 pt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 whitespace-nowrap">
            <Scale className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Explainable Matching</span>
          </div>
          <span className="font-mono text-[10px] text-slate-400 whitespace-nowrap shrink-0">
            0.45·D + 0.25·R + 0.20·C + 0.10·V
          </span>
        </div>

        {explanation ? (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">
                  {explanation.captainName} · {explanation.plate}
                </p>
                <p className="text-[11px] text-slate-400">
                  {explanation.distanceKm} km away · ETA {explanation.etaMinutes} mins
                </p>
              </div>
              <div className="text-right font-mono">
                <span className="text-sm font-bold text-amber-400 tabular-nums">
                  {explanation.finalScore.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-500"> / 100</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              <div className="bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">Dist (45%):</span>
                <span className="text-slate-200 tabular-nums">
                  +{explanation.scoreBreakdown.distance.weighted.toFixed(1)}
                </span>
              </div>
              <div className="bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">Rating (25%):</span>
                <span className="text-slate-200 tabular-nums">
                  +{explanation.scoreBreakdown.rating.weighted.toFixed(1)}
                </span>
              </div>
              <div className="bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">Reliab (20%):</span>
                <span className="text-slate-200 tabular-nums">
                  +{explanation.scoreBreakdown.completion.weighted.toFixed(1)}
                </span>
              </div>
              <div className="bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800/80 flex justify-between">
                <span className="text-slate-400">Vehicle (10%):</span>
                <span className="text-slate-200 tabular-nums">
                  +{explanation.scoreBreakdown.vehicle.weighted.toFixed(1)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {explanation.explanation}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Select a pickup &amp; destination to preview deterministic multi-factor driver rankings.
          </p>
        )}
      </div>
    </div>
  );
};
