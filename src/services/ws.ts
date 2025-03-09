import { WebSocketServer } from "ws";
import prisma from "../database";
import Logging from "../logging";
import Leveling from "../leveling";
import { CodeStorage } from "../codeStorage";
import { mergeUsers } from "../mergeUsers";
import { PlayerList } from "../playerList";
import { client } from "../index"
const wss = new WebSocketServer({ port: 9090 });

interface WebsocketMessage {
	type: string;
	steamId?: string;
	token?: string;
	content?: string | null;
	correlationId?: string;
}


interface ResponseMessage extends WebsocketMessage {
	success: boolean;
	error?: string;
}

const messageHandlers: Record<string, (data: WebsocketMessage) => Promise<any>> = {
	"getUser_steam": async (data) => {
		try {
			if (!data.content || !data.steamId) {
				return {
					success: false,
					content: `Malformed content received.`
				};
			}

			const steamId = data.steamId;
			const username = data.content;

			const account = await prisma.account.findUnique({
				where: { platform_platformId: { platform: "STEAM", platformId: steamId } },
				include: { user: true }
			});
			let user = undefined;

			if (!account || !account.user) {
				user = await prisma.user.create({
					data: {
						username: username,
						accounts: {
							create: {
								platform: "STEAM",
								platformId: steamId,
								username: username
							}
						},
						xp: 0,
						level: 1,
					},
				});
			}
			else {
				user = account.user
			}

			return {
				success: true,
				content: JSON.stringify(user)
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to get user: ${error}`
			};
		}
	},
	"linkCode_steam": async (data) => {
		if (!data.content || !data.steamId) {
			return {
				success: false,
				content: `Malformed content received.`
			};
		}

		const steamId = data.steamId;
		const code = data.content;

		let discordId = undefined;

		discordId = CodeStorage.getUser(code);
		if (!discordId) {
			console.log("Invalid code entered!");
			return {
				success: false,
				content: `Invalid code entered.`
			};
		}

		const result = await prisma.user.findMany({
			where: {
				accounts: {
					some: {
						OR: [
							{ platform: "STEAM", platformId: steamId },
							{ platform: "DISCORD", platformId: discordId },
						],
					},
				},
			},
			include: {
				accounts: {
					orderBy: {
						platform: 'asc',  // Ensures Steam comes before Discord
					},
				},
			},
		});

		if (result.length !== 2) {
			console.error(`Cannot merge when there are more or less than 2 users in the database. Found ${result.length} user(s).`);
			return {
				success: false,
				content: `Cannot merge when there are more or less than 2 users in the database. Found ${result.length} user(s).`
			};
		}

		const result_steam = result[0];
		const result_discord = result[1];

		const response = await mergeUsers(result_steam.id, result_discord.id);
		if (response.success) {
			CodeStorage.deleteCode(discordId);
			const discordUserId = result_discord.accounts.find(account => account.platform === 'DISCORD')?.platformId;
			if (discordUserId) {
				try {
					const discordUser = await client.users.fetch(discordUserId);
					discordUser.send({
						content: `🎉 Your Steam and Discord accounts have been successfully linked!`
					});
				} catch (error) {
					console.error("Error sending DM confirmation message:", error);
				}
			}
		}

		return {
			success: response.success,
			content: response.message
		};
	},
	"giveXP": async (data) => {
		try {
			if (!data.content || !data.steamId) {
				return {
					success: false,
					content: `Malformed content received.`
				};
			}

			const [userId, xpAmount] = data.content.split(" ");
			const updatedUser = Leveling.giveXP(userId, Number(xpAmount));

			if (!updatedUser) {
				return {
					success: false,
					content: `Could not find user by ID ${userId}`
				};
			}

			return {
				success: true,
				content: `Gave ${xpAmount} XP to user ${userId}`
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to give XP: ${error}`
			};
		}
	},
	"onJoin": async (data) => {
		try {
			if (!data.content || !data.steamId) {
				return {
					success: false,
					content: `Malformed content received.`
				};
			}

			const steamId = data.steamId;
			const user = await prisma.user.findFirst({
				where: {
					accounts: {
						some: {
							platformId: steamId
						}
					}
				}
			});

			if (user) {
				PlayerList.addPlayer(steamId, user);
			} else {
				return {
					success: false,
					content: "No user profile found!"
				};
			}
		} catch (err) {
			console.error(err);
			return {
				success: false,
				content: "An error occurred while processing the join request."
			};
		}
	},
	"onLeave": async (data) => {
		try {
			if (!data.content || !data.steamId) {
				return {
					success: false,
					content: `Malformed content received.`
				};
			}

			const steamId = data.steamId;
			const user = await prisma.user.findFirst({
				where: {
					accounts: {
						some: {
							platformId: steamId
						}
					}
				}
			});

			if (user) {
				PlayerList.removePlayerBySteamID(steamId);
				return {
					success: true,
					content: "Player successfully removed from the list."
				};
			} else {
				return {
					success: false,
					content: "No user profile found to remove!"
				};
			}
		} catch (err) {
			console.error(err);
			return {
				success: false,
				content: "An error occurred while processing the leave request."
			};
		}
	}
};

interface AuthValidationResponse {
	steamId: number;
	status: string;
}

async function authenticate(steamId: string, token: string): Promise<AuthValidationResponse | null> {
	const content = {
		steamId: steamId,
		token: token
	};

	const response = await fetch('https://services.facepunch.com/sbox/auth/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(content)
	});

	if (!response.ok) {
		console.log('HTTP response wasnt OK');
		return null;
	}

	const authValidationResponse: AuthValidationResponse = await response.json();
	return authValidationResponse;
}

wss.on("connection", (ws) => {
	Logging.log("🟢 Established WebSocket connection.");

	ws.on("message", async (message: string) => {
		try {
			const data = JSON.parse(message) as WebsocketMessage;
			if (!data.content) {
				return;
			}

			if (data.steamId && data.token) {
				const state = await authenticate(data.steamId, data.token);
				if (!state) {
					Logging.log(`❌ Authentication failed!`)
					return;
				}
			} else {
				Logging.log(`❌ Authentication failed!`)
				return;
			}

			Logging.log(`✉️ Received Message Type: ${data.type} | Content: ${data.content}`);

			if (data.type && messageHandlers[data.type]) {
				const result = await messageHandlers[data.type](data);

				if (data.correlationId) {
					const response: ResponseMessage = {
						type: `${data.type}_response`,
						correlationId: data.correlationId,
						...result
					};

					const json = JSON.stringify(response);
					ws.send(json);
					Logging.log(`✅ Sent response for request ${data.correlationId} | Type: ${data.type}`);
				}
			} else {
				Logging.log(`❌ Received unhandled message type: ${data.type}`);

				if (data.correlationId) {
					const response: ResponseMessage = {
						type: "error",
						correlationId: data.correlationId,
						success: false,
						error: `Unknown message type: ${data.type}`
					};

					const json = JSON.stringify(response);
					ws.send(json);
				}
			}
		} catch (error: any) {
			Logging.log(`❌ Error processing message: ${error.message}`);
		}
	});

	ws.on("close", () => {
		Logging.log("🔴 Closed WebSocket connection.");
	});

	ws.on("error", (error) => {
		Logging.log(`🔴 WebSocket connection ran into an error: ${error.message}`);
	});
});
