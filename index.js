const fs = require("fs");
// Do a quick check if the config exists, if not, copy the default and exit telling the end user to configure it
if (!fs.existsSync("./config.json")) {
	fs.copyFileSync("./config.default.json", "config.json");
	console.error("Please set up config.json then restart!");
	process.exit(1);
}
const sqlite3 = require("sqlite3").verbose();
const express = require('express');
const Discord = require("discord.js");
const config = require("./config.json");
const app = express();
const bot = new Discord.Client();

bot.on('ready', () => {
	console.log(`Logged into Discord as ${bot.user.tag}`);
	app.listen(config.stormworks.listen_port, "127.0.0.1", () => {
		console.log('server started');
	})
})

codes = {};
app.get("/getcode", async (req, res) => {
	if (!req.query.sid) {
		return res.sendStatus(400).end();
	}
	db.get(`SELECT * FROM verified WHERE steam_id = '${req.query.sid}'`, (err, row) => {
		if (row) return res.send({
			steam_id: req.query.sid,
			status: false
		}).end();
		if (codes[req.query.sid]) return res.send({
			code: codes[req.query.sid].toString(),
			steam_id: req.query.sid,
			status: true
		}).end();
		codes[req.query.sid] = Math.floor(100000 + Math.random() * 900000);
		res.send({
			code: codes[req.query.sid].toString(),
			steam_id: req.query.sid,
			status: true
		}).end();
		setTimeout(() => {
			codes[req.query.sid] = undefined;
		}, 180000);
	})
})

app.get("/check", async (req, res) => {
	if (!req.query.sid) {
		return res.sendStatus(400).end();
	}
	db.get(`SELECT * FROM verified WHERE steam_id = '${req.query.sid}'`, (err, row) => {
		if (row) {
			if (row.by_admin) return res.send({
				steam_id: row.steam_id.toString(),
				discord_id: row.discord_id.toString(),
				status: true
			}).end();
			bot.channels.cache.get(config.discord.channel_id).guild.members.fetch(row.discord_id).then((mem) => {
				mem.roles.cache.find(role => role.name === "@everyone")
				return res.send({
					steam_id: row.steam_id.toString(),
					discord_id: row.discord_id.toString(),
					status: true
				}).end();
			}).catch((err) => {
				db.exec(`DELETE FROM verified WHERE discord_id = ${row.discord_id}`);
				return res.send({
					steam_id: req.query.sid,
					status: false
				}).end();
			})
		} else {
			res.send({
				steam_id: req.query.sid,
				status: false
			}).end();
		}
	})
})

bot.on('message', (msg) => {
	if (msg.author.id === bot.user.id || msg.author.bot) return
	const prefix = config.discord.prefix;
	const args = msg.content.slice(prefix.length).trim().split(/ +/g);
	const cmd = args.shift().toLowerCase();
	if (msg.content.toLowerCase().startsWith(prefix)) {
		if (msg.channel.type === "dm") return msg.channel.send("Please run commands in the Discord server!")
		switch (cmd) {
			case "verify":
				db.get(`SELECT * FROM verified WHERE discord_id = '${msg.author.id}'`, (err, row) => {
					if (row) return msg.channel.send("You're already verified under another account!").then((msg1) => {
						setTimeout(() => {
							msg.delete();
							msg1.delete();
						}, 10000)
					});
					if (!args[0]) return msg.channel.send(`Error: Invalid code provided\nUse \`?verify\` in game to get your code!`).then((msg1) => {
						setTimeout(() => {
							msg.delete();
							msg1.delete();
						}, 10000)
					});
					if (args[0].length > 6 || !args[0].match(/\d{6}/m)) return msg.channel.send(`Error: Invalid code provided\nUse \`?verify\` in game to get your code!`).then((msg1) => {
						setTimeout(() => {
							msg.delete();
							msg1.delete();
						}, 10000)
					});
					if (!check(codes, args[0])) return msg.channel.send(`Error: Invalid code provided\nUse \`?verify\` in game to get your code!`).then((msg1) => {
						setTimeout(() => {
							msg.delete();
							msg1.delete();
						}, 10000)
					});
					tmp = db.prepare("INSERT INTO verified VALUES (?,?,?)");
					tmp.run(check(codes, args[0]), msg.author.id.toString(),0);
					tmp.finalize((err) => {
						if (err) console.log(err);
						codes[check(codes, args[0])] = undefined;
						if (config.discord.verified_role_id) msg.member.roles.add(config.discord.verified_role_id);
						msg.react("✅").then(() => {
							setTimeout(() => {
								msg.delete()
							}, 10000)
						})
					});
				});
				break;
			case "admin":
				if (!msg.member.permissions.has("ADMINISTRATOR")) return msg.channel.send(`You do not have permission to do that!`);
				if (!args[0]) return msg.channel.send(`Please provide a command\n\`${prefix}admin <command> [arguments]\``);
				switch (args[0]) {
					case "verify":
						if (!args[1]) return msg.channel.send(`Please provide a valid Steam ID\n\`${prefix}admin verify <steamid>\``);
						tmp = db.prepare("INSERT INTO verified VALUES (?,?,?)");
						tmp.run(args[1],0,1);
						tmp.finalize((err) => {
							if (err) console.log(err);
							msg.react("✅").then(() => {
								setTimeout(() => {
									msg.delete()
								}, 10000)
							})
						});
				}
		}
	}
})

var db = new sqlite3.Database("./auth.db", (err) => {
	if (err) {
		console.log(err);
		process.kill(1);
	}
	console.log("Opened DB");
	bot.login(config.discord.token);
	db.prepare(`CREATE TABLE IF NOT EXISTS verified (
		steam_id TEXT NOT NULL,
		discord_id TEXT DEFAULT 0 NOT NULL,
		by_admin INTEGER DEFAULT 0 NOT NULL,
		CONSTRAINT verified_PK PRIMARY KEY (steam_id)
	);`).run().finalize()
});

// Random functions, because yeah
const check = (input, what) => {
	for ([k, v] of Object.entries(input)) {
		if (v == what) {
			return k
		}
	}
	return false
}