import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    GuildMember
} from "discord.js";

import { Command } from "../commandHandler";
import Leveling from "../leveling";
import prisma from "../database";

@Command({
    name: "profile",
    description: "View your profile or another user's profile.",
    registrationRequired: true,
    options: [
        {
            name: "user",
            description: "The user of the profile to view",
            type: 6,
            required: false
        }
    ]
})
export class ProfileCommand {
    static async execute(interaction: ChatInputCommandInteraction) {
        try {
            const targetUser = interaction.options.getUser("user") || interaction.user;
            const member = interaction.guild?.members.cache.get(targetUser.id);

            const account = await prisma.account.findUnique({
                where: { platform_platformId: { platform: "DISCORD", platformId: targetUser.id } },
                include: {
                    user: {
                        include: {
                            badges: {
                                include: {
                                    badge: {
                                        include: {
                                            users: true 
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (!account || !account.user) {
                await interaction.reply({
                    content: `No profile found for user: ${targetUser}`,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (!member) {
                return;
            }

            let currentPage = 1;
            const pages = [
                () => {
                    const xpForNextLevel = Leveling.getXpForNextLevel(account.user.level);
                    const progressBarLength = 15;
                    const progress = Math.round((account.user.xp / xpForNextLevel) * progressBarLength);
                    const progressBar = "▰".repeat(progress) + "▱".repeat(progressBarLength - progress);

                    const multiplierInfo = getMultiplierInfo(member);
                    const multiplierDisplay = formatMultiplierDisplay(multiplierInfo);

                    const createdTimestamp = Math.floor(account.user.createdAt.getTime() / 1000);

                    const embed = new EmbedBuilder()
                        .setColor("#0099ff")
                        .setTitle(`${account.user.username}'s Profile`)
                        .setDescription(`Account created: <t:${createdTimestamp}:D>`)
                        .addFields([{
                            name: "Stats",
                            value: [
                                `📈 **Level**: ${account.user.level}`,
                                `💸 **Balance**: ${account.user.balance}$`,
                                `⚡ **XP**: ${account.user.xp}/${xpForNextLevel}`,
                            ].join('\n'),
                            inline: true
                        },
                        {
                            name: "XP Boost",
                            value: multiplierDisplay,
                            inline: true
                        },
                        {
                            name: "Streak",
                            value: `🔥 **Current Streak**: ${account.user.streak} day(s)`,
                            inline: false
                        },
                        {
                            name: `Level Progress`,
                            value: `${progressBar} ${Math.round((account.user.xp / xpForNextLevel) * 100)}%`,
                            inline: false
                        },
                        ]);

                    if (member?.user.avatarURL()) {
                        embed.setThumbnail(member.user.avatarURL() || '');
                    }

                    return embed;
                },
                async () => {
                    const badges = account.user.badges?.length
                        ? await Promise.all(account.user.badges.map(async ub => {
                            const awardedTimestamp = Math.floor(new Date(ub.awardedAt).getTime() / 1000); 

                            const totalUsers = await prisma.user.count();
                            const badgeUsersCount = ub.badge.users.length;
                            const rarity = parseFloat(((badgeUsersCount / totalUsers) * 100).toFixed(2));

                            let emoji = '';
                            if (rarity > 75) emoji = '🥇';
                            else if (rarity > 50) emoji = '🥈';
                            else if (rarity > 20) emoji = '🥉';
                            else emoji = ':gem:';  // For rarity <= 5%

                            return `**${ub.badge.name}**\n
                                    📋: ${ub.badge.description}\n
                                    😎 **Rarity**: ${rarity}% ${emoji}
                                    ⏳: <t:${awardedTimestamp}:D>
                                    ══════════════════`;})) 
                                    : "*No Badges*";

                    const badgesDescription = Array.isArray(badges) ? badges.join("\n\n") : badges;

                    const embed = new EmbedBuilder()
                        .setColor("#0099ff")
                        .setTitle(`${account.user.username}'s Badges`)
                        .setDescription(badgesDescription);

                    if (member?.user.avatarURL()) {
                        embed.setThumbnail(member.user.avatarURL() || '');
                    }

                    return embed;
                }
            ];

            const generateButtons = (page: number) => new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId("prev_page")
                    .setLabel("◀")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId("next_page")
                    .setLabel("▶")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === pages.length)
            );

            await interaction.reply({
                embeds: [await pages[currentPage - 1]()],
                components: [generateButtons(currentPage)]
            });

            const message = await interaction.fetchReply();
            const collector = message.createMessageComponentCollector({ time: 60000 });

            collector.on("collect", async i => {
                if (i.user.id !== interaction.user.id) {
                    await i.reply({ content: "You can't interact with this profile view!", flags: MessageFlags.Ephemeral });
                    return;
                }

                if (i.customId === "prev_page") currentPage--;
                if (i.customId === "next_page") currentPage++;

                await i.update({
                    embeds: [await pages[currentPage - 1]()],
                    components: [generateButtons(currentPage)]
                });
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: "Error fetching profile!",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
}


interface MultiplierInfo {
    multiplier: number;
    roles: Array<{
        name: string;
        multiplier: number;
    }>;
}

function getMultiplierInfo(member: GuildMember | null): MultiplierInfo {
    if (!member) {
        return { multiplier: 1.0, roles: [] };
    }

    const roles: Array<{ name: string; multiplier: number }> = [];
    let highestMultiplier = 1.0;

    member.roles.cache.forEach(role => {
        const multiplier = Leveling.roleMultipliers.get(role.id);
        if (multiplier && multiplier > 1) {
            roles.push({
                name: role.name,
                multiplier: multiplier
            });
            highestMultiplier = Math.max(highestMultiplier, multiplier);
        }
    });

    return {
        multiplier: highestMultiplier,
        roles: roles.sort((a, b) => b.multiplier - a.multiplier)
    };
}

function formatMultiplierDisplay(info: MultiplierInfo): string {
    if (info.roles.length === 0) {
        return "*No active XP boosts*";
    }

    const boostLines = info.roles.map(role =>
        `• ${role.name}: +${((role.multiplier - 1) * 100).toFixed(0)}%`
    );

    const totalBoost = `\n**Total Boost: +${((info.multiplier - 1) * 100).toFixed(0)}%**`;

    return boostLines.join('\n') + totalBoost;
}
