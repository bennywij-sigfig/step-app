-- Step Challenge 2026 roster
--
-- Assigns only existing users whose email matches this roster. Email is the
-- authoritative unique identifier; expected_name is retained for audit output
-- because legacy accounts may have a short or email-local-part display name.
-- People not yet registered in the application are intentionally skipped.
--
-- Run against the application's SQLite database after taking a backup. The
-- statement is idempotent: re-running it creates no duplicate team entries and
-- sets the same assignments again.
--
-- This application stores the current challenge roster in `teams` and
-- `users.team`; team assignments are not keyed to a challenge ID. Run this only
-- while Step Challenge 2026 is the active challenge.

BEGIN IMMEDIATE;

CREATE TEMP TABLE roster (
  expected_name TEXT NOT NULL,
  expected_email TEXT NOT NULL,
  team_name TEXT NOT NULL,
  PRIMARY KEY (expected_email)
);

INSERT INTO roster (expected_name, expected_email, team_name) VALUES
  -- Team 1
  ('Amit Srivastava', 'amit.srivastava@sigfig.com', 'Team 1'),
  ('Craig Greenwood', 'craig.greenwood@sigfig.com', 'Team 1'),
  ('Dana Menser', 'dana.menser@sigfig.com', 'Team 1'),
  ('Deepak Mishra', 'deepak.mishra@sigfig.com', 'Team 1'),
  ('Harsh Raj', 'harsh.raj@sigfig.com', 'Team 1'),
  ('Sudhakar Vyas', 'sudhakar.vyas@sigfig.com', 'Team 1'),
  -- Team 2
  ('Dan Mercurio', 'dan.mercurio@sigfig.com', 'Team 2'),
  ('Megan Crowley', 'megan.crowley@sigfig.com', 'Team 2'),
  ('Mrityunjay Kumar', 'mrityunjay.kumar@sigfig.com', 'Team 2'),
  ('Sai Krishna', 'sai.krishna@sigfig.com', 'Team 2'),
  ('Shashwat Chadha', 'shashwat.chadha@sigfig.com', 'Team 2'),
  ('Vaibhav Sharma', 'vaibhav.sharma@sigfig.com', 'Team 2'),
  -- Team 3
  ('Aaron Sanfillippo', 'aaron.sanfillippo@sigfig.com', 'Team 3'),
  ('Anurag Shrivastava', 'anurag.shrivastava@sigfig.com', 'Team 3'),
  ('Harpreet Chaudhary', 'harpreet.chaudhary@sigfig.com', 'Team 3'),
  ('Mike Sha', 'mike.sha@sigfig.com', 'Team 3'),
  ('Roy Romarate', 'roy.romarate@sigfig.com', 'Team 3'),
  ('Sachin Goyal', 'sachin.goyal@sigfig.com', 'Team 3'),
  -- Team 4
  ('Ajay Srikumar', 'ajay.srikumar@sigfig.com', 'Team 4'),
  ('Patty Howard', 'patty.howard@sigfig.com', 'Team 4'),
  ('Richard Hoska', 'richard.hoska@sigfig.com', 'Team 4'),
  ('Romil Gupta', 'romil.gupta@sigfig.com', 'Team 4'),
  ('Shashi Kant', 'shashi.kant@sigfig.com', 'Team 4'),
  ('Tejas Parkar', 'tejas.parkar@sigfig.com', 'Team 4'),
  -- Team 5
  ('Hardik Agarwal', 'hardik.agarwal@sigfig.com', 'Team 5'),
  ('Priya Joshi', 'priya.joshi@sigfig.com', 'Team 5'),
  ('Roger Fong', 'roger.fong@sigfig.com', 'Team 5'),
  ('Shreyan Ghosh', 'shreyan.ghosh@sigfig.com', 'Team 5'),
  ('Vaibhav Shinghal', 'vaibhav.shinghal@sigfig.com', 'Team 5'),
  ('William Matsuno', 'william.matsuno@sigfig.com', 'Team 5'),
  -- Team 6
  ('Alfiya Memon', 'alfiya.memon@sigfig.com', 'Team 6'),
  ('Benny Wijatno', 'benny.wijatno@sigfig.com', 'Team 6'),
  ('Vamshi Krishna', 'vamshi.krishna@sigfig.com', 'Team 6'),
  ('Tarun Arora', 'tarun.arora@sigfig.com', 'Team 6'),
  ('Vishal Jain', 'vishal.jain@sigfig.com', 'Team 6'),
  -- Team 7
  ('Aayush Agrawal', 'aayush.agrawal@sigfig.com', 'Team 7'),
  ('Anubhav Adarsh', 'anubhav.adarsh@sigfig.com', 'Team 7'),
  ('Benazir Qureshi', 'benazir.qureshi@sigfig.com', 'Team 7'),
  ('Samarth Khandelwal', 'samarth.khandelwal@sigfig.com', 'Team 7'),
  ('Tom Smith', 'tom.smith@sigfig.com', 'Team 7');

-- Preserve all seven requested team entries even when a team currently has no
-- registered members.
INSERT OR IGNORE INTO teams (name)
SELECT DISTINCT team_name FROM roster;

-- Email is unique in users and is the authoritative match. This permits
-- pre-existing accounts with legacy short display names to be assigned.
UPDATE users AS u
SET team = (
  SELECT r.team_name
  FROM roster AS r
  WHERE lower(trim(r.expected_email)) = lower(trim(u.email))
)
WHERE EXISTS (
  SELECT 1
  FROM roster AS r
  WHERE lower(trim(r.expected_email)) = lower(trim(u.email))
);

-- Verification output. Rows here were skipped and require no action until the
-- person has registered with the roster email.
SELECT r.team_name, r.expected_name, r.expected_email
FROM roster AS r
WHERE NOT EXISTS (
  SELECT 1
  FROM users AS u
  WHERE lower(trim(u.email)) = lower(trim(r.expected_email))
)
ORDER BY r.team_name, r.expected_name;

-- Final roster output: only successful assignments appear.
SELECT r.team_name, u.name, u.email
FROM roster AS r
JOIN users AS u
  ON lower(trim(u.email)) = lower(trim(r.expected_email))
ORDER BY r.team_name, u.name;

DROP TABLE roster;
COMMIT;
