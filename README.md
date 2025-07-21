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

2. **Configure environment variables**:
   For production, create a `.env` file or set these environment variables:
   ```bash
   # Required for production
   SESSION_SECRET=your-secure-32-char-minimum-secret-key
   NODE_ENV=production
   
   # Email configuration (Mailgun)
   MAILGUN_API_KEY=your-mailgun-api-key
   MAILGUN_DOMAIN=your-domain.com
   FROM_EMAIL=your-sender@your-domain.com
   ```
   
   For local development, the app will work without email configuration (magic links appear in console).

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
- **Email**: Mailgun API

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_SECRET` | Production | auto-generated | Secure session key (32+ chars) |
| `NODE_ENV` | No | development | Set to 'production' for production |
| `MAILGUN_API_KEY` | For email | - | Mailgun API key for sending emails |
| `MAILGUN_DOMAIN` | No | sigfig.com | Your verified Mailgun domain |
| `FROM_EMAIL` | No | data@sigfig.com | Sender email address |

## Production Considerations

- Set `NODE_ENV=production` for security features
- Use strong `SESSION_SECRET` (32+ characters)
- Configure Mailgun for email delivery
- Enable HTTPS for secure cookies
- Consider database backups

## Testing

The app runs on `localhost:3000` and creates a SQLite database file automatically. For testing without email, you can check the server console for magic link URLs.