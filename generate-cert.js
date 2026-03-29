const { generateKeyPairSync } = require("crypto");
const fs = require("fs");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

fs.writeFileSync(
  "private-key.pem",
  privateKey.export({ type: "pkcs1", format: "pem" })
);

fs.writeFileSync(
  "public-key.pem",
  publicKey.export({ type: "spki", format: "pem" })
);

console.log("Chaves geradas!");