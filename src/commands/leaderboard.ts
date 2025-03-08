import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    ApplicationCommandOptionType,
    Colors,
    MessageFlags
} from "discord.js";
import { Command } from "../commandHandler";
import prisma from "../database";

@Command({
    name: "leaderboard",
    description: "View leaderboards.",
    options: [
        {
            name: "type",
            description: "The type of leaderboard to display (level, balance).",
            type: ApplicationCommandOptionType.String,
            required: true,
            choices: [
                { name: "Balance", value: "balance" },
                { name: "Level", value: "level" },
                { name: "Badge Rarity", value: "badge-rarity"}
            ]
        }
    ]
})
export class LeaderboardCommand {
    static async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const type = interaction.options.getString("type", true);

        if (type === "balance") {
            const users = await prisma.user.findMany({
                orderBy: {
                    balance: 'desc',
                },
                take: 25,
            });

            if (users.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle("⚠️ No Users Found")
                    .setDescription(`There were no users found to fill the leaderboard with!`)
                    .setColor(Colors.Red);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            let usersText: string = '';
            let rank = 1;

            users.forEach(user => {
                let emoji = '';
                if (rank === 1) emoji = '🥇';
                else if (rank === 2) emoji = '🥈';
                else if (rank === 3) emoji = '🥉';

                usersText += `${emoji} \`\`#${rank.toString()}\`\` **${user.username}**: ${user.balance}$\n`;
                rank++;
            });

            const embed = new EmbedBuilder()
                .setTitle("🏆 __Balance Leaderboard__")
                .setDescription(usersText)
                .setColor(Colors.Gold);
            await interaction.reply({ embeds: [embed] });
        }
        // -----------------------------------------------------------------------------------------------------
        if (type === "level") {
            const users = await prisma.user.findMany({
                orderBy: [
                    {
                        level: 'desc',
                    },
                    {
                        xp: 'desc',
                    },
                ],
                take: 25,
            });

            if (users.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle("⚠️ No Users Found")
                    .setDescription(`There were no users found to fill the leaderboard with!`)
                    .setColor(Colors.Red);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }

            let usersText: string = '';
            let rank = 1;

            users.forEach(user => {
                let emoji = '';
                if (rank === 1) emoji = '🥇';
                else if (rank === 2) emoji = '🥈';
                else if (rank === 3) emoji = '🥉';

                usersText += `${emoji} \`\`#${rank.toString()}\`\` **${user.username}**: Level ${user.level} (${user.xp} xp)\n`;
                rank++;
            });

            const embed = new EmbedBuilder()
                .setTitle("🏆 __Level Leaderboard__")
                .setDescription(usersText)
                .setColor(Colors.Gold);
            await interaction.reply({ embeds: [embed] });
        }
        // -----------------------------------------------------------------------------------------------------
        if (type === "badge-rarity") {
            const totalUsers = await prisma.user.count();
        
            if (totalUsers === 0) {
                const embed = new EmbedBuilder()
                    .setTitle("⚠️ No Users Found")
                    .setDescription("There are no users in the database to calculate badge rarity!")
                    .setColor(Colors.Red);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }
        
            const badges = await prisma.badge.findMany({
                include: {
                    users: true,
                }
            });
        
            if (badges.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle("⚠️ No Badges Found")
                    .setDescription("There are no badges in the database to calculate rarity!")
                    .setColor(Colors.Red);
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                return;
            }
        
            let badgesWithRarity = badges.map(badge => {
                const numberOfUsersWithBadge = badge.users.length;
                const rarity = parseFloat(((numberOfUsersWithBadge / totalUsers) * 100).toFixed(2));
                return { badge, rarity }; 
            });
        
            badgesWithRarity.sort((a, b) => a.rarity - b.rarity);
        
            let badgeText: string = '';
            let rank = 1;
        
            badgesWithRarity.forEach(({ badge, rarity }) => {
                let emoji = '';
                if(rarity > 75) emoji = '';
                else if (rarity > 50) emoji = '🥉';
                else if (rarity > 20) emoji = '🥈';
                else if (rarity > 5) emoji = '🥇';
                else emoji = ':gem:';
        
                badgeText += `\`\`#${rank.toString()}\`\` **${badge.name}**: ${rarity}% ${emoji}\n`;
                rank++;
            });
        
            const embed = new EmbedBuilder()
                .setTitle("🏆 __Badge Rarity Leaderboard__")
                .setDescription(
                    ":gem: = 5%-0% owns\n" +
                    "🥇 = 20%-5% owns\n" +
                    "🥈 = 50%-20% owns\n" +
                    "🥉 = 75%-50% owns\n"
                )                
                
                .addFields(
                    { name: "", value: badgeText, inline: false }
                )
                .setColor(Colors.Gold);
            await interaction.reply({ embeds: [embed] });
        }   
        // -----------------------------------------------------------------------------------------------------          
    }
}
