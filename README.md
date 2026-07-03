# DevOneStack — Backend (Auth Server)

A secure Express + MongoDB REST API providing **JWT-based authentication** with Google OAuth 2.0, GitHub OAuth 2.0, and manual email/password flows. Tokens are issued as httpOnly cookies — never exposed to JavaScript.

---

## Tech Stack

| Layer            | Technology                     |
| ---------------- | ------------------------------ |
| Runtime          | Node.js (ESM, `"type":"module"`) |
| Framework        | Express 5                      |
| Database         | MongoDB Atlas via Mongoose 8   |
| Auth Strategy    | Passport.js (`session: false`) |
| OAuth Providers  | Google OAuth 2.0, GitHub OAuth 2.0 |
| Password Hashing | bcryptjs (saltRounds: 12)      |
| Token Auth       | JSON Web Tokens (JWT)          |
| Cookie Handling  | cookie-parser                  |
| CORS             | cors (locked to CLIENT_URL)    |
| Config           | dotenv                         |

---

## Project Structure

```
Backend/
├── config/
│   ├── db.js                 # MongoDB Atlas connection (connectDB)
│   └── passport.js           # Google + GitHub Passport strategies
├── controllers/              # Controller logic separating route handlers
│   ├── auth.controller.js
│   ├── boilerplate.controller.js
│   └── inbox.controller.js
├── middleware/               # Custom middleware
│   ├── protectRoute.js       # JWT token guard (replaces requireAuth)
│   ├── rateLimiter.js        # API rate limiters (login, signup, forgot password)
│   └── requireAuth.js        # Deprecated JWT guard (kept for compatibility)
├── models/                   # MongoDB (Mongoose) schemas
│   ├── Boilerplate.js        # User boilerplate files schema
│   ├── InboxItem.js          # User inbox items schema
│   ├── Space.js              # User tool/work space schema
│   └── User.js               # User accounts schema
├── routes/                   # Express routing tables
│   ├── auth.routes.js        # Authentication endpoints (Google, GitHub, manual)
│   ├── boilerplate.routes.js # Boilerplate CRUD endpoints
│   ├── inbox.routes.js       # Inbox Items CRUD endpoints
│   └── auth.js               # Deprecated authentication routes (kept for compatibility)
├── utils/                    # Utility helpers
│   ├── email.js              # Email transporter (verification/reset emails via Nodemailer)
│   ├── jwt.js                # JWT sign utilities
│   └── tokens.js             # Token helpers
├── .env                      # Secrets — DO NOT commit (in .gitignore)
├── .env.example              # Template — safe to commit
├── .gitignore
├── package.json
└── server.js                 # Express app entry point
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/devonestack?..."
GOOGLE_CLIENT_ID=from_google_cloud_console
GOOGLE_CLIENT_SECRET=from_google_cloud_console
GITHUB_CLIENT_ID=from_github_developer_settings
GITHUB_CLIENT_SECRET=from_github_developer_settings
JWT_SECRET=<64 char random hex>
JWT_REFRESH_SECRET=<64 char random hex>
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:9000
NODE_ENV=development
```

> **Tip:** Wrap values containing `&` (like MongoDB URIs) in double quotes.

### 3. Register OAuth redirect URIs

**Google Cloud Console** → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs:
```
http://localhost:9000/api/auth/google/callback
```

**GitHub Developer Settings** → OAuth App → Authorization callback URL:
```
http://localhost:9000/api/auth/github/callback
```

### 4. Start the server

```bash
npm run dev       # node --watch (auto-restarts on file changes)
npm start         # production
```

Server runs on `http://localhost:9000`.

---

## Available Scripts

| Command       | Description                             |
| ------------- | --------------------------------------- |
| `npm run dev` | Start with `node --watch` (auto-reload) |
| `npm start`   | Start in production mode                |

---

## API Endpoints

### Authentication `/api/auth`

#### OAuth

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/google` | Redirect to Google consent screen |
| **GET** | `/google/callback` | Google callback → issue tokens → redirect to frontend app |
| **GET** | `/github` | Redirect to GitHub consent screen |
| **GET** | `/github/callback` | GitHub callback → issue tokens → redirect to frontend app |

#### Local / Manual Auth

| Method | Endpoint | Body | Description |
| :--- | :--- | :--- | :--- |
| **POST** | `/signup` | `{ name, email, password }` | Sign up user, issue tokens, send verification email (Rate Limited) |
| **POST** | `/login` | `{ email, password }` | Verify credentials, issue tokens (Rate Limited) |
| **POST** | `/logout` | — | Invalidate refresh token, clear cookies |
| **GET** | `/verify-email/:token` | — | Verify email using a verification token |
| **POST** | `/forgot-password` | `{ email }` | Send reset password link via email (Rate Limited) |
| **POST** | `/reset-password/:token`| `{ password }` | Reset password using a reset token |
| **POST** | `/refresh` | — | Rotate access token via refresh cookie |
| **GET** | `/me` | — | Get current user's profile info (Requires `protectRoute`) |

### Inbox Items `/api/inbox` (Requires `protectRoute`)

| Method | Endpoint | Body | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/` | — | Retrieve all inbox items for the current user |
| **POST** | `/` | `{ title, ... }` | Create a new inbox item |
| **PUT** | `/:id` | `{ title, completed, ... }`| Update an inbox item by ID |
| **DELETE**| `/:id` | — | Delete an inbox item by ID |

### Boilerplates `/api/boilerplates` (Requires `protectRoute`)

| Method | Endpoint | Body | Description |
| :--- | :--- | :--- | :--- |
| **GET** | `/` | — | Retrieve all boilerplates for the current user |
| **POST** | `/` | `{ name, ... }` | Create a new boilerplate |
| **PUT** | `/:id` | `{ name, pinned, ... }`| Update a boilerplate by ID |
| **DELETE**| `/:id` | — | Delete a boilerplate by ID |

---

## Auth Flow

```
Email/Password:
  POST /signup or /login
    → bcrypt verify (12 rounds)
    → issue accessToken (15m) + refreshToken (7d) as httpOnly cookies
    → return { user }

OAuth (Google / GitHub):
  GET /google → redirect to provider
    → Passport verifies → find or create User in MongoDB
    → issue cookies → redirect to CLIENT_URL/oauth/callback#token=...

Token Refresh:
  POST /refresh
    → read refreshToken cookie → verify signature
    → check stored token in MongoDB (rotation attack detection)
    → issue new accessToken cookie

Logout:
  POST /logout
    → decode refreshToken → set User.refreshToken = null in DB
    → clear both cookies → 200
```

---

## Security

- ✅ All tokens in **httpOnly cookies** — inaccessible to JavaScript (except access tokens which can be passed via URL hash for client-side routing on initial redirect, then immediately cleared)
- ✅ `secure: true` + `sameSite: "none"` in production (HTTPS only)
- ✅ bcrypt **saltRounds: 12**
- ✅ Same `"Invalid credentials"` message for wrong email or password (no enumeration)
- ✅ Refresh token stored in MongoDB — logout actually invalidates the token
- ✅ Token reuse detection — mismatch returns 403
- ✅ CORS locked to `CLIENT_URL` — no wildcard
- ✅ No secrets in code — all via `process.env`
- ✅ `passport session: false` — sessions managed via JWT only
- ✅ Rate Limiting applied to sensitive auth endpoints (login, signup, forgot password)
- ✅ Helmet configuration for secure HTTP headers

---

## Protecting Routes

Use the `protectRoute` middleware on any route that needs a logged-in user:

```js
import protectRoute from '../middleware/protectRoute.js';

router.get('/toolspaces', protectRoute, getToolSpaces);
// req.userId is available inside the handler
```

---

## Dependencies

```bash
npm install express mongoose passport passport-google-oauth20 passport-github2 jsonwebtoken bcryptjs cookie-parser cors dotenv express-rate-limit express-session express-validator helmet nodemailer connect-mongo
```

| Package | Purpose |
| :--- | :--- |
| `express` | Web framework |
| `mongoose` | MongoDB ODM |
| `passport` | Auth middleware orchestration |
| `passport-google-oauth20`| Google OAuth 2.0 strategy |
| `passport-github2` | GitHub OAuth 2.0 strategy |
| `jsonwebtoken` | Sign and verify JWTs |
| `bcryptjs` | Password hashing (saltRounds: 12) |
| `cookie-parser` | Parse httpOnly cookies from requests |
| `cors` | Cross-origin resource sharing |
| `dotenv` | Load `.env` into `process.env` |
| `express-rate-limit` | Limit repeated requests to public APIs (auth protection) |
| `express-session` | Session support (used optionally/by Passport) |
| `express-validator` | Request validation middleware |
| `helmet` | HTTP header security configuration |
| `nodemailer` | Send verification and reset emails |
| `connect-mongo` | MongoDB session store |

---
