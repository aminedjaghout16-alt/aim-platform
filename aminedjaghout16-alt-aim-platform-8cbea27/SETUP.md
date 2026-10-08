# VANTAGE — Precision Aim Training Platform

## Firebase Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Once created, click the web icon (</>) to add a web app
4. Copy the `firebaseConfig` object values

### 2. Configure Your Credentials

Open `js/firebase-config.js` and replace all placeholder values:

```javascript
window.VantageFirebaseConfig = {
  apiKey: "AIzaSy...",              // Your API key
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};
```

### 3. Enable Authentication

In Firebase Console > Authentication > Sign-in method:

1. **Email/Password** — Enable it
2. **Google** — Enable it (set a support email if prompted)

### 4. Add Authorized Domains

In Firebase Console > Authentication > Settings > Authorized domains:

1. Add your deployment domain (e.g. `your-app.web.app`, `yourdomain.com`)
2. `localhost` is added by default for development

**Important:** Google Sign-In will fail with `auth/unauthorized-domain` if your deployment domain is not in this list.

### 5. Create Firestore Database

1. Go to Firestore Database in the sidebar
2. Click "Create database"
3. Choose "Start in production mode"
4. Select your preferred location

### 6. Deploy Security Rules

Install Firebase CLI and deploy the rules:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # Select your project, use existing firestore.rules file
firebase deploy --only firestore:rules
```

The `firestore.rules` file is already included in this project.

### 7. Run the App

Open `index.html` in a browser, or serve it:

```bash
npx serve .
# or
python3 -m http.server 3000
```

## What's Connected to Firebase

| Feature | Firebase Service | Details |
|---------|-----------------|---------|
| Email/password auth | Firebase Auth | Registration, login, logout |
| Google sign-in | Firebase Auth | OAuth popup |
| Persistent sessions | Firebase Auth | Survives page reload/device |
| Password reset | Firebase Auth | Email-based reset flow |
| User profiles | Firestore `users/` | Display name, initials avatar, settings, role |
| Training results | Firestore `results/` | Score, grade, stats, config per session |
| User settings | Firestore `users/{uid}/settings` | Game, sensitivity, DPI, preferences |
| Statistics | Firestore (computed) | Aggregated from results collection |

## Security

- Users can only access their own data (enforced by Firestore rules)
- Auth state guards protect all app pages
- No client-side bypass possible — rules are server-enforced

## Project Structure

```
├── index.html              # Main entry point
├── js/
│   ├── firebase-config.js  # ← PUT YOUR CREDENTIALS HERE
│   ├── firebase-init.js    # Firebase initialization
│   ├── app.js              # Main app, routing, auth guards
│   ├── services/
│   │   ├── authService.js      # Firebase Auth wrapper
│   │   └── databaseService.js  # Firestore wrapper
│   ├── pages/              # All page components
│   ├── components/         # Layout, UI components
│   └── engine/             # Training engine, scoring, scenarios
├── css/                    # Stylesheets
├── firestore.rules         # Deploy to Firebase
└── firebase.json           # Firebase config
```
