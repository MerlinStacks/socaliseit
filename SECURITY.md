# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | ✅ Active support  |
| < 1.0   | ❌ No support      |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to **security@sldevs.com**.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment** within 48 hours
- **Initial assessment** within 7 days
- **Resolution timeline** based on severity
- **Credit** in release notes (if desired)

## Security Best Practices

When self-hosting SocialiseIT:

1. **Environment Variables** — Never commit `.env` files. Use `stack.env.example` as a template.
2. **Database** — Use strong passwords and restrict network access.
3. **OAuth Credentials** — Rotate secrets periodically and use restrictive scopes.
4. **Docker** — Keep images updated and run containers as non-root.
5. **Reverse Proxy** — Use HTTPS with a proper SSL certificate (Let's Encrypt).

## Encryption

- Passwords are hashed with **bcrypt** (cost factor 12)
- OAuth tokens are encrypted at rest
- All API communication should be over HTTPS
