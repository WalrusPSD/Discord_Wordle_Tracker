### Setup

1. Create a Discord bot in the Developer Portal and invite it to your server.
2. Enable Message Content Intent for the bot.
3. Fill in the .env values using .env.example as guidance:

DISCORD_TOKEN= (bot token)
GUILD_ID= (server ID)
CHANNEL_ID= (channel where Wordle results appear)
LEADERBOARD_POST_CHANNEL_ID= (channel to post leaderboard)
WORDLE_BOT_ID= (the Wordle results bot user ID)
TZ=America/Los_Angeles (or your timezone)

4. Next we will add code and dependencies.
