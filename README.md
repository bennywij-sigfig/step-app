# Step Challenge Web App

A simple web application for tracking daily steps in a team challenge.

## Features

- **Passwordless Authentication**: Magic link login via email
- **Step Tracking**: Input and edit daily step counts
- **Leaderboard**: View rankings with totals and averages
- **Team Support**: Users can be assigned to teams
- **Mobile Optimized**: Responsive design for mobile devices

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure email (optional for testing)**:
   Set these environment variables or edit `server.js`:
   ```bash
   export EMAIL_USER=your-email@gmail.com
   export EMAIL_PASS=your-app-password
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Open in browser**:
   Go to `http://localhost:3000`

## How It Works

1. **Login**: Enter your email to receive a magic link
2. **Dashboard**: Log daily steps with date picker
3. **Leaderboard**: View all participants' progress
4. **Edit**: Modify previously entered step counts

## Database

Uses SQLite with these tables:
- `users` - User profiles and team assignments
- `steps` - Daily step counts per user
- `teams` - Team definitions
- `auth_tokens` - Magic link tokens

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Email**: Nodemailer

## Configuration

For production, configure proper email settings and consider:
- Email domain restrictions
- HTTPS setup
- Database backups
- User management features

## Testing

The app runs on `localhost:3000` and creates a SQLite database file automatically. For testing without email, you can check the server console for magic link URLs.