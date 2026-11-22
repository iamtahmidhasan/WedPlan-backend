# WedPlan Backend — REST API Service

The backend API service for **WedPlan**, an all-in-one wedding planning and vendor booking platform. Built with Node.js, Express 5, and MongoDB, this service handles authentication verification, service listings, booking lifecycles, reviews and ratings, category management, Stripe transaction verification, and AI-assisted wedding consultations.

---

## 🛠️ Technology Stack

- **Runtime**: [Node.js](https://nodejs.org/) (ES Modules)
- **Framework**: [Express 5](https://expressjs.com/)
- **Database**: [MongoDB Node Driver](https://www.mongodb.com/docs/drivers/node/current/)
- **Payments**: [Stripe Node SDK](https://github.com/stripe/stripe-node)
- **AI Integration**: Google Gemini API via REST
- **Middleware**: CORS, Express JSON Parser, Token Verification

---

## 🗄️ Database Architecture (MongoDB)

All application collections reside inside the `WedPlan` MongoDB database:

| Collection | Purpose |
| :--- | :--- |
| `user` | User profiles, role specifications (`customer`, `vendor`, `admin`), premium membership status, block state. |
| `session` | User active session tokens managed by Better Auth. |
| `Services` | Wedding vendor service packages, pricing, categories, approval status (`pending`, `approved`, `rejected`), media. |
| `Bookings` | Reservation inquiries, customer IDs, vendor IDs, event schedules, locations, and lifecycle statuses (`pending`, `confirmed`, `rejected`, `completed`, `cancelled`). |
| `reviews` | Customer ratings (1–5 stars), written feedback, linked `serviceId`, author details, and timestamps. |
| `Categories` | Curated wedding vendor categories with descriptions and representative imagery. |
| `Bookmarks` | Saved favorite services saved by couples for future reference. |
| `Transactions` | Stripe payment logs, subscription tier upgrades, and verified transaction IDs. |

---

## 🔑 Authentication Middleware (`verifyToken`)

Protected routes require an `Authorization` header containing the user's active session token:

```http
Authorization: Bearer <session_token>
```

The middleware validates the token against the `session` collection, resolves the associated user in the `user` collection, checks if the user is blocked, and attaches `req.user` and `req.role` to the request object.

---

## 📡 API Reference

### 1. Wedding Services
- `GET /services` — Retrieve approved services (supports optional query filters by category, location, and price).
- `POST /services` *(Protected)* — Create a new wedding service (Vendor/Admin).
- `PATCH /services` *(Protected)* — Update an existing service or change approval status (`approved`/`rejected`).
- `DELETE /services` *(Protected)* — Delete a service listing (Owner/Admin).

### 2. Reviews & Ratings
- `GET /reviews` — Retrieve all reviews across the platform. Automatically seeds initial verified dummy reviews if empty.
- `GET /reviews/:serviceId` — Retrieve reviews specific to a wedding service.
- `POST /reviews` *(Protected)* — Submit a 1–5 star rating and review. If a review already exists for this service from the current customer, it updates the existing entry.
- `PUT /reviews/:id` *(Protected)* — Update an existing review message and rating (Owner or Admin).
- `DELETE /reviews/:id` *(Protected)* — Permanently remove a review (Admin only).

### 3. Wedding Vendors
- `GET /vendors` — Retrieve all registered wedding professionals with approved status.
- `GET /vendors/:id` *(Protected)* — Retrieve detailed profile information for a specific vendor.

### 4. Bookings Management
- `GET /bookings` *(Protected)* — Retrieve bookings filtered by user role (customer reservations or incoming vendor requests).
- `POST /bookings` *(Protected)* — Create a new booking inquiry for a service.
- `PATCH /bookings` *(Protected)* — Update booking details or advance status (`pending`, `confirmed`, `completed`, `cancelled`).
- `DELETE /bookings` *(Protected)* — Cancel or remove a booking.

### 5. Categories
- `GET /categories` — List all wedding categories (auto-seeds defaults if empty).
- `POST /categories` *(Protected)* — Create a new category (Admin only).
- `PATCH /categories/:id` *(Protected)* — Update category details (Admin only).
- `DELETE /categories/:id` *(Protected)* — Remove a category (Admin only).

### 6. Bookmarks & Favorites
- `GET /bookmarks` *(Protected)* — Retrieve all bookmarked services for the logged-in customer.
- `POST /bookmarks` *(Protected)* — Add a service to customer bookmarks.
- `DELETE /bookmarks` *(Protected)* — Remove a service from bookmarks.

### 7. Transactions & Subscriptions
- `GET /transactions` *(Protected)* — View transaction history.
- `POST /transactions/verify` *(Protected)* — Verify a Stripe checkout session and upgrade vendor to Premium status.

### 8. AI Wedding Assistant
- `POST /ai-chat` / `POST /api-chat` — Interactive wedding planning assistant powered by Gemini API, trained with the platform's approved service catalog.

---

## ⚙️ Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
DATABASE_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
STRIPE_SECRET_KEY=sk_test_...
GEMINI_API_KEY=AIzaSy...
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
# Start with Node (ESM)
node index.js

# Or start with nodemon (if installed)
npx nodemon index.js
```

The server will listen at `http://localhost:5000` (or your configured `PORT`).

---

## 📜 License
Private & Proprietary. All rights reserved.
