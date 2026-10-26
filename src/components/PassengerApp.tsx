import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Navigation,
  Clock,
  LogOut,
  User as UserIcon,
  History,
  Star,
  X,
  Check,
  Car,
  Bike,
  Zap,
  ShieldCheck,
  AlertCircle,
  LocateFixed,
  Search,
  ArrowLeft,
  ArrowUpDown,
  ChevronsRight,
  Users,
  Compass,
  MessageSquare,
} from 'lucide-react';
import type {
  UserRecord,
  CaptainRecord,
  RideRecord,
  LandmarkSuggestion,
  FareEstimateResponse,
  VehicleType,
  Coordinates,
} from '../types';
import {
  apiRequest,
  setStoredToken,
  clearStoredToken,
  isPointInChennaiServiceArea,
  validateChennaiTripEndpoints,
} from '../types';
import { LiveMap } from './LiveMap';
import { TopDownCarSvg } from './TopDownCarSvg';

interface PassengerAppProps {
  user: Omit<UserRecord, 'password'> | null;
  setUser: (u: Omit<UserRecord, 'password'> | null) => void;
  activeRide: RideRecord | null;
  setActiveRide: (r: RideRecord | null) => void;
  fleetCaptains: Array<Omit<CaptainRecord, 'password'>>;
  captainLiveCoords: Coordinates | null;
  captainLastUpdatedAt?: string | null;
  onFarePreviewChange?: (fareData: FareEstimateResponse | null) => void;
  onRefreshState: () => Promise<void>;
}

/**
 * Pre-booking UI stages on the single Chennai map screen:
 * - 'home': 01 · Home Map (Interactive dark Chennai map + "Where do you want to go?" + dual location card)
 * - 'search': 02 · Choose Destination (Debounced Chennai search + editable pickup/destination + map tap)
 * - 'route': 03 · Confirm Pickup & Route (Map route polyline + distance/duration + adjust pickup pin)
 * - 'vehicle': 04 · Select a Ride (Tall reference cards for CabSafe Go / Auto / Moto + top-down vehicle spec view)
 *
 * Server-driven active ride stages (05 Finding Driver -> 06 Driver Assigned -> 07 Trip in Progress -> 08 Completed & Rate)
 * automatically take precedence when `activeRide` or `completedRideToRate` is present.
 */
type PreBookingStage = 'home' | 'search' | 'route' | 'vehicle';

export const PassengerApp: React.FC<PassengerAppProps> = ({
  user,
  setUser,
  activeRide,
  setActiveRide,
  fleetCaptains,
  captainLiveCoords,
  captainLastUpdatedAt,
  onFarePreviewChange,
  onRefreshState,
}) => {
  // Auth state
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('alex.passenger@cabsafe.demo');
  const [password, setPassword] = useState('password123');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Chennai Booking flow state — starts empty so PICKUP and DROPOFF pins appear only after user selection
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoords, setPickupCoords] = useState<Coordinates | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<Coordinates | null>(null);
  const [activeField, setActiveField] = useState<'pickup' | 'destination'>('pickup');
  const [suggestions, setSuggestions] = useState<LandmarkSuggestion[]>([]);
  const [landmarks, setLandmarks] = useState<LandmarkSuggestion[]>([]);
  const [searchingSuggestions, setSearchingSuggestions] = useState(false);
  const [fareEstimate, setFareEstimate] = useState<FareEstimateResponse | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>('car');
  const [bookingStep, setBookingStep] = useState<PreBookingStage>('home');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [gpsStatusNotice, setGpsStatusNotice] = useState<string | null>(null);

  // Drawers & Post-Ride Modals
  const [drawer, setDrawer] = useState<'none' | 'history' | 'profile'>('none');
  const [rideHistory, setRideHistory] = useState<RideRecord[]>([]);
  const [completedRideToRate, setCompletedRideToRate] = useState<RideRecord | null>(null);
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [ratingFeedback, setRatingFeedback] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Card' | 'Cash' | 'Wallet'>('Card');
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);

  // Load Chennai landmarks & recent ride history once authenticated
  useEffect(() => {
    apiRequest<LandmarkSuggestion[]>('/maps/landmarks')
      .then((list) => {
        setLandmarks(list);
        if (suggestions.length === 0) setSuggestions(list.slice(0, 10));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    apiRequest<RideRecord[]>('/rides/history', { role: 'user' })
      .then((list) => setRideHistory(list))
      .catch(() => {});
  }, [user, activeRide?.status]);

  // 300ms Debounced Chennai-biased autocomplete when user types in pickup or destination
  useEffect(() => {
    if (!user || !activeField) return;
    const query = activeField === 'pickup' ? pickup : destination;
    const isExactLandmark = landmarks.some((l) => l.display_name === query.trim());
    if (query.trim().length < 2 || isExactLandmark) {
      setSuggestions(landmarks.slice(0, 10));
      setSearchingSuggestions(false);
      return;
    }
    setSearchingSuggestions(true);
    const timer = setTimeout(() => {
      apiRequest<LandmarkSuggestion[]>(
        `/maps/get-suggestions?input=${encodeURIComponent(query)}`,
        { role: 'user' }
      )
        .then((res) => setSuggestions(res))
        .catch(() => setSuggestions(landmarks.slice(0, 10)))
        .finally(() => setSearchingSuggestions(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [pickup, destination, activeField, user, landmarks]);

  // Sync profile fields when user loads
  useEffect(() => {
    if (user) {
      setFirstName(user.fullname.firstname);
      setLastName(user.fullname.lastname || '');
      setPhone(user.phone || '+91 98401 23410');
    }
  }, [user]);

  // Detect ride completion (08 · Trip Completed) to show receipt & rating sheet
  useEffect(() => {
    if (activeRide && activeRide.status === 'completed' && !activeRide.userRating) {
      setCompletedRideToRate(activeRide);
    }
  }, [activeRide]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        const res = await apiRequest<{ user: Omit<UserRecord, 'password'>; token: string }>(
          '/users/login',
          {
            method: 'POST',
            body: { email, password },
          }
        );
        setStoredToken('user', res.token);
        setUser(res.user);
      } else {
        const res = await apiRequest<{ user: Omit<UserRecord, 'password'>; token: string }>(
          '/users/register',
          {
            method: 'POST',
            body: {
              fullname: { firstname: firstName, lastname: lastName },
              email,
              phone,
              password,
            },
          }
        );
        setStoredToken('user', res.token);
        setUser(res.user);
      }
      await onRefreshState();
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDemoPassengerLogin = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await apiRequest<{ user: Omit<UserRecord, 'password'>; token: string }>(
        '/users/login',
        {
          method: 'POST',
          body: { email: 'alex.passenger@cabsafe.demo', password: 'password123' },
        }
      );
      setStoredToken('user', res.token);
      setUser(res.user);
      await onRefreshState();
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/users/logout', { method: 'POST', role: 'user' });
    } catch {
      // Ignore network errors on logout
    }
    clearStoredToken('user');
    setUser(null);
    setActiveRide(null);
  };

  const handleSwapLocations = () => {
    const prevPickup = pickup;
    const prevPickupCoords = pickupCoords;
    setPickup(destination);
    setPickupCoords(destinationCoords);
    setDestination(prevPickup);
    setDestinationCoords(prevPickupCoords);
    setFareEstimate(null);
    setBookingError(null);
  };

  /**
   * Requests route & fare estimate from the backend and transitions to Step 03 (`route`) or Step 04 (`vehicle`).
   */
  const handleFindTrip = async (
    targetStage: PreBookingStage = 'route',
    overridePickup?: string,
    overridePickupCoords?: Coordinates | null,
    overrideDest?: string,
    overrideDestCoords?: Coordinates | null
  ) => {
    const effectivePickup = overridePickup ?? pickup;
    const effectivePickupCoords = overridePickupCoords ?? pickupCoords;
    const effectiveDest = overrideDest ?? destination;
    const effectiveDestCoords = overrideDestCoords ?? destinationCoords;

    if (!effectivePickup.trim() && !effectiveDest.trim()) {
      setBookingError('Please choose your pick-up and drop-off locations in Chennai first.');
      return;
    }
    if (!effectivePickup.trim()) {
      setActiveField('pickup');
      setBookingError('Please select a pick-up location in Chennai.');
      return;
    }
    if (!effectiveDest.trim()) {
      setActiveField('destination');
      setBookingError('Please select a drop-off destination in Chennai.');
      return;
    }
    if (effectivePickup.trim().toLowerCase() === effectiveDest.trim().toLowerCase()) {
      setBookingError('Pickup and destination cannot be the same location.');
      return;
    }

    if (effectivePickupCoords && effectiveDestCoords) {
      const check = validateChennaiTripEndpoints(effectivePickupCoords, effectiveDestCoords);
      if (!check.valid) {
        setBookingError(check.message || 'Location is outside the Chennai service area.');
        return;
      }
    }

    setBookingError(null);
    setGpsStatusNotice(null);
    setBookingBusy(true);
    try {
      const coordParams =
        effectivePickupCoords && effectiveDestCoords
          ? `&pickupLat=${effectivePickupCoords.lat}&pickupLon=${effectivePickupCoords.lon}&destLat=${effectiveDestCoords.lat}&destLon=${effectiveDestCoords.lon}`
          : '';
      const data = await apiRequest<FareEstimateResponse>(
        `/rides/get-fare?pickup=${encodeURIComponent(
          effectivePickup
        )}&destination=${encodeURIComponent(effectiveDest)}${coordParams}`,
        { role: 'user' }
      );
      setPickupCoords(data.originCoords);
      setDestinationCoords(data.destinationCoords);
      setFareEstimate(data);
      onFarePreviewChange?.(data);
      setBookingStep(targetStage);
    } catch (err) {
      const payload = (err as {
        payload?: { originCoords?: Coordinates; destinationCoords?: Coordinates };
      }).payload;
      if (payload?.originCoords) setPickupCoords(payload.originCoords);
      if (payload?.destinationCoords) setDestinationCoords(payload.destinationCoords);
      setFareEstimate(null);
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  /**
   * Separately assigns either Pickup or Drop-off when user selects a locality or search suggestion.
   * Only places the corresponding pin marker on the map; once both are chosen, previews the route.
   */
  const handleSelectLocationOption = (
    displayName: string,
    coords: Coordinates,
    isOutside?: boolean,
    explicitTarget?: 'pickup' | 'destination'
  ) => {
    setBookingError(null);
    setGpsStatusNotice(null);

    const targetField: 'pickup' | 'destination' =
      explicitTarget ??
      (bookingStep === 'home'
        ? !pickupCoords
          ? 'pickup'
          : !destinationCoords
            ? 'destination'
            : activeField
        : activeField);

    if (targetField === 'pickup') {
      setPickup(displayName);
      setPickupCoords(coords);
      if (isOutside) {
        setBookingError(
          `Selected pick-up "${displayName}" is outside the supported Chennai operating boundary.`
        );
        return;
      }
      if (destination.trim() && destinationCoords) {
        handleFindTrip('route', displayName, coords, destination, destinationCoords);
      } else {
        setActiveField('destination');
      }
    } else {
      setDestination(displayName);
      setDestinationCoords(coords);
      if (isOutside) {
        setBookingError(
          `Selected drop-off "${displayName}" is outside the supported Chennai operating boundary.`
        );
        return;
      }
      if (pickup.trim() && pickupCoords) {
        handleFindTrip('route', pickup, pickupCoords, displayName, coords);
      } else {
        setActiveField('pickup');
      }
    }
  };

  /**
   * Handles selecting a point directly on the Chennai map.
   * Never silently moves the passenger's selected coordinates.
   */
  const handleMapClickSelect = async (coords: Coordinates, forceTarget?: 'pickup' | 'destination') => {
    if (activeRide && ['pending', 'accepted', 'ongoing'].includes(activeRide.status)) {
      return;
    }
    const targetField: 'pickup' | 'destination' =
      forceTarget ??
      (bookingStep === 'route'
        ? 'pickup'
        : bookingStep === 'home'
          ? !pickupCoords
            ? 'pickup'
            : !destinationCoords
              ? 'destination'
              : activeField
          : activeField);

    setBookingError(null);
    setGpsStatusNotice(null);
    setFareEstimate(null);

    const inside = isPointInChennaiServiceArea(coords);
    if (targetField === 'pickup') {
      setPickupCoords(coords);
      if (!destinationCoords) setActiveField('destination');
    } else {
      setDestinationCoords(coords);
      if (!pickupCoords) setActiveField('pickup');
    }

    try {
      const rev = await apiRequest<{
        coords: Coordinates;
        display_name: string;
        inServiceArea: boolean;
      }>(`/maps/reverse-geocode?lat=${coords.lat}&lon=${coords.lon}`, {
        role: 'user',
      });
      if (targetField === 'pickup') {
        setPickup(rev.display_name);
        setPickupCoords(rev.coords);
      } else {
        setDestination(rev.display_name);
        setDestinationCoords(rev.coords);
      }
      if (!rev.inServiceArea) {
        setBookingError(
          `Selected ${targetField === 'pickup' ? 'pick-up' : 'drop-off'} point (${coords.lat.toFixed(
            4
          )}, ${coords.lon.toFixed(4)}) is outside the supported Chennai operating boundary.`
        );
      }
    } catch {
      const fallbackLabel = inside
        ? `Chennai Pinned Location (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})`
        : `Pinned Point (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(
            4
          )}) — Outside Chennai Service Boundary`;
      if (targetField === 'pickup') {
        setPickup(fallbackLabel);
      } else {
        setDestination(fallbackLabel);
      }
      if (!inside) {
        setBookingError(
          `Selected ${targetField === 'pickup' ? 'pick-up' : 'drop-off'} point (${coords.lat.toFixed(
            4
          )}, ${coords.lon.toFixed(4)}) is outside the supported Chennai operating boundary.`
        );
      }
    }
  };

  /**
   * Current-location support with runtime permission handling and graceful manual fallback.
   */
  const handleUseDeviceGps = () => {
    setBookingError(null);
    setGpsStatusNotice(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatusNotice(
        'Device geolocation is unavailable in this environment. Manual Chennai search and map-pin selection remain active.'
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords: Coordinates = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lon: Number(pos.coords.longitude.toFixed(5)),
        };
        setPickupCoords(coords);
        const inside = isPointInChennaiServiceArea(coords);
        if (!inside) {
          setPickup(`Device GPS (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)})`);
          setBookingError(
            `Your current device GPS (${coords.lat.toFixed(4)}, ${coords.lon.toFixed(
              4
            )}) is outside the Chennai operating boundary. Please select a pickup within Chennai.`
          );
          return;
        }
        await handleMapClickSelect(coords, 'pickup');
        setGpsStatusNotice('Pickup set from live device GPS within Chennai.');
      },
      (err) => {
        const reason =
          err.code === 1
            ? 'Location permission denied.'
            : 'Device GPS signal unavailable.';
        setGpsStatusNotice(
          `${reason} Manual Chennai locality search and map-tap selection are ready.`
        );
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 10000 }
    );
  };

  /**
   * Step 04 -> 05: Submits ride request to backend with duplicate-tap lock.
   * Transitions to 05 · Finding Your Driver only when backend returns the created pending ride.
   */
  const handleCreateRide = async () => {
    if (bookingBusy || activeRide) return;
    setBookingError(null);
    setBookingBusy(true);
    try {
      const created = await apiRequest<RideRecord>('/rides/create', {
        method: 'POST',
        role: 'user',
        body: {
          pickup,
          destination,
          pickupCoords,
          destinationCoords,
          vehicleType: selectedVehicle,
        },
      });
      setActiveRide(created);
      setBookingStep('home');
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const handleCancelRide = async () => {
    if (!activeRide || bookingBusy) return;
    setBookingBusy(true);
    try {
      await apiRequest<RideRecord>('/rides/cancel', {
        method: 'POST',
        role: 'user',
        body: {
          rideId: activeRide._id,
          reason: 'Passenger cancelled request',
        },
      });
      setActiveRide(null);
      setBookingStep('home');
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const handlePayAndRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = completedRideToRate || activeRide;
    if (!target || bookingBusy) return;
    setBookingBusy(true);
    try {
      await apiRequest<RideRecord>('/rides/pay', {
        method: 'POST',
        role: 'user',
        body: {
          rideId: target._id,
          paymentMethod,
          rating: ratingValue,
          feedback: ratingFeedback,
        },
      });
      setCompletedRideToRate(null);
      setActiveRide(null);
      setRatingFeedback('');
      setBookingStep('home');
      await onRefreshState();
    } catch (err) {
      setBookingError((err as Error).message);
    } finally {
      setBookingBusy(false);
    }
  };

  const openHistoryDrawer = async () => {
    setDrawer('history');
    try {
      const list = await apiRequest<RideRecord[]>('/rides/history', { role: 'user' });
      setRideHistory(list);
    } catch {
      setRideHistory([]);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSavedMsg(null);
    try {
      const updated = await apiRequest<Omit<UserRecord, 'password'>>('/users/profile', {
        method: 'PUT',
        role: 'user',
        body: { firstname: firstName, lastname: lastName, phone },
      });
      setUser(updated);
      setProfileSavedMsg('Profile saved.');
    } catch (err) {
      setProfileSavedMsg((err as Error).message);
    }
  };

  // ---------------- Unauthenticated Login / Signup View ----------------
  if (!user) {
    return (
      <div className="h-full flex flex-col justify-between p-6 bg-[#0B0D12] text-white overflow-y-auto">
        <div className="space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <span className="text-xl font-extrabold tracking-tight text-white font-display">
                CabSafe Chennai
              </span>
              <p className="text-xs text-slate-400">Passenger Mobility Portal · Tamil Nadu</p>
            </div>
            <div className="flex items-center gap-1 bg-[#181B22] p-1 rounded-full border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#E2FF44] text-[#0B0D12]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError(null);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-[#E2FF44] text-[#0B0D12]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-red-950/70 border border-red-500/40 text-xs text-red-200 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-3.5">
            {authMode === 'signup' && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      First name
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Alex"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-sm text-white focus:outline-none focus:border-[#E2FF44]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Last name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Rivera"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-sm text-white focus:outline-none focus:border-[#E2FF44]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Mobile phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98401 23410"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-sm text-white focus:outline-none focus:border-[#E2FF44]"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Passenger email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.passenger@cabsafe.demo"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-sm text-white focus:outline-none focus:border-[#E2FF44]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-sm text-white focus:outline-none focus:border-[#E2FF44]"
              />
            </div>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full min-h-[46px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
            >
              {authBusy
                ? 'Authenticating...'
                : authMode === 'login'
                  ? 'Sign In as Passenger'
                  : 'Create Passenger Account'}
            </button>
          </form>
        </div>

        <div className="pt-4 border-t border-white/10 space-y-2.5">
          <p className="text-[11px] text-slate-400 text-center">
            Instant Demo Access (Pre-seeded Chennai Passenger Account)
          </p>
          <button
            type="button"
            onClick={handleDemoPassengerLogin}
            disabled={authBusy}
            className="w-full min-h-[44px] rounded-full bg-[#1C1F26] hover:bg-[#252932] border border-[#E2FF44]/40 text-[#E2FF44] font-semibold text-xs transition-colors cursor-pointer"
          >
            One-Click Demo Passenger Login (Alex Rivera)
          </button>
        </div>
      </div>
    );
  }

  // Determine map coordinates
  const mapPickup = activeRide?.pickupCoords || fareEstimate?.originCoords || pickupCoords;
  const mapDest =
    activeRide?.destinationCoords || fareEstimate?.destinationCoords || destinationCoords;
  const mapGeometry = activeRide?.routeGeometry || fareEstimate?.routeGeometry || null;

  const assignedCaptain =
    activeRide &&
    ['accepted', 'ongoing'].includes(activeRide.status) &&
    typeof activeRide.captain === 'object' &&
    activeRide.captain
      ? activeRide.captain
      : null;

  const spotlightCaptain =
    assignedCaptain ||
    fleetCaptains.find((c) => c.vehicle.vehicleType === selectedVehicle) ||
    fleetCaptains[0] ||
    null;

  // Show assigned driver's location only during active rides ('accepted' or 'ongoing')
  const mapCaptainCoords: Coordinates | null = assignedCaptain
    ? captainLiveCoords ||
      (assignedCaptain.location?.coordinates
        ? {
            lon: assignedCaptain.location.coordinates[0],
            lat: assignedCaptain.location.coordinates[1],
          }
        : null)
    : null;

  const lastUpdateTimestamp =
    captainLastUpdatedAt || assignedCaptain?.location?.updatedAt || null;
  const isLocationStale = lastUpdateTimestamp
    ? Date.now() - new Date(lastUpdateTimestamp).getTime() > 120000
    : false;

  const mapHeightClass =
    activeRide || bookingStep === 'route'
      ? 'h-[40%]'
      : bookingStep === 'search'
        ? 'h-[26%]'
        : 'h-[30%]';

  return (
    <div className="relative h-full w-full flex flex-col bg-[#0B0D12] text-white overflow-hidden">
      {/* Reference-Matched Top Header Bar */}
      <div className="h-[52px] px-3.5 bg-[#0B0D12] border-b border-white/10 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={openHistoryDrawer}
            aria-label="My Trips"
            title="My Trips & Receipts"
            className="w-9 h-9 rounded-full bg-[#1C1F26] hover:bg-[#252932] border border-white/10 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
          >
            <History className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-extrabold text-sm text-white tracking-tight truncate">
                CabSafe
              </span>
              <span className="text-[10px] font-mono text-[#E2FF44]">
                CHENNAI
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {user.fullname.firstname} {user.fullname.lastname || ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Logout Passenger"
            title="Logout"
            className="w-9 h-9 rounded-full bg-[#1C1F26] hover:bg-red-950/80 border border-white/10 flex items-center justify-center text-slate-300 hover:text-red-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setDrawer('profile')}
            aria-label="Passenger Profile"
            title="Passenger Profile"
            className="w-9 h-9 rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-xs flex items-center justify-center shadow-md transition-colors cursor-pointer"
          >
            {user.fullname.firstname.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </div>

      {/* Primary Interactive Dark Chennai Map Canvas */}
      <div className={`${mapHeightClass} w-full relative shrink-0 overflow-hidden transition-all duration-200`}>
        <LiveMap
          pickupCoords={mapPickup}
          destinationCoords={mapDest}
          captainCoords={mapCaptainCoords}
          captainLabel={
            assignedCaptain
              ? `${assignedCaptain.fullname.firstname} (${assignedCaptain.vehicle.plate})`
              : undefined
          }
          routeGeometry={mapGeometry}
          showFleetMarkers={false}
          onMapClick={handleMapClickSelect}
          interactiveHint={
            !activeRide
              ? bookingStep === 'route'
                ? 'Tap map to fine-tune your Chennai pickup pin'
                : !pickupCoords
                  ? 'Tap map or select below to set Pick-up pin'
                  : !destinationCoords
                    ? 'Tap map or select below to set Drop-off pin'
                    : `Tap map to adjust ${activeField === 'pickup' ? 'Pick-up' : 'Drop-off'} in Chennai`
              : undefined
          }
        />

        {/* Floating Current-Location Button on Map */}
        <button
          type="button"
          onClick={handleUseDeviceGps}
          data-testid="use-device-gps-btn"
          title="Use current Chennai GPS location"
          className="absolute bottom-2 right-2.5 z-10 min-h-[32px] px-3 py-1 rounded-full bg-[#181B22]/95 hover:bg-[#252932] text-[#E2FF44] shadow-md border border-[#E2FF44]/40 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <LocateFixed className="w-3.5 h-3.5 text-[#E2FF44]" />
          <span>GPS</span>
        </button>
      </div>

      {/* Contextual Obsidian Bottom Sheet Area */}
      <div className="flex-1 bg-[#0B0D12] border-t border-white/10 flex flex-col overflow-y-auto no-scrollbar px-3.5 py-2.5">
        {bookingError && (
          <div
            role="alert"
            data-testid="service-area-error-banner"
            className="mb-2 p-2.5 rounded-2xl bg-red-950/80 border border-red-500/40 text-xs text-red-200 flex items-center justify-between gap-2"
          >
            <span>{bookingError}</span>
            <button
              type="button"
              onClick={() => setBookingError(null)}
              aria-label="Dismiss error"
              className="p-1 text-red-300 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {gpsStatusNotice && (
          <div
            role="status"
            data-testid="gps-fallback-notice"
            className="mb-2 p-2 rounded-2xl bg-[#1C1F26] border border-[#E2FF44]/40 text-[11px] text-[#E2FF44] flex items-center justify-between gap-2"
          >
            <span>{gpsStatusNotice}</span>
            <button
              type="button"
              onClick={() => setGpsStatusNotice(null)}
              aria-label="Dismiss GPS notice"
              className="p-0.5 text-slate-300 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* STAGE 08 · Trip Completed: Confirmed Final Fare, Summary & Rate Driver */}
        {completedRideToRate ? (
          <form onSubmit={handlePayAndRate} className="space-y-3">
            {/* Chartreuse Arrival / Completion Header Banner */}
            <div className="bg-[#E2FF44] text-[#0B0D12] rounded-2xl px-3.5 py-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider">
                  08 · Trip Completed
                </span>
                <h2 className="text-sm font-extrabold">
                  Final Fare &amp; Rate Your Captain
                </h2>
              </div>
              <span className="font-mono text-base font-extrabold bg-[#0B0D12] text-[#E2FF44] px-3 py-1 rounded-full tabular-nums">
                ₹{completedRideToRate.fare.toFixed(2)}
              </span>
            </div>

            <div className="bg-[#181B22] rounded-2xl p-3 space-y-1.5 text-xs border border-white/10">
              <div className="flex justify-between text-slate-400">
                <span>Base Fare (INR)</span>
                <span className="font-mono text-white tabular-nums">
                  ₹{completedRideToRate.fareBreakdown?.baseFare.toFixed(2) || '60.00'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>
                  Distance ({(completedRideToRate.distance / 1000).toFixed(2)} km)
                </span>
                <span className="font-mono text-white tabular-nums">
                  ₹{completedRideToRate.fareBreakdown?.distanceFare.toFixed(2) || '95.58'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>
                  Duration ({Math.max(1, Math.round(completedRideToRate.duration / 60))} mins)
                </span>
                <span className="font-mono text-white tabular-nums">
                  ₹{completedRideToRate.fareBreakdown?.timeFare.toFixed(2) || '30.00'}
                </span>
              </div>
              <div className="border-t border-white/10 pt-1.5 flex justify-between font-bold text-[#E2FF44]">
                <span>Confirmed Final Fare (INR)</span>
                <span className="font-mono tabular-nums">
                  ₹{completedRideToRate.fare.toFixed(2)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Card', 'Cash', 'Wallet'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`min-h-[36px] rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                      paymentMethod === method
                        ? 'bg-[#E2FF44] text-[#0B0D12] border-[#E2FF44]'
                        : 'bg-[#181B22] text-slate-300 border-white/10 hover:bg-[#252932]'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Rate Your Captain
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Rate ${star} stars`}
                    onClick={() => setRatingValue(star)}
                    className={`min-h-[38px] min-w-[38px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                      star <= ratingValue
                        ? 'bg-[#E2FF44]/20 border-[#E2FF44] text-[#E2FF44]'
                        : 'bg-[#181B22] border-white/10 text-slate-600'
                    }`}
                  >
                    <Star className="w-4 h-4 fill-current" />
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={ratingFeedback}
              onChange={(e) => setRatingFeedback(e.target.value)}
              placeholder="Optional compliment or trip feedback..."
              className="w-full px-3.5 py-2 rounded-full bg-[#181B22] border border-white/10 text-xs text-white focus:outline-none focus:border-[#E2FF44]"
            />

            <button
              type="submit"
              disabled={bookingBusy}
              className="w-full min-h-[44px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
            >
              {bookingBusy ? 'Submitting...' : 'Submit Rating & Return Home'}
            </button>
          </form>
        ) : activeRide && ['pending', 'accepted', 'ongoing'].includes(activeRide.status) ? (
          /* STAGES 05, 06, 07 · Reference Screen 2 & Screen 3 Layered Chartreuse + Obsidian Active Ride Card */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between" aria-live="polite">
            <div className="space-y-2">
              {/* Compact Dual Location Pill Container (from Reference Screen 2) */}
              <div className="bg-[#252932] rounded-[20px] p-2 space-y-1.5 border border-white/5">
                <div className="bg-[#0D0F14] rounded-full px-3 py-1.5 flex items-center gap-2.5">
                  <MapPin className="w-3.5 h-3.5 text-[#E2FF44] shrink-0" />
                  <p className="text-[11px] text-slate-200 font-medium truncate">
                    {activeRide.pickup}
                  </p>
                </div>
                <div className="bg-[#0D0F14] rounded-full px-3 py-1.5 flex items-center gap-2.5">
                  <Navigation className="w-3.5 h-3.5 text-[#E2FF44] shrink-0" />
                  <p className="text-[11px] text-slate-200 font-medium truncate">
                    {activeRide.destination}
                  </p>
                </div>
              </div>

              {/* Layered Chartreuse Arrival Banner + Dark Obsidian Driver Card (Reference Screen 2) */}
              <div className="pt-0.5">
                <div className="bg-[#E2FF44] text-[#0B0D12] rounded-t-[24px] px-4 pt-2.5 pb-5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                      {activeRide.status === 'pending' && '05 · Finding a Driver'}
                      {activeRide.status === 'accepted' && '06 · Driver Assigned'}
                      {activeRide.status === 'ongoing' && '07 · Trip in Progress'}
                    </p>
                    <h2 className="text-xs font-extrabold">
                      {activeRide.status === 'pending' && 'Finding your driver…'}
                      {activeRide.status === 'accepted' &&
                        `The driver will arrive in (${assignedCaptain?.fullname.firstname || 'Captain'} is arriving)`}
                      {activeRide.status === 'ongoing' && 'En route to destination'}
                    </h2>
                  </div>
                  <span className="bg-[#1C1F26] text-[#E2FF44] font-mono text-xs font-extrabold px-3 py-1 rounded-full shrink-0">
                    {activeRide.status === 'pending'
                      ? 'Matching…'
                      : activeRide.status === 'accepted'
                        ? `${activeRide.matchExplanation?.etaMinutes ?? 2} min`
                        : isLocationStale
                          ? 'GPS Stale'
                          : 'Live GPS'}
                  </span>
                </div>

                {/* Overlapping Obsidian Card */}
                <div className="-mt-3 bg-[#14171F] rounded-[24px] p-3 border border-white/10 space-y-2.5 shadow-xl">
                  {/* Driver Pill with White License Plate Badge (Reference Screen 2 & 3) */}
                  {assignedCaptain ? (
                    <div className="bg-[#252932] rounded-2xl p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-[#E2FF44] text-[#0B0D12] font-extrabold text-xs flex items-center justify-center shrink-0">
                          {assignedCaptain.fullname.firstname.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-white truncate">
                            {assignedCaptain.fullname.firstname}{' '}
                            {assignedCaptain.fullname.lastname || ''}
                          </h3>
                          <p className="text-[11px] text-slate-400 truncate">
                            {assignedCaptain.vehicle.color}{' '}
                            {assignedCaptain.vehicle.model || assignedCaptain.vehicle.vehicleType}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block bg-white text-[#0B0D12] font-mono text-[11px] font-extrabold px-2.5 py-1 rounded-full">
                          {assignedCaptain.vehicle.plate}
                        </span>
                        <p className="text-[10px] text-[#E2FF44] font-semibold mt-0.5">
                          ★ {assignedCaptain.metrics.rating.toFixed(1)} ·{' '}
                          {assignedCaptain.metrics.completedRides} trips
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#252932] rounded-2xl p-2.5 space-y-1">
                      <p className="text-xs font-bold text-white">
                        Connecting with nearby Chennai captains…
                      </p>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {activeRide.matchExplanation?.explanation ||
                          'Broadcasting ride request to active Chennai captains...'}
                      </p>
                    </div>
                  )}

                  {/* 6-Digit Pickup OTP + Price Row + Top-Down Vehicle Graphic (Reference Screen 3) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      {activeRide.status !== 'ongoing' && activeRide.otp && (
                        <div className="bg-[#0B0D12] border border-[#E2FF44]/40 rounded-2xl p-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-[#E2FF44] shrink-0" />
                            <div>
                              <p className="text-[10px] font-bold text-white">
                                Pickup Verification OTP
                              </p>
                              <p className="text-[9px] text-slate-400">
                                Share with captain
                              </p>
                            </div>
                          </div>
                          <span
                            data-testid="passenger-otp-code"
                            className="font-mono text-sm font-extrabold tracking-widest text-[#E2FF44] tabular-nums"
                          >
                            {activeRide.otp}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between bg-[#1C1F26] rounded-2xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-white text-[#0B0D12] flex items-center justify-center shrink-0">
                            <Car className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white capitalize">
                              {activeRide.vehicleType === 'car'
                                ? 'CabSafe Go · Sedan'
                                : activeRide.vehicleType === 'cng'
                                  ? 'CabSafe Auto · 3 Seat'
                                  : 'CabSafe Moto · 1 Seat'}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              98% safety rating · INR
                            </p>
                          </div>
                        </div>
                        <span className="bg-[#252932] text-white font-mono text-sm font-extrabold px-3 py-1 rounded-xl tabular-nums">
                          ₹{activeRide.fare.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 hidden xs:flex items-center justify-center">
                      <TopDownCarSvg
                        vehicleType={activeRide.vehicleType}
                        className="w-12 h-24"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Reference Screen 2/3 Bottom Pill Action Bar */}
            {['pending', 'accepted'].includes(activeRide.status) ? (
              <button
                type="button"
                disabled={bookingBusy}
                onClick={handleCancelRide}
                className="w-full bg-[#252932] hover:bg-red-950/80 border border-white/10 rounded-full p-1.5 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <span className="w-9 h-9 rounded-full bg-[#E2FF44] text-[#0B0D12] flex items-center justify-center shrink-0">
                  <X className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-white group-hover:text-red-200">
                  {bookingBusy ? 'Cancelling...' : 'Cancel Ride Request'}
                </span>
                <ChevronsRight className="w-4 h-4 text-slate-400 mr-2" />
              </button>
            ) : (
              <div className="w-full bg-[#252932] border border-white/10 rounded-full p-1.5 flex items-center justify-between">
                <span className="w-9 h-9 rounded-full bg-[#E2FF44] text-[#0B0D12] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-white">
                  Live Trip Telemetry Active
                </span>
                <ChevronsRight className="w-4 h-4 text-[#E2FF44] mr-2" />
              </div>
            )}
          </div>
        ) : bookingStep === 'home' ? (
          /* STAGE 01 · Home Map: Reference Screen 1 ("Where do you want to go?", Driver Spotlight, Dual Stacked Location Card) */
          <div className="space-y-2 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              {/* Editorial Display Heading + "Where to?" Trigger */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h1 className="text-lg font-extrabold tracking-tight text-white font-display leading-tight">
                    Where do you
                    <br />
                    want to go?
                  </h1>
                </div>
                <button
                  type="button"
                  data-testid="where-to-trigger"
                  onClick={() => {
                    setActiveField(!pickupCoords ? 'pickup' : 'destination');
                    setBookingStep('search');
                  }}
                  className="px-3.5 py-2 rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-xs flex items-center gap-1.5 shadow-md transition-colors cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Where to?</span>
                </button>
              </div>

              {/* Driver / Captain Spotlight Pill (Reference Screen 1) */}
              {spotlightCaptain && (
                <div className="bg-[#1C1F26] border border-white/5 rounded-2xl px-3 py-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#E2FF44] text-[#0B0D12] font-extrabold text-xs flex items-center justify-center shrink-0">
                      {spotlightCaptain.fullname.firstname.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {spotlightCaptain.fullname.firstname}{' '}
                        {spotlightCaptain.fullname.lastname || ''}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {spotlightCaptain.vehicle.model || 'Toyota Camry Hybrid'} ·{' '}
                        {spotlightCaptain.vehicle.plate}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 text-[#E2FF44] shrink-0">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="w-3 h-3 fill-current" />
                    ))}
                  </div>
                </div>
              )}

              {/* Dual Stacked Location Card with Center Swap Button (Reference Screen 1 & 2) */}
              <div className="relative bg-[#252932] rounded-[22px] p-2 space-y-1.5 border border-white/10">
                <div
                  onClick={() => {
                    setActiveField('pickup');
                    setBookingStep('search');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveField('pickup');
                      setBookingStep('search');
                    }
                  }}
                  data-testid="home-pickup-pill"
                  className={`w-full bg-[#0D0F14] hover:bg-[#141720] rounded-full px-3 py-1.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer border ${
                    !pickupCoords && activeField === 'pickup'
                      ? 'border-[#E2FF44]/60'
                      : 'border-transparent'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-[#1C1F26] flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-[#E2FF44]" />
                  </span>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                      Pick-up Location
                    </p>
                    <p
                      className={`text-xs font-semibold truncate ${
                        pickup ? 'text-white' : 'text-slate-400'
                      }`}
                    >
                      {pickup || 'Add a pick-up location'}
                    </p>
                  </div>
                </div>

                {/* Center Overlapping Swap Button */}
                <button
                  type="button"
                  onClick={handleSwapLocations}
                  aria-label="Swap pickup and destination"
                  title="Swap pickup and destination"
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-[#1C1F26] hover:bg-[#E2FF44] text-slate-200 hover:text-[#0B0D12] border-2 border-[#252932] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>

                <div
                  onClick={() => {
                    setActiveField('destination');
                    setBookingStep('search');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveField('destination');
                      setBookingStep('search');
                    }
                  }}
                  data-testid="home-destination-pill"
                  className={`w-full bg-[#0D0F14] hover:bg-[#141720] rounded-full px-3 py-1.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer border ${
                    pickupCoords && !destinationCoords
                      ? 'border-[#E2FF44]/60'
                      : 'border-transparent'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-[#1C1F26] flex items-center justify-center shrink-0">
                    <Navigation className="w-3.5 h-3.5 text-[#E2FF44]" />
                  </span>
                  <div className="min-w-0 flex-1 pr-6">
                    <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                      Destination
                    </p>
                    <p
                      className={`text-xs font-semibold truncate ${
                        destination ? 'text-white' : 'text-slate-400'
                      }`}
                    >
                      {destination || 'Add your destination'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reference Mode Pill Selector ("Driver" Chartreuse Pill + Saved Localities) */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveField('pickup');
                    setBookingStep('search');
                  }}
                  className={`min-h-[34px] rounded-full font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-colors ${
                    !pickupCoords
                      ? 'bg-[#E2FF44] text-[#0B0D12]'
                      : 'bg-[#1C1F26] text-[#E2FF44] border border-[#E2FF44]/40'
                  }`}
                >
                  {pickupCoords ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  <span>{pickupCoords ? 'Pick-up Set' : '1. Set Pick-up'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveField('destination');
                    setBookingStep('search');
                  }}
                  className={`min-h-[34px] rounded-full font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    pickupCoords && !destinationCoords
                      ? 'bg-[#E2FF44] text-[#0B0D12]'
                      : destinationCoords
                        ? 'bg-[#1C1F26] text-[#E2FF44] border border-[#E2FF44]/40'
                        : 'bg-[#1C1F26] hover:bg-[#252932] text-slate-200 border border-white/5'
                  }`}
                >
                  {destinationCoords ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Compass className="w-3.5 h-3.5" />
                  )}
                  <span>{destinationCoords ? 'Drop-off Set' : '2. Set Drop-off'}</span>
                </button>
              </div>

              {/* Quick Chennai Localities (Zero inner scrollbar) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {!pickupCoords
                      ? 'Select Pick-up Locality in Chennai'
                      : !destinationCoords
                        ? 'Select Drop-off Locality in Chennai'
                        : 'Saved Chennai Localities'}
                  </p>
                  <span className="text-[10px] font-mono text-[#E2FF44]">
                    {!pickupCoords ? 'Step 1 of 2' : !destinationCoords ? 'Step 2 of 2' : 'Ready'}
                  </span>
                </div>
                <div className="space-y-1">
                  {landmarks.slice(0, 2).map((item) => (
                    <button
                      key={item.placeId}
                      type="button"
                      onClick={() => {
                        const coords = { lat: item.lat, lon: item.lon };
                        handleSelectLocationOption(
                          item.display_name,
                          coords,
                          item.inServiceArea === false
                        );
                      }}
                      className="w-full px-3 py-1.5 rounded-xl bg-[#181B22]/80 hover:bg-[#252932] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-100 truncate">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {item.display_name}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-[#E2FF44] shrink-0">
                        {!pickupCoords ? 'Set Pick-up' : 'Set Drop-off'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={bookingBusy}
              onClick={() => {
                if (!pickupCoords) {
                  setActiveField('pickup');
                  setBookingStep('search');
                } else if (!destinationCoords) {
                  setActiveField('destination');
                  setBookingStep('search');
                } else {
                  handleFindTrip('route');
                }
              }}
              className="w-full min-h-[40px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-xs transition-colors cursor-pointer"
            >
              {bookingBusy
                ? 'Loading Route...'
                : !pickupCoords
                  ? 'Choose Pick-up Location'
                  : !destinationCoords
                    ? 'Choose Drop-off Location'
                    : 'Preview Current Route & Fares'}
            </button>
          </div>
        ) : bookingStep === 'search' ? (
          /* STAGE 02 · Choose Destination: Dual Recessed Input Pills + Debounced Chennai Suggestions */
          <div className="space-y-2 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setBookingStep('home')}
                  className="text-xs font-bold text-slate-300 hover:text-[#E2FF44] flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Map</span>
                </button>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E2FF44]">
                  {activeField === 'pickup' ? '02 · Choose Pick-up' : '02 · Choose Drop-off'}
                </span>
              </div>

              {/* Dual Stacked Location Container from Reference Screen 1 & 2 */}
              <div className="relative bg-[#252932] rounded-[22px] p-2 space-y-1.5 border border-white/10">
                <div className="relative">
                  <MapPin className="w-4 h-4 text-[#E2FF44] absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    aria-label="Pickup location"
                    value={pickup}
                    onFocus={() => setActiveField('pickup')}
                    onChange={(e) => {
                      setPickup(e.target.value);
                      setPickupCoords(null);
                      setFareEstimate(null);
                      setActiveField('pickup');
                    }}
                    placeholder="Add a pick-up location in Chennai"
                    className={`w-full pl-9 pr-9 py-2 rounded-full bg-[#0D0F14] border text-xs font-medium text-white focus:outline-none ${
                      activeField === 'pickup' ? 'border-[#E2FF44]' : 'border-transparent'
                    }`}
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSwapLocations}
                  aria-label="Swap pickup and destination"
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-[#1C1F26] hover:bg-[#E2FF44] text-white hover:text-[#0B0D12] border-2 border-[#252932] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>

                <div className="relative">
                  <Navigation className="w-4 h-4 text-[#E2FF44] absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    aria-label="Destination location"
                    value={destination}
                    onFocus={() => setActiveField('destination')}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      setDestinationCoords(null);
                      setFareEstimate(null);
                      setActiveField('destination');
                    }}
                    placeholder="Add your destination in Chennai"
                    className={`w-full pl-9 pr-9 py-2 rounded-full bg-[#0D0F14] border text-xs font-medium text-white focus:outline-none ${
                      activeField === 'destination' ? 'border-[#E2FF44]' : 'border-transparent'
                    }`}
                  />
                </div>
              </div>

              {/* Suggestions List */}
              <div className="pt-0.5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-medium text-slate-400">
                    {activeField === 'destination'
                      ? 'Select Chennai drop-off or tap map'
                      : 'Select Chennai pick-up or tap map'}
                  </p>
                  <span className="text-[10px] font-mono text-[#E2FF44]">
                    {searchingSuggestions ? 'Searching…' : 'Chennai Biased'}
                  </span>
                </div>
                <div className="space-y-1 max-h-[145px] overflow-y-auto no-scrollbar">
                  {suggestions.map((item) => {
                    const isOutside = item.inServiceArea === false;
                    return (
                      <button
                        key={item.placeId}
                        type="button"
                        onClick={() => {
                          const coords = { lat: item.lat, lon: item.lon };
                          handleSelectLocationOption(
                            item.display_name,
                            coords,
                            isOutside,
                            activeField
                          );
                        }}
                        className="w-full text-left px-3 py-1.5 rounded-xl bg-[#181B22]/80 hover:bg-[#252932] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {item.display_name}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-mono shrink-0 ${
                            isOutside ? 'text-red-400 font-semibold' : 'text-[#E2FF44]'
                          }`}
                        >
                          {item.category}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={bookingBusy}
              onClick={() => handleFindTrip('route')}
              className="w-full min-h-[42px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
            >
              {bookingBusy ? 'Validating Zone & Route...' : 'Confirm Pickup & Route'}
            </button>
          </div>
        ) : bookingStep === 'route' && fareEstimate ? (
          /* STAGE 03 · Confirm Pickup & Route Sheet */
          <div className="space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E2FF44]">
                    03 · Confirm Pickup &amp; Route
                  </span>
                  <h2 className="text-base font-extrabold text-white">
                    Review Route on Chennai Map
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setBookingStep('search')}
                  className="text-xs font-bold text-[#E2FF44] hover:underline cursor-pointer"
                >
                  Edit Addresses
                </button>
              </div>

              <div className="bg-[#252932] rounded-[22px] p-3 space-y-2 text-xs border border-white/10">
                <div className="flex items-center justify-between font-mono text-[#E2FF44] border-b border-white/10 pb-2">
                  <span>Estimated Distance: {fareEstimate.distance.text}</span>
                  <span>Duration: {fareEstimate.duration.text}</span>
                </div>
                <div className="bg-[#0D0F14] rounded-full px-3 py-2 flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-[#E2FF44] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase text-slate-400">
                      Pickup Pin (Tap map to adjust if needed)
                    </p>
                    <p className="font-semibold text-white truncate">{pickup}</p>
                  </div>
                </div>
                <div className="bg-[#0D0F14] rounded-full px-3 py-2 flex items-center gap-2.5">
                  <Navigation className="w-4 h-4 text-[#E2FF44] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase text-slate-400">
                      Destination
                    </p>
                    <p className="font-semibold text-white truncate">{destination}</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setBookingStep('vehicle')}
              className="w-full min-h-[44px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
            >
              Choose a Ride Option
            </button>
          </div>
        ) : (
          /* STAGE 04 · Select a Ride: Reference Screen 1 Tall Vehicle Cards + Screen 3 Top-Down Vehicle Specs */
          <div className="space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E2FF44]">
                    04 · Select a Ride
                  </span>
                  <h2 className="text-base font-extrabold text-white">Choose a ride</h2>
                  {fareEstimate && (
                    <p className="text-[11px] text-slate-400 font-mono">
                      {fareEstimate.distance.text} · {fareEstimate.duration.text}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBookingStep('route')}
                  className="text-xs font-bold text-slate-300 hover:text-[#E2FF44] cursor-pointer"
                >
                  Back to Route
                </button>
              </div>

              {/* Reference Screen 1: 3 Tall Side-by-Side Vehicle Tier Cards */}
              {fareEstimate && (
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'car' as VehicleType,
                        title: 'CabSafe Go',
                        subtitle: 'Sedan · 2m',
                        seats: '4',
                        icon: Car,
                      },
                      {
                        id: 'cng' as VehicleType,
                        title: 'CabSafe Auto',
                        subtitle: 'Auto · 3m',
                        seats: '3',
                        icon: Zap,
                      },
                      {
                        id: 'motorcycle' as VehicleType,
                        title: 'CabSafe Moto',
                        subtitle: 'Moto · 1m',
                        seats: '1',
                        icon: Bike,
                      },
                    ] as const
                  ).map((tier) => {
                    const Icon = tier.icon;
                    const active = selectedVehicle === tier.id;
                    const price = fareEstimate.fares[tier.id];
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setSelectedVehicle(tier.id)}
                        className={`p-2.5 rounded-[20px] border text-left flex flex-col justify-between min-h-[112px] transition-all cursor-pointer ${
                          active
                            ? 'bg-[#323642] border-[#E2FF44]'
                            : 'bg-[#181B22] border-white/5 hover:border-white/20'
                        }`}
                      >
                        <div>
                          <p
                            className={`text-xs font-extrabold truncate ${
                              active ? 'text-[#E2FF44]' : 'text-white'
                            }`}
                          >
                            {tier.title}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {tier.subtitle}
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-slate-300 mt-1.5">
                            <Users className="w-3 h-3 text-[#E2FF44]" />
                            <span>{tier.seats} seats</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/10">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-[#E2FF44] text-[#0B0D12]'
                                : 'bg-[#0B0D12] text-white'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <span className="font-mono text-xs font-extrabold text-white tabular-nums">
                            ₹{price.toFixed(2)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Reference Screen 3: Bento Spec Tiles + Top-Down Vehicle Graphic */}
              <div className="bg-[#14171F] border border-white/10 rounded-[20px] p-2.5 flex items-center justify-between gap-3">
                <div className="flex-1 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-[#1C1F26] rounded-xl px-2.5 py-1.5 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-[#E2FF44]" />
                      <span className="text-[11px] font-bold text-white">
                        {selectedVehicle === 'car'
                          ? '4 Seat'
                          : selectedVehicle === 'cng'
                            ? '3 Seat'
                            : '1 Seat'}
                      </span>
                    </div>
                    <div className="bg-[#1C1F26] rounded-xl px-2.5 py-1.5 flex items-center gap-2">
                      <Compass className="w-3.5 h-3.5 text-[#E2FF44]" />
                      <span className="text-[11px] font-bold text-white">
                        {spotlightCaptain?.metrics.completedRides || 148} Trips
                      </span>
                    </div>
                  </div>
                  <div className="bg-[#1C1F26] rounded-xl px-2.5 py-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300 font-semibold">
                        98% user safety rating
                      </span>
                      <span className="font-mono text-[#E2FF44] font-bold">
                        ★ {spotlightCaptain?.metrics.rating.toFixed(1) || '4.9'}
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[#0B0D12] overflow-hidden">
                      <div className="w-[98%] h-full rounded-full bg-[#E2FF44]" />
                    </div>
                  </div>
                </div>
                <div className="shrink-0 pr-1">
                  <TopDownCarSvg
                    vehicleType={selectedVehicle}
                    className="w-12 h-22"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={bookingBusy || !fareEstimate}
              onClick={handleCreateRide}
              className="w-full min-h-[44px] rounded-full bg-[#E2FF44] hover:bg-[#d4f235] disabled:bg-slate-700 text-[#0B0D12] font-extrabold text-sm transition-colors cursor-pointer"
            >
              {bookingBusy
                ? 'Requesting Ride...'
                : `Confirm ${
                    selectedVehicle === 'car'
                      ? 'CabSafe Go'
                      : selectedVehicle === 'cng'
                        ? 'CabSafe Auto'
                        : 'CabSafe Moto'
                  }${fareEstimate ? ` · ₹${fareEstimate.fares[selectedVehicle].toFixed(2)}` : ''}`}
            </button>
          </div>
        )}
      </div>

      {/* Slide-Over Drawer: Trip History & Receipts */}
      {drawer === 'history' && (
        <div className="absolute inset-0 z-30 bg-[#0B0D12] text-white flex flex-col">
          <div className="h-[52px] px-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">My Trips &amp; Receipts</h2>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              aria-label="Close Trip History"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1C1F26] text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {rideHistory.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-medium text-slate-400">No trips recorded yet.</p>
              </div>
            ) : (
              rideHistory.map((item) => (
                <div
                  key={item._id}
                  className="bg-[#181B22] border border-white/10 rounded-2xl p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#E2FF44] uppercase">
                      {item.vehicleType} · {item.status}
                    </span>
                    <span className="font-mono font-extrabold text-white tabular-nums">
                      ₹{item.fare.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-slate-300 truncate">From: {item.pickup}</p>
                  <p className="text-slate-300 truncate">To: {item.destination}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/10">
                    <span>
                      {(item.distance / 1000).toFixed(2)} km · {item.paymentMethod} (
                      {item.paymentStatus})
                    </span>
                    {item.userRating ? (
                      <span className="text-[#E2FF44] font-semibold">
                        Rated {item.userRating}/5 ★
                      </span>
                    ) : (
                      <span>
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Slide-Over Drawer: Passenger Profile Management */}
      {drawer === 'profile' && (
        <div className="absolute inset-0 z-30 bg-[#0B0D12] text-white flex flex-col">
          <div className="h-[52px] px-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Passenger Profile</h2>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              aria-label="Close Profile"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1C1F26] text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSaveProfile} className="p-4 space-y-3.5 text-xs">
            {profileSavedMsg && (
              <div className="p-2.5 rounded-xl bg-[#1C1F26] border border-[#E2FF44]/40 text-[#E2FF44] flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>{profileSavedMsg}</span>
              </div>
            )}
            <div>
              <label className="block font-medium text-slate-400 mb-1">First Name</label>
              <input
                type="text"
                required
                minLength={3}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-400 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-400 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#181B22] border border-white/10 text-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-400 mb-1">Email (Verified)</label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-3.5 py-2.5 rounded-2xl bg-[#14171F] border border-white/5 text-slate-500"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-full bg-[#E2FF44] text-[#0B0D12] font-extrabold text-xs cursor-pointer"
            >
              Save Profile Changes
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
