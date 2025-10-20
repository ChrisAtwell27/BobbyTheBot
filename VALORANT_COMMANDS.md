# 🎮 Valorant Team System - Quick Command Reference

## Team Commands
| Command | Description | Permission |
|---------|-------------|------------|
| `@Valorant` | Create a new team | Everyone |
| `!valorantteam` | Create a new team (alternative) | Everyone |

## Team Buttons (Interactive)
| Button | Description | Permission |
|--------|-------------|------------|
| ➕ **Join Team** | Join an existing team | Everyone |
| ➖ **Leave Team** | Leave the current team | Team Members |
| ✅ **Close Team** | Close team with 2-4 players | Team Leader |
| 🗑️ **Disband** | Disband the entire team | Team Leader |
| 👑 **Transfer Leader** | Transfer leadership to another member | Team Leader |
| 📨 **Invite Player** | View invite instructions | Team Leader |
| ✏️ **Set Name** | Set a custom team name (2-30 chars) | Team Leader |

## Player Settings
| Command | Description | Example |
|---------|-------------|---------|
| `!valagents <agents>` | Set up to 3 preferred agents | `!valagents Jett, Reyna, Phoenix` |
| `!valblock @user` | Block a toxic player | `!valblock @ToxicPlayer123` |
| `!valunblock @user` | Unblock a player | `!valunblock @ToxicPlayer123` |
| `!valblocklist` | View your blocked users list | `!valblocklist` |

## Match Tracking
| Command | Description | Example |
|---------|-------------|---------|
| `!valreport win <score>` | Report a match win (within 2hrs) | `!valreport win 13-7` |
| `!valreport loss <score>` | Report a match loss (within 2hrs) | `!valreport loss 5-13` |
| `!valmatchhistory` | View your W/L record and history | `!valmatchhistory` |

## Statistics & History
| Command | Description |
|---------|-------------|
| `!valteams` | View your personal team history |
| `!teamhistory` | View your personal team history (alternative) |
| `!teamstats` | View server-wide team statistics |
| `!valstats` | Register/view your Valorant rank stats |

---

## 🎮 Supported Agents (28)
```
Controllers:    Brimstone, Viper, Omen, Astra, Harbor, Clove
Duelists:       Phoenix, Jett, Reyna, Raze, Yoru, Neon, Iso
Initiators:     Sova, Breach, Skye, KAY/O, Fade, Gekko, Veto, Tejo
Sentinels:      Sage, Cypher, Killjoy, Chamber, Deadlock, Vyse, Waylay
```

---

## ⚡ Quick Tips

**Creating Teams:**
- Teams last 2 hours before auto-expiring
- Voice channel auto-created in Games category
- AFK players kicked after 5 minutes of inactivity

**Managing Teams:**
- Only leader can: Set name, transfer leadership, close, disband
- Anyone can join/leave (unless blocked)
- Minimum 2 players to close a team

**Blocking:**
- Blocked users can't join your teams
- You can't join blocked users' teams
- Mutual blocking prevents all interaction

**Match Reporting:**
- Must report within 2 hours of team completion
- Only need to report once per team
- Score is optional but recommended

**Ready Check:**
- Automatically starts when team hits 5/5
- 60-second timer for all players to confirm
- Shows real-time ready status

---

## 🔔 Automatic Features

**Voice Channels:**
- ✅ Created when team is made
- ✅ Named after team leader
- ✅ Located in Games category
- ✅ Auto-deletes after 1 hour of inactivity

**DM Notifications:**
- ✅ Sent when team fills up (5/5)
- ✅ Includes team roster
- ✅ Includes voice channel link

**AFK Detection:**
- ✅ Monitors all team members
- ✅ 5-minute timeout
- ✅ Auto-kicks and notifies
- ✅ Updates team display

**Ready Check:**
- ✅ Triggers at 5/5 players
- ✅ 60-second countdown
- ✅ Real-time status updates
- ✅ Pings all members

---

## ❓ Common Questions

**Q: How long do teams last?**
A: 2 hours, or until disbanded/closed.

**Q: Can I have multiple teams?**
A: No, limit of 1 active team per user.

**Q: What if someone is AFK?**
A: They're auto-kicked after 5 minutes of inactivity.

**Q: How do I unblock someone?**
A: Use `!valunblock @username`

**Q: Can I close a team with less than 5 players?**
A: Yes! Use the "Close Team" button (minimum 2 players).

**Q: When should I report match results?**
A: Within 2 hours of your team completing.

**Q: Do I need to set preferred agents?**
A: No, it's optional but helps teammates know your playstyle.

**Q: What happens to the voice channel?**
A: Auto-deletes after 1 hour of being empty.

---

*For detailed documentation, see VALORANT_SYSTEM_DOCUMENTATION.md*
