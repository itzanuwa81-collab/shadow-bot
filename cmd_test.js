module.exports = {
  name: "test",
  commands: ["test"],

  async execute(sock, m, args) {
    await sock.sendMessage(m.key.remoteJid, {
      text: "✅ SHADOW BOT is working!"
    });
  }
};
