# DigitalOcean Environment Variables Setup

## ⚠️ IMPORTANT: All API Keys Must Be Set as Environment Variables

Your bot is now configured to **only** use environment variables for security. No API keys are stored in the code.

---

## 🔧 How to Add Environment Variables in DigitalOcean

### Step 1: Access Your App
1. Go to: https://cloud.digitalocean.com/apps
2. Select your **BobbyTheBot** app
3. Click the **"Settings"** tab

### Step 2: Add Environment Variables
1. Scroll to **"App-Level Environment Variables"**
2. Click **"Edit"**
3. Add each variable below by clicking **"Add Variable"**

---

## 📋 Required Environment Variables

### 1. Discord Bot Token (REQUIRED)
```
KEY:   DISCORD_BOT_TOKEN
VALUE: MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZNqnp.35UImMB1mi2D119PYwUD8sxZmhG1t-DBoJOxmw
TYPE:  ✅ Encrypted
```

### 2. OpenAI API Key (REQUIRED for AI features)
```
KEY:   OPENAI_API_KEY
VALUE: [YOUR_OPENAI_KEY_HERE]
TYPE:  ✅ Encrypted
```

**Get your OpenAI key:**
- Visit: https://platform.openai.com/api-keys
- Click "Create new secret key"
- Copy the key (starts with `sk-proj-` or `sk-`)

### 3. Gemini API Key (OPTIONAL - legacy)
```
KEY:   GEMINI_API_KEY
VALUE: AIzaSyDhIE3XJ4AQetznuZ5l2cQnlxV2ZV1u_9A
TYPE:  ✅ Encrypted
```
*Note: This is for legacy code. Bobby primarily uses OpenAI now.*

### 4. Port (OPTIONAL - auto-assigned by DigitalOcean)
```
KEY:   PORT
VALUE: 3000
TYPE:  Plain Text
```

---

## 📝 Quick Copy-Paste Format

```env
DISCORD_BOT_TOKEN=MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZNqnp.35UImMB1mi2D119PYwUD8sxZmhG1t-DBoJOxmw
OPENAI_API_KEY=YOUR_OPENAI_KEY_HERE
GEMINI_API_KEY=AIzaSyDhIE3XJ4AQetznuZ5l2cQnlxV2ZV1u_9A
PORT=3000
```

---

## ✅ After Adding Variables

1. Click **"Save"** at the bottom
2. Your app will **automatically redeploy**
3. Wait 2-3 minutes for deployment to complete
4. Check deployment logs for success messages

---

## 🔍 Verify Deployment

Look for these messages in your deployment logs:

```
✅ OpenAI API key loaded successfully
🤖 Bobby Conversation Handler (OpenAI GPT-4 Mini) initialized
Role bot is online!
```

If you see warnings:
```
⚠️ OPENAI_API_KEY not found in environment variables
```
**Fix:** Go back and add the `OPENAI_API_KEY` variable.

---

## 🧪 Test Bobby's AI

Once deployed, test in your Discord:

**Test 1: AI Conversation**
```
Bobby, what games can you help me with?
```

**Test 2: Magic 8-Ball**
```
!ask Will I win the lottery?
```

**Test 3: Help Command**
```
!help
```

---

## 🔒 Security Best Practices

✅ **DO:**
- Mark all tokens/keys as **"Encrypted"**
- Use environment variables for all secrets
- Rotate keys if exposed

❌ **DON'T:**
- Commit `.env` files to Git
- Share API keys publicly
- Hardcode secrets in code

---

## 💰 OpenAI Pricing

GPT-4 Mini is extremely affordable:
- **Input:** ~$0.15 per 1M tokens
- **Output:** ~$0.60 per 1M tokens
- **Typical usage:** <$0.01 per day with normal traffic

**Free Tier:**
- 3 requests/minute
- 200 requests/day
- Good for testing

**Paid Tier:**
- Much higher limits
- Pay-as-you-go
- Set spending limits in OpenAI dashboard

---

## 🐛 Troubleshooting

### Bot won't start
- Check all required variables are set
- Verify bot token is correct
- Review deployment logs for errors

### Bobby doesn't respond to name mentions
- Verify `OPENAI_API_KEY` is set
- Check OpenAI account has available credits
- Look for initialization errors in logs

### "OpenAI not configured" message
- OpenAI key is missing or invalid
- Check spelling of variable name: `OPENAI_API_KEY`
- Verify key on OpenAI dashboard

### Variables not taking effect
- Click "Save" after adding variables
- Wait for automatic redeployment
- Check deployment status in DigitalOcean

---

## 📞 Support

If issues persist:
1. Check DigitalOcean deployment logs
2. Verify all environment variables are saved
3. Test OpenAI key at: https://platform.openai.com/playground
4. Review bot console logs for specific errors

---

**Your bot is now secure and ready for production! 🚀**
