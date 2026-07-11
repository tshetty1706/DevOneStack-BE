# DevOneStack — Backend

Express + MongoDB REST API with JWT auth, Google/GitHub OAuth, Spaces, History tracking, and Inbox.
 
---

## Tech Stack

| | |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| Database | MongoDB Atlas via Mongoose 8 |
| Auth | Passport.js (Google + GitHub OAuth) + JWT |
| Password Hashing | bcryptjs (12 rounds) |
| Cookies | httpOnly JWT — never exposed to JS |
| Security | Helmet, CORS, Rate Limiting |

---

## Setup

```bash
# 1. Install
cd Backend
npm install

# 2. Create .env from template
cp .env.example .env
```

Fill in `.env`:

```env
MONGODB_URI=mongo_uri
JWT_SECRET=<64-char random hex>
JWT_REFRESH_SECRET=<64-char random hex>
GOOGLE_CLIENT_ID=from_google_cloud_console
GOOGLE_CLIENT_SECRET=from_google_cloud_console
GITHUB_CLIENT_ID=from_github_settings
GITHUB_CLIENT_SECRET=from_github_settings
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:9000
NODE_ENV=development
```

```bash
# 3. Run
npm run dev     # nodemon (auto-restart)
npm start       # production
nodemon server.js
```

Server runs at `http://localhost:9000`

---

## Project Structure

```
Backend/
├── config/
│   ├── db.js               # MongoDB connection
│   └── passport.js         # Google + GitHub strategies
├── controllers/
│   ├── auth.controller.js
│   ├── boilerplate.controller.js
│   ├── history.controller.js
│   ├── inbox.controller.js
│   └── space.controller.js
├── middleware/
│   ├── protectRoute.js     # JWT auth guard (use on protected routes)
│   └── rateLimiter.js      # Rate limits for auth endpoints
├── models/
│   ├── User.js
│   ├── Space.js            # Tool workspaces
│   ├── History.js          # Activity log
│   ├── InboxItem.js
│   └── Boilerplate.js
├── routes/
│   ├── auth.routes.js
│   ├── space.routes.js
│   ├── history.routes.js
│   ├── inbox.routes.js
│   └── boilerplate.routes.js
├── utils/
│   ├── email.js            # Email helper (prints link in dev — use EmailJS on frontend)
│   ├── jwt.js              # JWT sign/verify helpers
│   └── tokens.js           # Token generation
└── server.js               # Entry point
```

---

## API Endpoints

### Auth `/api/auth`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/signup` | Register with email + password |
| POST | `/login` | Login with email + password |
| POST | `/logout` | Clear tokens + cookies |
| GET | `/me` | Get current user (protected) |
| GET | `/verify-email/:token` | Verify email address |
| POST | `/forgot-password` | Request password reset |
| POST | `/reset-password/:token` | Set new password |
| POST | `/refresh` | Rotate access token |
| GET | `/google` | Start Google OAuth |
| GET | `/github` | Start GitHub OAuth |

### Spaces `/api/spaces` *(protected)*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get all spaces for current user |
| POST | `/` | Create a new space |
| GET | `/:id` | Get a single space |
| PUT | `/:id` | Update a space |
| DELETE | `/:id` | Delete a space |
| PATCH | `/:spaceId/recount` | Recount and repair all space statistics counters |
| PATCH | `/:spaceId/[notes|snippets|docs|repos|prompts|communities]/:id/pin` | Pin/unpin a space sub-resource |

### Dashboard `/api/dashboard` *(protected)*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/pinned` | Retrieve all pinned items (notes, snippets, docs, repos, prompts, communities) across spaces |

### History `/api/history` *(protected)*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get recent activity. Supports filtering by `?spaceId=ID` |

### Inbox `/api/inbox` *(protected)*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get all inbox items |
| POST | `/` | Create inbox item |
| PUT | `/:id` | Update inbox item |
| DELETE | `/:id` | Delete inbox item |

### Boilerplates `/api/boilerplates` *(protected)*

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Get all boilerplates |
| POST | `/` | Create boilerplate |
| PUT | `/:id` | Update boilerplate |
| DELETE | `/:id` | Delete boilerplate |

---

## OAuth Redirect URIs

Register these in your OAuth provider dashboards:

**Google Cloud Console:**
```
http://localhost:9000/api/auth/google/callback
```

**GitHub Developer Settings:**
```
http://localhost:9000/api/auth/github/callback
```

---

## Notes

- Email sending in dev just prints the verification link to the console (Nodemailer not configured). Email is sent from the **frontend via EmailJS**.
- All tokens stored in **httpOnly cookies** — no localStorage.
- Refresh token stored in MongoDB — logout truly invalidates it.
