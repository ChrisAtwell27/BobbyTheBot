# Digital Ocean Webhook API Setup

## 🌊 Your bot is hosted on Digital Ocean!

Since your bot runs on Digital Ocean, you need to configure the webhook API to be accessible from your local browser or web application.

---

## 🔍 Quick Diagnosis

**Error:** `{ "error": "Failed to connect", "message": "Failed to fetch" }`

**Cause:** You're trying to connect to `http://localhost:3001` from your browser, but the bot is running on a remote Digital Ocean server, not your local machine.

---

## ✅ Solution 1: Direct Port Access (Quick Testing)

### Step 1: Get Your Server Information

Find your Digital Ocean droplet's public IP or domain:
```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Check the webhook server is running
curl http://localhost:3001/health
```

### Step 2: Open Port 3001 on Digital Ocean

```bash
# On your Digital Ocean droplet
sudo ufw allow 3001/tcp
sudo ufw reload
sudo ufw status
```

### Step 3: Update CORS Settings

Make sure your environment variables allow external connections:

```bash
# In Digital Ocean's environment variables or .env
MAFIA_WEB_ORIGIN=*  # Allows all origins (for testing only!)
```

### Step 4: Restart the Bot

```bash
# On Digital Ocean
pm2 restart bobby-bot  # or however you run your bot
# or
npm start
```

### Step 5: Test from Your Browser

In the webhook demo ([docs/mafia-webhook-example.html](docs/mafia-webhook-example.html)):

1. **Webhook API URL**: `http://YOUR_DROPLET_IP:3001`
   - Replace `YOUR_DROPLET_IP` with your actual IP (e.g., `http://123.45.67.89:3001`)
2. **Webhook Secret**: Your secret from Digital Ocean env vars
3. **Guild ID**: Your Discord server ID

**⚠️ Security Warning:** This exposes port 3001 to the internet. Only use for testing!

---

## ✅ Solution 2: SSH Tunnel (Secure Testing)

This keeps port 3001 closed but lets you test locally:

### On Your Local Machine:

```bash
ssh -L 3001:localhost:3001 root@your-droplet-ip
```

Keep this terminal open, then in the webhook demo use:
- **Webhook API URL**: `http://localhost:3001`

This securely tunnels the remote port to your local machine.

---

## ✅ Solution 3: HTTPS Reverse Proxy with Nginx (Production Ready)

### Step 1: Install Nginx on Digital Ocean

```bash
# On your droplet
sudo apt update
sudo apt install nginx
```

### Step 2: Configure Nginx

Create nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/webhook-api
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name yourbot.yourdomain.com;  # Change this to your domain

    # Webhook API endpoints
    location /webhook-api/ {
        # Remove /webhook-api/ prefix when proxying
        rewrite ^/webhook-api/(.*) /$1 break;

        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, X-Webhook-Signature' always;

        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
```

### Step 3: Enable the Configuration

```bash
sudo ln -s /etc/nginx/sites-available/webhook-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 4: (Optional) Add HTTPS with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourbot.yourdomain.com
```

### Step 5: Update Your Web Application

Use this URL in your webhook demo:
- **Without HTTPS**: `http://yourbot.yourdomain.com/webhook-api`
- **With HTTPS**: `https://yourbot.yourdomain.com/webhook-api`

Example:
```javascript
const API_URL = 'https://yourbot.yourdomain.com/webhook-api';

fetch(`${API_URL}/health`);  // https://yourbot.yourdomain.com/webhook-api/health
```

---

## 🔧 Troubleshooting on Digital Ocean

### Check if Bot is Running

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Check if process is running
ps aux | grep node

# Check if port 3001 is listening
netstat -tulpn | grep 3001
# or
ss -tulpn | grep 3001
```

### Check Webhook Server Logs

```bash
# If using pm2
pm2 logs bobby-bot

# If using systemd
sudo journalctl -u bobby-bot -f

# Check for this line in logs:
# ✅ Mafia Webhook API server listening on port 3001
# 🔒 Webhook authentication is ENABLED
```

### Test Locally on the Server

```bash
# On the Digital Ocean droplet
curl http://localhost:3001/health
```

Expected response:
```json
{
  "success": true,
  "service": "Mafia Webhook API",
  "status": "online",
  "timestamp": "..."
}
```

### Check Environment Variables

```bash
# Verify environment variables are set
echo $MAFIA_WEBHOOK_PORT
echo $MAFIA_WEBHOOK_SECRET
echo $MAFIA_WEB_ORIGIN
```

### Check Firewall

```bash
sudo ufw status
```

Should show:
```
3001/tcp                   ALLOW       Anywhere
```

---

## 🔐 Production Security Checklist

When deploying for real users:

- [ ] Use HTTPS (not HTTP) via nginx + Let's Encrypt
- [ ] Restrict `MAFIA_WEB_ORIGIN` to your specific domain
- [ ] Close direct port 3001 access (`sudo ufw deny 3001/tcp`)
- [ ] Only allow access through nginx reverse proxy
- [ ] Use a different webhook secret than development
- [ ] Enable rate limiting in nginx:
  ```nginx
  limit_req_zone $binary_remote_addr zone=webhook:10m rate=10r/s;
  limit_req zone=webhook burst=20 nodelay;
  ```
- [ ] Monitor logs for suspicious activity
- [ ] Use environment variables (not .env file)

---

## 📋 Quick Reference

### Update Environment Variables on Digital Ocean

If you're using Digital Ocean's App Platform:
1. Go to your app in Digital Ocean dashboard
2. Settings → Environment Variables
3. Add/update these variables:
   ```
   MAFIA_WEBHOOK_PORT=3001
   MAFIA_WEBHOOK_SECRET=your_secret_here
   MAFIA_WEB_ORIGIN=*  (or your domain)
   ```
4. Save and redeploy

If using a Droplet:
```bash
# Edit environment file
sudo nano /etc/environment

# Or if using pm2
pm2 restart bobby-bot --update-env
```

---

## 🎯 Testing Your Setup

### Test 1: Health Check from Server

```bash
# SSH into Digital Ocean
curl http://localhost:3001/health
```

### Test 2: Health Check from Your Computer

```bash
# Replace with your droplet IP
curl http://YOUR_DROPLET_IP:3001/health
```

### Test 3: From Browser

Open: `http://YOUR_DROPLET_IP:3001/health` in your browser

### Test 4: Interactive Demo

1. Open [docs/mafia-webhook-example.html](docs/mafia-webhook-example.html)
2. Set URL to: `http://YOUR_DROPLET_IP:3001`
3. Enter your webhook secret
4. Click "Test Connection"

---

## 📞 Need Help?

Common issues:

1. **Connection refused**: Bot isn't running or webhook server didn't start
2. **Timeout**: Firewall blocking port 3001
3. **CORS error**: `MAFIA_WEB_ORIGIN` needs to be set to `*` or your domain
4. **401 Unauthorized**: Webhook secret doesn't match

Check logs on Digital Ocean:
```bash
pm2 logs bobby-bot --lines 100
```

Look for:
- ✅ Mafia Webhook API server listening on port 3001
- 🔒 Webhook authentication is ENABLED
- Any error messages

---

## Example: Complete Working Setup

Your Digital Ocean environment variables:
```bash
DISCORD_BOT_TOKEN=your_actual_bot_token
MAFIA_WEBHOOK_PORT=3001
MAFIA_WEBHOOK_SECRET=a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c
MAFIA_WEB_ORIGIN=*
```

Your firewall:
```bash
sudo ufw allow 3001/tcp
```

Your web application:
```javascript
const API_URL = 'http://your-droplet-ip:3001';
const WEBHOOK_SECRET = 'a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c';

fetch(`${API_URL}/health`);  // Should work!
```

---

Ready to test? Get your Digital Ocean IP and try it! 🚀
