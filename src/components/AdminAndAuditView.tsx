import React, { useState } from 'react';
import {
  ShieldAlert,
  Server,
  Radio,
  Smartphone,
  Scale,
  RefreshCw,
} from 'lucide-react';
import type { CaptainRecord, RideRecord } from '../types';
import { LiveMap } from './LiveMap';

interface AdminOverviewData {
  captains: Array<Omit<CaptainRecord, 'password'>>;
  rides: RideRecord[];
  stats: {
    totalCaptains: number;
    activeCaptains: number;
    totalRides: number;
    activeRides: number;
    completedRides: number;
    totalVolumeInr?: number;
    totalVolumeUsd: number;
  };
}

interface AdminAndAuditViewProps {
  mode: 'admin' | 'audit';
  overview: AdminOverviewData | null;
  onRefresh: () => Promise<void>;
  onTriggerSimAction: (action: string, rideId?: string) => Promise<void>;
}

export const AdminAndAuditView: React.FC<AdminAndAuditViewProps> = ({
  mode,
  overview,
  onRefresh,
  onTriggerSimAction,
}) => {
  const [auditTab, setAuditTab] = useState<
    'endpoints' | 'sockets' | 'security' | 'android'
  >('security');

  if (mode === 'admin') {
    const captains = overview?.captains || [];
    const rides = overview?.rides || [];
    const stats = overview?.stats || {
      totalCaptains: 0,
      activeCaptains: 0,
      totalRides: 0,
      activeRides: 0,
      completedRides: 0,
      totalVolumeUsd: 0,
    };

    const focusedRide =
      rides.find((r) => ['pending', 'accepted', 'ongoing'].includes(r.status)) ||
      rides[0] ||
      null;

    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6 text-slate-100">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white font-display">
              Chennai Dispatch Operations &amp; Explainable Matching Console
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Provisional Chennai Operating Boundary (13.0827°N, 80.2707°E) · Live Fleet Telemetry &amp; Ranking Audits
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onTriggerSimAction('spawn-demo-ride')}
              className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              [SIMULATION] Dispatch Chennai Test Ride
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="px-3.5 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 4-Column KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400">Active Chennai Captains</p>
            <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
              {stats.activeCaptains} / {stats.totalCaptains}
            </p>
            <p className="text-[11px] text-emerald-400 mt-1">
              Provisional Chennai polygon enforced
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400">In-Progress Rides</p>
            <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1">
              {stats.activeRides}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Atomic lock &amp; duplicate ride protection
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400">Completed Trips</p>
            <p className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
              {stats.completedRides}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              OTP-verified handshakes
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400">Settled Gross Volume (INR)</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
              ₹{(stats.totalVolumeInr ?? stats.totalVolumeUsd).toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Transparent INR base + distance + time
            </p>
          </div>
        </div>

        {/* 2-Column Split: Live Chennai Fleet Map + Explainable Match Audit */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden min-h-[380px] flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">
                Chennai Operating Zone &amp; Fleet Map (Provisional Dev Boundary)
              </h2>
              <span className="font-mono text-xs text-slate-400">
                {captains.length} Captains Tracked
              </span>
            </div>
            <div className="flex-1 min-h-[330px]">
              <LiveMap
                pickupCoords={focusedRide?.pickupCoords || null}
                destinationCoords={focusedRide?.destinationCoords || null}
                routeGeometry={focusedRide?.routeGeometry || null}
                fleetCaptains={captains}
                showFleetMarkers={true}
              />
            </div>
          </div>

          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-semibold text-white">
                    Explainable Multi-Factor Audit Log
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  Deterministic Ranking
                </span>
              </div>

              {focusedRide?.candidateRankings &&
              focusedRide.candidateRankings.length > 0 ? (
                <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
                  {focusedRide.candidateRankings.map((cand, idx) => (
                    <div
                      key={cand.captainId}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        idx === 0
                          ? 'bg-slate-950 border-amber-500/40'
                          : 'bg-slate-950/50 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          #{idx + 1} · {cand.captainName} ({cand.plate})
                        </span>
                        <span className="font-mono font-bold text-amber-400 tabular-nums">
                          {cand.finalScore.toFixed(1)} pts
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        {cand.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No candidate rankings recorded yet.
                </p>
              )}
            </div>

            <div className="border-t border-slate-800 pt-3 text-[11px] text-slate-400 font-mono">
              Formula: Score = 0.45·S_dist + 0.25·S_rating + 0.20·S_completion + 0.10·S_vehicle
            </div>
          </div>
        </div>

        {/* Rides & Fleet Ledger Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Recent &amp; Active Chennai Ride Ledger
            </h2>
            <span className="font-mono text-xs text-slate-400">
              {rides.length} Total Records
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                  <th className="py-2.5 px-4 font-medium">Ride ID</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Passenger</th>
                  <th className="py-2.5 px-4 font-medium">Assigned Captain</th>
                  <th className="py-2.5 px-4 font-medium">Chennai Route</th>
                  <th className="py-2.5 px-4 font-medium text-right">Fare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {rides.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono text-slate-300">
                      {r._id.slice(-8)}
                    </td>
                    <td className="py-2.5 px-4 font-mono uppercase text-amber-400">
                      {r.status}
                    </td>
                    <td className="py-2.5 px-4 text-slate-200">
                      {typeof r.user === 'object' && r.user
                        ? `${r.user.fullname.firstname} ${r.user.fullname.lastname || ''}`
                        : String(r.user)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {typeof r.captain === 'object' && r.captain
                        ? `${r.captain.fullname.firstname} (${r.captain.vehicle.plate})`
                        : 'Unassigned'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 max-w-xs truncate">
                      {r.pickup} → {r.destination}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-white tabular-nums">
                      ₹{r.fare.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- Repository Audit, Security & Native Android Release Reference View ----------------
  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6 text-slate-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white font-display">
            CabSafe Chennai Audit, Security &amp; Android Release Blueprint
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Stages 5–7: Chennai Service Boundary, Socket.IO Protocol, Security Remediations, and Native Android Export
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          {(
            [
              { id: 'security', label: 'Security & Boundary', icon: ShieldAlert },
              { id: 'endpoints', label: 'HTTP Matrix', icon: Server },
              { id: 'sockets', label: 'Socket.IO Matrix', icon: Radio },
              { id: 'android', label: 'Android & Release', icon: Smartphone },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAuditTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  auditTab === tab.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {auditTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">
              1. Authoritative Chennai Service-Area Boundary (`422 OUTSIDE_SERVICE_AREA`)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Configuration (`/src/config/chennaiServiceArea.ts`):</strong>{' '}
              Provisional development polygon centered at <code>13.0827°N, 80.2707°E</code> covering Chennai city, OMR (Perungudi, Thoraipakkam, Sholinganallur), and GST corridor through Tambaram.
            </p>
            <p className="text-xs text-emerald-400">
              <strong>Enforcement:</strong> Validated on both the client and backend (<code>GET /rides/get-fare</code>, <code>POST /rides/create</code>, <code>POST /captains/location</code>, and Socket <code>update-location-captain</code>). Out-of-area points are never silently moved into Chennai.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">
              2. Atomic Ride Acceptance &amp; Duplicate Submission Prevention (`409 Conflict`)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Race Condition Remediation:</strong>{' '}
              <code>confirmRideAtomically</code> requires <code>status === &apos;pending&apos; &amp;&amp; captain === null</code>, returning HTTP <code>409 Conflict</code> if a second captain attempts to accept the same ride.
            </p>
            <p className="text-xs text-emerald-400">
              <strong>Duplicate Booking Prevention:</strong> <code>createRide</code> checks <code>getActiveRideForActor(&apos;user&apos;, userId)</code> and rejects concurrent duplicate ride submissions with HTTP <code>409 Conflict</code> (<code>DUPLICATE_ACTIVE_RIDE</code>).
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">
              3. Captain Ownership &amp; OTP Secrecy (`403 Forbidden` / Role Sanitization)
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Identity Enforcement:</strong> <code>POST /rides/confirm</code>, <code>POST /rides/start-ride</code>, and <code>POST /rides/end-ride</code> bind strictly to the JWT-authenticated <code>req.captain._id</code>.
            </p>
            <p className="text-xs text-emerald-400">
              <strong>OTP Protection:</strong> <code>sanitizeRideForRole(ride, &apos;captain&apos;)</code> strips the 6-digit <code>otp</code> from all captain HTTP and Socket payloads; the trip can only transition to <code>ongoing</code> when the captain submits the rider’s OTP.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">
              4. Authenticated Socket.IO Session &amp; Live GPS Relay
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Session Verification:</strong> Distinguishes raw socket connections from token-authenticated sessions on <code>join</code> and <code>update-location-captain</code>.
            </p>
            <p className="text-xs text-emerald-400">
              <strong>Scoped Tracking:</strong> Live driver locations are relayed via <code>captain-location-updated</code> only during active rides (<code>accepted</code> or <code>ongoing</code>) and cleared immediately when a trip ends or is cancelled.
            </p>
          </div>
        </div>
      )}

      {auditTab === 'endpoints' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-4">Method &amp; Path</th>
                <th className="py-2.5 px-4">Role / Auth</th>
                <th className="py-2.5 px-4">Request Parameters / Body</th>
                <th className="py-2.5 px-4">Response &amp; Audited Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">GET /maps/service-area</td>
                <td className="py-2.5 px-4">Public</td>
                <td className="py-2.5 px-4 font-mono">None</td>
                <td className="py-2.5 px-4">200 &#123; mapConfig (13.0827, 80.2707), metadata, polygon &#125;</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">GET /maps/reverse-geocode</td>
                <td className="py-2.5 px-4">authAny</td>
                <td className="py-2.5 px-4 font-mono">?lat=&amp;lon=</td>
                <td className="py-2.5 px-4">200 &#123; coords, display_name, locality, inServiceArea &#125;</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">GET /rides/get-fare</td>
                <td className="py-2.5 px-4">authAny</td>
                <td className="py-2.5 px-4 font-mono">?pickup=&amp;destination=</td>
                <td className="py-2.5 px-4">200 Fare + Route · 422 if outside Chennai boundary</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">POST /rides/create</td>
                <td className="py-2.5 px-4">authUser</td>
                <td className="py-2.5 px-4 font-mono">pickup, destination, vehicleType</td>
                <td className="py-2.5 px-4">201 Ride · 422 outside Chennai · 409 duplicate active ride</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">POST /rides/confirm</td>
                <td className="py-2.5 px-4">authCaptain</td>
                <td className="py-2.5 px-4 font-mono">rideId (uses req.captain._id)</td>
                <td className="py-2.5 px-4">200 Ride (OTP stripped) · 409 Conflict if already accepted</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">POST /rides/start-ride</td>
                <td className="py-2.5 px-4">authCaptain</td>
                <td className="py-2.5 px-4 font-mono">rideId, otp (6 digits)</td>
                <td className="py-2.5 px-4">200 Ride (status: ongoing) · 400 wrong OTP · 403 wrong captain</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">POST /captains/location</td>
                <td className="py-2.5 px-4">authCaptain</td>
                <td className="py-2.5 px-4 font-mono">lat, lon</td>
                <td className="py-2.5 px-4">200 Captain · 422 if outside Chennai operating boundary</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {auditTab === 'sockets' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-4">Event Name</th>
                <th className="py-2.5 px-4">Direction</th>
                <th className="py-2.5 px-4">Payload</th>
                <th className="py-2.5 px-4">Recipient &amp; Behavior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">join</td>
                <td className="py-2.5 px-4">Client → Server</td>
                <td className="py-2.5 px-4 font-mono">&#123; userId, userType, token &#125;</td>
                <td className="py-2.5 px-4">Verifies JWT token, binds socketId, joins userType:userId room</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-amber-400">update-location-captain</td>
                <td className="py-2.5 px-4">Captain → Server</td>
                <td className="py-2.5 px-4 font-mono">&#123; userId, location: &#123; lat, lon &#125;, token &#125;</td>
                <td className="py-2.5 px-4">Validates captain JWT &amp; Chennai polygon; relays captain-location-updated</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-emerald-400">new-ride</td>
                <td className="py-2.5 px-4">Server → Captains</td>
                <td className="py-2.5 px-4 font-mono">Sanitized Ride + matchExplanation</td>
                <td className="py-2.5 px-4">Sent to ranked active Chennai captains (OTP excluded)</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-emerald-400">ride-confirmed</td>
                <td className="py-2.5 px-4">Server → Passenger</td>
                <td className="py-2.5 px-4 font-mono">Ride with Captain + 6-digit OTP</td>
                <td className="py-2.5 px-4">Transitions rider UI to WaitingForDriver with OTP</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-mono text-emerald-400">captain-location-updated</td>
                <td className="py-2.5 px-4">Server → Passenger</td>
                <td className="py-2.5 px-4 font-mono">&#123; rideId, captainId, location, updatedAt &#125;</td>
                <td className="py-2.5 px-4">Emitted only while ride is accepted or ongoing</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {auditTab === 'android' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-white">
              Stage 5 &amp; 7: Native Android Map SDK Selection &amp; Release Preparation
            </h3>
            <p className="text-slate-300 leading-relaxed">
              Compatible with existing backend OpenStreetMap / OSRM / Photon APIs without requiring a paid Google Maps key:
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
              <p className="font-semibold text-amber-400">
                1. Map Rendering Library: osmdroid / MapLibre Native
              </p>
              <p className="text-slate-300 leading-relaxed">
                Uses <code>org.osmdroid:osmdroid-android:6.1.18</code> (or <code>org.maplibre.gl:android-sdk:11.5.1</code>) centered at <code>GeoPoint(13.0827, 80.2707)</code> (zoom <code>12.0</code>). Configures a descriptive <code>User-Agent</code> header (<code>CabSafe-Android/1.0</code>) per OSM Tile Usage Policy. For high-volume commercial production, swap the tile source URL via <code>BuildConfig.MAP_TILE_URL</code> without changing UI code.
              </p>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
              <p className="font-semibold text-emerald-400">
                2. BuildConfig &amp; Credential Hygiene
              </p>
              <p className="text-slate-300 leading-relaxed">
                Configure <code>CABSAFE_API_BASE_URL</code> in <code>local.properties</code> / Gradle <code>buildConfigField</code> (<code>http://10.0.2.2:3000</code> for emulator, <code>https://...</code> with <code>cleartextTrafficPermitted=&quot;false&quot;</code> for release). Never embed private signing keys, database URIs, or JWT secrets in the APK.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
