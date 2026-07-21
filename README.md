# 🩺 Swastha — AI Intelligence Layer on ABHA

**Swastha** is a state-of-the-art healthcare AI intelligence platform designed to organize scattered medical records (PDFs, lab reports, prescriptions) into a unified, searchable timeline. Built as an intelligence layer on top of India's ABHA ecosystem.

---

## 🌟 Key Features

- **Google OAuth 2.0 & Email Authentication**: Seamless social login and email signup with 6-digit security OTP verification.
- **Supabase Cloud Database Persistence**: Production-grade Postgres database powered by Supabase with Row Level Security (RLS) support.
- **Account Deduplication**: Enforces single unique user account per email address across Google and Email login methods.
- **Smart Workspace Routing**: Remembers user role choices (Patient vs. Doctor) and routes returning users directly to their dashboard.
- **Real SMTP Email Delivery**: Nodemailer integration with HTML templates for OTP codes and password reset links.
- **Unified Monorepo Architecture**: Single command `npm run dev` boots up Express API (`:5001`) and Vite React frontend (`:5173`) concurrently.

---

## 📁 Repository Structure

```
Swastha/
├── backend/                  # Node.js & Express API Server
│   ├── config/
│   │   └── supabase.js       # Supabase Client SDK initialization
│   ├── db/
│   │   └── users.js          # User database access layer (Supabase / Postgres)
│   ├── routes/
│   │   └── auth.js           # Auth routes (Login, Register, Google OAuth, OTP)
│   ├── utils/
│   │   └── mailer.js         # Nodemailer SMTP email service
│   ├── .env.example          # Backend environment variable template
│   └── server.js             # Backend Express server entry point
├── frontend/                 # React 18 + Vite + TailwindCSS App
│   ├── src/
│   │   ├── context/
│   │   │   └── AuthContext.jsx # React Context for global auth state
│   │   ├── modules/
│   │   │   └── authentication/ # Login, Register, VerifyOTP, RoleSelection UI
│   │   ├── services/
│   │   │   └── auth.js         # Frontend Auth API service layer
│   │   ├── App.jsx             # React Router route declarations
│   │   └── main.jsx            # Application entry point wrapped with Providers
│   └── .env.example          # Frontend environment variable template
├── .gitignore                # Git exclusion rules
├── package.json              # Monorepo root script & dependency manifest
└── tailwind.config.js        # Root Tailwind CSS configuration
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: `v18+` or `v20+`
- **npm**: `v9+`
- **Supabase Account**: Free project at [supabase.com](https://supabase.com)

### 2. Installation
Install all dependencies for root monorepo, backend, and frontend with a single command:

```bash
npm install
```

---

## ⚙️ Environment Configuration

### Backend Setup (`backend/.env`)
Copy `backend/.env.example` to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Populate the required credentials:

```env
PORT=5001

# Google OAuth 2.0 Client ID
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com

# JWT Secret
JWT_SECRET=your_jwt_secret_key_here

# Supabase Credentials (Get from Supabase > Project Settings > API)
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Nodemailer SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_character_google_app_password
EMAIL_FROM="Swastha Support" <your_email@gmail.com>
FRONTEND_URL=http://localhost:5173
```

### Frontend Setup (`frontend/.env`)
Copy `frontend/.env.example` to `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

Populate frontend environment variables:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
VITE_API_BASE_URL=http://localhost:5001/api
```

---

## 🗄️ Database Schema Setup (Supabase)

Run the following SQL snippet in your **Supabase Dashboard > SQL Editor**:

```sql
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255),
  picture TEXT,
  role VARCHAR(50) DEFAULT 'patient',
  auth_provider VARCHAR(50) DEFAULT 'email',
  specialty VARCHAR(255),
  license_number VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🏃 Running the Application

Launch both the **Express Backend** (`http://localhost:5001`) and **Vite Frontend** (`http://localhost:5173`) concurrently:

```bash
npm run dev
```

### Individual Development Servers:
- **Frontend Only**: `npm run dev:frontend`
- **Backend Only**: `npm run dev:backend`

### Production Build:
- **Build Frontend Assets**: `npm run build:frontend`

---

## 🛡️ License

Built for the **Swastha Healthcare AI Hackathon**. All rights reserved.