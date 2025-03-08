import { User } from "@prisma/client";

export class PlayerList {
    private static players = new Map<string, User>();

    /**
     * Retrieves a player by their Steam ID.
     * @param steamId - The Steam ID of the player.
     * @returns The `User` object if found, otherwise `undefined`.
     */
    static getPlayerBySteamID(steamId: string): User | undefined {
        return this.players.get(steamId);
    }

    /**
     * Adds a player to the list using their Steam ID.
     * @param steamId - The Steam ID of the player.
     * @param user - The `User` object to store.
     */
    static addPlayerBySteamID(steamId: string, user: User): void {
        this.players.set(steamId, user);
    }

    /**
     * Removes a player from the list using their Steam ID.
     * @param steamId - The Steam ID of the player to remove.
     */
    static removePlayerBySteamID(steamId: string): void {
        this.players.delete(steamId);
    }

    /**
     * Retrieves all players currently stored in the list.
     * @returns An array of `User` objects.
     */
    static getAllPlayers(): User[] {
        return Array.from(this.players.values());
    }

    /**
     * Retrieves the internal map of players.
     * @returns A `Map` where keys are Steam IDs and values are `User` objects.
     */
    static getPlayerList(): Map<string, User> {
        return this.players;
    }

    /**
     * Finds a player by their username.
     * @param username - The username of the player (case-insensitive).
     * @returns The `User` object if found, otherwise `undefined`.
     */
    static getPlayerByUsername(username: string): User | undefined {
        return Array.from(this.players.values()).find(
            (player) => player.username.toLowerCase() === username.toLowerCase()
        );
    }

    /**
     * Removes a player from the list using their username.
     * @param username - The username of the player to remove (case-insensitive).
     */
    static removePlayerByUsername(username: string): void {
        for (const [steamId, user] of this.players) {
            if (user.username.toLowerCase() === username.toLowerCase()) {
                this.players.delete(steamId);
                break;
            }
        }
    }
}
