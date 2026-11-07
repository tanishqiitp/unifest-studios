# Launch setup: email sending and Google sign-in

Two steps need your own accounts, so they can't be done from the code. Each takes about 10 minutes.

## 1. Real email sending (needed before launch)

Supabase's built-in sender allows only a few sign-in emails per hour and can't use the branded Unifest email. A free Resend account fixes both.

You need a domain you control (for example `unifest.in`), because email services only send from verified domains.

1. Sign up at https://resend.com (free plan: 3,000 emails a month).
2. **Domains → Add domain**, enter a subdomain such as `mail.unifest.in`, and add the DNS records Resend shows at your domain provider. Wait until it says **Verified**.
3. **API Keys → Create API key** (permission: Sending access). Copy it. Don't send it to anyone, including in chat.
4. In Supabase: **Project → Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: `no-reply@mail.unifest.in` · Sender name: `Unifest Studios`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: the API key
5. Still in Supabase: **Authentication → Rate Limits**, raise "emails sent per hour" (for example to 100).
6. Tell Claude it's done. The branded templates in `supabase/templates/` can then be switched on (uncomment the lines at the end of `supabase/config.toml` and run `supabase config push`).

## 2. Continue with Google (optional)

The app already has the button. It appears by itself once Google is switched on in Supabase.

1. Go to https://console.cloud.google.com, create a project (for example "Unifest Studios").
2. **APIs & Services → OAuth consent screen**: External, app name "Unifest Studios", your support email, then publish.
3. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origins: `https://unifest-studios.vercel.app`
   - Authorised redirect URI: `https://geagslcdzmniegzifzmp.supabase.co/auth/v1/callback`
4. Copy the client ID and client secret.
5. In Supabase: **Authentication → Sign In / Providers → Google**, turn it on, paste the client ID and secret, save. Don't send the secret in chat.
6. Open the site and click **Sign in**: "Continue with Google" is now there.

## If you add your own domain to the site

When the site moves from `unifest-studios.vercel.app` to your own domain, update:
- Vercel: **Settings → Domains**.
- Supabase: `site_url` and `additional_redirect_urls` in `supabase/config.toml`, then `supabase config push`.
- Google (if set up): the authorised JavaScript origin.
- `index.html`: the `og:url` and `og:image` addresses.
