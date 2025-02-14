const express = require("express");
const fs = require("fs");
const axios = require("axios");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readlineSync = require("readline-sync");
const path = require("path");
const { Api } = require("telegram");

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json()); // Middleware to parse JSON body

// Replace with your API ID, API Hash, and phone number
const apiId = 29773749;
const apiHash = "9a22cce43ed56f2fed2d95a3df4aed79";
const phoneNumber = "+989399682366";

// Setup the Telegram client session
const sessionFile = "session.txt";
let sessionString = fs.existsSync(sessionFile)
  ? fs.readFileSync(sessionFile, "utf8")
  : "";
const stringSession = new StringSession(sessionString);
const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

async function startClient() {
  await client.start({
    phoneNumber: async () => phoneNumber,
    password: async () => "",
    phoneCode: async () =>
      readlineSync.question("Enter the code you received: "),
    onError: (err) => console.error(err),
  });

  console.log("Connected to Telegram");
  fs.writeFileSync(sessionFile, client.session.save()); // Save session
}

// Function to download the file from the provided URL
async function downloadFile(fileUrl) {
  const fileName = path.basename(new URL(fileUrl).pathname);
  const writer = fs.createWriteStream(
    path.join(__dirname, "uploads", fileName),
  );

  console.log(`Downloading file: ${fileName}`);
  const response = await axios({
    method: "get",
    url: fileUrl,
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(fileName));
    writer.on("error", reject);
  });
}

// Function to upload the file to Telegram
async function uploadFile(filePath) {
  try {
    const me = await client.getMe();
    console.log(`Uploading file: ${filePath}`);

    const result = await client.sendFile(me.id, {
      file: filePath,
      caption: "Here is the file from URL",
      forceDocument: true, // Keep file format as document (no compression)
      partSizeKb: 40960, // Larger chunk size (5MB instead of 2MB)
      workers: 64, // Parallel workers for upload
      progressCallback: (progress) => {
        console.log(`Uploaded: ${Math.round(progress * 100)}%`);
      },
    });

    console.log(`File ${filePath} uploaded successfully!`);
    fs.unlinkSync(filePath);
    // Extract file ID and access hash from the response
    const fileId = result.media.document.id.toString(); // Convert Integer to string
    const accessHash = result.media.document.accessHash.toString(); // Convert Integer to string
    const mimeType = result.media.document.mimeType;
    const fileReference = result.media.document.fileReference;

    return { fileId, accessHash, mimeType, fileReference }; // Return both fileId and accessHash
  } catch (error) {
    console.error("Error uploading file:", error);
    throw new Error("Failed to upload file to Telegram");
  }
}

app.post("/upload", async (req, res) => {
  // const { fileUrl } = req.body;
  const { fileUrl, chatId } = req.body;

  if (!fileUrl || !chatId) {
    return res.status(400).json({ error: "File URL and chat ID are required" });
  }

  if (!fileUrl) {
    return res.status(400).json({ error: "File URL is required" });
  }

  try {
    //await startClient();
    await startClient();

    // Download the file
    const filePath = await downloadFile(fileUrl);

    // Upload the file to Telegram and get file ID and access hash
    const { fileId, accessHash, mimeType, fileReference } = await uploadFile(
      path.join(__dirname, "uploads", filePath),
    );

    // Send the file ID and access hash as the response
    res.json({
      message: "File uploaded successfully to Telegram",
      uploadedFileId: fileId, // Return file ID
      uploadedFileAccessHash: accessHash, // Return access hash
    });

    //forward code
    const inputDocument = new Api.InputDocument({
      id: fileId,
      accessHash: accessHash,
      fileReference: fileReference,
    });
    
    const botUsername = "@uploaderbogbot"; 
    const bot = await client.getEntity(botUsername);
    const message = await client.sendMessage(bot, {
      message: "Hello, bot!",
      file: inputDocument,
    });


  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
