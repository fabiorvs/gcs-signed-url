const express = require("express");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const fs = require("fs").promises;
const app = express();
const port = 3000;

// Substitua com os valores do seu projeto
const bucketName = "cdse-prd";
const serviceAccountKeyPath = path.join(__dirname, "config/service.json");

// Instancia o cliente de armazenamento
const storage = new Storage({
  keyFilename: serviceAccountKeyPath,
});

// Função para gerar a URL autenticada
async function generateSignedUrl(filename) {
  const options = {
    version: "v4",
    action: "read",
    expires: Date.now() + 60 * 60 * 1000, // 1 hora
  };

  const [url] = await storage
    .bucket(bucketName)
    .file(filename)
    .getSignedUrl(options);
  return url;
}

// Função para obter o conteúdo do arquivo HTML do bucket
async function getHtmlContentFromBucket(filename) {
  const file = storage.bucket(bucketName).file(filename);
  const contents = await file.download();
  return contents.toString("utf-8");
}

// Função para processar o conteúdo do HTML e substituir URLs
async function processHtmlContent(htmlContent, baseDir) {
  const urlRegex = /src="([^"]+)"|href="([^"]+)"/g;
  let match;

  while ((match = urlRegex.exec(htmlContent)) !== null) {
    const url = match[1] || match[2];
    if (url) {
      const absolutePath = path.join(baseDir, url);
      try {
        const signedUrl = await generateSignedUrl(absolutePath);
        htmlContent = htmlContent.replace(url, signedUrl);
      } catch (err) {
        console.error(`Erro ao gerar a URL assinada para ${url}:`, err);
      }
    }
  }

  return htmlContent;
}

// Rota para servir o HTML processado diretamente do bucket
app.get("/html/*", async (req, res) => {
  const filename = req.params[0];
  try {
    const htmlContent = await getHtmlContentFromBucket(filename);
    const baseDir = path.dirname(filename);
    const processedHtml = await processHtmlContent(htmlContent, baseDir);
    res.send(processedHtml);
  } catch (err) {
    console.error("Erro ao processar o arquivo HTML:", err);
    res.status(500).send("Erro ao processar o arquivo HTML");
  }
});

// Rota para redirecionar para a URL autenticada de um único arquivo
app.get("/redirect/*", async (req, res) => {
  const filename = req.params[0]; // Pega o caminho completo do arquivo

  try {
    const signedUrl = await generateSignedUrl(filename);
    res.redirect(signedUrl);
  } catch (err) {
    console.error("Erro ao gerar a URL assinada:", err);
    res.status(500).send("Erro ao gerar a URL assinada");
  }
});

// Iniciar o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
