import {
    Client,
    Events,
    GatewayIntentBits,
    REST,
    Routes,
    TextChannel,
    GuildMember
} from "discord.js";
import { getCommands } from "./commandHandler";
import dotenv from "dotenv";
import prisma from "./database";
import Leveling from "./leveling";
import Logging from "./logging";
import { Config } from "./config";
import "./services/ws";

dotenv.config();

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, async (client) => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: "Register with /register!", type: 2 }],
        status: "online",
    });

    const rest = new REST().setToken(Config.token);
    const commands = getCommands().map(({ name, description, options }) => ({
        name,
        description,
        options,
    }));

    try {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, Config.guild_id),
            { body: commands }
        );
        console.log("Commands registered successfully!");

        Logging.log("🟢 Bot is now online!");
    } catch (error) {
        console.error("Error refreshing commands:", error);
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || Leveling.IGNORED_CHANNELS.includes(message.channel.id)) {
        return;
    }

    try {
        // This might not be very efficient...
        const account = await prisma.account.findUnique({
            where: {
                platform_platformId: {
                    platform: "DISCORD",
                    platformId: message.author.id
                }
            },
            include: { user: true }
        });

        if (!account || !account.user) {
            return;
        }

        const member = message.member as GuildMember;
        await Leveling.giveXP(
            account.userId,
            Leveling.XP_PER_MESSAGE,
            member,
            message.channel as TextChannel
        );
    } catch (error) {
        console.error('Error processing message XP:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = getCommands().find((cmd) => cmd.name === interaction.commandName);
    if (command) await command.execute(interaction);
});

async function shutdown() {
    console.log("Shutdown initiated");
    try {
        Logging.log("🔴 Bot is now offline!");
    } catch (error) {
        console.error("Error during shutdown:", error);
    } finally {
        await prisma.$disconnect();
        await client.destroy();
        process.exit(0);
    }
}

client.on(Events.ShardDisconnect, async (_, shardId) => {
    console.log(`Shard ${shardId} disconnected`);
    await shutdown();
});

client.on(Events.ShardError, async (error, shardId) => {
    console.error(`Shard ${shardId} encountered error:`, error);
    await shutdown();
});

client.login(Config.token);