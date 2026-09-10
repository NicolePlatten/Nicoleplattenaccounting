# Nicole Platten Accounting — SEO & Analytics Setup

The code is already prepared. You only need to add your account IDs after creating the free services.

## 1. Google Search Console
Recommended: verify the whole domain using the DNS option in Search Console. This does not require editing the website files. After verification, submit:

`https://nicoleplattenaccounting.co.uk/sitemap.xml`

Then request indexing for the homepage, Services, Content Creators, Who I Help and Contact pages.

## 2. Google Analytics 4
Create a GA4 property and a Web data stream for `https://nicoleplattenaccounting.co.uk`.

Find the Measurement ID (format `G-XXXXXXXXXX`). Open `analytics.js` and replace:

`G-REPLACE_ME`

with your real ID.

Tracked lead actions include:
- WhatsApp clicks
- Phone clicks
- Email clicks
- Contact-page/CTA clicks
- Successful enquiry forms (`generate_lead`) after Formspree succeeds

## 3. Microsoft Clarity
Create a Clarity project for the website. Copy the Project ID and replace:

`REPLACE_ME`

in `analytics.js` under `clarityProjectId`.

## 4. Privacy / analytics choice
The site includes an optional analytics banner. GA4 and Clarity are not loaded until the visitor accepts. Visitors can reopen their choice using Cookie settings in the footer.

## 5. Formspree
Your existing Formspree endpoint remains unchanged. A successful submission sets a temporary success flag and redirects to `thank-you.html`; only a genuine successful form submission triggers the GA4 `generate_lead` event.

## 6. What to watch in Search Console
Once data arrives, look at:
- Queries with high impressions but low clicks → improve titles/descriptions
- Pages ranking around positions 5–20 → good targets for content upgrades
- Searches mentioning Solihull, Birmingham, Marston Green, accountant, self assessment, bookkeeping, landlord, creator or influencer

## 7. What to watch in Analytics / Clarity
- Which landing pages generate WhatsApp/contact clicks
- Google organic vs Instagram/social traffic
- Mobile conversion rate
- Where visitors stop scrolling
- Which service pages lead to enquiries

## Files added/changed
- `analytics.js` — analytics, consent and conversion tracking
- `styles.css` — consent banner styling
- `script.js` — successful Formspree flag
- all `.html` pages — analytics loader + improved metadata
- `privacy.html` — analytics/cookie wording
- `sitemap.xml` and `robots.txt` — refreshed SEO crawl files

## Website 5% offer popup
A branded offer appears after 10 seconds on normal site pages. It captures the visitor email through the existing Formspree endpoint, then reveals code `WEB5OFF`.

GA4 events, once analytics is connected and consent is accepted:
- `discount_offer_view`
- `discount_offer_claim`
- `discount_offer_dismiss`
- `discount_code_copy`

A visitor who dismisses the offer will not see it again for 7 days. A visitor who claims it will not see it again for 180 days.
