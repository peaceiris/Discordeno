# Getting Started

Discordeno aims for a simple, easy and stress-free interaction with the Discord API. Always supporting the latest version to ensure stability, consistency and the best developer experience.

This website serves as the purpose for introducing Discordeno to developers. The full documentation for all the functions and methods can be visited by clicking the link below:

[View Documentation on Deno](https://doc.deno.land/https/deno.land/x/discordeno/mod.ts)

## Useful Links
- [GitHub Repository](https://github.com/Skillz4Killz/Discordeno)
- [Deno Page](https://deno.land/x/discordeno)
- [Website](https://discordeno.mod.land)

## Requirements

- **Deno 1.0** or higher

## Creating your First Discord Bot Application

Plenty of guides are available on how to create a Discord Bot Application.

1. [Creating an Application](https://discord.com/developers/applications) on the Developer Portal, name something cool and pick a sweet icon!
2. After creating an application. Save the **Client ID.** Thats the unique identifier for a Discord Bot.
3. Now, go and create a bot by clicking the **Bot** tab. You will see a **Token** section and thats the Discord Bot's token. **Make sure you don't share that token with anyone!!!**
4. Invite the bot to the server, you can use the **[Discord Permissions Calculator](https://discordapi.com/permissions.html#0)** for creating the invite link with custom permissions. By default, `0` means no permissions and `8` means Administrator.

Now you've created an Application but it will need some code in order for it to be online. Thats when Discordeno comes in handy!

> Make sure you store your tokens in a file that is NOT deployed by adding it to the .gitignore file. **Don't share your bot token with anybody.**

## Installation

You can install Discordeno by importing:
```ts
import Client from "https://x.nest.land/Discordeno@9.0.1/src/module/client.ts";
```

## Example Usage

Starting with Discordeno is very simple, you can start from scratch without any boilerplates/frameworks: Add this snippet of code into a new TypeScript file:

```ts
import StartBot, { sendMessage, Intents } from "https://x.nest.land/Discordeno@9.0.1/src/module/client.ts";
import config from "./config.ts";

StartBot({
    token: config.token,
    intents: [Intents.GUILD_MESSAGES, Intents.GUILDS],
    eventHandlers: {
        ready: () => {
            console.log(`Logged!`);
        },
        messageCreate: (message) => {
            if (message.content === "!ping") {
                sendMessage(message.channelID, "Pong");
            }
        }
    }
});
```

## Tutorials

Below you will find youtube playlists that display channels using Discordeno for their tutorials.

Web-Mystery Tutorials:
- [Making a Discord bot with Deno and Discordeno](https://web-mystery.com/articles/making-discord-bot-deno-and-discordeno)
- [Running a Discord bot written in Deno in Docker](https://web-mystery.com/articles/running-discord-bot-written-deno-docker)
- YouTube Tutorials:
    - [Discordeno Bot Tutorials YouTube series](https://youtu.be/rIph9-BGsuQ)
