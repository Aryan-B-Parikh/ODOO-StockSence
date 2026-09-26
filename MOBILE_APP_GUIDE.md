# StockSense — Mobile App Version Guide 📱

StockSense has been upgraded to a **Progressive Web App (PWA)** and **Capacitor Mobile App** with native mobile ergonomics, offline sync, haptic feedback, camera barcode scanning, and bottom tab navigation.

---

## 🚀 1. Instant Mobile Installation (PWA)

You can run and install StockSense directly onto any **iOS (iPhone/iPad)** or **Android** device without app store delays:

### On Android (Chrome / Edge / Samsung Internet):
1. Connect your phone to the same Wi-Fi network as this PC.
2. Open Chrome on your phone and navigate to:
   ```
   http://<YOUR_PC_IP>:3000
   ```
   *(e.g., `http://192.168.253.1:3000` as shown in Next.js dev server)*
3. Chrome will automatically display an **"Install StockSense App"** banner at the bottom.
4. Tap **Install App** (or tap the 3 dots menu `⋮` → **Install App** / **Add to Home screen**).
5. The app will install as a standalone mobile application with its own app icon, splash screen, and full-screen experience (no browser URL bar).

### On iOS (Apple Safari):
1. Open Safari on your iPhone/iPad and visit `http://<YOUR_PC_IP>:3000`.
2. Tap the **Share** button (`⎋` with arrow up).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **Add**. StockSense appears on your iOS home screen with the custom app icon and black-translucent native status bar.

---

## 📲 2. Mobile Features & Ergonomics

| Feature | Description |
| :--- | :--- |
| **Mobile Bottom Tab Bar** | Fixed at the bottom (`Home`, `Ops`, elevated `SCAN`, `Stock`, `More`) with native haptic vibration feedback. |
| **Warehouse Operations Sheet** | 1-tap bottom sheet for Inbound Receipts, Outbound Deliveries, Internal Transfers, Stock Adjustments, and Cycle Counts. |
| **Instant Camera Scanner** | Central elevated **SCAN** button opens instant camera scanner (`jsQR`) or hardware barcode wedge input with auto-routing. |
| **Offline-First Resilience** | In-warehouse dead zones are fully supported. Mutations are stored in an offline queue and automatically synced once reconnected. |
| **Mobile Install Banner** | Non-intrusive smart banner guiding warehouse staff to install the app onto their mobile devices. |
| **Kiosk & PIN Lock** | 4-digit PIN lock screen with on-screen numeric keypad for shared warehouse tablets or mobile phones. |

---

## 📦 3. Building Native Android APK / iOS App (Capacitor)

The repository includes `capacitor.config.json` preconfigured for Android and iOS builds.

### Step 1: Initialize Capacitor
```bash
npm run mobile:init
```

### Step 2: Add Android Platform & Sync
```bash
npm run mobile:android
```

### Step 3: Open in Android Studio
```bash
npm run mobile:open
```
Inside Android Studio:
- Click **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)** to generate the `.apk` file for direct installation on warehouse barcode scanner terminals (Zebra, Honeywell, etc.).

---

## 🔑 Demo Login Credentials
- **Manager**: `manager@stocksense.app` / `Manager123!`
- **Warehouse Staff**: `staff@stocksense.app` / `Staff123!`
- **Staff (Anomaly Demo)**: `sam@stocksense.app` / `Staff123!`
