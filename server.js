const express = require("express");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const fs = require("fs").promises;
const app = express();
const port = 3000;

const bucketName = "cdse-prd";
const serviceAccountKeyPath = path.join(__dirname, "config/service.json");

const storage = new Storage({
  keyFilename: serviceAccountKeyPath,
});

async function generateSignedUrl(filename) {
  const options = {
    version: "v4",
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  };

  const [url] = await storage
    .bucket(bucketName)
    .file(filename)
    .getSignedUrl(options);
  return url;
}

async function processHtmlFile(htmlFilePath) {
  let htmlContent = await fs.readFile(htmlFilePath, "utf-8");
  const baseDir = path.dirname(htmlFilePath);

  const urlRegex = /src="([^"]+)"|href="([^"]+)"/g;
  let match;

  while ((match = urlRegex.exec(htmlContent)) !== null) {
    const url = match[1] || match[2];
    if (url) {
      const absolutePath = path.join(baseDir, url);
      const relativePath = path.relative(__dirname, absolutePath);
      try {
        const signedUrl = await generateSignedUrl(relativePath);
        htmlContent = htmlContent.replace(url, signedUrl);
      } catch (err) {
        console.error(`Erro ao gerar a URL assinada para ${url}:`, err);
      }
    }
  }

  return htmlContent;
}

app.get("/html/*", async (req, res) => {
  const filePath = path.join(__dirname, req.params[0]);

  try {
    const processedHtml = await processHtmlFile(filePath);
    res.send(processedHtml);
  } catch (err) {
    console.error("Erro ao processar o arquivo HTML:", err);
    res.status(500).send("Erro ao processar o arquivo HTML");
  }
});

app.get("/redirect/*", async (req, res) => {
  const filename = req.params[0];

  try {
    const signedUrl = await generateSignedUrl(filename);
    res.redirect(signedUrl);
  } catch (err) {
    console.error("Erro ao gerar a URL assinada:", err);
    res.status(500).send("Erro ao gerar a URL assinada");
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
