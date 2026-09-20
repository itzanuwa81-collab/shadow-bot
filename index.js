require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const config = require("./config");

const PREFIX = process.env.PREFIX || config.DEFAULT_PREFIX || ".";
const BOT_NUMBER = process.env.BOT_NUMBER;

const commands = new Map();

function loadCommands() {
  const files = fs
    .readdirSync(__dirname)
    .filter(
      (file) =>
        file.startsWith("cmd_") &&
        file.endsWith(".js")
    );

  for (const file of files) {
    try {
      const command = require(path.join(__dirname, file));

      if (!command.name || !Array.isArray(command.commands)) {
        continue;
      }

      for (const name of command.commands) {
        commands.set(name.toLowerCase(), command);
      }

      console.log(`✅ Loaded: ${file}`);
    } catch {
      console.log(`❌ Failed to load: ${file}`);
    }
  }
}

loadCommands();

let isStarting = false;

async function startBot() {
  if (isStarting) return;

  isStarting = true;

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState("./session");

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["SHADOW", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingCodeRequested = false;

    sock.ev.on("connection.update", async (update) => {
      const {
        connection,
        lastDisconnect,
        qr,
      } = update;

      if (connection === "connecting") {
        console.log("🔄 Connecting SHADOW...");
      }

      if (connection === "open") {
        isStarting = false;
        pairingCodeRequested = false;

        console.log("🟢 SHADOW BOT CONNECTED!");
      }

      if (qr && !pairingCodeRequested) {
        pairingCodeRequested = true;

        try {
          if (!BOT_NUMBER) {
            console.log("❌ BOT_NUMBER is missing in .env");
            pairingCodeRequested = false;
            return;
          }

          const code = await sock.requestPairingCode(
            BOT_NUMBER.replace(/\D/g, "")
          );

          console.log("");
          console.log("================================");
          console.log("👻 SHADOW PAIRING CODE");
          console.log(code);
          console.log("================================");
          console.log("");
          console.log("📱 Enter this code in WhatsApp.");
        } catch {
          pairingCodeRequested = false;
          console.log("❌ Unable to generate pairing code.");
        }
      }

      if (connection === "close") {
        isStarting = false;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("❌ Logged out. Pair again.");
          return;
        }

        console.log("🔄 Reconnecting...");

        setTimeout(() => {
          startBot().catch(() => {});
        }, 5000);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
        const m = messages[0];

        if (!m || !m.message) return;

        // Do not respond to bot's own messages
        if (m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;

        if (!remoteJid) return;

        const messageType = Object.keys(m.message)[0];

        let text = "";

        if (messageType === "conversation") {
          text = m.message.conversation;
        } else if (
          messageType === "extendedTextMessage"
        ) {
          text =
            m.message.extendedTextMessage?.text || "";
        }

        if (!text) return;

        text = text.trim();

        if (!text.startsWith(PREFIX)) return;

        const body = text.slice(PREFIX.length).trim();

        if (!body) return;

        const parts = body.split(/\s+/);
        const commandName = parts.shift().toLowerCase();
        const args = parts;

        const command = commands.get(commandName);

        if (!command) return;

        try {
          await command.execute(sock, m, args);
        } catch {
          await sock.sendMessage(remoteJid, {
            text:
              "❌ Something went wrong. Please try again.",
          });
        }
      } catch {
        // Ignore unexpected message errors
      }
    });
  } catch {
    isStarting = false;

    console.log(
      "❌ Service is temporarily unavailable."
    );

    setTimeout(() => {
      startBot().catch(() => {});
    }, 5000);
  }
}

process.on("uncaughtException", () => {
  console.log("❌ Unexpected error occurred.");
});

process.on("unhandledRejection", () => {
  console.log("❌ Unexpected error occurred.");
});

startBot().catch(() => {});
