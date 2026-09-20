require("dotenv").config();

const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const config = require("./config");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("🟢 SHADOW BOT CONNECTED!");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Logged out. Pair again.");
      } else {
        console.log("🔄 Reconnecting...");
        setTimeout(startBot, 3000);
      }
    }
  });

  console.log(`👻 ${config.BOT_NAME} starting...`);
}

startBot().catch(() => {
  console.log("❌ Service is temporarily unavailable.");
});
