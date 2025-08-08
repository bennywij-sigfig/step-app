# Shadow Leaderboard Database Schema Design

## Overview
The shadow leaderboard introduces an alternative "steps" system through an embedded tap-to-jump pig game. Users discover this through a hidden UI toggle that reveals a shadow mode with inverted theming.

## Database Tables

### `shadow_steps` Table
Parallel structure to the main `steps` table for shadow steps earned through gameplay.

```sql
CREATE TABLE IF NOT EXISTS shadow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL,
  game_sessions INTEGER DEFAULT 0,
  longest_run INTEGER DEFAULT 0,
  total_distance INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  UNIQUE(user_id, date)
);
```

### `shadow_hearts` Table
Daily heart system with cheat protection - users get 5 hearts per day.

```sql
CREATE TABLE IF NOT EXISTS shadow_hearts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  hearts_remaining INTEGER DEFAULT 5,
  hearts_used INTEGER DEFAULT 0,
  last_play_time DATETIME,
  total_attempts INTEGER DEFAULT 0,
  suspicious_activity INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  UNIQUE(user_id, date)
);
```

### `shadow_game_sessions` Table
Detailed logging for cheat detection and analytics.

```sql
CREATE TABLE IF NOT EXISTS shadow_game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  steps_earned INTEGER NOT NULL,
  distance_traveled INTEGER NOT NULL,
  obstacles_passed INTEGER DEFAULT 0,
  play_duration INTEGER NOT NULL, -- in milliseconds
  hearts_spent INTEGER DEFAULT 1,
  client_timestamp DATETIME,
  server_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address TEXT,
  suspicious_flags TEXT, -- JSON string of flags
  FOREIGN KEY (user_id) REFERENCES users (id)
);
```

### `shadow_user_preferences` Table
User preferences for shadow mode discovery and settings.

```sql
CREATE TABLE IF NOT EXISTS shadow_user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  shadow_mode_discovered BOOLEAN DEFAULT 0,
  shadow_theme_preference TEXT DEFAULT 'auto', -- 'auto', 'dark', 'light'
  game_sensitivity INTEGER DEFAULT 5, -- 1-10 scale for jump sensitivity
  sound_enabled BOOLEAN DEFAULT 1,
  discovered_at DATETIME,
  last_shadow_activity DATETIME,
  total_shadow_sessions INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  UNIQUE(user_id)
);
```

## Key Design Decisions

### 1. Parallel Structure
- `shadow_steps` mirrors the main `steps` table structure
- Separate shadow leaderboards without affecting main challenge
- Can be easily toggled on/off per user

### 2. Cheat Protection
- **Hearts System**: Limited attempts per day (5 hearts)
- **Session Logging**: Detailed tracking with timestamps and IP
- **Suspicious Activity**: Flags for unusual patterns (too fast completion, impossible scores)
- **Rate Limiting**: Server-side validation of play frequency

### 3. Discovery Mechanism
- Hidden UI element (maybe triggered by specific click pattern or easter egg)
- `shadow_mode_discovered` flag tracks who found it
- Progressive revelation to maintain mystery

### 4. Game Integration
- Steps earned based on distance traveled in pig game
- Obstacles passed and play duration for analytics
- Multiple sessions per day allowed (until hearts run out)

## API Endpoints (to be implemented)

```
POST /api/shadow/discover          # Mark shadow mode as discovered
GET  /api/shadow/status           # Get user's shadow status (hearts, steps)
POST /api/shadow/play-session     # Submit game session results
GET  /api/shadow/leaderboard      # Get shadow leaderboard
GET  /api/shadow/my-stats         # Get user's shadow statistics
```

## Cheat Detection Algorithms

### Time-based Detection
- Minimum play duration for given distance
- Maximum reasonable steps per minute
- Pattern detection for automated play

### Statistical Analysis
- Compare user's performance to population averages
- Flag sudden improvements in performance
- Detect impossible scores or distances

### Rate Limiting
- Max sessions per hour (to prevent spam)
- Exponential backoff for failed attempts
- IP-based rate limiting

## Integration with Existing Systems

### Theme System
- Invert current theme when in shadow mode
- Store shadow theme preference separately
- Smooth transitions between modes

### Physics System
- Reuse existing confetti physics for game elements
- Pig character physics using same system
- Obstacle bounce/collision detection

### User Management
- No changes to existing user structure
- Shadow preferences stored separately
- Admin can view shadow statistics

This design maintains the mystery and excitement of discovery while providing robust cheat protection and seamless integration with your existing architecture.