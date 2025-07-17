# Step Challenge App - Development Notes

## 🏗️ Project Overview
A web application for tracking daily steps in a company-wide challenge for ~150 Sigfig employees.

## 🚀 Current Status: MVP Complete ✅
- **Functional**: Core step tracking, leaderboards, admin management
- **Secure**: Session-based auth, SQL injection protection
- **Beautiful**: Modern glass-morphism UI, mobile-responsive
- **Ready for**: Internal company deployment

## 🔧 Tech Stack
- **Backend**: Node.js + Express + SQLite
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Auth**: Passwordless magic links via Mailgun
- **Sessions**: express-session with 24hr expiry
- **Email**: Mailgun API with Simpsons quotes + XKCD links

## 📁 Key Files
- `server.js` - Main Express server with all API routes
- `database.js` - SQLite schema and initialization
- `public/index.html` - Login page
- `public/dashboard.html` - Main user interface
- `public/admin.html` - Admin management dashboard
- `.env` - Environment variables (Mailgun API key)

## 🔑 Environment Variables
```bash
MAILGUN_API_KEY=your_key_here
MAILGUN_DOMAIN=sigfig.com
FROM_EMAIL=data@sigfig.com
SESSION_SECRET=change_in_production
```

## 🎯 Architecture Decisions Made

### Authentication
- **Passwordless**: Magic links only (no passwords to manage)
- **Session-based**: Secure server-side sessions (not JWT)
- **Email domain**: Open to any email (not restricted to @sigfig.com)

### Ranking System
- **Individual**: Ranked by steps per day reported (total ÷ days logged)
- **Teams**: Ranked by team average steps per day
- **Why**: Fair comparison regardless of participation frequency

### Database Design
```sql
users (id, email, name, team, is_admin)
teams (id, name)
steps (user_id, date, count, created_at, updated_at)
auth_tokens (token, email, expires_at, used)
```

### UI/UX Approach
- **Mobile-first**: Designed for phone usage primarily
- **Glass-morphism**: Modern blur/transparency effects
- **Touch-friendly**: 44px+ touch targets, no zoom issues
- **Progressive enhancement**: Works without JS for basic functionality

## 🚨 Known Security Issues
1. **Admin routes unprotected** - `/admin` accessible to anyone
2. **No CSRF protection** - Forms vulnerable to cross-site attacks
3. **No rate limiting** - API endpoints can be abused

## 🧪 Testing Commands
```bash
# Start server
npm start

# Test step validation
curl -X POST http://localhost:3000/api/steps \
  -H "Content-Type: application/json" \
  -d '{"date":"2024-01-01","count":75000}'

# Test leaderboard
curl http://localhost:3000/api/leaderboard | jq

# Test admin endpoints
curl http://localhost:3000/api/admin/users | jq
```

## 🎭 Fun Features
- **Simpsons quotes** in login emails
- **Random XKCD links** for entertainment
- **Smooth animations** throughout UI
- **Glass cards** with backdrop blur effects

## 📊 Current Data
- **Hardcoded admins**: benny@sigfig.com, benazir.qureshi@sigfig.com
- **Sample teams**: Team Alpha, Team Beta, Team Gamma
- **Step limit**: 70,000 steps/day (based on 47k max from last year)

## 🔄 Development Workflow
1. Make changes to code
2. Restart server: `pkill -f "node server.js"; node server.js &`
3. Test at `http://localhost:3000`
4. Check server console for magic links (if email not configured)

## 🚀 Deployment Notes
- **Railway/Render**: Recommended for easy deployment
- **SQLite**: Fine for 150 users, no separate DB needed
- **Email**: Requires Mailgun configuration for production
- **HTTPS**: Required for secure cookies in production

## 📝 Code Patterns
- **Error handling**: Always return JSON errors from API
- **SQL queries**: Use parameterized queries (protection against injection)
- **Sessions**: Check `req.session.userId` for authentication
- **Frontend**: Fetch API with async/await pattern

## 🎯 Next Developer Notes
- **Critical first**: Fix admin authentication (see TODO.md)
- **File structure**: Keep it simple, avoid over-engineering
- **Testing**: Manual testing has been sufficient so far
- **Documentation**: Update this file as you make changes

---
*Last session: Fixed session-based security, added Simpsons quotes, implemented team management*