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

## Practice dashboard upgrade (v10)
Before uploading the v10 admin files, run `SUPABASE-PRACTICE-UPGRADE.sql` once in the Supabase SQL Editor. It adds the stored client attention flag and reminder-status fields used by the upgraded admin dashboard. The migration is additive and uses `IF NOT EXISTS` where possible.


## V11 practice-management upgrade
Run `SUPABASE-PRACTICE-V11.sql` once in the Supabase SQL Editor before using onboarding checklists, document requests, private notes or recurring work templates. The migration is additive and does not delete existing client data.

## V12 potential-client preview access
Run `SUPABASE-POTENTIAL-CLIENTS-V12.sql` once in Supabase SQL Editor.

Deploy the new Edge Function:

    supabase functions deploy create-potential-client

The function uses the same `RESEND_API_KEY` already used by the portal. Optional secrets:

    CLIENT_WELCOME_FROM_EMAIL=Nicole Platten Accounting <documents@nicoleplattenaccounting.co.uk>
    PORTAL_LOGIN_URL=https://nicoleplattenaccounting.co.uk/client-login.html

If those optional values are not set, the function falls back to the existing document sender and the live Nicole Platten Accounting login URL.

Potential clients receive a generated temporary password and `must_change_password=true`, so the existing first-login password-change flow applies. Potential accounts only see the preview portal. Nicole can upgrade them from **Potential clients** in the admin portal; the same login then unlocks the full client portal. Deleting a potential client uses the existing `delete-client` Edge Function.
