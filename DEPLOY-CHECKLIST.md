# Deploy checklist — Promotions fixes

Run from project root.

## 1. Local test (Firebase Hosting emulator)

```bash
firebase emulators:start --only hosting
```

- Open http://127.0.0.1:5000 (or the port shown).
- Log in as admin → go to **Admin → Promoții**.
- Check: promo row uses class layout (no vertical text at 360px); plain text with newlines shows multiple lines; rich HTML has paragraph/list/link styling.
- Open **Comenzi → Promoții** (client view): same checks, links styled.

## 2. Deploy to Firebase Hosting

**Deploy to gosbiromania.web.app (default / staging):**
```bash
firebase deploy --only hosting:staging --project gosbiromania
```

**Deploy to comenzi-2969b.web.app (prod):**
```bash
firebase deploy --only hosting:prod --project gosbiromania
```

Note: `firebase deploy --only hosting --project gosbiromania` deploys to **both** sites. Use `hosting:staging` or `hosting:prod` to deploy to one.

Optional: bump `APP_VER` in `index.html` (and script `?v=` params) if you changed JS/CSS so browsers fetch new assets.

## 3. After deploy

- Hard refresh (Ctrl+Shift+R) or open in incognito.
- Re-test Admin → Promoții and client Promoții tab on a real device or DevTools mobile (360–430px).
