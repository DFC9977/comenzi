# CLAUDE.md — Gosbi Comenzi

## Project Overview

**Gosbi Comenzi** is a Romanian-language order management web application for a pet food distributor (Gosbi brand). It is a static site hosted on Firebase Hosting with Firebase Firestore as the backend.

- **Project name**: Gosbi-professional-comenzi
- **Firebase project (staging)**: `gosbiromania` → `gosbiromania.web.app`
- **Firebase project (prod)**: `comenzi-2969b` → `comenzi-2969b.web.app`
- **UI language**: Romanian

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES modules), HTML5, CSS3 |
| Database | Firebase Firestore (NoSQL) |
| Auth | Firebase Auth (email/password, phone-to-email scheme) |
| Hosting | Firebase Hosting (two sites: staging + prod) |
| Functions | Firebase Cloud Functions v2 (Node 20, europe-west1) |
| CI/CD | GitHub Actions (preview deploys on PRs, smoke tests, auto-deploy on merge) |
| Firebase SDK | 10.12.5 loaded from `gstatic.com` CDN |
| Node deps | `axios`, `firebase-admin` (utility scripts only) |
| E2E Testing | Playwright (Chromium) |

There is **no build system** — no bundler, no transpiler. All modules are native ES modules imported directly in the browser. Firebase SDK is loaded from `https://www.gstatic.com/firebasejs/10.12.5/`.

---

## Repository Structure

```
/
├── index.html                 # Main SPA entry point (auth + catalog)
├── admin.html                 # Admin panel (clients, promotions, notifications, counties)
├── my-orders.html             # Client orders + messages + promotions (loaded in iframe)
├── messages.html              # Admin centralized messaging
├── reports.html               # Admin reports/analytics
├── orders-admin.html          # Admin orders management
├── catalog.html               # Standalone catalog page
├── styles.css                 # Global styles for index.html
├── sw.js                      # Service worker (network-first, no-store for JS/CSS)
├── admin.js                   # Admin panel logic (root-level, used by admin.html)
├── myOrders.js                # Client orders view (root-level, used by my-orders.html)
├── upload.js                  # Node.js utility: product image upload
├── upload-from-url.js         # Node.js utility: upload product images from URL
├── firebase.json              # Firebase Hosting/Functions/Firestore config (two hosting targets)
├── firestore.rules            # Firestore security rules
├── .firebaserc                # Firebase project aliases (staging + prod targets)
├── package.json               # Root: axios + firebase-admin + playwright (utility scripts)
├── playwright.config.js       # Playwright E2E test configuration
├── DEPLOY-CHECKLIST.md        # Deployment checklist (promotions fixes)
├── test-results/              # Playwright test output (gitignored artifacts)
├── tests/
│   └── e2e/
│       └── admin-clients.spec.js  # Playwright: admin Clients tab tests
├── functions/
│   ├── index.js               # Firebase Cloud Functions (adminResetUserPassword)
│   └── package.json           # Functions deps: firebase-admin ^12, firebase-functions ^6
├── .github/
│   └── workflows/
│       ├── firebase-hosting-pull-request.yml  # PR preview deploy
│       ├── firebase-hosting-merge.yml         # Auto-deploy to live on push to main
│       └── tests-smoke.yml                    # Playwright smoke tests on PR/push to main
└── js/                        # ES module library
    ├── config.js              # Firebase config (API keys) — superseded by js/firebase.js multi-env
    ├── firebase.js            # Firebase init: multi-env config selection + exports auth/db/storage/functions
    ├── app.js                 # Main SPA controller
    ├── auth.js                # Auth helpers (login, register, ensureUserDoc)
    ├── catalog.js             # Product loading, rendering, filters, cart UI
    ├── cart.js                # localStorage cart state
    ├── orders.js              # Order create/update (Firestore transactions)
    ├── profile.js             # User profile, county/city lists, contact save
    ├── localities.js          # COUNTY_CITIES map (extracted shared module)
    ├── adminOrders.js         # Admin orders management (status, chat, PDF, WhatsApp)
    ├── messages.js            # Admin centralized chat
    ├── reports.js             # Admin reports
    ├── clientDelivery.js      # Client delivery schedule display
    ├── clientPromos.js        # Client promotions with read tracking + HTML sanitization
    └── pdf-export.js          # PDF export for orders
```

---

## Architecture

### Single-Page Application

`index.html` is the root SPA. It shows one of several `<section>` screens at a time:

- `screenLoading` — initial auth check
- `screenLogin` — phone + password login/register
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
| Admin — Județe | `admin.html#counties` |
| Admin — Comenzi | `orders-admin.html` |
| Rapoarte | `reports.html` |

---

## Multi-Environment Setup

The project has two separate Firebase environments:

| Environment | Firebase project | Hosting site |
|---|---|---|
| Staging | `gosbiromania` | `gosbiromania.web.app` |
| Prod | `comenzi-2969b` | `comenzi-2969b.web.app` |

### Environment selection at runtime (`js/firebase.js`)

`js/firebase.js` selects the Firebase config based on `window.location.hostname`:

- `gosbiromania.*` → staging config
- `comenzi-2969b.*` or `comenzi9.*` → prod config
- `localhost` / `127.0.0.1` → reads `localStorage.getItem("FB_ENV")`:
  - `"prod"` → prod config
  - anything else → staging config (default)

**To switch environment on localhost**, open DevTools Console and run:
```js
localStorage.setItem("FB_ENV", "prod"); location.reload();
// or
localStorage.removeItem("FB_ENV"); location.reload(); // back to staging
```

`js/firebase.js` exports: `auth`, `db`, `storage`, `functions` (all initialized from the selected config).

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
  "text": "string (plain text, legacy)",
  "contentText": "string (plain text, preferred)",
  "contentHtml": "string (rich HTML, optional — sanitized on render)",
  "active": true,
  "startDate": "Timestamp",
  "endDate": "Timestamp",
  "createdAt": "Timestamp"
}
```

**Promotion content rendering priority:**
1. If `contentHtml` is present and non-empty → sanitize with `sanitizePromoHtml()` and render as HTML
2. Otherwise render `contentText` (or legacy `text`) as plain text with newlines converted to `<br>`

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

#### `passwordResetRequests/{reqId}`
```json
{
  "phone": "07XXXXXXXX",
  "status": "pending | resolved",
  "createdAt": "Timestamp",
  "resolvedAt": "Timestamp",
  "resolvedBy": "adminUid"
}
```

Publicly writable (any visitor can create). Admin reads/resolves. The `adminResetUserPassword` Cloud Function marks requests as `"resolved"`.

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

## Firebase Cloud Functions

Located in `functions/`. Deployed to region `europe-west1` on Node 20.

### `adminResetUserPassword` (callable)

Allows admins to set a new password for any client by phone number.

**Input:** `{ phone: "07xx", newPassword: "xxx", requestId?: "docId" }`
**Output:** `{ success: true }`

**Flow:**
1. Verifies caller is authenticated and has `role: "admin"` in Firestore
2. Looks up Firebase Auth user by `phone@phone.local` email
3. Calls `auth().updateUser(uid, { password: newPassword })`
4. If `requestId` is provided, marks the `passwordResetRequests/{requestId}` document as `status: "resolved"`

**Deploy:**
```bash
cd functions && npm install
firebase deploy --only functions
```

---

## Firestore Security Rules (`firestore.rules`)

Key rules summary:

| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | Own doc or admin | Create: own uid only; Update: own or admin |
| `products` | Public | Admin only |
| `categories` | Public | Admin only |
| `promotions` | Signed in | Admin only |
| `counties` | Signed in | Admin only |
| `counters` | Signed in | Update `orders` counter: any signed-in user; Create: admin only |
| `orders` | Own orders or admin | Create: own `clientId`, status must be `"NEW"`; Update own `"NEW"` orders or admin |
| `orders/messages` | Own order's client or admin | Strict: text ≤ 1000 chars, `fromUid` must match caller, `fromRole` in `["admin","client"]` |
| `passwordResetRequests` | Admin only | **Public** (unauthenticated users can create) |

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

## Cart

Cart is persisted in `localStorage` under the key `gosbi_cart_v2`.

**Schema:**
```json
{ "items": { "productId": 2, "productId2": 1 }, "updatedAt": 1700000000000 }
```

**Public API** (from `js/cart.js`):

- `getCart()` — returns full cart object
- `getItemsArray()` — returns `[{productId, qty}]`
- `getItemCount()` — total quantity
- `getQty(productId)` — qty for one product
- `setQuantity(productId, qty)` — set absolute qty
- `increment(productId, step)` — increment/decrement
- `removeItem(productId)` — remove one product
- `clearCart()` — empty cart

Every write dispatches `cart:updated` CustomEvent on `window`.

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

`js/catalog.js` also has `normalizeProduct()` which applies defensive fallbacks for missing product fields (price aliases, `active`, `sortOrder`, `imageUrls`, `categoryId`, `name`).

---

## Service Worker

`sw.js` runs only on Firebase Hosting (not localhost, not GitHub Pages). It can be toggled via URL params:

- `?nosw=1` — disable SW (useful during development)
- `?sw=1` — force enable SW

**Cache strategy:**
- HTML pages: network-first, fallback to cache
- JS files: always `cache: "no-store"` (prevents stale scripts)
- CSS files: always `cache: "no-store"`
- Everything else (images, etc.): browser default

---

## Version Management / Cache Busting

`index.html` sets `window.APP_VER` (currently `43`). JS modules are loaded with `?v=43`. Bump this number when deploying changes to ensure browsers load the new files:

```html
<script>window.APP_VER = 44;</script>
<script type="module" src="./js/app.js?v=44"></script>
```

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
- Phone numbers are stored and displayed as strings like `"0744123456"` (no spaces, no country code prefix +40).
- Money formatting: use `ro-RO` locale — `Number(v).toLocaleString("ro-RO")` → `"1.234,56"` + lei suffix.
- Timestamps: always use Firestore `serverTimestamp()` for writes; `ts.toDate().toLocaleString("ro-RO")` for display.
- HTML escaping: every module has its own `escapeHtml()` function — always escape user-generated content before inserting into `innerHTML`. This duplication is intentional (no shared utils module).
- Promo HTML: use `sanitizePromoHtml()` (in `js/clientPromos.js` and `admin.js`) when rendering `contentHtml` — strips all dangerous attributes and non-whitelisted tags. Allowed: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `a`, `ol`, `ul`, `li`, `span`. Safe `href` only (`http://`, `https://`, `mailto:`).
- No external UI framework: all DOM manipulation is done manually. No React, Vue, or jQuery.
- Firebase SDK is CDN-only: never install it via npm for browser code. Only `firebase-admin` is in `package.json` (for Node utility scripts).
- `merge: true` on `setDoc` calls to avoid overwriting fields unexpectedly.
- Use dot-notation keys in `updateDoc` (e.g., `"contact.fullName"`) when updating nested fields to avoid overwriting sibling fields.

---

## Development Workflow

### Local Development

There is no local dev server configured. Options:

**Firebase Emulator (recommended):**
```bash
npm install -g firebase-tools
firebase emulators:start --only hosting,firestore,auth
```

**Any static server (e.g., `npx serve .` or VS Code Live Server):**
- Add `?nosw=1` to URL to disable the service worker during dev
- Firestore/Auth will use the live Firebase project (staging by default)
- Switch to prod locally: `localStorage.setItem("FB_ENV", "prod"); location.reload()`

### Disabling Service Worker During Dev

Append `?nosw=1` to any page URL in Chrome DevTools to prevent the SW from caching JS/CSS files.

---

## Deploying

### Deploy to staging only
```bash
firebase deploy --only hosting:staging --project gosbiromania
```

### Deploy to prod only
```bash
firebase deploy --only hosting:prod --project gosbiromania
```

### Deploy to both sites
```bash
firebase deploy --only hosting --project gosbiromania
```

### Deploy Firestore rules
```bash
firebase deploy --only firestore:rules
```

### Deploy Cloud Functions
```bash
firebase deploy --only functions
```

After deploying JS/CSS changes, **remember to bump `APP_VER`** in `index.html`.

See `DEPLOY-CHECKLIST.md` for a step-by-step checklist for promotions-related deploys.

Or let GitHub Actions handle preview deploys on PRs automatically.

---

## E2E Testing (Playwright)

Playwright is used for end-to-end tests. Config: `playwright.config.js`.

- **Test directory**: `tests/e2e/`
- **Default base URL**: `http://localhost:5000` (override with env var `BASE_URL`)
- **Browser**: Chromium (headless)
- **Timeout**: 30 seconds per test

### Running tests locally

```bash
# Install Playwright browsers (first time)
npx playwright install

# Run all e2e tests
npx playwright test

# Run against a specific base URL (e.g. staging)
BASE_URL=https://gosbiromania.web.app npx playwright test

# Run a specific spec file
npx playwright test tests/e2e/admin-clients.spec.js

# Run with credentials for tests that require login
ADMIN_PHONE=07XXXXXXXX ADMIN_PASS=yourpassword npx playwright test
```

### Writing new tests

Tests requiring admin login use environment variables:
- `ADMIN_PHONE` — admin phone number (e.g. `0744123456`)
- `ADMIN_PASS` — admin password

Tests that lack credentials skip gracefully (`test.skip()`).

### Existing tests

| File | Tests |
|---|---|
| `tests/e2e/admin-clients.spec.js` | Admin Clients tab: list visible, search/filter, row click → client detail |

---

## No Automated Unit Tests

There is no unit test suite. Testing is done manually in the browser or via Playwright E2E tests. Do not add a unit test runner without discussing with the project owner.

---

## CI/CD

Three GitHub Actions workflows handle Firebase Hosting deploys and tests:

### Preview deploys (`.github/workflows/firebase-hosting-pull-request.yml`)
- Triggers on every pull request
- Deploys a temporary preview channel to Firebase Hosting
- Requires repository secret: `FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA`
- No build step (static files deployed as-is)

### Production deploys (`.github/workflows/firebase-hosting-merge.yml`)
- Triggers on push to `main` branch
- Deploys to the live Firebase Hosting channel (`channelId: live`)
- Requires the same `FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA` secret
- No build step

### Smoke tests (`.github/workflows/tests-smoke.yml`)
- Triggers on PRs and pushes to `main`
- Installs Node 20, runs `npm ci`, installs Playwright Chromium
- Runs `npm run test:ci:smoke` (defined in root `package.json`)
- Falls back: checks `tests/e2e/order-workflow.spec.js` first, then `tests/e2e/` folder, then auto-discovers

---

## Utility Scripts (Node.js)

These scripts run with Node.js and `firebase-admin`, not in the browser:

- `upload.js` — uploads product images from local files
- `upload-from-url.js` — uploads product images from remote URLs using `axios`

Run with:
```bash
node upload.js
node upload-from-url.js
```

Requires a `serviceAccountKey.json` file (gitignored, **never commit this**).

---

## Common Pitfalls

- **Stale JS in production**: Always bump `APP_VER` when deploying changed JS files. The SW prevents old files from being served, but only when version param changes.
- **Phone auth scheme**: Firebase Auth uses email/password internally. The "email" is `<phone>@phone.local`. Do not confuse with real email-based auth.
- **Pending vs active clients**: New registrations start with `status: "pending"`. Admin must approve them (`status: "active"`) for prices to be visible.
- **Order edit vs create**: Order editing uses `sessionStorage` keys (`editingOrderId`, `editingOrderNumber`). Only orders with `status: "NEW"` can be edited.
- **iframe navigation**: Secondary pages use `postMessage` to communicate with the parent. Don't try to navigate the parent window directly from iframe code — use `window.parent.postMessage(...)`.
- **escapeHtml duplication**: Each module has its own copy. This is intentional (no shared utils module). Keep them consistent.
- **County/city lists**: `js/localities.js` exports `COUNTY_CITIES` — a shared map of county → city array. It is imported by both `js/profile.js` (client contact form) and `admin.js` (admin client card edit). If a city is not in the list, users can type it manually in the input.
- **Counties Firestore IDs**: Document ID in `counties/` collection uses the exact county name as ID (e.g., `counties/Sălaj`). This ensures matching with `contact.county` from the client profile which also uses `COUNTIES_LIST` values.
- **Multi-env Firebase config**: `js/firebase.js` (not `js/config.js`) is the authoritative Firebase initializer. It auto-selects prod vs staging based on hostname. `js/config.js` is superseded.
- **Promo content fields**: New promos may have `contentHtml` (rich text) and/or `contentText` (plain). Legacy promos have `text` only. The renderer checks `contentHtml` first.
- **Cloud Functions region**: Functions deploy to `europe-west1`. If calling from the browser, pass the `functions` export from `js/firebase.js` (already initialized with the correct app).
- **passwordResetRequests**: Publicly writable — anyone (even unauthenticated) can submit a password reset request. The collection is read/managed only by admins.
- **Admin navigation — Comenzi**: Admin users open `orders-admin.html`, not `my-orders.html`.

---

## Recent Changes

### 2026-02-25

#### Playwright E2E tests added
- `playwright.config.js` at project root: configures Chromium, `baseURL`, 30s timeout
- `tests/e2e/admin-clients.spec.js`: three tests for admin Clients tab (list visible, search/filter, row click → detail)
- Tests require `ADMIN_PHONE`/`ADMIN_PASS` env vars; skip gracefully if absent

#### Smoke test CI workflow (`.github/workflows/tests-smoke.yml`)
- Triggers on PRs and pushes to `main`
- Runs `npm ci`, installs Playwright Chromium, executes `npm run test:ci:smoke`
- Falls back to `tests/e2e/` folder if `order-workflow.spec.js` not found

#### Admin panel: client search and detail view (`admin.js`, `admin.html`)
- `#clientsSearchInput` with clear button `#clientsSearchClear` (adds `has-value` class when non-empty)
- `#clientsListContainer` holds `.client-row` items; clicking navigates to `#client/{uid}` hash
- Client detail back button `#clientDetailBack`, detail content `#clientDetailContent`

### 2026-02-21

#### Promotion content improvements (`js/clientPromos.js`)
- Added `sanitizePromoHtml()`: whitelist-based HTML sanitizer using `DOMParser`; allows `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `a`, `ol`, `ul`, `li`, `span`; strips `on*` handlers, `style`, unsafe `href`
- Added `formatPlainTextToHtml()`: escapes then converts newlines to `<br>`
- Render priority: `contentHtml` → sanitized HTML; `contentText`/`text` → plain text
- Mobile layout fix: promo cards use flexbox class layout preventing text overflow at 360px

#### Added `DEPLOY-CHECKLIST.md`
- Step-by-step instructions for deploying promotions fixes
- Documents staging-only and prod-only deploy commands

### 2026-02-20

#### Extracted `js/localities.js` (new shared module)
- `COUNTY_CITIES` map (county → city array) extracted from `js/profile.js` into its own ES module `js/localities.js`
- Both `js/profile.js` and `admin.js` now import `COUNTY_CITIES` from `./localities.js` (or `./js/localities.js`)
- Eliminates duplication and ensures both the client contact form and the admin client-card edit use the same city list

#### City datalist in admin client cards (`admin.js`)
- The Localitate field in admin client-card edit now uses a `<datalist>` populated from `COUNTY_CITIES` for the selected county
- Updating the Județ select refreshes the datalist suggestions immediately
- Users can still type a city name manually if it's not in the list

#### Auto-deploy to production on merge to main (`.github/workflows/firebase-hosting-merge.yml`)
- New GitHub Actions workflow added: pushes to `main` automatically deploy to the live Firebase Hosting channel
- Previously only PR preview deploys existed; production had to be deployed manually with `firebase deploy`

### 2026-02-19

#### Editable contact fields in admin client cards (`admin.js`)
- Added "Date contact" section in `renderUserCard()` — first section shown in each client card
- Fields: Telefon (readonly), Nume complet, Canisă/Felisă, Adresă, Județ (select), Localitate
- County select uses the same `COUNTIES_LIST` as the client registration form
- Saved via dot-notation keys (`"contact.fullName"`, etc.) in `updateDoc` to avoid overwriting `contact.completed`
- Live update of header name as admin types

#### County name input → predefined dropdown (`admin.js` — Județe tab)
- Replaced free-text `<input>` with `<select>` populated from `COUNTIES_LIST`
- Already-configured counties are excluded from the dropdown (no duplicates)
- Firestore document ID is now the canonical county name (e.g., `counties/Sălaj`) instead of a generated slug that stripped diacritics
- Fixes delivery day lookup mismatch caused by typos like "Salaj" vs "Sălaj"

### Earlier

#### Firebase Cloud Functions — `adminResetUserPassword`
- New `functions/` directory with callable function for admin-initiated password resets
- Verifies caller has `role: "admin"` in Firestore before resetting
- Optionally marks `passwordResetRequests/{requestId}` as `"resolved"`
- Region: `europe-west1`, Node 20

#### Firestore security rules (`firestore.rules`)
- Added to repository; rules cover all collections
- `passwordResetRequests`: publicly writable (create), admin-only read/update/delete
- Orders messages: message text limited to 1000 chars; `fromUid` enforced server-side

#### Multi-environment Firebase setup
- `.firebaserc` defines `staging` (`gosbiromania`) and `prod` (`comenzi-2969b`) targets
- `firebase.json` updated with two hosting targets + functions + firestore rules config
- `js/firebase.js` now selects config by hostname; exports `storage` and `functions` in addition to `auth` and `db`

#### `normalizeProduct()` in `js/catalog.js`
- Defensive fallback function applied to each product on load
- Handles missing/aliased fields: `basePrice` ← `priceGross` / `price` / `base_price` / `basePriceRon`
- Ensures `active`, `sortOrder`, `imageUrls`, `categoryId`, `name` always have safe defaults

#### Admin orders tab (`orders-admin.html`)
- Admin navigation now includes "Comenzi" button pointing to `orders-admin.html`
