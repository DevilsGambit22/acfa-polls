# ACFA Community Suite v2

A clean GitHub Pages front end connected to the existing ACFA Supabase project.

## What is included

- Shared Supabase client and configuration
- Command Center dashboard and live activity feed
- Opening Library with approval workflow and voting
- Suggestion Board with status labels and voting
- World Member Map
- Birthday Wall
- Member Shoutouts
- Club Survey
- ACFA Assistant-style Chess.com HTML and plain-text Message Builder
- Local Template Library
- Responsive black, gold, and bronze design
- Clear connection indicator and user-facing error handling

## Installation

1. Run `supabase/acfa-community-suite-safe-schema.sql` in the **existing** Supabase project's SQL Editor.
2. Open **Supabase → Project Settings → API**.
3. Copy the Project URL and anon/publishable key.
4. Open `js/config.js` and replace:
   - `PASTE_YOUR_SUPABASE_URL_HERE`
   - `PASTE_YOUR_SUPABASE_ANON_KEY_HERE`
5. Upload all files and folders to the root of the GitHub Pages repository.
6. In GitHub, open **Settings → Pages** and deploy from the repository's main branch/root.
7. Open the deployed page. The top-right indicator must say **Supabase connected**.

## Important security rule

Never place the Supabase service-role key in GitHub or browser JavaScript. The public anon/publishable key is expected in the browser; Row Level Security in the supplied schema controls access.

## Approval workflow

Opening recommendations, suggestions, and shoutouts enter Supabase as `pending`. Approve them in Supabase by changing their `status`:

```sql
update public.acfa_openings set status = 'approved' where id = 'ITEM-ID';
update public.acfa_suggestions set status = 'approved' where id = 'ITEM-ID';
update public.acfa_shoutouts set status = 'approved' where id = 'ITEM-ID';
```

Suggestion statuses may also be:

- `under_consideration`
- `planned`
- `completed`
- `declined`

## Existing polls

The safe schema deliberately does not delete or alter the old `polls`, `poll_options`, or `votes` tables. This package adds the new `acfa_` modules around that existing project.
