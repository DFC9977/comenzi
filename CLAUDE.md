# CLAUDE.md — Gosbi Comenzi

## Project Overview

**Gosbi Comenzi** is a Romanian-language order management web application for a pet food distributor (Gosbi brand). It is a static site hosted on Firebase Hosting with Firebase Firestore as the backend and Cloud Functions for privileged server-side operations.

- **Project name**: Gosbi-professional-comenzi
- **Firebase environments**: `gosbiromania` (staging) and `comenzi-2969b` (production)
- **UI language**: Romanian

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES modules), HTML5, CSS3 |
| Database | Firebase Firestore (NoSQL) |
| Auth | Firebase Auth (email/password, phone-to-email scheme) |
| Hosting | Firebase Hosting (two targets: staging + prod) |
| Functions | Firebase Cloud Functions v2 (Node.js 20, region: europe-west1) |
| CI/CD | GitHub Actions (preview deploys, production auto-deploy, smoke tests) |
| Firebase SDK | 10.12.5 loaded from `gstatic.com` CDN |
| Node deps | `axios`, `firebase-admin` (utility scripts only); `@playwright/test` (dev) |

There is **no build system** — no bundler, no transpiler. All modules are native ES modules imported directly in the browser. Firebase SDK is loaded from `https://www.gstatic.com/firebasejs/10.12.5/`.

---

## Repository Structure

```
/
├── index.html              # Main SPA entry point (auth + catalog)
├── admin.html              # Admin panel (clients, promotions, notifications, counties, password resets)
├── my-orders.html          # Client orders + messages + promotions (loaded in iframe)
├── messages.html           # Admin centralized messaging
├── reports.html            # Admin reports/analytics
├── orders-admin.html       # Admin orders management (minimal wrapper)
├── catalog.html            # Standalone catalog page
├── styles.css              # Global styles for index.html
├── sw.js                   # Service worker (network-first, no-store for JS/CSS)
├── admin.js                # Admin panel logic (root-level, used by admin.html)
├── myOrders.js             # Client orders view (root-level, used by my-orders.html)
├── firestore.rules         # Firestore security rules (deployed via CI)
├── upload.js               # Node.js utility: product image upload
├── upload-from-url.js      # Node.js utility: upload product images from URL
├── firebase.json           # Firebase Hosting config (two targets: staging + prod)
├── .firebaserc             # Firebase project aliases (default/prod/staging)
├── package.json            # axios + firebase-admin + @playwright/test
├── DEPLOY-CHECKLIST.md     # Deployment procedure notes
├── .github/
│   └── workflows/
│       ├── firebase-hosting-pull-request.yml  # PR preview deploy
│       ├── firebase-hosting-merge.yml         # Auto-deploy to live on push to main
│       └── tests-smoke.yml                    # Playwright smoke tests
├── functions/
│   ├── index.js            # Cloud Functions (adminResetUserPassword)
│   └── package.json        # Functions dependencies
└── js/                     # ES module library
    ├── config.js           # Firebase config constants (staging only — NOT used at runtime)
    ├── firebase.js         # Firebase app/auth/db/storage/functions initialization
    ├── app.js              # Main SPA controller
    ├── auth.js             # Auth helpers (login, register, ensureUserDoc)
    ├── catalog.js          # Product loading, rendering, filters, cart UI
    ├── cart.js             # localStorage cart state
    ├── orders.js           # Order create/update (Firestore transactions)
    ├── profile.js          # User profile, county/city lists, contact save
    ├── localities.js       # COUNTY_CITIES map (shared module, 42 counties)
    ├── adminOrders.js      # Admin orders management (status, chat, PDF, WhatsApp)
    ├── messages.js         # Admin centralized chat
    ├── reports.js          # Admin reports/analytics
    ├── clientDelivery.js   # Client delivery schedule display
    ├── clientPromos.js     # Client promotions with read tracking + HTML sanitization
    └── pdf-export.js       # PDF export for orders (jsPDF + AutoTable)
```

---

## Architecture

### Single-Page Application

`index.html` is the root SPA. It shows one of several `<section>` screens at a time:

- `screenLoading` — initial auth check
- `screenLogin` — phone + password login/register + forgot password form
- `screenContactGate` — new user contact info form
- `screenCatalog` — product grid with cart
- `screenAdmin` — wrapper with an `<iframe id="adminFrame">` that loads secondary pages

Secondary pages (`my-orders.html`, `admin.html`, `messages.html`, `reports.html`) all run inside this iframe.

### Cross-Frame Communication

The parent (`index.html`) and iframe pages communicate via `window.postMessage`:

| Message `action` | Direction | Meaning |
|---|---|---|
| `showCatalog` | iframe → parent | Navigate parent back to catalog |
| `promosRead` | iframe → parent | Clear promotions badge |
| `messagesRead` | iframe → parent | Clear messages badge |
| `catalog:submitOrderRequested` | catalog.js → app.js | Submit cart as order (CustomEvent on window) |

### Navigation

Navigation buttons in the topbar open different iframe sources via `openFrame(src, title, subtitle)`:

| Button | Target |
|---|---|
| Comenzi (client) | `my-orders.html` |
| Promoții | `my-orders.html?tab=promotions` |
| Mesaje (client) | `my-orders.html?tab=messages` |
| Mesaje (admin) | `messages.html` |
| Admin — Clienți | `admin.html#clients` |
| Admin — Promoții | `admin.html#promotions` |
| Admin — Notificări | `admin.html#notifications` |
| Admin — Județe | `admin.html#counties` |
| Admin — Reset parole | `admin.html#password-resets` |
| Rapoarte | `reports.html` |

---

## Dual Firebase Environments

`js/firebase.js` selects the Firebase project at runtime based on `window.location.hostname`:

| Hostname | Environment | Project |
|---|---|---|
| `gosbiromania.web.app` / `gosbiromania.firebaseapp.com` | Staging | `gosbiromania` |
| `comenzi-2969b.web.app` / `comenzi9.*` | Production | `comenzi-2969b` |
| `localhost` / `127.0.0.1` | Local (default: staging) | `gosbiromania` (or `localStorage.FB_ENV = "prod"`) |

**To point localhost to prod**: open DevTools console and run `localStorage.setItem("FB_ENV","prod")`, then reload.

The `js/config.js` file only contains the staging config and is **not used by the browser** — `js/firebase.js` embeds both configs inline and selects based on hostname.

### Firebase Hosting Targets

| Target | Site | Deploy command |
|---|---|---|
| `staging` | `gosbiromania.web.app` | `firebase deploy --only hosting:staging --project gosbiromania` |
| `prod` | `comenzi-2969b.web.app` | `firebase deploy --only hosting:prod --project gosbiromania` |

Use `firebase deploy --only hosting --project gosbiromania` to deploy to **both** targets simultaneously.

---

## Firebase / Firestore Schema

### Collections

#### `users/{uid}`
```json
{
  "uid": "string",
  "phone": "07XXXXXXXX",
  "email": "07XXXXXXXX@phone.local",
  "role": "client | admin",
  "status": "pending | active",
  "contact": {
    "fullName": "string",
    "kennel": "string (optional)",
    "address": "string",
    "county": "string",
    "city": "string",
    "completed": true,
    "completedAt": "Timestamp"
  },
  "priceRules": {
    "globalMarkup": 10,
    "categories": { "categoryId": 15 }
  },
  "seenPromotions": ["promoId1", "promoId2"],
  "clientType": "string",
  "channel": "string",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

#### `orders/{orderId}`
```json
{
  "orderNumber": 1001,
  "clientId": "uid",
  "clientSnapshot": {
    "uid": "string",
    "email": "string",
    "phone": "string",
    "fullName": "string",
    "county": "string",
    "city": "string",
    "address": "string",
    "clientType": "string",
    "channel": "string"
  },
  "items": [
    {
      "productId": "string",
      "name": "string",
      "qty": 2,
      "unitPriceFinal": 10.50,
      "lineTotal": 21.00
    }
  ],
  "total": 21.00,
  "status": "NEW | CONFIRMED | SENT | DELIVERED | CANCELED",
  "statusHistory": [{ "status": "NEW", "at": "Timestamp", "adminUid": null }],
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

#### `orders/{orderId}/messages` (subcollection)
```json
{
  "text": "string",
  "fromRole": "client | admin",
  "fromUid": "string",
  "readByAdmin": false,
  "readByClient": false,
  "createdAt": "Timestamp"
}
```

#### `products/{productId}`
```json
{
  "name": "string",
  "active": true,
  "sortOrder": 1,
  "basePrice": 10.50,
  "categoryId": "string",
  "producer": "string",
  "gama": "string",
  "sku": "string",
  "description": "string",
  "imageUrls": ["https://..."]
}
```

#### `promotions/{promoId}`
```json
{
  "title": "string",
  "contentHtml": "string (sanitized HTML from Quill editor)",
  "contentText": "string (plain text fallback)",
  "active": true,
  "startDate": "Timestamp",
  "endDate": "Timestamp",
  "createdAt": "Timestamp"
}
```

Note: promotions created via the Quill editor store both `contentHtml` (rich HTML) and `contentText` (plain text). `clientPromos.js` renders `contentHtml` if present, otherwise falls back to `contentText` with `\n` → `<br>` conversion.

#### `counters/orders`
```json
{ "lastNumber": 1005 }
```

#### `counties/{countyName}`
```json
{
  "startDate": "YYYY-MM-DD",
  "intervalDays": 14
}
```

Document ID is the **exact** county name (e.g., `counties/Sălaj`) — must match `contact.county` from the user profile exactly including diacritics.

#### `passwordResetRequests/{reqId}`
```json
{
  "phone": "07XXXXXXXX",
  "status": "pending | resolved",
  "createdAt": "Timestamp",
  "resolvedAt": "Timestamp (optional)",
  "resolvedBy": "adminUid (optional)"
}
```

Password reset requests can be created by anyone (unauthenticated). Admins resolve them via the Password Resets tab in admin.html, which calls the `adminResetUserPassword` Cloud Function.

---

## Authentication

Firebase Auth is used with email/password, but there is no real email. Phone numbers are converted to fake email addresses:

```
07XXXXXXXX  →  07XXXXXXXX@phone.local
```

This is done in `js/auth.js:phoneToEmail()` and also inline in `js/app.js`. On first login, a user document is created in `users/{uid}` with `role: "client"` and `status: "pending"`.

### User Roles & Access

| Role | Status | Can see prices | Can place orders | Admin panels |
|---|---|---|---|---|
| client | pending | No | No | No |
| client | active | Yes | Yes | No |
| admin | any | Yes | Yes | Yes (all tabs) |

Role is stored in `users/{uid}.role`. After login, `routeAfterAuth()` in `app.js` determines which navigation buttons to show.

---

## Cloud Functions

Located in `functions/index.js`. Deployed to `europe-west1` region.

### `adminResetUserPassword` (callable)

Called from the admin panel "Reset parole" tab to set a new password for a client.

**Input**: `{ phone: "07XXXXXXXX", newPassword: "string", requestId: "docId (optional)" }`

**Output**: `{ success: true }`

**Security checks**:
1. Must be authenticated
2. Caller's `users/{uid}.role` must be `"admin"` (verified server-side in Firestore)
3. `newPassword` minimum 6 characters

**Side effect**: if `requestId` provided, marks `passwordResetRequests/{requestId}` as `status: "resolved"`.

To call from browser JS:
```javascript
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.js";
const fn = httpsCallable(functions, "adminResetUserPassword");
const result = await fn({ phone, newPassword, requestId });
```

---

## Cart

Cart is persisted in `localStorage` under the key `gosbi_cart_v2`.

Schema:
```json
{ "items": { "productId": 2, "productId2": 1 }, "updatedAt": 1700000000000 }
```

Public API (from `js/cart.js`):

- `getCart()` — returns full cart object
- `getItemsArray()` — returns `[{productId, qty}]`
- `getItemCount()` — total quantity
- `getQty(productId)` — qty for one product
- `setQuantity(productId, qty)` — set absolute qty
- `increment(productId, step)` — increment/decrement
- `removeItem(productId)` — remove one product
- `clearCart()` — empty cart

Every write dispatches `cart:updated` CustomEvent on `window`. Falls back to in-memory storage if `localStorage` is unavailable.

---

## Order Submission Flow

1. User clicks "Trimite comanda" in `catalog.js`
2. `catalog.js` fires `catalog:submitOrderRequested` CustomEvent with `detail.items`
3. `app.js` catches it and calls `submitOrder()` from `js/orders.js`
4. `orders.js`:
   - Checks `sessionStorage.editingOrderId` — if set, updates existing order (only if `status === "NEW"`)
   - Otherwise creates new order using a Firestore transaction
   - Order number is atomically incremented from `counters/orders.lastNumber` (starts at 1000)
   - Cart is cleared after success

Edit mode is activated by setting `sessionStorage.editingOrderId` and `sessionStorage.editingOrderNumber` before loading the catalog.

---

## Price Calculation

Prices are computed in `js/catalog.js:computeFinalPrice()`:

1. Read `basePrice` (also aliased as `priceGross`, `price`, `base_price`, `basePriceRon`)
2. If `priceRules.categories[categoryId]` exists → apply that markup %
3. Otherwise apply `priceRules.globalMarkup` %
4. Formula: `finalPrice = basePrice * (1 + markup / 100)`

Prices are only shown to users with `status: "active"` or `role: "admin"`.

---

## Service Worker

`sw.js` runs only on Firebase Hosting (not localhost, not GitHub Pages). Toggle via URL params:

- `?nosw=1` — disable SW (useful during development)
- `?sw=1` — force enable SW

Cache strategy:

- HTML pages: network-first, fallback to cache
- JS files: always `cache: "no-store"` (prevents stale scripts)
- CSS files: always `cache: "no-store"`
- Everything else (images, etc.): browser default

---

## Version Management / Cache Busting

`index.html` sets `window.APP_VER` (currently `43`). JS modules are loaded with `?v=43`. Bump this number when deploying changes to ensure browsers load new files:

```html
<script>window.APP_VER = 44;</script>
<script type="module" src="./js/app.js?v=44"></script>
```

---

## Firestore Security Rules

`firestore.rules` is tracked in the repository and deployed automatically on merge to `main` (via `firebase-hosting-merge.yml`). Key rules:

| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | own doc or admin | own doc or admin |
| `products` | public (unauthenticated) | admin only |
| `categories` | public (unauthenticated) | admin only |
| `promotions` | any signed-in user | admin only |
| `counties` | any signed-in user | admin only |
| `counters/orders` | any signed-in user | signed-in (update only) |
| `orders` | own order or admin | create: own + status=NEW |
| `orders/messages` | own order or admin | own order or admin (max 1000 chars) |
| `passwordResetRequests` | admin only | anyone (unauthenticated create) |

---

## CSS Design System

Global CSS variables defined in `styles.css`:

```css
--bg: #0b0f14         /* page background */
--card: #121924       /* card background */
--text: #e8eef6       /* primary text */
--muted: #9fb0c3      /* secondary text */
--line: #223044       /* borders */
--primary: #4da3ff    /* blue accent */
--danger: #ff5d5d     /* red/error */
--ok: #35d07f         /* green/success */
```

The design is dark-themed. All pages use consistent CSS variables. Inline styles are common in dynamically generated HTML (catalog cards, chat messages, etc.).

---

## Key Conventions

- All UI text is in Romanian. Variable names and code comments are mostly in Romanian.
- Phone numbers are stored and displayed as strings like `"0744123456"` (no spaces, no country code prefix `+40`).
- Money formatting: use `ro-RO` locale — `Number(v).toLocaleString("ro-RO")` → `"1.234,56"` + ` lei` suffix.
- Timestamps: always use Firestore `serverTimestamp()` for writes; `ts.toDate().toLocaleString("ro-RO")` for display.
- HTML escaping: every module has its own `escapeHtml()` function — always escape user-generated content before inserting into `innerHTML`.
- No external UI framework: all DOM manipulation is done manually. No React, Vue, or jQuery.
- Firebase SDK is CDN-only: never install it via npm for browser code. Only `firebase-admin` is in `package.json` (for Node utility scripts).
- `merge: true` on `setDoc` calls to avoid overwriting fields unexpectedly.
- HTML sanitization for promotions: `clientPromos.js` uses `sanitizePromoHtml()` which allows only safe tags (`p`, `br`, `strong`, `em`, `u`, `a[href]`, `ol`, `ul`, `li`, `span`) and validates href to `http://`, `https://`, or `mailto:`.

---

## Development Workflow

### Local Development

There is no local dev server configured. Options:

**Firebase Emulator (recommended):**
```bash
npm install -g firebase-tools
firebase emulators:start --only hosting,firestore,auth
```

**Any static server** (e.g., `npx serve .` or VS Code Live Server):
- Add `?nosw=1` to URL to disable the service worker during dev
- Firestore/Auth will use the live `gosbiromania` project (staging)

### Switching Environments Locally

```javascript
// In DevTools console — point localhost to prod
localStorage.setItem("FB_ENV", "prod")
// Reload page

// Revert to staging (default)
localStorage.removeItem("FB_ENV")
```

### Disabling Service Worker During Dev

Append `?nosw=1` to any page URL in Chrome DevTools to prevent the SW from caching JS/CSS files.

---

## Deploying

See `DEPLOY-CHECKLIST.md` for the full procedure. Summary:

```bash
# Deploy to staging only
firebase deploy --only hosting:staging --project gosbiromania

# Deploy to prod only
firebase deploy --only hosting:prod --project gosbiromania

# Deploy to both staging + prod
firebase deploy --only hosting --project gosbiromania

# Deploy Firestore rules
firebase deploy --only firestore:rules --project gosbiromania

# Deploy Cloud Functions
firebase deploy --only functions --project gosbiromania
```

After deploying, **bump `APP_VER`** in `index.html` if JS or CSS files changed.

---

## Testing

### Playwright Smoke Tests

`@playwright/test` is in `devDependencies`. The smoke test workflow (`tests-smoke.yml`) runs `tests/e2e/order-workflow.spec.js` via Playwright with Chromium.

Run locally:
```bash
npx playwright install chromium
CI=true SMOKE_TEST=true npx playwright test tests/e2e/order-workflow.spec.js --project=chromium
```

The workflow auto-discovers tests if `tests/e2e/order-workflow.spec.js` doesn't exist.

There is no other automated test suite. Functional testing is done manually in the browser.

---

## CI/CD

Three GitHub Actions workflows:

### 1. Preview deploys (`firebase-hosting-pull-request.yml`)
- Triggers on every pull request (same-repo only)
- Deploys a temporary preview channel to Firebase Hosting
- Requires secret: `FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA`
- No build step (static files deployed as-is)

### 2. Production deploys (`firebase-hosting-merge.yml`)
- Triggers on push to `main` branch
- Deploys to the live Firebase Hosting channel (`channelId: live`, project `gosbiromania`)
- **Also deploys Firestore rules** (`firebase deploy --only firestore:rules`)
- Requires secret: `FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA`

### 3. Smoke tests (`tests-smoke.yml`)
- Runs Playwright smoke tests
- Target: `tests/e2e/order-workflow.spec.js` (Chromium, 2 workers)
- Falls back to `tests/e2e/` folder or auto-discovery if file not found

---

## Utility Scripts (Node.js)

These scripts run with Node.js and `firebase-admin`, not in the browser:

- `upload.js` — uploads product images from local `./upload` folder to Firebase Storage
- `upload-from-url.js` — downloads and migrates product images from remote URLs using `axios`

```bash
node upload.js
node upload-from-url.js
```

Requires a `serviceAccountKey.json` file (gitignored — **never commit this**).

---

## Common Pitfalls

- **Stale JS in production**: Always bump `APP_VER` in `index.html` when deploying changed JS files. The SW prevents old files from being served, but only when the version param changes.

- **Phone auth scheme**: Firebase Auth uses email/password internally. The "email" is `<phone>@phone.local`. Do not confuse with real email-based auth.

- **Dual environments**: `js/firebase.js` selects staging vs prod based on hostname. `js/config.js` only contains the staging config and is **not used** by the browser code — it exists as reference. Do not use `config.js` in new browser modules; import from `firebase.js` instead.

- **Cloud Functions region**: Functions are deployed to `europe-west1`. The `getFunctions(app)` call in `firebase.js` does not specify a region; the default is `us-central1`. If calling functions from the browser, either configure the region in `getFunctions(app, "europe-west1")` or rely on the default routing. Verify this when adding new callable function calls.

- **Pending vs active clients**: New registrations start with `status: "pending"`. Admin must approve them (`status: "active"`) for prices to be visible.

- **Order edit vs create**: Order editing uses `sessionStorage` keys (`editingOrderId`, `editingOrderNumber`). Only orders with `status: "NEW"` can be edited.

- **iframe navigation**: Secondary pages use `postMessage` to communicate with the parent. Don't try to navigate the parent window directly from iframe code — use `window.parent.postMessage(...)`.

- **`escapeHtml` duplication**: Each module has its own copy. This is intentional (no shared utils module). Keep them consistent.

- **County/city lists**: `js/localities.js` exports `COUNTY_CITIES` — a shared map of county → city array. It is imported by both `js/profile.js` (client contact form) and `admin.js` (admin client card edit). If a city is not in the list, users can type it manually in the input.

- **Counties Firestore IDs**: Document ID in `counties/` collection uses the **exact** county name as ID (e.g., `counties/Sălaj`). This ensures matching with `contact.county` from the client profile which also uses `COUNTIES_LIST` values. Never strip diacritics from county names when writing to Firestore.

- **Promotions rich content**: The Quill editor in admin saves both `contentHtml` (rich HTML) and `contentText` (plain text). When reading promotions on the client side, check for `contentHtml` first before falling back to `contentText`. The sanitizer in `clientPromos.js` is intentionally strict.

---

## Recent Changes

### 2026-02-24
- **Smoke test CI workflow** (`tests-smoke.yml`): Playwright smoke test runner added to CI for `tests/e2e/order-workflow.spec.js`

### 2026-02-20
- **Extracted `js/localities.js`** (new shared module): `COUNTY_CITIES` map extracted from `js/profile.js` into its own ES module; both `js/profile.js` and `admin.js` now import from it
- **City datalist in admin client cards** (`admin.js`): The Localitate field uses a `<datalist>` populated from `COUNTY_CITIES` for the selected county; updates on county change; free-text still allowed
- **Auto-deploy to production on merge to `main`** (`.github/workflows/firebase-hosting-merge.yml`): New workflow deploys to live channel and also deploys Firestore rules

### 2026-02-19
- **Editable contact fields in admin client cards** (`admin.js`): Added "Date contact" section in `renderUserCard()` — fields: Telefon (readonly), Nume complet, Canisă/Felisă, Adresă, Județ (select), Localitate; saved via dot-notation keys to avoid overwriting `contact.completed`; live header name update as admin types
- **County name input → predefined dropdown** (`admin.js` — Județe tab): Replaced free-text `<input>` with `<select>` from `COUNTIES_LIST`; already-configured counties excluded; Firestore document ID is now the canonical county name with diacritics (e.g., `counties/Sălaj`) — fixes delivery day lookup mismatch
