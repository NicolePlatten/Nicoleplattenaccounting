# Nicole Platten Accounting — Client Portal Setup

The portal UI and security model are built. The website cannot go live until the Supabase project values and email sender are connected.

## 1. Create Supabase project
Create a free Supabase project. In Project Settings > API, copy the Project URL and **publishable** key into `portal-config.js`. Never put a secret/service-role key in website files.

## 2. Create database
Open Supabase SQL Editor and run `supabase/schema.sql`.

## 3. Create Nicole admin login
In Authentication > Users create Nicole's user with her chosen login email/password. Then run the final commented SQL line in `schema.sql`, replacing `NICOLES_LOGIN_EMAIL` with that email.

## 4. Deploy Edge Functions
Using Supabase CLI from this project folder:

    supabase login
    supabase link --project-ref YOUR_PROJECT_REF
    supabase functions deploy create-client
    supabase functions deploy email-document

## 5. Configure document email
Create a free Resend account and verify `nicoleplattenaccounting.co.uk`. Create an API key. In Supabase Edge Function secrets set:

    RESEND_API_KEY=...
    NICOLE_DOCUMENT_EMAIL=nicoleplatten@outlook.com
    DOCUMENT_FROM_EMAIL=Nicole Platten Portal <documents@nicoleplattenaccounting.co.uk>

Do not commit these values to GitHub.

## 6. URLs
- `client-login.html` — clients and Nicole sign in here.
- `portal.html` — client dashboard.
- `admin.html` — Nicole-only dashboard.

## Security
RLS restricts clients to their own record/messages. Admin access is checked server-side. Client creation happens in an authenticated Edge Function so privileged credentials never enter GitHub/browser code. Documents are sent as email attachments and are not inserted into Supabase Storage/database.
