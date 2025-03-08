import { User } from "@prisma/client";

export class PlayerList {
    private static players = new Map<string, User>();

    /**
     * Retrieves a player by their Steam ID.
     * @param steamId - The Steam ID of the player.
     * @returns The `User` object if found, otherwise `null`.
     */
    static getPlayerBySteamID(steamId: string): User | null {
        return this.players.get(steamId) || null;
    }

    /**
     * Adds a player to the list using their Steam ID.
     * If a player with the same Steam ID already exists, it updates the entry.
     * @param steamId - The Steam ID of the player.
     * @param user - The `User` object to store.
     */
    static addPlayerBySteamID(steamId: string, user: User): void {
        this.players.set(steamId, user);
    }

    /**
     * Removes a player from the list using their Steam ID.
     * @param steamId - The Steam ID of the player to remove.
     * @returns `true` if the player was removed, `false` if not found.
     */
    static removePlayerBySteamID(steamId: string): boolean {
        return this.players.delete(steamId);
    }

    /**
     * Retrieves all players currently stored in the list.
     * @returns An array of `User` objects.
     */
    static getAllPlayers(): User[] {
        return [...this.players.values()];
    }

    /**
     * Retrieves the internal map of players.
     * @returns A `Map` where keys are Steam IDs and values are `User` objects.
     */
    static getPlayerList(): Map<string, User> {
        return new Map(this.players);
    }

    /**
     * Finds a player by their username.
     * @param username - The username of the player (case-insensitive).
     * @returns The `User` object if found, otherwise `null`.
     */
    static getPlayerByUsername(username: string): User | null {
        const lowerUsername = username.toLowerCase();
        for (const user of this.players.values()) {
            if (user.username.toLowerCase() === lowerUsername) {
                return user;
            }
        }
        return null;
    }

    /**
     * Removes a player from the list using their username.
     * @param username - The username of the player to remove (case-insensitive).
     * @returns `true` if a player was removed, `false` if not found.
     */
    static removePlayerByUsername(username: string): boolean {
        const lowerUsername = username.toLowerCase();
        for (const [steamId, user] of this.players) {
            if (user.username.toLowerCase() === lowerUsername) {
                return this.players.delete(steamId);
            }
        }
        return false;
    }
}
