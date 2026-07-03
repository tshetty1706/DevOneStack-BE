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
│   ├── db.js              # MongoDB Atlas connection (connectDB)
│   └── passport.js        # Google + GitHub Passport strategies
├── middleware/
│   └── requireAuth.js     # JWT cookie guard for protected routes
├── models/
│   └── User.js            # Mongoose user schema
├── routes/
│   └── auth.js            # All 8 auth endpoints
├── utils/
│   └── tokens.js          # JWT sign helpers + cookieOptions
├── .env                   # Secrets — DO NOT commit (in .gitignore)
├── .env.example           # Template — safe to commit
├── .gitignore
├── package.json
└── server.js              # Express app entry point
```

---

## Prerequisites

- **Node.js** v18 or above
- **MongoDB Atlas** account with a cluster and a database user
- **Google Cloud Console** project with OAuth 2.0 credentials
- **GitHub Developer Settings** OAuth App

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

All routes are prefixed with `/api/auth`.

### OAuth

| Method | Endpoint                  | Description                                     |
| ------ | ------------------------- | ----------------------------------------------- |
| GET    | `/google`                 | Redirect to Google consent screen               |
| GET    | `/google/callback`        | Google callback → issue tokens → redirect to app |
| GET    | `/github`                 | Redirect to GitHub consent screen               |
| GET    | `/github/callback`        | GitHub callback → issue tokens → redirect to app |

### Manual Auth

| Method | Endpoint    | Body                         | Description                          |
| ------ | ----------- | ---------------------------- | ------------------------------------ |
| POST   | `/signup`   | `{ name, email, password }`  | Create account, issue tokens         |
| POST   | `/login`    | `{ email, password }`        | Verify credentials, issue tokens     |
| POST   | `/refresh`  | —                            | Rotate access token via refresh cookie |
| POST   | `/logout`   | —                            | Invalidate refresh token, clear cookies |
| GET    | `/me`       | —                            | Return current user from access token |

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
    → issue cookies → redirect to CLIENT_URL/dashboard

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

- ✅ All tokens in **httpOnly cookies** — inaccessible to JavaScript
- ✅ `secure: true` + `sameSite: "none"` in production (HTTPS only)
- ✅ bcrypt **saltRounds: 12**
- ✅ Same `"Invalid credentials"` message for wrong email or password (no enumeration)
- ✅ Refresh token stored in MongoDB — logout actually invalidates the token
- ✅ Token reuse detection — mismatch returns 403
- ✅ CORS locked to `CLIENT_URL` — no wildcard
- ✅ No secrets in code — all via `process.env`
- ✅ `passport session: false` — sessions managed via JWT only

---

## Protecting Routes

Use the `requireAuth` middleware on any route that needs a logged-in user:

```js
import { requireAuth } from '../middleware/requireAuth.js';

router.get('/toolspaces', requireAuth, getToolSpaces);
// req.userId is available inside the handler
```

---

## Dependencies

```bash
npm install express mongoose passport passport-google-oauth20 passport-github2 jsonwebtoken bcryptjs cookie-parser cors dotenv
```

| Package                  | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `express`                | Web framework                           |
| `mongoose`               | MongoDB ODM                             |
| `passport`               | Auth middleware orchestration           |
| `passport-google-oauth20`| Google OAuth 2.0 strategy              |
| `passport-github2`       | GitHub OAuth 2.0 strategy              |
| `jsonwebtoken`           | Sign and verify JWTs                   |
| `bcryptjs`               | Password hashing (saltRounds: 12)      |
| `cookie-parser`          | Parse httpOnly cookies from requests   |
| `cors`                   | Cross-origin resource sharing          |
| `dotenv`                 | Load `.env` into `process.env`         |

---

## License

Private.
