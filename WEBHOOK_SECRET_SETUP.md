# Webhook Secret Setup Guide

## ✅ Your Webhook Secret Has Been Generated!

Your `.env` file has been created with a secure webhook secret. Here's what you need to know:

### 🔑 Your Webhook Secret

```
a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c
```

**⚠️ IMPORTANT:** This secret is already set in your `.env` file. Keep it secure!

---

## 📋 How to Use Your Webhook Secret

### 1. In Your Web Application

When making requests to the webhook API, include the secret in the `Authorization` header:

```javascript
const WEBHOOK_SECRET = 'a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c';

fetch('http://localhost:3001/api/voice/mute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WEBHOOK_SECRET}`
  },
  body: JSON.stringify({
    userId: '123456789',
    guildId: '987654321',
    reason: 'Night phase'
  })
});
```

### 2. Test the Connection

Open the interactive demo: [docs/mafia-webhook-example.html](docs/mafia-webhook-example.html)

1. Set **Webhook API URL** to: `http://localhost:3001`
2. Set **Webhook Secret** to: `a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c`
3. Enter your Discord Guild ID
4. Click "Test Connection"

---

## 🔄 Generating a New Secret (If Needed)

If you ever need to regenerate your webhook secret:

### Method 1: Node.js (Recommended)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Method 2: OpenSSL (Linux/Mac)
```bash
openssl rand -hex 32
```

### Method 3: PowerShell (Windows)
```powershell
-join ((48..57) + (97..102) | Get-Random -Count 64 | % {[char]$_})
```

### Method 4: Online Generator
Visit: https://randomkeygen.com/ and use a "CodeIgniter Encryption Key" or similar 64-character hex string.

---

## 🔒 Security Best Practices

### ✅ DO:
- Keep your `.env` file private (it's already in `.gitignore`)
- Use HTTPS in production (not HTTP)
- Regenerate the secret if it's ever compromised
- Use different secrets for development and production
- Store secrets in environment variables on your server

### ❌ DON'T:
- Commit `.env` to git
- Share your secret in Discord, Slack, or other chat apps
- Use the same secret across multiple projects
- Hardcode the secret in your website's JavaScript (use a backend proxy)
- Use HTTP in production (always use HTTPS)

---

## 📝 Current Configuration

Your `.env` file is configured with these webhook settings:

```env
MAFIA_WEBHOOK_PORT=3001
MAFIA_WEBHOOK_SECRET=a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c
MAFIA_WEB_ORIGIN=*
```

### What These Mean:

- **MAFIA_WEBHOOK_PORT**: The port the webhook API runs on (default: 3001)
- **MAFIA_WEBHOOK_SECRET**: Your authentication secret
- **MAFIA_WEB_ORIGIN**: Allowed CORS origins
  - `*` = Allow all origins (good for development)
  - `https://yourgame.com` = Only allow specific domain (use in production)

---

## 🚀 Next Steps

1. **Fill in your other API keys** in `.env`:
   - `DISCORD_BOT_TOKEN` - Your Discord bot token
   - `OPENAI_API_KEY` - (Optional) For mute bee emoji translation
   - Other optional keys

2. **Start the bot**:
   ```bash
   npm start
   ```

3. **Verify the webhook server started**:
   You should see:
   ```
   ✅ Mafia Webhook API server listening on port 3001
   🔒 Webhook authentication is ENABLED
   ```

4. **Test the API**:
   ```bash
   curl http://localhost:3001/health
   ```

   Expected response:
   ```json
   {
     "success": true,
     "service": "Mafia Webhook API",
     "status": "online",
     "timestamp": "2025-11-08T..."
   }
   ```

---

## 🔧 Troubleshooting

### "Webhook authentication is DISABLED"
- Make sure `MAFIA_WEBHOOK_SECRET` is set in `.env`
- Restart the bot after adding the secret

### "401 Unauthorized" errors
- Check that the secret in your web app matches the one in `.env`
- Ensure you're using `Bearer ` prefix: `Authorization: Bearer <secret>`
- Make sure there are no extra spaces or line breaks

### "Port 3001 already in use"
- Change `MAFIA_WEBHOOK_PORT` to a different port (e.g., 3002)
- Or kill the process using port 3001

### CORS errors in browser
- For development, set `MAFIA_WEB_ORIGIN=*`
- For production, set to your domain: `MAFIA_WEB_ORIGIN=https://yourgame.com`

---

## 📚 Additional Resources

- **Quick Start Guide**: [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md)
- **API Documentation**: [api/README.md](api/README.md)
- **Interactive Demo**: [docs/mafia-webhook-example.html](docs/mafia-webhook-example.html)
- **GitHub Pages Documentation**: https://yourusername.github.io/BobbyTheBot/webhook-api.html

---

## 🔐 Production Deployment

When deploying to production:

1. **Generate a new secret** (don't use the development one)
2. **Use environment variables** on your server (not a .env file)
3. **Enable HTTPS** for all webhook API requests
4. **Restrict CORS** to your specific domain
5. **Add rate limiting** to prevent abuse
6. **Monitor logs** for suspicious activity

Example production environment setup:
```bash
# On your production server
export MAFIA_WEBHOOK_SECRET="<new-production-secret>"
export MAFIA_WEB_ORIGIN="https://yourgame.com"
export MAFIA_WEBHOOK_PORT=3001
```

---

**Need Help?** Check the troubleshooting sections in:
- [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md)
- [api/README.md](api/README.md)
- [docs/webhook-api.html](docs/webhook-api.html)
