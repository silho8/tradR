# tradR Supabase Auth Email Templates

These are for Supabase Dashboard → Authentication → Email Templates. They are **not** Resend templates. Keep the Supabase variable `{{ .ConfirmationURL }}` exactly as written so Supabase generates the secure, expiring link.

## 1. Confirm signup

**Subject:** Confirm your tradR email

Paste this into the **Confirm signup** message body:

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f7f8f4;font-family:Arial,Helvetica,sans-serif;color:#172b3a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f4;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce4db;">
          <tr><td style="background:#102a43;padding:22px 28px;color:#ffffff;font-size:26px;font-weight:800;">trad<span style="color:#c8f169;">R.</span></td></tr>
          <tr><td style="height:5px;background:#c8f169;font-size:1px;line-height:5px;">&nbsp;</td></tr>
          <tr><td style="padding:34px 30px 10px;font-size:11px;letter-spacing:1.8px;font-weight:bold;color:#71863c;">EMAIL CONFIRMATION</td></tr>
          <tr><td style="padding:0 30px 14px;font-size:28px;line-height:36px;font-weight:bold;color:#102a43;">Confirm your email address</td></tr>
          <tr><td style="padding:0 30px 24px;font-size:15px;line-height:25px;color:#536874;">Welcome to tradR. Confirm this email address to finish creating your account and start using the marketplace.</td></tr>
          <tr><td style="padding:0 30px 28px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#c8f169;color:#102a43;text-decoration:none;font-size:14px;font-weight:bold;padding:14px 20px;border-radius:3px;">Confirm email address</a>
          </td></tr>
          <tr><td style="padding:0 30px 28px;font-size:12px;line-height:20px;color:#697a85;">If the button does not work, copy this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color:#536d2a;word-break:break-all;">{{ .ConfirmationURL }}</a><br><br>If you did not create a tradR account, you can safely ignore this email.</td></tr>
          <tr><td style="background:#f7f8f4;border-top:1px solid #dce4db;padding:18px 30px;font-size:11px;line-height:18px;color:#7b898c;">tradR · Your campus marketplace<br><a href="https://www.tradrr.store" style="color:#536d2a;">www.tradrr.store</a></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
```

## 2. Reset password

**Subject:** Reset your tradR password

Paste this into the **Reset password** message body:

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f7f8f4;font-family:Arial,Helvetica,sans-serif;color:#172b3a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f4;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce4db;">
          <tr><td style="background:#102a43;padding:22px 28px;color:#ffffff;font-size:26px;font-weight:800;">trad<span style="color:#c8f169;">R.</span></td></tr>
          <tr><td style="height:5px;background:#c8f169;font-size:1px;line-height:5px;">&nbsp;</td></tr>
          <tr><td style="padding:34px 30px 10px;font-size:11px;letter-spacing:1.8px;font-weight:bold;color:#71863c;">ACCOUNT SECURITY</td></tr>
          <tr><td style="padding:0 30px 14px;font-size:28px;line-height:36px;font-weight:bold;color:#102a43;">Reset your password</td></tr>
          <tr><td style="padding:0 30px 24px;font-size:15px;line-height:25px;color:#536874;">We received a request to reset the password for your tradR account. Use the button below to choose a new password.</td></tr>
          <tr><td style="padding:0 30px 28px;">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#c8f169;color:#102a43;text-decoration:none;font-size:14px;font-weight:bold;padding:14px 20px;border-radius:3px;">Reset password</a>
          </td></tr>
          <tr><td style="padding:0 30px 28px;font-size:12px;line-height:20px;color:#697a85;">If the button does not work, copy this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color:#536d2a;word-break:break-all;">{{ .ConfirmationURL }}</a><br><br>If you did not request a password reset, ignore this email. Your current password will remain unchanged.</td></tr>
          <tr><td style="background:#f7f8f4;border-top:1px solid #dce4db;padding:18px 30px;font-size:11px;line-height:18px;color:#7b898c;">tradR · Your campus marketplace<br><a href="https://www.tradrr.store" style="color:#536d2a;">www.tradrr.store</a></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>
```

## Dashboard steps still required

1. Open https://supabase.com/dashboard/project/mmwgmgzpxzkhbrabloiq/auth/templates
2. Open **Confirm signup**, set the subject above, replace the message body with the first HTML template, and save.
3. Open **Reset password**, set the subject above, replace the message body with the second HTML template, and save.
4. Open https://supabase.com/dashboard/project/mmwgmgzpxzkhbrabloiq/auth/smtp and verify custom SMTP is enabled, host is `smtp.resend.com`, port is `465` (SSL) or `587` (STARTTLS), username is `resend`, sender email is `support@tradrr.store`, and sender name is `tradR`. Do not share the SMTP password/API key in chat.
5. In Supabase URL configuration, ensure `https://www.tradrr.store/auth/confirmed` and `https://www.tradrr.store/auth/reset-password` are allowed redirects.
6. Test signup with an unused email and password recovery with a test account. Check inbox and spam. Confirm each link lands on the correct tradR page.

**Delivery note:** a public DNS lookup did not return a DMARC TXT record for `_dmarc.tradrr.store` during this check. After confirming DNS is authoritative at Namecheap or elsewhere, add a DMARC record if one truly is absent. Start with a monitoring policy such as `v=DMARC1; p=none; rua=mailto:support@tradrr.store; adkim=r; aspf=r` only if that mailbox can receive DMARC reports; otherwise omit `rua`. Do not set `p=reject` until all legitimate senders are aligned and monitored.
