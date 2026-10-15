# BloodBridge REST API Reference

Comprehensive specification of all REST endpoints provided by the BloodBridge coordination backend.

---

## Base URL
- Development: `http://localhost:5000/api`
- Production: `https://bloodbridge.org/api`

---

## 1. Authentication (`/api/auth`)

### `POST /api/auth/register`
Register a new donor, requester, or hospital account.
- **Body**: `{ email, password, fullName, role, phone, ... }`
- **Response `201`**: `{ success: true, user: { id, email, role }, token: "JWT..." }`

### `POST /api/auth/login`
Authenticate credentials and issue session JWT.
- **Body**: `{ email, password }`
- **Response `200`**: `{ success: true, user, token }`

### `GET /api/auth/me`
Retrieve authenticated profile context. Requires `Authorization: Bearer <TOKEN>`.

---

## 2. Emergency Coordination Requests (`/api/requests`)

### `GET /api/requests`
Fetch requests with optional filtering by status, urgency, or blood group.

### `POST /api/requests`
Create a new emergency blood coordination request.
- **Role**: `REQUESTER`, `HOSPITAL`, `ADMIN`
- **Body**: `{ patientName, bloodGroup, units, urgency, hospitalId, ... }`

### `GET /api/requests/:id`
Fetch single request details and live matching timeline.

### `PATCH /api/requests/:id/verify`
Hospital clinical verification of blood requirement.
- **Role**: `HOSPITAL`, `ADMIN`

### `POST /api/requests/:id/respond`
Donor accepts or declines an emergency dispatch notification.
- **Role**: `DONOR`

---

## 3. Hospital Blood Inventory (`/api/inventory`)

### `GET /api/inventory`
Query live blood unit balances, reservations, and critical alerts.
- **Role**: `HOSPITAL`, `ADMIN`

### `POST /api/inventory/restock`
Record a new blood batch into inventory.
- **Role**: `HOSPITAL`, `ADMIN`
- **Body**: `{ hospitalId, bloodGroup, units, collectedAt, shelfLifeDays }`

### `POST /api/inventory/reserve`
Lock units for confirmed surgical emergency.
- **Role**: `HOSPITAL`, `ADMIN`
- **Body**: `{ hospitalId, bloodGroup, units }`

### `POST /api/inventory/release`
Release reserved units back to available stock upon cancellation.
- **Role**: `HOSPITAL`, `ADMIN`
- **Body**: `{ bloodGroup, units }`

### `POST /api/inventory/dispense`
Dispense reserved units for patient transfusion.
- **Role**: `HOSPITAL`, `ADMIN`

---

## 4. Donor Preferences (`/api/donor-preferences`)

### `GET /api/donor-preferences`
Retrieve travel range, channel, and quiet hour settings.
- **Role**: `DONOR`, `ADMIN`

### `PUT /api/donor-preferences`
Update alert configuration.
- **Body**: `{ maxTravelDistanceKm, channels, quietHoursEnabled, quietHoursStart, quietHoursEnd, emergencyOnly }`

---

## 5. Clinical Staff Roster (`/api/hospital-staff`)

### `GET /api/hospital-staff`
List delegated doctors, nurses, and technicians for a facility.

### `POST /api/hospital-staff`
Invite and delegate permissions to clinical personnel.

### `DELETE /api/hospital-staff/:id`
Deactivate clinical staff credentials.

---

## 6. Pre-Screening & Clinical Safety (`/api/health-screening`)

### `POST /api/health-screening/evaluate`
Evaluate donor self-assessment questionnaire prior to dispatch.
- **Body**: `{ weightKg, ageYears, feelsHealthyToday, hasActiveFeverOrInfection, ... }`
- **Response**: `{ success: true, data: { isEligible, disqualifyingReasons, advisories, nextEligibleDate } }`

---

## 7. Donor Badges & Community Leaderboard (`/api/badges`)

### `GET /api/badges/profile`
Retrieve donor gamification ranking, streak, and awarded badges.

### `GET /api/badges/leaderboard`
Top community lifesavers sorted by reputation score.

### `GET /api/badges/catalog`
Full catalog of unlockable achievement badges.

---

## 8. Gratitude & Feedback (`/api/feedback`)

### `POST /api/feedback`
Submit post-donation star rating, punctuality score, and note.

### `GET /api/feedback/donor/:donorId`
Aggregated testimonials and average rating for a donor.

---

## 9. Regional Emergency Broadcasts (`/api/broadcasts`)

### `GET /api/broadcasts/active`
Fetch active regional mass-casualty alerts (Public).

### `POST /api/broadcasts`
Issue a new multi-channel emergency broadcast.
- **Role**: `ADMIN`

---

## 10. System Health & Diagnostics (`/api/health`)

### `GET /api/health`
Basic service ping (`200 OK`).

### `GET /api/health/deep`
Comprehensive diagnostics: process memory (RSS/heap), uptime, database query latency, and live socket connection counter.
