# Word Quiz

A simple vocabulary quiz web app with Supabase authentication.

## Setup

1. Copy `config.js.example` to `config.js`:
   ```
   cp config.js.example config.js
   ```

2. Edit `config.js` and fill in your Supabase project URL and anon key:
   ```js
   var CONFIG = {
       SUPABASE_URL: 'https://xxxxx.supabase.co',
       SUPABASE_ANON_KEY: 'eyJhbGciOi...'
   };
   ```

3. Create a `progress` table in Supabase:
   ```sql
   CREATE TABLE progress (
       id BIGSERIAL PRIMARY KEY,
       user_id UUID REFERENCES auth.users(id),
       word TEXT NOT NULL,
       correct BOOLEAN NOT NULL,
       answered_at TIMESTAMPTZ NOT NULL
   );

   ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can insert their own progress"
       ON progress FOR INSERT
       WITH CHECK (auth.uid() = user_id);

   CREATE POLICY "Users can read their own progress"
       ON progress FOR SELECT
       USING (auth.uid() = user_id);
   ```

4. Serve the files with any static file server, or open `index.html` directly. For GitHub Pages, just push to your repo.

## Features

- Email/password signup and login via Supabase
- Multiple-choice vocabulary quiz (343 words)
- Progress tracking stored in Supabase
- Wrong word review with download
- Past quiz history on home page
- Mobile-friendly responsive design
