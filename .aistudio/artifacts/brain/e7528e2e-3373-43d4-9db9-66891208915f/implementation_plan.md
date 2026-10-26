# Online Cab Booking (`dhanush190312/online-cab`) — Read-Only Audit & Implementation Plan

This document provides the complete, source-verified read-only audit of `https://github.com/dhanush190312/online-cab` and the prioritized engineering plan for both backend remediation and client (Android / Web) integration.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Critical Repairs Required Before Client Integration**:
> Source inspection confirmed **5 high-severity backend defects** that must be repaired before relying on the backend in production or mobile clients:
> 1. **Non-atomic ride confirmation (`ride.service.js`)**: `confirmRide` updates `{ _id: rideId }` without checking `{ status: 'pending', captain: null }`, allowing duplicate driver acceptance and arbitrary status resets.
> 2. **Unverified driver identity (`ride.controller.js` & `ride.service.js`)**: `POST /rides/confirm` trusts `req.body.captainId` instead of `req.captain._id`, and `GET /rides/start-ride` does not verify that `ride.captain` matches `req.captain._id`.
> 3. **Unauthenticated Socket.IO events (`socket.js`)**: `join` and `update-location-captain` accept arbitrary `userId` values with zero JWT verification.
> 4. **State-changing `GET` endpoints**: `GET /users/logout`, `GET /captains/logout`, and `GET /rides/start-ride` mutate database state over `GET` (and expose `otp` in URL query strings).
> 5. **Silent schema data loss & stale responses (`ride.model.js` & `ride.service.js`)**: `rideSchema` omits `vehicleType` (silently stripped on save), and `startRide`/`endRide` return pre-update Mongoose documents with stale `status` values.

---

## 1. Confirmed Repository Structure & Technology Stack

### Repository Layout (Verified via Git Clone)

- **Root Documentation**:
  - `readme.md`: REST API, Socket.IO event documentation, and Mongoose model overview.
  - `schema.md`: Mermaid ER diagram for `User`, `Captain`, `Ride`, and `BlacklistToken`.
  - `PROJECT_INSPECTION.md` & `CABSAFE_DEVELOPMENT_HANDOFF.md`: Prior inspection notes and AWS/DynamoDB + Explainable Matching handoff specification.
- **Backend (`/Backend` — CommonJS Node.js Server)**:
  - Entry & Config: `server.js` (HTTP server + DB init + Socket.IO init on `process.env.PORT || 4000`), `app.js` (Express app, CORS allowlist, cookie-parser, `/api/checkhealth`, route mounts), `socket.js` (Socket.IO server and room/socketId management), `db/db.js` (`mongoose.connect(process.env.DB_CONNECT)`).
  - Middleware: `middlewares/auth.middleware.js` (`authUser`, `authCaptain` using `jsonwebtoken` + `blacklistToken.model.js`).
  - Models: `models/user.model.js`, `models/captain.model.js`, `models/ride.model.js`, `models/blacklistToken.model.js`.
  - Routes: `routes/user.routes.js`, `routes/captain.routes.js`, `routes/ride.routes.js`, `routes/maps.routes.js`.
  - Controllers: `db/controllers/user.controller.js`, `db/controllers/captain.controller.js`, `db/controllers/ride.controller.js`, `db/controllers/maps.controller.js`.
  - Services: `services/user.service.js`, `services/captain.service.js`, `services/ride.service.js`, `services/maps.service.js`.
- **Frontend (`/Frontend` — ESM React + Vite SPA)**:
  - Entry & Config: `vite.config.js`, `tailwind.config.js`, `eslint.config.js`, `src/main.jsx`, `src/App.jsx`.
  - Context & Networking: `src/context/apiBase.js`, `src/context/http.js` (Axios with Bearer token interceptor), `src/context/SocketContext.jsx`, `src/context/socketBaseUrl.js`, `src/context/useSocket.js`, `src/context/UserContext.jsx`, `src/context/CaptainContext.jsx`.
  - Pages: `Start.jsx`, `UserLogin.jsx`, `UserSignup.jsx`, `UserLogout.jsx`, `UserProtectedWrapper.jsx`, `Home.jsx`, `Riding.jsx`, `CaptainLogin.jsx`, `CaptainSignup.jsx`, `CaptainHome.jsx`, `CaptainRiding.jsx`.
  - Components: `LiveTracking.jsx`, `LocationSearchPanel.jsx`, `VehiclePanel.jsx`, `ConfirmRide.jsx`, `LookingForDriver.jsx`, `WaitingForDriver.jsx`, `CaptainDetails.jsx`, `RidePopUp.jsx`, `ConfirmRidePopUp.jsx`, `FinishRide.jsx`, `layout/MobileFrame.jsx`.

### Confirmed Dependencies & Build/Test Execution

- **Backend (`Backend/package.json`)**: `express@^4.21.2`, `socket.io@^4.8.1`, `mongoose@^8.9.3`, `jsonwebtoken@^9.0.2`, `bcryptjs@^2.4.3`, `bcrypt@^5.1.1` (installed but unused in models), `express-validator@^7.2.1`, `axios@^1.11.0`, `cors@^2.8.5`, `cookie-parser@^1.4.7`, `dotenv@^16.4.7`.
  - *Scripts*: `"start": "node server.js"`, `"dev": "node --watch server.js"`, `"test": "echo \"Error: no test specified\" && exit 1"`.
  - *Test Execution Result*: Running `npm test` in `/Backend` exits with code `1` (`Error: no test specified`). No automated backend tests exist.
- **Frontend (`Frontend/package.json`)**: `react@^18.3.1`, `react-dom@^18.3.1`, `react-router-dom@^6.28.1`, `socket.io-client@^4.8.1`, `axios@^1.8.1`, `leaflet@^1.9.4`, `react-leaflet@^4.2.1`, `gsap@^3.13.0`, `@gsap/react@^2.1.2`, `remixicon@^4.6.0`, `vite@^6.0.5`, `tailwindcss@^3.4.17`.
  - *Build & Lint Execution Result*: `npm run build` succeeds in `2.65s` (`dist/assets/index-CWPFw_hQ.js` at `778.59 kB`); `npm run lint` passes with `0 errors, 2 warnings` (`react-refresh/only-export-components` on `CaptainContext.jsx` and `UserContext.jsx`).

---

## 2. Complete HTTP Endpoint Matrix

| Method | Path | Role | Auth Middleware | Query / Params | Request Body (Validated Fields) | Success Response | Actual Error Behavior in Source |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | None | None | None | `200 OK` `"Hello World"` | None |
| `GET` | `/api/checkhealth` | Public | None | None | None | `200 OK` `"ok"` | None |
| `POST` | `/users/register` | Passenger | None | None | `{ fullname: { firstname (min 3), lastname? }, email (isEmail), password (min 6) }` | `201 Created` `{ user, token }` (Note: does not set cookie) | `400` `{ errors: [...] }` or `{ error: "User already registered" }`; unhandled DB error crashes request |
| `POST` | `/users/login` | Passenger | None | None | `{ email (isEmail), password (min 6) }` | `200 OK` `{ user, token }` + sets `token` cookie (`httpOnly, secure, sameSite: 'none'`) | `400` `{ errors: [...] }`; `401` `{ error: "Invalid email or password" }` |
| `GET` | `/users/profile` | Passenger | `authUser` | None | None | `200 OK` `req.user` JSON | `401` `{ error: "Unauthorized" }` or `"Unauthorized: User not found"` |
| `GET` ⚠️ | `/users/logout` | Passenger | `authUser` | None | None | `200 OK` `{ message: "Logged out successfully" }` (blacklists token, clears cookie) | `401` `{ error: "Unauthorized" }`; **Bug**: `req.headers.authorization.split(" ")[1]` throws `TypeError` if no cookie and no header (though `authUser` guards first) |
| `POST` | `/captains/register` | Captain | None | None | `{ fullname: { firstname (min 3), lastname? }, email, password (min 6), vehicle: { color (min 3), plate (min 3), capacity (int >=1), vehicleType (min 3) } }` | `201 Created` `{ token, captain }` | `400` `{ errors: [...] }` or `{ message: "Captain already exist" }` |
| `POST` | `/captains/login` | Captain | None | None | `{ email (isEmail), password (min 6) }` | `200 OK` `{ captain, token }` + sets cookie + updates captain `status: "active"` in DB | `400` `{ errors: [...] }` or `{ error: "Invalid email or password" }` (wrong password); `404` `{ error: "Invalid email or password" }` (unknown email — **user enumeration leak**) |
| `GET` | `/captains/profile` | Captain | `authCaptain` | None | None | `200 OK` `req.captain` JSON | `401` `{ error: "Unauthorized captain" }` |
| `GET` ⚠️ | `/captains/logout` | Captain | `authCaptain` | None | None | `200 OK` `{ message: "Logged out successfully" }` + sets `status: "inactive", socketId: null` | `401` `{ error: "Unauthorized captain" }` |
| `GET` | `/maps/get-coordinates` | Passenger | `authUser` | `?address=<string, min 3>` | None | `200 OK` `{ lat: number, lon: number }` (via Nominatim) | `400` `{ errors: [...] }`; `401` if captain/unauth; `404` `{ message: "Coordinates not found" }` |
| `GET` | `/maps/get-distance-time` | Passenger | `authUser` | `?origin=<str>&destination=<str>` | None | `200 OK` `{ distance: { text, value }, duration: { text, value } }` (via Nominatim + OSRM) | `400` `{ errors: [...] }`; `404` `{ message: "Distance and time not found" }` |
| `GET` | `/maps/get-suggestions` | Passenger | `authUser` | `?input=<str>` | None | `200 OK` `Array<{ name, city, country, lat, lon, display_name, placeId }>` (via Photon) | `400` `{ errors: [...] }`; `500` `{ message: "Suggestions not found" }` |
| `POST` | `/rides/create` | Passenger | `authUser` | None | `{ pickup (min 3), destination (min 3), vehicleType ('car'\|'cng'\|'motorcycle') }` | `201 Created` `ride` JSON (**includes `otp`**), then asynchronously geocodes pickup and emits `new-ride` to captains within `2000` km | `400` `{ errors: [...] }`; `500` `{ message: "Failed to create ride", error }` (Note: if post-response geocoding throws after `res.status(201).json(ride)`, controller attempts `res.status(500)` causing `ERR_HTTP_HEADERS_SENT`!) |
| `GET` | `/rides/get-fare` | Passenger | `authUser` | `?pickup=<min 3>&destination=<min 3>` | None | `200 OK` `{ car: number, cng: number, motorcycle: number }` | `400` `{ message: "Pickup and destination are required" }` (Note: `rideController.getFare` does **not** check `validationResult(req)`!); `500` `{ message: "Failed to calculate fare" }` |
| `POST` | `/rides/confirm` | Captain | `authCaptain` | None | `{ rideId (MongoId), captainId (MongoId) }` | `200 OK` `captainRideResponse` (with `otp` deleted); emits `ride-confirmed` (with `otp`) to `ride.user.socketId` | `400` `{ errors: [...] }`; `404` `{ message: "Ride or user not found" }` (if `!ride.user.socketId`, **after** DB is already mutated!); `500` `{ message: "Failed to confirm ride in ride controller", error }` |
| `GET` ⚠️ | `/rides/start-ride` | Captain | `authCaptain` | `?rideId=<MongoId>&otp=<6 chars>` | None | `200 OK` `safeRideResponse` (with `otp` deleted, stale `status: 'accepted'`); emits `ride-started` to `ride.user.socketId` | `400` `{ errors: [...] }`; `404` `{ message: "Ride not found" }`; `500` `{ message: "Failed to start ride in ride controller", error }` |
| `POST` | `/rides/end-ride` | Captain | `authCaptain` | None | `{ rideId (MongoId) }` | `200 OK` `ride` (stale `status: 'ongoing'`); emits `ride-ended` to `ride.user.socketId` | `400` `{ errors: [...] }`; `404` `{ message: "Ride not found" }`; `500` `{ message: "Failed to end ride in ride controller", error }` |

*(⚠️ indicates a state-changing `GET` endpoint design flaw).*

---

## 3. Complete Socket.IO Event Matrix

| Event Name | Direction | Payload Schema | Authorization / Validation in `socket.js` | Recipient / Side Effect |
| :--- | :--- | :--- | :--- | :--- |
| `join` | Client → Server | `{ userId: string, userType: "user" \| "captain" }`, optional `ack` callback | **NONE** (No JWT check; only checks `if (!userId \|\| !userType)`). | Updates `userModel` (`{ socketId }`) or `captainModel` (`{ socketId, status: "active" }`); joins Socket.IO room `${userType}:${userId}`; calls `ack({ ok: true })`. |
| `user-join` | Client → Server | `{ userId: string }` | **NONE** | Legacy alias calling `handleJoin({ ...p, userType: "user" })`. |
| `captain-join` | Client → Server | `{ userId: string }` | **NONE** | Legacy alias calling `handleJoin({ ...p, userType: "captain" })`. |
| `update-location-captain` | Client → Server | `{ userId: string, location: { lat: number, lon: number } }`, optional `ack` | **NONE** (No JWT check, no check that socket belongs to `userId`, no lat/lon bounds check). | Updates `captainModel.findByIdAndUpdate(userId, { location: { type: "Point", coordinates: [lon, lat] } })`. **Note**: Does NOT broadcast location to the active rider's socket! |
| `update-location` | Client → Server | `{ userId: string, location: { lat: number, lon: number } }` | **NONE** | Alias for `update-location-captain`. |
| `disconnect` | Client → Server | `reason: string` | Built-in Socket.IO lifecycle | Runs `userModel.updateMany({ socketId }, { $unset: { socketId: 1 } })` and `captainModel.updateMany({ socketId }, { $unset: { socketId: 1 }, status: "inactive" })`. |
| `new-ride` | Server → Captain | `Ride` document populated with `user` (`otp` excluded via `select: false`) | Triggered inside `POST /rides/create` (`authUser`) | Sent via `io.to(captain.socketId).emit("new-ride", rideWithUser)` to all active captains within `2000` km radius. |
| `ride-confirmed` | Server → Passenger | `Ride` document populated with `user`, `captain`, and **`+otp`** | Triggered inside `POST /rides/confirm` (`authCaptain`) | Sent via `io.to(ride.user.socketId).emit("ride-confirmed", ride)`. |
| `ride-started` | Server → Passenger | `Ride` document populated with `user`, `captain`, and **`+otp`** (with stale `status: "accepted"`) | Triggered inside `GET /rides/start-ride` (`authCaptain`) | Sent via `io.to(ride.user.socketId).emit("ride-started", ride)`. |
| `ride-ended` | Server → Passenger | `Ride` document populated with `user` and `captain` (with stale `status: "ongoing"`) | Triggered inside `POST /rides/end-ride` (`authCaptain`) | Sent via `io.to(ride.user.socketId).emit("ride-ended", ride)`. |

---

## 4. Mapping Existing APIs to Android Features & Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   Minimal Android Architecture (MVVM)                      │
│                                                                            │
│  ┌──────────────────────────┐         ┌─────────────────────────────────┐  │
│  │ Jetpack Compose / UI     │         │ Foreground Location Service     │  │
│  │ • AuthScreens            │         │ • FusedLocationProviderClient   │  │
│  │ • PassengerHomeScreen    │         │ • Emits update-location-captain │  │
│  │ • CaptainHomeScreen      │         │   every 5–10s while online      │  │
│  │ • ActiveRideScreen       │         └────────────────┬────────────────┘  │
│  └────────────┬─────────────┘                          │                   │
│               ▼                                        ▼                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ViewModels + StateFlow (Unidirectional Data Flow)                    │  │
│  │ • AuthViewModel · PassengerRideViewModel · CaptainRideViewModel      │  │
│  └────────────┬────────────────────────────────────────┬────────────────┘  │
│               ▼                                        ▼                   │
│  ┌───────────────────────────────────┐   ┌──────────────────────────────┐  │
│  │ Retrofit2 + OkHttp3 Repository    │   │ SocketManager (Singleton)    │  │
│  │ • AuthInterceptor (Bearer JWT     │   │ • socket.io-client-java      │  │
│  │   from EncryptedSharedPreferences)│   │ • Auto re-emits "join" on    │  │
│  │ • UserApi / CaptainApi /          │   │   Socket.EVENT_CONNECT       │  │
│  │   RideApi / MapsApi               │   │ • Exposes SharedFlow<Event>  │  │
│  └───────────────────────────────────┘   └──────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### API-to-Android Feature Mapping

1. **Onboarding & Role-Based Authentication**:
   - *Endpoints*: `POST /users/register`, `POST /users/login`, `GET /users/profile`, `GET /users/logout`; `POST /captains/register`, `POST /captains/login`, `GET /captains/profile`, `GET /captains/logout`.
   - *Android Implementation*: Store the returned `token` and `userType` (`"user"` | `"captain"`) in `EncryptedSharedPreferences` (or Jetpack `DataStore`). Attach `Authorization: Bearer <token>` via an OkHttp `Interceptor` (do not rely on browser cookies on Android).
2. **Place Autocomplete & Route Preview**:
   - *Endpoints*: `GET /maps/get-suggestions?input=...`, `GET /maps/get-coordinates?address=...`, `GET /maps/get-distance-time?origin=...&destination=...`.
   - *Android Implementation*: Debounce search text inputs (`300ms` via Kotlin `Flow.debounce(300)`). **Limitation**: `/maps/*` routes only accept `authUser`, so the Captain Android view cannot call `/maps/*` unless the backend middleware is expanded.
3. **Fare Estimation & Ride Creation (Passenger)**:
   - *Endpoints*: `GET /rides/get-fare?pickup=...&destination=...`, `POST /rides/create`.
   - *Android Implementation*: Display estimates for `car`, `cng`, and `motorcycle`. On `POST /rides/create`, persist the returned `ride._id` and `ride.otp` locally so the passenger immediately has their OTP even before/after `ride-confirmed`.
4. **Driver Presence, Location Streaming & Ride Matching (Captain)**:
   - *Socket Events & Endpoints*: Emit `join` (`{ userId, userType: "captain" }`) on connect; stream GPS from an Android Foreground Service via `update-location-captain`; listen for `new-ride`; accept via `POST /rides/confirm`.
5. **OTP Handshake, Active Trip & Completion**:
   - *Socket Events & Endpoints*: Passenger receives `ride-confirmed` (displays captain details + `ride.otp`). Captain inputs passenger's 6-digit OTP calling `GET /rides/start-ride?rideId=...&otp=...`; passenger receives `ride-started`. Captain finishes trip via `POST /rides/end-ride`; passenger receives `ride-ended`.

---

## 5. Deep-Dive Investigation: Security & Reliability Evidence

### 5.1 OTP Disclosure Analysis
- **Database Model (`Backend/models/ride.model.js:46-50`)**: `otp` is configured with `select: false`.
- **Creation (`Backend/services/ride.service.js:48-63`)**: `rideModel.create(...)` returns the full in-memory Mongoose document including `otp` to `POST /rides/create` (safe, as the caller is the passenger).
- **Broadcast to Captains (`Backend/db/controllers/ride.controller.js:27`)**: `await rideModel.findById(ride._id).populate("user")` omits `+otp`, so `new-ride` socket payloads do **not** leak the OTP to captains.
- **Confirmation & Start (`Backend/services/ride.service.js:84-88, 104-108` vs `Backend/db/controllers/ride.controller.js:68-70, 93-95`)**:
  - `ride.service.js` explicitly queries `.select('+otp')` in both `confirmRide()` and `startRide()`.
  - `ride.controller.js` sends the full `ride` object (containing `otp`) to `ride.user.socketId` via `ride-confirmed`, and then strips `otp` from the HTTP response returned to the captain (`delete captainRideResponse.otp`).
  - **Residual Risk**: (1) `GET /rides/start-ride?rideId=...&otp=...` passes the 6-digit OTP in the URL query string, exposing it in HTTP logs. (2) Note that `PROJECT_INSPECTION.md` was written before the controller-level `delete captainRideResponse.otp` patch was added, so `ride.service.js` still returns the sensitive `+otp` field to any caller.

### 5.2 Driver Identity Validation Flaws
- **Unverified `captainId` in `POST /rides/confirm` (`Backend/db/controllers/ride.controller.js:54-57`)**:
  - Although the route uses `authMiddleware.authCaptain` (which sets `req.captain`), the controller extracts `const { rideId, captainId } = req.body;` and passes `captainId` to `rideService.confirmRide(rideId, captainId)` without checking `captainId === String(req.captain._id)`. Any authenticated captain can spoof another captain's ID.
- **Missing Captain Ownership Check in `GET /rides/start-ride` (`Backend/services/ride.service.js:100-118`)**:
  - `ride.controller.js` passes `captainId: req.captain._id` to `rideService.startRide({ rideId, otp, captainId: req.captain._id })`.
  - However, `ride.service.js` queries `await rideModel.findOne({ _id: rideId, otp })` and **never checks `ride.captain.equals(captainId)`**! Any captain with the `rideId` and `otp` can start another captain's ride.

### 5.3 Duplicate Ride Acceptance (Race Condition)
- **Source Evidence (`Backend/services/ride.service.js:77-81`)**:
  ```javascript
  const resp = await rideModel.findOneAndUpdate(
      { _id: rideId },
      { status: 'accepted', captain: captainId },
      { new: true }
  );
  ```
- **Impact**: Because the query filter only checks `{ _id: rideId }` instead of `{ _id: rideId, status: 'pending', captain: null }`, two or more captains tapping "Accept" concurrently will both receive `200 OK`, overwriting the assigned captain and emitting multiple `ride-confirmed` events with different drivers to the passenger. Even a `completed` or `ongoing` ride can be overwritten back to `accepted`.

### 5.4 Authorization of Location Updates & Socket Hijacking
- **Source Evidence (`Backend/socket.js:39-75`)**:
  - `initializeSocket(server)` attaches no JWT authentication middleware.
  - `handleJoin` accepts `{ userId, userType }` from any connected socket and immediately executes `userModel.findByIdAndUpdate(userId, { socketId: socket.id })` or `captainModel.findByIdAndUpdate(userId, { socketId: socket.id, status: "active" })`.
  - `handleUpdateLoc` accepts `{ userId, location: { lat, lon } }` from any socket and updates `captainModel.findByIdAndUpdate(userId, { location: { type: "Point", coordinates: [lon, lat] } })`.
- **Impact**: Any unauthenticated client can hijack a passenger's or captain's real-time notifications (`new-ride`, `ride-confirmed`, including the rider's `otp`!) by emitting `join` with their `userId`, or spoof any captain's GPS coordinates.

### 5.5 Valid Ride-State Transitions & Stale Return Values
- **Unenforced State Machine**:
  - `pending -> accepted`: Not enforced (`confirmRide` accepts any current status).
  - `accepted -> ongoing`: Enforced in `startRide` (`if (ride.status !== 'accepted')`), **but** `await rideModel.findByIdAndUpdate(rideId, { status: 'ongoing' })` does not update the local `ride` variable, so `startRide` returns `ride` with `status: 'accepted'`!
  - `ongoing -> completed`: Enforced in `endRide` (`if (ride.status !== 'ongoing')`), **but** `await rideModel.findByIdAndUpdate({ _id: rideId, captain: captain._id }, { status: 'completed' })` also returns the old `ride` instance with `status: 'ongoing'`!
  - `* -> cancelled`: Defined in `rideSchema` (`enum: ['pending', 'accepted', 'completed', 'ongoing', 'cancelled']`), but completely unimplemented in routes, controllers, and services.

### 5.6 State-Changing `GET` Endpoints (Design Risk)
- `GET /users/logout` (`Backend/routes/user.routes.js:18`): Blacklists JWT and mutates authentication state via `GET`.
- `GET /captains/logout` (`Backend/routes/captain.routes.js:24`): Blacklists JWT and sets captain `status: "inactive"` via `GET`.
- `GET /rides/start-ride` (`Backend/routes/ride.routes.js:28`): Mutates ride status from `accepted` to `ongoing`, triggers Socket.IO broadcasts, and transmits the secret `otp` in URL query parameters.

### 5.7 Additional Source-Verified Bugs
- **Post-Response Exception Crash in `POST /rides/create` (`Backend/db/controllers/ride.controller.js:19-41`)**: `res.status(201).json(ride)` is sent on line 19 *before* `await mapService.getAddressCoordinate(pickup)`. If Nominatim geocoding fails or rate-limits, execution jumps to `catch (error)` and calls `res.status(500).json(...)` after headers were already sent!
- **Missing `vehicleType` in `rideSchema` (`Backend/models/ride.model.js`)**: `ride.service.js` passes `vehicleType` to `rideModel.create()`, but `rideSchema` does not define `vehicleType`, so Mongoose silently drops it.
- **Un-broadcasted Captain Location**: When a captain emits `update-location-captain`, `socket.js` writes the coordinates to MongoDB, but **never emits the updated coordinates to the passenger** on an active ride.
- **Unrealistic `2000` km Broadcast Radius (`Backend/db/controllers/ride.controller.js:25`)**: `mapService.getCaptainsInTheRadius(pickupCoordinates.lat, pickupCoordinates.lon, 2000)` searches a 2,000 km radius and does not filter by `vehicle.vehicleType`.

---

## 6. Missing or Undocumented Backend Capabilities

1. **Active Ride Recovery Endpoint (`GET /rides/active`)**: Neither passenger nor captain can fetch their current in-progress ride (`pending`, `accepted`, `ongoing`) if the app restarts or the browser refreshes.
2. **Ride Cancellation Endpoint (`POST /rides/cancel`)**: No way for a passenger or captain to cancel a `pending` or `accepted` ride.
3. **Real-Time Driver Location Relay to Passenger**: `update-location-captain` saves to DB but does not push `captain-location-updated` to the matched passenger's socket.
4. **Trip History, Receipts & Ratings (`GET /rides/history`, `POST /rides/rate`, `POST /rides/pay`)**: No endpoints to list past rides, record payment completion, or rate captains.
5. **Captain Availability Toggle (`PATCH /captains/status`)**: Captains have no endpoint to toggle between `active` (online) and `inactive` (offline) without logging out.
6. **Captain Access to Map/Routing Endpoints**: `/maps/*` routes only allow `authUser`, blocking captains from fetching route polylines or reverse-geocoding.

---

## 7. Prioritized Implementation & Remediation Plan

### Phase A — Must Be Repaired First (P0 Security & State Integrity)
1. **Fix Atomic Ride Acceptance & Captain Identity Binding**:
   - In `confirmRide`, bind `captainId = req.captain._id` (ignore `req.body.captainId`) and use an atomic filter `{ _id: rideId, status: 'pending', captain: null }`, returning `409 Conflict` if already claimed.
   - In `startRide`, require `{ _id: rideId, captain: req.captain._id, status: 'accepted' }` and return the updated `{ new: true }` document (`status: 'ongoing'`).
   - In `endRide`, use `findOneAndUpdate({ _id: rideId, captain: req.captain._id, status: 'ongoing' }, { status: 'completed' }, { new: true })`.
2. **Authenticate Socket.IO & Relay Live Captain Coordinates**:
   - Validate JWT tokens during Socket.IO connection/join so clients can only join and update locations for their own authenticated identity, and relay `captain-location-updated` to the passenger of any `accepted`/`ongoing` ride.
3. **Fix Schema & Post-Response Crash in `createRide`**:
   - Add `vehicleType`, `pickupCoords`, `destinationCoords`, `distance`, `duration`, and `timestamps` to `rideSchema`, and guard post-response notification logic in `createRide` so geocoding errors cannot trigger `ERR_HTTP_HEADERS_SENT`.

### Phase B — Core Feature Completion (P1 Reliability & Missing Endpoints)
4. **Add Active Ride Recovery, Cancellation, History, Ratings & Captain Toggle**:
   - Implement `GET /rides/active`, `POST /rides/cancel`, `GET /rides/history`, `POST /rides/rate`, `POST /rides/pay`, and `PATCH /captains/status` (while keeping legacy `GET` logout/start-ride aliases alongside `POST` so existing clients do not break).
5. **Implement Explainable Multi-Factor Driver Matching & Resilient Geo Fallback**:
   - Rank active captains by distance ($W_d=0.45$), rating ($W_r=0.25$), completion rate ($W_c=0.20$), and vehicle compatibility ($W_v=0.10$), and add deterministic city-landmark geocoding/routing fallback when public Nominatim/OSRM endpoints rate-limit.

### Phase C — Frontend UX Remediation, Simulation Controls & Automated Tests (P2)
6. **Repair All Frontend Data Bindings & Add Role Switcher + `[SIMULATION]` Toolbar**:
   - Fix `WaitingForDriver.jsx`, `Riding.jsx`, `CaptainHome.jsx`, `CaptainRiding.jsx`, and `UserProtectedWrapper.jsx`; preserve the centered `MobileFrame` on desktop with a top Role Switcher (`Passenger` · `Captain` · `Admin Dispatch`) and clearly labelled `[SIMULATION]` controls; verify with `node:test` unit/integration tests.
