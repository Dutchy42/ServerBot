import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, Colors, TextChannel } from "discord.js";
import { Command } from "../commandHandler";
import prisma from "../database";
import Leveling from "../leveling";

@Command({
    name: "daily",
    description: "Receive your daily allowance."
})
export class DailyCommand {
    static async execute(interaction: ChatInputCommandInteraction) {
        const dailyMoney = 5;
        const dailyXP = 10;

        const account = await prisma.account.findUnique({
            where: {
                platform_platformId: {
                    platform: "DISCORD",
                    platformId: interaction.user.id
                }
            },
            include: { user: true }
        });

        if (!account || !account.user) {
            await interaction.reply({
                content: "User not found. Please register first!",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const user = account.user;
        const now = new Date();
        const lastClaimed = user.lastClaimedDaily ? new Date(user.lastClaimedDaily) : null;

        if (lastClaimed && now.getTime() - lastClaimed.getTime() < 24 * 60 * 60 * 1000) {
            const nextClaimTime = new Date(lastClaimed.getTime() + 24 * 60 * 60 * 1000);
            const timeRemaining = this.formatTimeRemaining(nextClaimTime.getTime() - now.getTime());

            await interaction.reply({
                content: `You can claim your next daily reward in ${timeRemaining}.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        let updatedUser;

        let streakIncrement = 1;
        let streakBroken = undefined;
        if (lastClaimed) {
            const lastClaimDate = new Date(lastClaimed);
            lastClaimDate.setHours(0, 0, 0, 0);

            const currentDate = new Date();
            currentDate.setHours(0, 0, 0, 0);

            if (currentDate.getTime() - lastClaimDate.getTime() > 24 * 60 * 60 * 1000) {
                streakIncrement = 1;
                streakBroken = true;
            } else {
                streakIncrement = user.streak + 1;
                streakBroken = false;
            }
        }

        updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                balance: { increment: dailyMoney },
                streak: streakIncrement,
                lastClaimedDaily: now
            }
        });

        const leveled = await Leveling.giveXP(
            user.id,
            dailyXP,
            undefined,
            interaction.channel as TextChannel
        );

        if (!leveled) {
            await interaction.reply({
                content: "An error occurred while gaining your daily XP. Please try again later.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("Daily Allowance")
            .setDescription("You have received your daily rewards!")
            .addFields(
                { name: "Money Received", value: `\`\`${dailyMoney}$\`\``, inline: true },
                { name: "XP Received", value: `\`\`${dailyXP}XP\`\``, inline: true },
                { name: "Current Streak", value: `\`\`${updatedUser.streak} day(s)\`\``, inline: true }
            )
            .setColor(Colors.Green)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        if (streakBroken) {
            const embed = new EmbedBuilder()
                .setTitle(":broken_heart: Streak Reset")
                .setDescription("Your streak has been reset due to a missed daily claim.")
                .setColor(Colors.Red)
                .setTimestamp();

            await interaction.followUp({ embeds: [embed] });
        }
    }

    private static formatTimeRemaining(ms: number): string {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }
}
