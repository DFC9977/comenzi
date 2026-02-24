# CLAUDE.md — Gosbi Comenzi

## 1. Overview

**Gosbi Comenzi** is a Romanian-language order management web application for a pet food distributor (Gosbi brand). Static site (no build step, no bundler) hosted on Firebase Hosting with Firebase Firestore as the database, Firebase Auth for authentication, and one Firebase Cloud Function for privileged server-side operations.

- **UI language**: Romanian. Variable names and comments are mostly in Romanian.
- **No build system**: vanilla ES modules, no transpiler, no bundler. Firebase SDK loaded from CDN (`gstatic.com/firebasejs/10.12.5`).
- **Two Firebase projects**: `gosbiromania` (staging) and `comenzi-2969b` (production).

---

## 2. Architecture Summary

```
index.html (SPA root)
  ├── screenLoading        — auth check in progress
  ├── screenLogin          — phone+password login/register + forgot password form
  ├── screenContactGate    — new user contact form (first login only)
  ├── screenCatalog        — product grid + cart + checkout bar
  └── screenAdmin          — <iframe id="adminFrame"> loading secondary pages:
        ├── my-orders.html       — client orders, promotions, messages
        ├── admin.html           — admin panel (5 tabs)
        ├── messages.html        — admin centralized chat
        ├── reports.html         — admin analytics
        └── orders-admin.html    — admin orders list (alternate entry)
```

Parent ↔ iframe communication is done exclusively via `window.postMessage`. Never navigate the parent window directly from iframe code. Supported actions: `showCatalog`, `promosRead`, `messagesRead`.

---

## 3. Environments (Staging vs Production)

### Project IDs

| Environment | Firebase Project ID | Hosting Site | Firestore/Auth |
|---|---|---|---|
| Staging | `gosbiromania` | `gosbiromania.web.app` | `gosbiromania` project |
| Production | `comenzi-2969b` | `comenzi-2969b.web.app` | `comenzi-2969b` project |

### Hosting Target Mapping

`firebase.json` declares exactly **two** hosting targets:

```json
"hosting": [
  { "target": "staging", "public": "." },
  { "target": "prod",    "public": "." }
]
```

`.firebaserc` maps these targets under the `gosbiromania` project alias:

```json
{
  "projects": {
    "default": "gosbiromania",
    "prod":    "comenzi-2969b",
    "staging": "gosbiromania"
  },
  "targets": {
    "gosbiromania": {
      "hosting": {
        "staging": ["gosbiromania"],
        "prod":    ["comenzi-2969b"]
      }
    }
  }
}
```

The default project alias (`"default": "gosbiromania"`) means all `firebase` CLI commands without `--project` use `gosbiromania`.

### Runtime Environment Switching (`js/firebase.js`)

`js/firebase.js` selects the Firebase config at runtime based on `window.location.hostname`:

```
hostname includes "gosbiromania"                    → staging config (gosbiromania project)
hostname includes "comenzi-2969b" or "comenzi9"    → prod config (comenzi-2969b project)
hostname is "localhost" or "127.0.0.1"              → read localStorage.getItem("FB_ENV"):
                                                        "prod"  → prod config
                                                        anything else → staging config (default)
any other hostname                                  → staging config
```

To switch localhost to production Firestore/Auth:
```javascript
// In browser DevTools console:
localStorage.setItem("FB_ENV", "prod");
// Reload the page.

// Revert to staging:
localStorage.removeItem("FB_ENV");
```

**`js/config.js` is NOT used at runtime.** It contains only the staging config and exists as a reference artifact. Do not import from it in browser modules; import from `js/firebase.js` instead.

### Region Configuration

Functions are deployed with `setGlobalOptions({ region: "europe-west1" })` in `functions/index.js`.

`js/firebase.js` exports:
```javascript
export const functions = getFunctions(app, "europe-west1");
```

**Without the explicit region argument, `getFunctions(app)` defaults to `us-central1` and all callable function invocations fail.** See Known Issues #1.

### ⚠ Cross-Deploy Warning

**Do not run `firebase deploy --only hosting` without specifying a target.** This deploys to BOTH `gosbiromania.web.app` (staging) and `comenzi-2969b.web.app` (production) in a single command. Always specify the target explicitly.

---

## 4. Repository Structure

```
/
├── index.html                # SPA root (auth, catalog, admin iframe wrapper); APP_VER = 43
├── admin.html                # Admin panel (5 tabs: Clienți, Promoții, Notificări, Județe, Resetare parole)
├── my-orders.html            # Client view (tabs: Comenzi, Promoții, Mesaje)
├── messages.html             # Admin centralized messaging
├── reports.html              # Admin reports/analytics
├── orders-admin.html         # Admin orders list (minimal iframe page)
├── catalog.html              # Standalone catalog page
├── styles.css                # Global CSS variables + components (dark theme)
├── sw.js                     # Service worker (network-first HTML; no-store JS/CSS)
├── admin.js                  # Admin panel controller (used by admin.html, 1148 lines)
├── myOrders.js               # Client orders controller (used by my-orders.html)
├── firestore.rules           # Firestore security rules (tracked, deployed via CI)
├── firebase.json             # Firebase config: 2 hosting targets, functions, firestore rules
├── .firebaserc               # Project aliases and hosting target → site mappings
├── package.json              # Root: axios, firebase-admin, @playwright/test ^1.50.0 (dev)
├── DEPLOY-CHECKLIST.md       # Manual deploy procedure notes
├── upload.js                 # Node.js utility: upload product images from local files
├── upload-from-url.js        # Node.js utility: upload product images from remote URLs
├── .github/
│   └── workflows/
│       ├── firebase-hosting-pull-request.yml  # PR preview deploy → gosbiromania project
│       ├── firebase-hosting-merge.yml         # Push to main → gosbiromania live + Firestore rules
│       └── tests-smoke.yml                    # ⚠ See Known Issues #2
├── functions/
│   ├── index.js              # Cloud Functions: adminResetUserPassword (callable, europe-west1)
│   └── package.json          # firebase-admin ^12.0.0, firebase-functions ^6.0.0, node 20
└── js/
    ├── firebase.js           # Firebase init (dual-env, exports: auth, db, storage, functions)
    ├── config.js             # Staging config constants — NOT used at runtime
    ├── app.js                # SPA controller: auth routing, nav, order submission, badges
    ├── auth.js               # Phone auth helpers: normalizePhone, phoneToEmail, login, register
    ├── catalog.js            # Product grid, filtering, price computation, cart UI
    ├── cart.js               # localStorage cart (key: gosbi_cart_v2)
    ├── orders.js             # Order create/update via Firestore transaction
    ├── profile.js            # User profile read/write, county/city form helpers
    ├── localities.js         # COUNTY_CITIES map: 42 counties → city arrays (shared)
    ├── adminOrders.js        # Admin order cards, status updates, chat, PDF, WhatsApp
    ├── messages.js           # Admin centralized chat: conversation list + real-time panel
    ├── reports.js            # Admin analytics: overview, products, clients, affiliates
    ├── clientDelivery.js     # Client delivery schedule display (next 3 dates)
    ├── clientPromos.js       # Client promotions: render, sanitize HTML, track seen
    └── pdf-export.js         # PDF export (jsPDF + AutoTable): exportOrderPDFA4_PRO()
```

---

## 5. Cloud Functions

**Location**: `functions/index.js`
**Runtime**: Node.js 20
**Region**: `europe-west1` (set via `setGlobalOptions({ region: "europe-west1" })`)
**Deployed to**: ⚠ Confirm which project (gosbiromania or comenzi-2969b) functions are deployed to.

### adminResetUserPassword (callable)

**Trigger**: HTTPS Callable (`onCall`)
**Called from**: `admin.js` via `httpsCallable(functions, 'adminResetUserPassword')`

**Input payload**:
```json
{ "phone": "07XXXXXXXX", "newPassword": "string (min 6 chars)", "requestId": "docId (optional)" }
```

**Output on success**:
```json
{ "success": true }
```

**Behavior** (in order):
1. Verifies `request.auth` is not null (throws `unauthenticated` if missing)
2. Reads `users/{callerUid}` from Firestore; verifies `role === "admin"` (throws `permission-denied` if not)
3. Validates `phone` and `newPassword` are present; validates `newPassword.length >= 6`
4. Looks up Firebase Auth user by email `${phone}@phone.local` (throws `not-found` if missing)
5. Calls `admin.auth().updateUser(uid, { password: newPassword })`
6. If `requestId` provided: updates `passwordResetRequests/{requestId}` with `{ status: "resolved", resolvedAt: serverTimestamp(), resolvedBy: callerUid }`
7. Returns `{ success: true }`

---

## 6. Firestore Data Model

### Collections

#### `users/{uid}`
```
uid             string
phone           string           "07XXXXXXXX" (no spaces, no +40 prefix)
email           string           "07XXXXXXXX@phone.local"
role            string           "client" | "admin"
status          string           "pending" | "active"
contact         map
  fullName      string
  kennel        string           optional
  address       string
  county        string           exact Romanian county name with diacritics
  city          string
  completed     boolean
  completedAt   Timestamp
priceRules      map              optional; absent for new users
  globalMarkup  number           markup % applied to all products
  categories    map              { [categoryId]: number } — per-category markup %
seenPromotions  array<string>    promotion document IDs
clientType      string           optional
channel         string           optional (affiliate/referrer identifier)
createdAt       Timestamp
updatedAt       Timestamp
```

#### `orders/{orderId}`
```
orderNumber     number
clientId        string           UID of the ordering user
clientSnapshot  map
  uid           string
  email         string
  phone         string
  fullName      string
  county        string
  city          string
  address       string
  clientType    string
  channel       string
items           array<map>
  productId     string
  name          string
  qty           number
  unitPriceFinal number
  lineTotal     number
total           number
status          string           "NEW" | "CONFIRMED" | "SENT" | "DELIVERED" | "CANCELED"
statusHistory   array<map>
  status        string
  at            Timestamp
  adminUid      string | null
createdAt       Timestamp
updatedAt       Timestamp
```

#### `orders/{orderId}/messages` (subcollection)
```
text          string           max 1000 characters (enforced by Firestore rules)
fromRole      string           "client" | "admin"
fromUid       string
readByAdmin   boolean
readByClient  boolean
createdAt     Timestamp
```

#### `products/{productId}`
```
name          string
active        boolean
sortOrder     number
basePrice     number           canonical price field; also aliased in old data as priceGross, price, base_price, basePriceRon
categoryId    string
producer      string
gama          string
sku           string
description   string
imageUrls     array<string>
```

#### `promotions/{promoId}`
```
contentHtml   string           sanitized HTML from Quill editor (may be absent for old promos)
contentText   string           plain text (always present for Quill-created promos)
text          string           alias of contentText — written for backwards compatibility
contentDelta  map | null       Quill Delta ops { ops: [...] } — STORED BUT NEVER READ by any consumer; treat as opaque dead data
active        boolean
startDate     Timestamp | null null means no start restriction
endDate       Timestamp | null null means no end restriction
createdAt     Timestamp
createdBy     string           UID of admin who created it
updatedAt     Timestamp        present after edits
```

**Rendering logic** (`clientPromos.js` and `admin.js`):
- If `contentHtml` exists and is non-empty: run through `sanitizePromoHtml()`, inject with `innerHTML`
- Otherwise: escape `contentText || text`, convert `\n` → `<br>`

`sanitizePromoHtml()` uses `DOMParser`, allows only: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `a`, `ol`, `ul`, `li`, `span`. Strips all `on*` attributes, all `style` attributes, all `href` values that do not start with `http://`, `https://`, or `mailto:`. Unwraps disallowed elements (preserves text content). Never use `innerHTML` with promotion content without passing it through `sanitizePromoHtml()` first.

#### `counties/{countyName}`
```
startDate    string     "YYYY-MM-DD"
intervalDays number
```

Document ID is the **exact** county name with Romanian diacritics (e.g., `counties/Sălaj`). Must match `contact.county` exactly. Never strip diacritics.

#### `counters/orders`
```
lastNumber   number     incremented atomically per order (starts at 1000)
```

#### `passwordResetRequests/{reqId}`

**Created by**: unauthenticated users via `addDoc` from `js/app.js`.

**Firestore rules**: `create: if true` (public write); `read, update, delete: if isAdmin()`.

```
phone         string     "07XXXXXXXX"
email         string     "07XXXXXXXX@phone.local"
status        string     "pending" | "resolved"
createdAt     Timestamp
```

**On resolution via Cloud Function** ("Setează parola" button — calls `adminResetUserPassword`):
```
status        "resolved"
resolvedAt    Timestamp
resolvedBy    string     UID of admin who called the function
```

**On resolution via "Rezolvat" button** (direct `updateDoc` in `admin.js`):
```
status        "resolved"
resolvedAt    Timestamp
```
`resolvedBy` is **absent** in this path. See Known Issues #3.

### Missing: `firestore.indexes.json`

`firestore.indexes.json` does **not exist** in the repository. All composite Firestore indexes were created manually in the Firebase console and are not tracked in code. See Known Issues #5.

---

## 7. Security Model

### Role System

Roles are stored in `users/{uid}.role` in Firestore.

| Role | Status | Can see prices | Can place orders | Admin panels |
|---|---|---|---|---|
| `client` | `pending` | No | No | No |
| `client` | `active` | Yes | Yes | No |
| `admin` | any | Yes | Yes | Yes |

**Frontend enforcement** (`js/app.js:routeAfterAuth()`): reads `users/{uid}` after login, sets `__isAdminSession` flag, shows/hides navigation based on `profile.role`. Client-side only — Firestore rules provide real enforcement.

**Backend enforcement** (`firestore.rules`):
```javascript
function isAdmin() {
  return signedIn() && (
    request.auth.token.admin == true
    || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
  );
}
```

`request.auth.token.admin == true` supports Firebase Custom Claims, but no code currently sets custom claims.

### Per-Collection Access Model

| Collection | Unauthenticated | Any signed-in | Own doc only | Admin only |
|---|---|---|---|---|
| `users` | — | — | read + update own | list all, delete |
| `products` | **read** | read | — | create, update, delete |
| `categories` | **read** | read | — | create, update, delete |
| `promotions` | — | **read** | — | create, update, delete |
| `counties` | — | **read** | — | create, update, delete |
| `counters/orders` | — | read; update `orders` counter only | — | create |
| `orders` | — | — | create (status=NEW), read, update (status=NEW only) | full access |
| `orders/*/messages` | — | — | read + create (own order) + update readByClient | admin: full read/write |
| `passwordResetRequests` | **create** | — | — | read, update, delete |

### Rules File Location and Deploy Command

Rules file: `firestore.rules` (repo root)

```bash
firebase deploy --only firestore:rules --project gosbiromania
```

Rules are also deployed automatically on every push to `main` via `firebase-hosting-merge.yml` (with `continue-on-error: true`).

---

## 8. Admin Panel

`admin.html` loads `admin.js` as an ES module. Five tabs:

| Tab ID (hash) | Content |
|---|---|
| `#clients` | Pending and active clients; editable contact fields; price markup rules |
| `#promotions` | Quill rich-text editor; create/edit/delete/toggle promotions |
| `#notifications` | WhatsApp message composer per county |
| `#counties` | Delivery schedule per county (startDate + intervalDays) |
| `#password-resets` | Password reset request queue |

### Password Resets Tab (`#password-resets`)

**Implemented in**: `admin.js`, `loadPasswordResetRequests()` and `renderPasswordResets()`

**Data source**: `onSnapshot` on `collection(db, "passwordResetRequests")` ordered by `createdAt desc`

**Display**: "⏳ În așteptare" (status ≠ "resolved") and "✅ Rezolvate" (status = "resolved")

**"Setează parola" button**:
1. Reveals inline password input form
2. On "Salvează": validates `newPassword.length >= 6`
3. Calls `httpsCallable(functions, 'adminResetUserPassword')` with `{ phone, newPassword, requestId }`
4. On success: Cloud Function sets password in Firebase Auth and marks request resolved (writes `resolvedBy`)

**"Rezolvat" button** (marks done without changing password):
1. Calls `updateDoc(doc(db, 'passwordResetRequests', reqId), { status: 'resolved', resolvedAt: serverTimestamp() })`
2. Does NOT call the Cloud Function; does NOT write `resolvedBy` — see Known Issues #3

**Permissions required**: `role: "admin"` in Firestore. Enforced by Firestore rules (`isAdmin()`) and independently by the Cloud Function.

---

## 9. Testing

### Playwright

`@playwright/test ^1.50.0` is in `devDependencies` of `package.json`.

**`tests/e2e/` directory does not exist.**
**`playwright.config.js` does not exist.**

Expected test file location (once created): `tests/e2e/order-workflow.spec.js`

Local run command (once test file and config exist):
```bash
npx playwright install chromium
CI=true SMOKE_TEST=true npx playwright test tests/e2e/order-workflow.spec.js --project=chromium --workers=2
```

### `tests-smoke.yml`

See Known Issues #2. The file currently has no `name:` or `on:` trigger key and will never execute.

---

## 10. Known Issues

### Issue 1 — Functions Region Mismatch (Active Bug)

**File**: `js/firebase.js` line 52

`getFunctions(app)` without a region argument defaults to `us-central1`. The deployed function `adminResetUserPassword` is in `europe-west1`. All calls via `httpsCallable(functions, 'adminResetUserPassword')` will fail with a network/CORS error.

**Fix**: Change `getFunctions(app)` → `getFunctions(app, "europe-west1")`.

### Issue 2 — `tests-smoke.yml` Malformed (Never Executes)

**File**: `.github/workflows/tests-smoke.yml`

The file contains 27 lines and starts directly with a step body at line 1 (`      - name: Run smoke tests`). There is no `name:` field, no `on:` trigger, and no `jobs:` block. GitHub Actions will not execute this workflow.

**Fix**: Prepend a valid workflow header. Keep all existing step content untouched.

### Issue 3 — `resolvedBy` Field Inconsistency

**Files**: `admin.js` (direct `updateDoc`), `functions/index.js` (Cloud Function)

When the "Rezolvat" button resolves a `passwordResetRequests` doc directly, the written document is `{ status, resolvedAt }`. When the Cloud Function resolves it, the written document is `{ status, resolvedAt, resolvedBy }`. Any code that reads `resolvedBy` must handle its possible absence.

**Fix**: Route all status-update writes through the Cloud Function, or explicitly handle `resolvedBy` absence in all readers.

### Issue 4 — `contentDelta` Dead Data in Promotions

**File**: `admin.js` line ~888

Every promotion created writes a `contentDelta` field (Quill Delta format: `{ ops: [...] }`). No code in `clientPromos.js`, `admin.js`, or any other module reads this field. It accumulates in Firestore with every promotion write.

**Fix option A**: Remove the `contentDelta` write from `admin.js` going forward (no migration of existing documents needed — field is unused).
**Fix option B**: Keep writing it but document explicitly as unused (already done above).

### Issue 5 — Firestore Indexes Not Tracked

`firestore.indexes.json` does not exist in the repository. All composite Firestore indexes were created manually in the Firebase console.

**Fix**: Export current indexes and commit the file:
```bash
firebase firestore:indexes --project gosbiromania > firestore.indexes.json
```
Then register it in `firebase.json`:
```json
"firestore": {
  "rules": "firestore.rules",
  "indexes": "firestore.indexes.json"
}
```
Deploy indexes:
```bash
firebase deploy --only firestore:indexes --project gosbiromania
```

---

## 11. Deployment Cookbook

### Prerequisites

```bash
npm install -g firebase-tools
firebase login
```

Required GitHub Actions secret:
- `FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA` — service account JSON for the `gosbiromania` project

### Deploy Hosting: Staging Only

```bash
firebase deploy --only hosting:staging --project gosbiromania
```

Deploys to `gosbiromania.web.app`.

### Deploy Hosting: Production Only

```bash
firebase deploy --only hosting:prod --project gosbiromania
```

Deploys to `comenzi-2969b.web.app`.

### Deploy Hosting: Both Targets

```bash
firebase deploy --only hosting --project gosbiromania
```

Deploys to both `gosbiromania.web.app` and `comenzi-2969b.web.app` simultaneously.

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules --project gosbiromania
```

### Deploy Firestore Indexes (once `firestore.indexes.json` exists)

```bash
firebase deploy --only firestore:indexes --project gosbiromania
```

### Deploy Cloud Functions

```bash
firebase deploy --only functions --project gosbiromania
```

⚠ Confirm which project functions are deployed to. If functions must run against `comenzi-2969b` Firestore/Auth, deploy with `--project comenzi-2969b` instead.

### Deploy Everything

```bash
firebase deploy --project gosbiromania
```

### Safe Production Deploy Workflow

1. Test on staging: `firebase deploy --only hosting:staging --project gosbiromania`
2. Verify on `gosbiromania.web.app`
3. **Bump `APP_VER`** in `index.html` if any JS or CSS files changed:
   ```html
   <!-- Change current value to next integer: -->
   <script>window.APP_VER = 44;</script>
   <script type="module" src="./js/app.js?v=44"></script>
   ```
4. Deploy to production: `firebase deploy --only hosting:prod --project gosbiromania`
5. If Firestore rules changed: `firebase deploy --only firestore:rules --project gosbiromania`
6. Hard-refresh (`Ctrl+Shift+R`) or test in incognito to confirm new assets load

### CI/CD Behavior

| Workflow | Trigger | What deploys |
|---|---|---|
| `firebase-hosting-pull-request.yml` | Any PR (same-repo only) | Preview channel on `gosbiromania` project |
| `firebase-hosting-merge.yml` | Push to `main` | Live channel (`channelId: live`) on `gosbiromania` project + Firestore rules (`continue-on-error: true`) |
| `tests-smoke.yml` | ⚠ Never (malformed — see Known Issues #2) | — |

**⚠ Confirm**: `firebase-hosting-merge.yml` uses `FirebaseExtended/action-hosting-deploy@v0` with `projectId: gosbiromania` and no explicit `target:` parameter. With a multi-target `firebase.json`, verify whether this deploys to `staging` only, `prod` only, or both. Intent appears to be staging-only (`gosbiromania.web.app`), but must be confirmed against the action's multi-target behavior.

---

## 12. Troubleshooting & Footguns

### `adminResetUserPassword` always fails with network error
`getFunctions(app)` in `js/firebase.js` defaults to `us-central1`. Function is in `europe-west1`. Fix: `getFunctions(app, "europe-west1")` (Known Issue #1).

### Stale JS after deploy
Always bump `APP_VER` in `index.html` when deploying changed JS or CSS files. The service worker uses `cache: "no-store"` for JS/CSS, but the version query param is still required for CDN and proxy cache busting.

### Phone auth confusion
Firebase Auth stores users with email `07XXXXXXXX@phone.local`. `signInWithEmailAndPassword(auth, "0744123456@phone.local", password)` is the actual call. Do not treat these as real email addresses.

### County names must include diacritics
`counties/` document IDs are exact Romanian county names: `Sălaj`, `Brăila`, `Iași`, etc. `contact.county` must use the same spelling. The COUNTY_CITIES map in `js/localities.js` is the canonical source. Never strip diacritics — it breaks delivery schedule lookups.

### Promotion HTML must always be sanitized
`clientPromos.js` renders `contentHtml` via `innerHTML`. Always pass through `sanitizePromoHtml(html, fallback)` first. Uses `DOMParser` — not regex. Handles nested elements correctly.

### Order editing uses sessionStorage flags
Set `sessionStorage.setItem('editingOrderId', id)` and `sessionStorage.setItem('editingOrderNumber', num)` before navigating to catalog. Only orders with `status === "NEW"` can be edited (enforced in `orders.js` and Firestore rules). `openFrame()` in `app.js` clears these flags automatically on navigation.

### `escapeHtml` is duplicated intentionally
Every module has its own `escapeHtml()` function. There is no shared utility module. Keep all copies consistent.

### Pending clients cannot see prices
New registrations start at `status: "pending"`. An admin must set `status: "active"` in admin.html → Clienți tab. Until then `app.js:refreshCatalog()` passes `showPrices: false`.

### `serviceAccountKey.json` must never be committed
`upload.js` and `upload-from-url.js` require a `serviceAccountKey.json` at the project root. This file is gitignored. Never commit it.
