# MongoDB Atlas Setup Complete! 🎉

## What Was Changed

### Files Created:
- `database/connection.js` - MongoDB connection handler
- `database/models/User.js` - User schema for all persistent data
- `.env` - Environment variables (includes MongoDB connection string)
- `MONGODB_SETUP.md` - This file

### Files Modified:
- `index.js` - Added MongoDB connection on bot startup
- `events/askHandler.js` - Migrated from text files to MongoDB
- `package.json` - Added mongoose, mongodb, and dotenv dependencies

## Next Steps

### 1. Set Your MongoDB Password Locally

Edit `.env` and replace `<db_password>` with your actual MongoDB password:

```env
MONGODB_URI=mongodb+srv://chrisatwell9:YOUR_ACTUAL_PASSWORD@bobbythebot.m7mo0ai.mongodb.net/?retryWrites=true&w=majority&appName=BobbyTheBot
```

### 2. Test Locally

```bash
npm start
```

Check the console for:
- ✅ Connected to MongoDB Atlas
- ✅ OpenAI API key loaded successfully

Test Bobby's memory commands:
- `!setmemory Call me Captain`
- Talk to Bobby and see if he remembers
- `!mymemory` - Check what Bobby remembers

### 3. Add MongoDB URI to DigitalOcean

1. Go to your DigitalOcean App Platform dashboard
2. Navigate to your app → Settings → Environment Variables
3. Add new environment variable:
   - **Key**: `MONGODB_URI`
   - **Value**: `mongodb+srv://chrisatwell9:YOUR_PASSWORD@bobbythebot.m7mo0ai.mongodb.net/?retryWrites=true&w=majority&appName=BobbyTheBot`
   - **Encrypt**: ✅ Yes (recommended)
4. Save and redeploy

### 4. Deploy to DigitalOcean

```bash
git add .
git commit -m "Add MongoDB Atlas integration for persistent data storage"
git push origin main
```

## What This Fixes

✅ **User memories persist across deployments** - Bobby remembers conversations
✅ **Personality scores saved in database** - Custom personality settings won't reset
✅ **Ready for other data migration** - Economy balances, pets, activity stats can now use MongoDB

## MongoDB User Schema

The User model stores:
- `userId` - Discord user ID
- `memory` - Personal memories for Bobby's context
- `personalityScore` - 1-10 scale for Bobby's personality
- `balance` - Economy balance (ready for future migration)
- `messageCount` & `dailyMessageCount` - Activity tracking
- `pet` - Virtual pet data (ready for future migration)
- `valorantRank` - Valorant stats
- `arenaStats` - Gladiator arena stats

## Future Migrations

These handlers can be migrated to MongoDB next:
- `eggbuckHandler.js` - Economy balances
- `virtualPetHandler.js` - Pet data
- `gamblingHandler.js` - Gambling stats
- `kothHandler.js` - Activity tracking
- `gladiatorHandler.js` - Arena stats

All data fields are already in the User schema!

## Troubleshooting

**"Failed to connect to MongoDB"**
- Check your password in MONGODB_URI
- Make sure your IP is whitelisted in MongoDB Atlas (use 0.0.0.0/0 for all IPs)
- Verify the connection string is correct

**"Bobby doesn't remember anything"**
- Check console for MongoDB connection success message
- Make sure MONGODB_URI is set in environment
- Try `!mymemory` to check if data is saving

**Data still resets on deployment**
- Verify MONGODB_URI is set in DigitalOcean environment variables
- Check DigitalOcean logs for MongoDB connection errors
- Make sure you encrypted the environment variable
