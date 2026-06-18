# BLOKQ Casino - Deployment Guide

## Secure Admin Panel & Game Logic Implementation

### Overview
This implementation secures the admin panel and game logic by moving all sensitive operations to Cloudflare Workers.

### Files Created/Modified

#### 1. `/functions/api/admin.js` (NEW)
- **Purpose**: Handles all admin operations (add, update, delete games)
- **Security Features**:
  - Verifies user identity via Firebase ID token
  - Checks admin role in Firestore before allowing operations
  - All database writes happen server-side only
  - Returns 403 for non-admin users

#### 2. `/firestore.rules` (NEW)
- **Purpose**: Firestore security rules
- **Key Rules**:
  - `games` collection: Only admins can create/update/delete
  - `users` collection: Users can read their own data, admins can read all
  - `bets` collection: Immutable after creation
  - Helper function `isAdmin()` checks user role

#### 3. `/admin.html` (MODIFIED)
- **Changes**:
  - Removed direct Firestore write operations (`addDoc`, `updateDoc`, `deleteDoc`)
  - Added `callAdminApi()` function to communicate with Cloudflare Worker
  - All game management now goes through `/api/admin` endpoint
  - Admin status verified via server response, not client-side check

#### 4. `/functions/[[path]].ts` (NEW)
- **Purpose**: Cloudflare Workers router
- **Routes**:
  - `POST /api/wager` → Game betting logic
  - `POST /api/admin` → Admin operations
  - `GET /api/config` → Firebase/Cloudinary config

#### 5. `/wrangler.toml` (NEW)
- **Purpose**: Cloudflare Workers configuration
- **Usage**: Deploy with `wrangler deploy`

### Security Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser   │────▶│ Cloudflare Worker│────▶│  Firestore  │
│  (Frontend) │     │   (/api/admin)   │     │  Database   │
└─────────────┘     └──────────────────┘     └─────────────┘
       │                      │                       │
       │ 1. Send ID Token     │                       │
       │─────────────────────▶│                       │
       │                      │ 2. Verify Token       │
       │                      │    Check Admin Role   │
       │                      │──────────────────────▶│
       │                      │ 3. Return User Data   │
       │                      │◀──────────────────────│
       │                      │                       │
       │                      │ 4. If Admin: Execute  │
       │                      │    Operation          │
       │                      │──────────────────────▶│
       │ 5. Return Result     │                       │
       │◀─────────────────────│                       │
```

### Deployment Steps

1. **Set up Cloudflare Workers:**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Configure secrets:**
   ```bash
   wrangler secret put apiKey
   wrangler secret put authDomain
   wrangler secret put projectId
   wrangler secret put storageBucket
   wrangler secret put messagingSenderId
   wrangler secret put appId
   wrangler secret put CLOUDINARY_CLOUD_NAME
   wrangler secret put CLOUDINARY_UPLOAD_PRESET
   ```

3. **Deploy Firestore rules:**
   ```bash
   firebase deploy --only firestore:rules
   # Or use Google Cloud Console to upload firestore.rules
   ```

4. **Deploy Workers:**
   ```bash
   wrangler deploy
   ```

### Testing Admin Access

As an admin user (role = 'admin' in Firestore):

1. Log in to `admin.html`
2. Try adding a new game - should succeed
3. Try editing/deleting games - should succeed

As a regular user (role = 'user'):

1. Log in to `admin.html`
2. Should be redirected to index.html
3. Direct API calls should return 403 Forbidden

### API Endpoints

#### POST /api/admin
**Actions:**
- `addGame`: Add new game
- `updateGame`: Update existing game
- `deleteGame`: Delete game
- `getGames`: Fetch all games
- `getUser`: Get user details (admin only)

**Request Body:**
```json
{
  "idToken": "firebase_id_token",
  "action": "addGame",
  "gameData": {
    "title": "Game Name",
    "page": "game.html",
    "emoji": "🎮",
    "category": "originals",
    "image": "https://..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Game added successfully",
  "gameId": "abc123"
}
```

### Security Checklist

✅ All admin operations moved to Cloudflare Workers
✅ User identity verified via Firebase ID token
✅ Admin role checked server-side before any operation
✅ Firestore rules deny client writes to games collection
✅ No direct database access from frontend for admin operations
✅ Balance updates handled atomically in wager API
✅ Game RNG generated server-side only
