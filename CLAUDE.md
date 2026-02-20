# CLAUDE.md — Gosbi Comenzi

## Project Overview

**Gosbi Comenzi** is a Romanian-language order management web application for a pet food distributor (Gosbi brand). It is a static site hosted on Firebase Hosting with Firebase Firestore as the backend.

- **Project name**: Gosbi-professional-comenzi
- **Firebase project**: `gosbiromania`
- **Firebase Hosting site**: `gosbiromania`
- **UI language**: Romanian

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES modules), HTML5, CSS3 |
| Database | Firebase Firestore (NoSQL) |
| Auth | Firebase Auth (email/password, phone-to-email scheme) |
| Hosting | Firebase Hosting |
| CI/CD | GitHub Actions (preview deploys on PRs) |
| Firebase SDK | 10.12.5 loaded from `gstatic.com` CDN |
| Node deps | `axios`, `firebase-admin` (utility scripts only) |

There is **no build system** — no bundler, no transpiler. All modules are native ES modules imported directly in the browser. Firebase SDK is loaded from `https://www.gstatic.com/firebasejs/10.12.5/`.

---

## Repository Structure
/
├── index.html # Main SPA entry point (auth + catalog)
├── admin.html # Admin panel (clients, promotions, notifications, counties)
├── my-orders.html # Client orders + messages + promotions (loaded in iframe)
├── messages.html # Admin centralized messaging
├── reports.html # Admin reports/analytics
├── orders-admin.html # Admin orders management
├── catalog.html # Standalone catalog page
├── styles.css # Global styles for index.html
├── sw.js # Service worker (network-first, no-store for JS/CSS)
├── admin.js # Admin panel logic (root-level, used by admin.html)
├── myOrders.js # Client orders view (root-level, used by my-orders.html)
├── upload.js # Node.js utility: product image upload
├── upload-from-url.js # Node.js utility: upload product images from URL
├── firebase.json # Firebase Hosting config
├── .firebaserc # Firebase project alias
├── package.json # Only axios + firebase-admin (utility scripts)
├── .github/
│ └── workflows/
│ ├── firebase-hosting-pull-request.yml # PR preview deploy
│ └── firebase-hosting-merge.yml # Auto-deploy to live on push to main
└── js/ # ES module library
├── config.js # Firebase config (API keys)
├── firebase.js # Firebase app/auth/db initialization
├── app.js # Main SPA controller
├── auth.js # Auth helpers (login, register, ensureUserDoc)
├── catalog.js # Product loading, rendering, filters, cart UI
├── cart.js # localStorage cart state
├── orders.js # Order create/update (Firestore transactions)
├── profile.js # User profile, county/city lists, contact save
├── localities.js # COUNTY_CITIES map (extracted shared module)
├── adminOrders.js # Admin orders management (status, chat, PDF, WhatsApp)
├── messages.js # Admin centralized chat
├── reports.js # Admin reports
├── clientDelivery.js # Client delivery schedule display
├── clientPromos.js # Client promotions with read tracking
└── pdf-export.js # PDF export for orders
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
| Rapoarte | `reports.html` |

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
}orders/{orderId}{
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
}orders/{orderId}/messages (subcollection){
  "text": "string",
  "fromRole": "client | admin",
  "fromUid": "string",
  "readByAdmin": false,
  "readByClient": false,
  "createdAt": "Timestamp"
}products/{productId}{
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
}promotions/{promoId}
{
  "title": "string",
  "content": "string",
  "active": true,
  "startDate": "Timestamp",
  "endDate": "Timestamp",
  "createdAt": "Timestamp"
}
counters/orders
{ "lastNumber": 1005 }
counties/{countyName}
{
  "startDate": "YYYY-MM-DD",
  "intervalDays": 14
}
Authentication

Firebase Auth is used with email/password, but there is no real email. Phone numbers are converted to fake email addresses:

07XXXXXXXX  →  07XXXXXXXX@phone.local

This is done in js/auth.js:phoneToEmail() and also inline in js/app.js. On first login, a user document is created in users/{uid} with role: "client" and status: "pending".

User Roles & Access
Role	Status	Can see prices	Can place orders	Admin panels
client	pending	No	No	No
client	active	Yes	Yes	No
admin	any	Yes	Yes	Yes (all tabs)

Role is stored in users/{uid}.role. After login, routeAfterAuth() in app.js determines which navigation buttons to show.

Cart

Cart is persisted in localStorage under the key gosbi_cart_v2.

Schema:

{ "items": { "productId": 2, "productId2": 1 }, "updatedAt": 1700000000000 }

Public API (from js/cart.js):

getCart() — returns full cart object

getItemsArray() — returns [{productId, qty}]

getItemCount() — total quantity

getQty(productId) — qty for one product

setQuantity(productId, qty) — set absolute qty

increment(productId, step) — increment/decrement

removeItem(productId) — remove one product

clearCart() — empty cart

Every write dispatches cart:updated CustomEvent on window.

Order Submission Flow

User clicks "Trimite comanda" in catalog.js

catalog.js fires catalog:submitOrderRequested CustomEvent with detail.items

app.js catches it and calls submitOrder() from js/orders.js

orders.js:

Checks sessionStorage.editingOrderId — if set, updates existing order (only if status === "NEW")

Otherwise creates new order using a Firestore transaction

Order number is atomically incremented from counters/orders.lastNumber (starts at 1000)

Cart is cleared after success

Edit mode is activated by setting sessionStorage.editingOrderId and sessionStorage.editingOrderNumber before loading the catalog.

Price Calculation

Prices are computed in js/catalog.js:computeFinalPrice():

Read basePrice (also aliased as priceGross, price, base_price, basePriceRon)

If priceRules.categories[categoryId] exists → apply that markup %

Otherwise apply priceRules.globalMarkup %

Formula: finalPrice = basePrice * (1 + markup / 100)

Prices are only shown to users with status: "active" or role: "admin".

Service Worker

sw.js runs only on Firebase Hosting (not localhost, not GitHub Pages). It can be toggled via URL params:

?nosw=1 — disable SW (useful during development)

?sw=1 — force enable SW

Cache strategy:

HTML pages: network-first, fallback to cache

JS files: always cache: "no-store" (prevents stale scripts)

CSS files: always cache: "no-store"

Everything else (images, etc.): browser default

Version Management / Cache Busting

index.html sets window.APP_VER (currently 42). JS modules are loaded with ?v=42. Bump this number when deploying changes to ensure browsers load the new files:

<script>window.APP_VER = 43;</script>
<script type="module" src="./js/app.js?v=43"></script>
CSS Design System

Global CSS variables defined in styles.css:

--bg: #0b0f14         /* page background */
--card: #121924       /* card background */
--text: #e8eef6       /* primary text */
--muted: #9fb0c3      /* secondary text */
--line: #223044       /* borders */
--primary: #4da3ff    /* blue accent */
--danger: #ff5d5d     /* red/error */
--ok: #35d07f         /* green/success */

The design is dark-themed. All pages use consistent CSS variables. Inline styles are common in dynamically generated HTML (catalog cards, chat messages, etc.).

Key Conventions

All UI text is in Romanian. Variable names and code comments are mostly in Romanian.

Phone numbers are stored and displayed as strings like "0744123456" (no spaces, no country code prefix +40).

Money formatting: use ro-RO locale — Number(v).toLocaleString("ro-RO") → "1.234,56" + lei suffix.

Timestamps: always use Firestore serverTimestamp() for writes; ts.toDate().toLocaleString("ro-RO") for display.

HTML escaping: every module has its own escapeHtml() function — always escape user-generated content before inserting into innerHTML.

No external UI framework: all DOM manipulation is done manually. No React, Vue, or jQuery.

Firebase SDK is CDN-only: never install it via npm for browser code. Only firebase-admin is in package.json (for Node utility scripts).

merge: true on setDoc calls to avoid overwriting fields unexpectedly.

Development Workflow
Local Development

There is no local dev server configured. Options:

Firebase Emulator (recommended):

npm install -g firebase-tools
firebase emulators:start --only hosting,firestore,auth

Any static server (e.g., npx serve . or VS Code Live Server):

Add ?nosw=1 to URL to disable the service worker during dev

Firestore/Auth will use the live gosbiromania project

Disabling Service Worker During Dev

Append ?nosw=1 to any page URL in Chrome DevTools to prevent the SW from caching JS/CSS files.

Deploying
firebase deploy --only hosting

Or let GitHub Actions handle preview deploys on PRs automatically (see .github/workflows/firebase-hosting-pull-request.yml).

After deploying, remember to bump APP_VER in index.html.

No Tests

There is no automated test suite. Testing is done manually in the browser. Do not add a test runner without discussing with the project owner.

CI/CD

Two GitHub Actions workflows handle Firebase Hosting deploys:

Preview deploys (.github/workflows/firebase-hosting-pull-request.yml):

Triggers on every pull request

Deploys a temporary preview channel to Firebase Hosting

Requires repository secret: FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA

No build step (static files deployed as-is)

Production deploys (.github/workflows/firebase-hosting-merge.yml):

Triggers on push to main branch

Deploys to the live Firebase Hosting channel (channelId: live)

Requires the same FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA secret

Auto-generated by Firebase CLI; no build step

Utility Scripts (Node.js)

These scripts run with Node.js and firebase-admin, not in the browser:

upload.js — uploads product images from local files

upload-from-url.js — uploads product images from remote URLs using axios

Run with:

node upload.js
node upload-from-url.js

Requires a serviceAccountKey.json file (gitignored, never commit this).

Common Pitfalls

Stale JS in production: Always bump APP_VER when deploying changed JS files. The SW prevents old files from being served, but only when version param changes.

Phone auth scheme: Firebase Auth uses email/password internally. The "email" is <phone>@phone.local. Do not confuse with real email-based auth.

Pending vs active clients: New registrations start with status: "pending". Admin must approve them (status: "active") for prices to be visible.

Order edit vs create: Order editing uses sessionStorage keys (editingOrderId, editingOrderNumber). Only orders with status: "NEW" can be edited.

iframe navigation: Secondary pages use postMessage to communicate with the parent. Don't try to navigate the parent window directly from iframe code — use window.parent.postMessage(...).

escapeHtml duplication: Each module has its own copy. This is intentional (no shared utils module). Keep them consistent.

County/city lists: js/localities.js exports COUNTY_CITIES — a shared map of county → city array. It is imported by both js/profile.js (client contact form) and admin.js (admin client card edit). If a city is not in the list, users can type it manually in the input.

Counties Firestore IDs: Document ID in counties/ collection uses the exact county name as ID (e.g., counties/Sălaj). This ensures matching with contact.county from the client profile which also uses COUNTIES_LIST values.

Recent Changes
2026-02-20
Extracted js/localities.js (new shared module)

COUNTY_CITIES map (county → city array) extracted from js/profile.js into its own ES module js/localities.js

Both js/profile.js and admin.js now import COUNTY_CITIES from ./localities.js (or ./js/localities.js)

Eliminates duplication and ensures both the client contact form and the admin client-card edit use the same city list

City datalist in admin client cards (admin.js)

The Localitate field in admin client-card edit now uses a <datalist> populated from COUNTY_CITIES for the selected county

Updating the Județ select refreshes the datalist suggestions immediately

Users can still type a city name manually if it's not in the list

Auto-deploy to production on merge to main (.github/workflows/firebase-hosting-merge.yml)

New GitHub Actions workflow added: pushes to main automatically deploy to the live Firebase Hosting channel

Previously only PR preview deploys existed; production had to be deployed manually with firebase deploy

2026-02-19
Editable contact fields in admin client cards (admin.js)

Added "Date contact" section in renderUserCard() — first section shown in each client card

Fields: Telefon (readonly), Nume complet, Canisă/Felisă, Adresă, Județ (select), Localitate

County select uses the same COUNTIES_LIST as the client registration form

Saved via dot-notation keys ("contact.fullName", etc.) in updateDoc to avoid overwriting contact.completed

Live update of header name as admin types

County name input → predefined dropdown (admin.js — Județe tab)

Replaced free-text <input> with <select> populated from COUNTIES_LIST

Already-configured counties are excluded from the dropdown (no duplicates)

Firestore document ID is now the canonical county name (e.g., counties/Sălaj) instead of a generated slug that stripped diacritics

Fixes delivery day lookup mismatch caused by typos like "Salaj" vs "Sălaj"