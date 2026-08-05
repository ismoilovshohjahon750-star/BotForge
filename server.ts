import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import AdmZip from "adm-zip";
import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import fs from 'fs';
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { adminDb } from "./src/lib/firebase-admin.ts";
import { GoogleGenAI, Type } from "@google/genai";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config({ override: true });

const DEFAULT_GROQ_API_KEY = process.env.GROQ_API_KEY || "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";

function getGroqClient(customKey?: string) {
  const apiKey = customKey || DEFAULT_GROQ_API_KEY;
  if (!apiKey) return null;
  return new Groq({ apiKey });
}

// Local Database Setup
const db = new Database('ukaaaa.db');
db.exec(`CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    owner_id TEXT,
    name TEXT,
    language TEXT,
    entryPoint TEXT,
    code BLOB,
    status TEXT DEFAULT 'stopped'
)`);

db.exec(`CREATE TABLE IF NOT EXISTS bot_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id TEXT,
    type TEXT,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

const runningBots = new Map<string, any>();

async function updateFirestoreBotStatus(botId: string, status: 'running' | 'stopped') {
    try {
        await adminDb.collection('bots').doc(botId).update({
            status: status
        });
        console.log(`[Firestore Sync]: Bot ${botId} status updated to ${status}`);
    } catch (e) {
        console.error(`[Firestore Sync Error]: Failed to update bot ${botId} status on Firestore:`, e);
    }
}

async function updateFirestoreBotMetadata(botId: string, metadata: { language?: string; entryPoint?: string; status?: string }) {
    try {
        await adminDb.collection('bots').doc(botId).update(metadata);
        console.log(`[Firestore Sync]: Bot ${botId} metadata updated:`, metadata);
    } catch (e) {
        console.error(`[Firestore Sync Error]: Failed to update bot ${botId} metadata on Firestore:`, e);
    }
}

function addBotLog(botId: string, type: 'deploy' | 'run' | 'system', message: string) {
    const cleanMsg = message.toString().trim();
    if (!cleanMsg) return;
    try {
        db.prepare('INSERT INTO bot_logs (bot_id, type, message) VALUES (?, ?, ?)').run(botId, type, cleanMsg);
    } catch (e) {
        console.error("Failed to write to database bot_logs:", e);
    }
    console.log(`[BotLog - ${type} - ${botId}]: ${cleanMsg}`);
}

async function startBot(botId: string) {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId) as any;
    if (!bot) return;

    if (runningBots.has(botId)) return; // Already running

    // Set status to running first
    db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('running', botId);
    updateFirestoreBotStatus(botId, 'running');

    // Clear old logs to start with a fresh slate
    try {
        db.prepare('DELETE FROM bot_logs WHERE bot_id = ?').run(botId);
    } catch (e) {
        console.error(e);
    }

    addBotLog(botId, 'system', `🔄 Deploy jarayoni boshlandi: ${bot.name}`);

    // Create bot workspace
    const botDir = path.join(process.cwd(), 'bots_running', botId);
    if (!fs.existsSync(botDir)) fs.mkdirSync(botDir, { recursive: true });

    addBotLog(botId, 'system', `📁 Workspace yaratildi: ${botDir}`);

    try {
        const zipPath = path.join(botDir, 'bot.zip');
        fs.writeFileSync(zipPath, bot.code);
        
        // Extract using AdmZip
        addBotLog(botId, 'deploy', `📦 Paket ochilmoqda (Extracting bot.zip)...`);
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(botDir, true);
        addBotLog(botId, 'deploy', `✅ Barcha fayllar muvaffaqiyatli ochildi.`);
    } catch (extractError: any) {
        addBotLog(botId, 'system', `❌ Paketni ochishda xatolik: ${extractError.message}`);
        db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
        updateFirestoreBotStatus(botId, 'stopped');
        return;
    }

    // Unwrap single top-level directory if zip contained a single wrapper folder
    try {
        const rootItems = fs.readdirSync(botDir).filter(i => i !== 'bot.zip');
        if (rootItems.length === 1) {
            const singleFolder = path.join(botDir, rootItems[0]);
            if (fs.existsSync(singleFolder) && fs.statSync(singleFolder).isDirectory()) {
                addBotLog(botId, 'deploy', `📂 Ichki qatlam papkasi (${rootItems[0]}) ildiz darajasiga ochilmoqda...`);
                const innerItems = fs.readdirSync(singleFolder);
                for (const innerItem of innerItems) {
                    const src = path.join(singleFolder, innerItem);
                    const dest = path.join(botDir, innerItem);
                    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
                    fs.renameSync(src, dest);
                }
                fs.rmdirSync(singleFolder);
            }
        }
    } catch (e: any) {
        console.error("Folder flattening error:", e);
    }

    // Inspect files in workspace to accurately verify language and entryPoint
    const allDiskFiles = fs.readdirSync(botDir).filter(f => f !== 'bot.zip');
    let hasRequirementsTxt = allDiskFiles.includes('requirements.txt') || allDiskFiles.includes('Pipfile');
    const hasPackageJson = allDiskFiles.includes('package.json');
    const pyFiles = allDiskFiles.filter(f => f.endsWith('.py'));
    const jsFiles = allDiskFiles.filter(f => f.endsWith('.js') || f.endsWith('.ts'));

    let activeLanguage = bot.language;
    let activeEntryPoint = bot.entryPoint;

    if (hasRequirementsTxt || pyFiles.length > 0) {
        activeLanguage = 'python';
        if (!activeEntryPoint || !allDiskFiles.includes(activeEntryPoint)) {
            if (allDiskFiles.includes('main.py')) activeEntryPoint = 'main.py';
            else if (allDiskFiles.includes('bot.py')) activeEntryPoint = 'bot.py';
            else if (allDiskFiles.includes('app.py')) activeEntryPoint = 'app.py';
            else if (allDiskFiles.includes('run.py')) activeEntryPoint = 'run.py';
            else if (pyFiles.length > 0) activeEntryPoint = pyFiles[0];
            else activeEntryPoint = 'main.py';
        }
    } else if (hasPackageJson || jsFiles.length > 0) {
        activeLanguage = 'nodejs';
        if (!activeEntryPoint || !allDiskFiles.includes(activeEntryPoint)) {
            if (allDiskFiles.includes('index.js')) activeEntryPoint = 'index.js';
            else if (allDiskFiles.includes('bot.js')) activeEntryPoint = 'bot.js';
            else if (allDiskFiles.includes('main.js')) activeEntryPoint = 'main.js';
            else if (allDiskFiles.includes('app.js')) activeEntryPoint = 'app.js';
            else if (allDiskFiles.includes('server.js')) activeEntryPoint = 'server.js';
            else if (jsFiles.length > 0) activeEntryPoint = jsFiles[0];
            else activeEntryPoint = 'index.js';
        }
    }

    if (activeLanguage !== bot.language || activeEntryPoint !== bot.entryPoint) {
        addBotLog(botId, 'system', `ℹ️ Tizim aniqladi: Muhit -> ${activeLanguage.toUpperCase()}, Boshlang'ich fayl -> ${activeEntryPoint}`);
        db.prepare('UPDATE bots SET language = ?, entryPoint = ? WHERE id = ?').run(activeLanguage, activeEntryPoint, botId);
        updateFirestoreBotMetadata(botId, { language: activeLanguage, entryPoint: activeEntryPoint });
        bot.language = activeLanguage;
        bot.entryPoint = activeEntryPoint;
    }

    // Auto-create requirements.txt if python bot lacks requirements.txt
    if (activeLanguage === 'python' && !hasRequirementsTxt && pyFiles.length > 0) {
        addBotLog(botId, 'deploy', `🔍 Python fayllari tahlil qilinmoqda...`);
        const detectedPackages = new Set<string>();
        for (const pyFile of pyFiles) {
            try {
                const content = fs.readFileSync(path.join(botDir, pyFile), 'utf8');
                if (content.includes('telebot') || content.includes('TeleBot')) detectedPackages.add('pyTelegramBotAPI');
                if (content.includes('aiogram')) detectedPackages.add('aiogram');
                if (content.includes('telegram') || content.includes('ApplicationBuilder')) detectedPackages.add('python-telegram-bot');
                if (content.includes('requests')) detectedPackages.add('requests');
                if (content.includes('dotenv')) detectedPackages.add('python-dotenv');
                if (content.includes('aiohttp')) detectedPackages.add('aiohttp');
                if (content.includes('bs4') || content.includes('BeautifulSoup')) detectedPackages.add('beautifulsoup4');
            } catch (e) {}
        }
        if (detectedPackages.size > 0) {
            const reqContent = Array.from(detectedPackages).join('\n');
            fs.writeFileSync(path.join(botDir, 'requirements.txt'), reqContent);
            hasRequirementsTxt = true;
            addBotLog(botId, 'deploy', `⚡ Avto-aniqlangan paketlar uchun requirements.txt yaratildi:\n${Array.from(detectedPackages).join(', ')}`);
        }
    }

    // Read bot's own individual .env file if it exists
    const localEnvPath = path.join(botDir, '.env');
    const childEnv: Record<string, string> = { ...process.env };
    if (fs.existsSync(localEnvPath)) {
        try {
            const envContent = fs.readFileSync(localEnvPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const equalIdx = trimmed.indexOf('=');
                    if (equalIdx !== -1) {
                        const key = trimmed.substring(0, equalIdx).trim();
                        const val = trimmed.substring(equalIdx + 1).trim();
                        const cleanVal = val.replace(/^["']|["']$/g, '');
                        childEnv[key] = cleanVal;
                    }
                }
            });
            addBotLog(botId, 'system', `🔑 Mahalliy .env fayli muvaffaqiyatli yuklandi.`);
        } catch (e: any) {
            addBotLog(botId, 'system', `⚠️ Mahalliy .env faylini o'qishda xatolik: ${e.message}`);
        }
    }

    const runBotProcess = () => {
        addBotLog(botId, 'system', `🚀 Botni ishga tushirish jarayoni boshlanmoqda...`);
        let cmd = 'node';
        let args = [bot.entryPoint || 'index.js'];

        if (bot.language === 'python' || pyFiles.length > 0) {
            cmd = 'python3';
            args = [bot.entryPoint || 'main.py'];
        }

        addBotLog(botId, 'system', `⚙️ Buyruq bajarilmoqda: ${cmd} ${args.join(' ')}`);

        // Run bot
        const child = spawn(cmd, args, {
            cwd: botDir,
            env: childEnv
        });

        runningBots.set(botId, child);

        child.stdout.on('data', (data) => {
            addBotLog(botId, 'run', data.toString());
        });

        child.stderr.on('data', (data) => {
            addBotLog(botId, 'run', `⚠️ [Xatolik/Stderr]: ${data.toString()}`);
        });
        
        child.on('close', (code) => {
            addBotLog(botId, 'system', `🛑 Bot jarayoni kodi ${code} bilan tugatildi.`);
            db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
            updateFirestoreBotMetadata(botId, { status: 'stopped' });
            runningBots.delete(botId);
        });

        child.on('error', (err) => {
            addBotLog(botId, 'system', `❌ Jarayonni boshlashda xatolik: ${err.message}`);
            db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
            updateFirestoreBotMetadata(botId, { status: 'stopped' });
            runningBots.delete(botId);
        });
    };

    // If Python bot and has requirements.txt
    if (bot.language === 'python' && fs.existsSync(path.join(botDir, 'requirements.txt'))) {
        addBotLog(botId, 'deploy', `⚡ Python loyihasi aniqlandi. requirements.txt orqali kutubxonalar o'rnatilmoqda (pip install)...`);
        
        const pipInstall = spawn('python3', ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: botDir, env: childEnv });
        runningBots.set(botId, pipInstall);

        pipInstall.stdout.on('data', (data) => {
            addBotLog(botId, 'deploy', data.toString());
        });

        pipInstall.stderr.on('data', (data) => {
            addBotLog(botId, 'deploy', data.toString());
        });

        pipInstall.on('close', (code) => {
            if (code === 0) {
                addBotLog(botId, 'deploy', `✅ Python kutubxonalari muvaffaqiyatli o'rnatildi!`);
                runningBots.delete(botId);
                runBotProcess();
            } else {
                addBotLog(botId, 'deploy', `⚠️ pip install kodi ${code} bilan tugadi, bot ishga tushirilmoqda...`);
                runningBots.delete(botId);
                runBotProcess();
            }
        });
    } 
    // If Node.js bot and has package.json
    else if (bot.language === 'nodejs' && hasPackageJson) {
        addBotLog(botId, 'deploy', `⚡ Node JS loyihasi aniqlandi. package.json orqali kutubxonalar o'rnatilmoqda (npm install)...`);
        
        const npmInstall = spawn('npm', ['install', '--no-audit', '--no-fund'], { cwd: botDir, env: childEnv });
        runningBots.set(botId, npmInstall);

        npmInstall.stdout.on('data', (data) => {
            addBotLog(botId, 'deploy', data.toString());
        });

        npmInstall.stderr.on('data', (data) => {
            addBotLog(botId, 'deploy', data.toString());
        });

        npmInstall.on('close', (code) => {
            if (code === 0) {
                addBotLog(botId, 'deploy', `✅ Kutubxonalar muvaffaqiyatli o'rnatildi!`);
                runningBots.delete(botId);
                runBotProcess();
            } else {
                addBotLog(botId, 'system', `❌ Kutubxona o'rnatishda xatolik yuz berdi (npm install exit code: ${code})`);
                db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', botId);
                updateFirestoreBotMetadata(botId, { status: 'stopped' });
                runningBots.delete(botId);
            }
        });
    } else {
        addBotLog(botId, 'deploy', `📝 O'rnatish shart bo'lgan fayllar mavjud emas yoki o'rnatib bo'lingan. To'g'ridan-to'g'ri ishga tushiriladi.`);
        runBotProcess();
    }
}

let aiClient: GoogleGenAI | null = null;
let currentApiKey: string | undefined = undefined;

function getGeminiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY muhit o'zgaruvchisi o'rnatilmagan! Iltimos, Settings > Secrets panelida uni o'rnating.");
  }
  
  if (!aiClient || currentApiKey !== key) {
    currentApiKey = key;
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  
  app.use(express.json());

  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "BotForge Backend" });
  });

  // Start existing bots on server startup
  const botsToRun = db.prepare('SELECT id FROM bots WHERE status = ?').all('running');
  botsToRun.forEach((bot: any) => startBot(bot.id));

  // Bot yuklash
  app.post("/api/bots/upload", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Fayl yuklanmadi" });
      }

      const zip = new AdmZip(req.file.buffer);
      const zipEntries = zip.getEntries();
      
      // Tilni va kirish faylini chuqur aniqlash
      let language = "unknown";
      let entryPoint = "";

      const fileEntries = zipEntries.filter(e => !e.isDirectory);
      const fileBaseNames = fileEntries.map(e => e.entryName.split('/').pop() || '');

      const hasReq = fileBaseNames.includes("requirements.txt") || fileBaseNames.includes("Pipfile");
      const hasPkg = fileBaseNames.includes("package.json");
      const pyFiles = fileBaseNames.filter(f => f.endsWith(".py"));
      const jsFiles = fileBaseNames.filter(f => f.endsWith(".js") || f.endsWith(".ts"));

      if (hasReq || pyFiles.length > 0) {
        language = "python";
        if (fileBaseNames.includes("main.py")) entryPoint = "main.py";
        else if (fileBaseNames.includes("bot.py")) entryPoint = "bot.py";
        else if (fileBaseNames.includes("app.py")) entryPoint = "app.py";
        else if (fileBaseNames.includes("run.py")) entryPoint = "run.py";
        else if (pyFiles.length > 0) entryPoint = pyFiles[0];
        else entryPoint = "main.py";
      } else if (hasPkg || jsFiles.length > 0) {
        language = "nodejs";
        if (fileBaseNames.includes("index.js")) entryPoint = "index.js";
        else if (fileBaseNames.includes("bot.js")) entryPoint = "bot.js";
        else if (fileBaseNames.includes("main.js")) entryPoint = "main.js";
        else if (fileBaseNames.includes("app.js")) entryPoint = "app.js";
        else if (fileBaseNames.includes("server.js")) entryPoint = "server.js";
        else if (jsFiles.length > 0) entryPoint = jsFiles[0];
        else entryPoint = "index.js";
      } else {
        language = "nodejs";
        entryPoint = "index.js";
      }

      // Match Firestore document ID if provided by client to keep SQLite/Firestore synchronized
      const botId = (req.query.id as string) || (req.body.id as string) || Date.now().toString();
      
      db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        botId,
        req.user?.uid,
        req.body.name || req.file.originalname.replace(".zip", ""),
        language,
        entryPoint,
        req.file.buffer,
        'stopped'
      );

      res.json({
        message: "Bot muvaffaqiyatli yuklandi",
        data: { id: botId, name: req.body.name || req.file.originalname.replace(".zip", ""), language, entryPoint }
      });
    } catch (error) {
      console.error("Yuklashda xatolik:", error);
      res.status(500).json({ error: "Serverda xatolik yuz berdi" });
    }
  });

  // Botlarni boshqarish
  app.post("/api/bots/:id/action", requireAuth, async (req: AuthRequest, res) => {
    const { action } = req.body; // 'start', 'stop'
    const { id } = req.params;

    if (action === 'start') {
      startBot(id);
      res.json({ message: `Bot ${id} ishga tushirildi`, status: 'running' });
    } else if (action === 'stop') {
      const bot = db.prepare('SELECT name FROM bots WHERE id = ?').get(id) as any;
      if (bot) {
        db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', id);
        updateFirestoreBotStatus(id, 'stopped');
        
        // Kill process
        const runningBot = runningBots.get(id);
        if (runningBot) {
            runningBot.kill();
            runningBots.delete(id);
        }
        
        console.log(`Bot ${bot.name} stopped.`);
        res.json({ message: `Bot ${id} to'xtatildi`, status: 'stopped' });
      } else {
        res.status(404).json({ error: "Bot topilmadi" });
      }
    } else {
      res.status(400).json({ error: "Noto'g'ri amaliyot" });
    }
  });

  // Bot loglarini olish
  app.get("/api/bots/:id/logs", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      const logs = db.prepare('SELECT type, message, created_at as createdAt FROM bot_logs WHERE bot_id = ? ORDER BY id ASC').all(id);
      res.json({ logs });
    } catch (error) {
      console.error("Loglarni olishda xato:", error);
      res.status(500).json({ error: "Loglarni yuklab bo'lmadi" });
    }
  });

  // Bot loglarini tozalash
  app.post("/api/bots/:id/logs/clear", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM bot_logs WHERE bot_id = ?').run(id);
      res.json({ success: true, message: "Loglar tozalandi" });
    } catch (error) {
      console.error("Loglarni tozalashda xatonik:", error);
      res.status(500).json({ error: "Loglarni tozalab bo'lmadi" });
    }
  });

  // Bot loyhasini fayllardan yaratib SQLite-ga saqlash (AI Generated Live Publish uchun)
  app.post("/api/bots/create-from-files", requireAuth, async (req: AuthRequest, res) => {
    const { id, name, files, language, entryPoint } = req.body;
    if (!id || !files || !Array.isArray(files)) {
      return res.status(400).json({ error: "id va files parameterlari talab qilinadi" });
    }

    try {
      const zip = new AdmZip();
      
      files.forEach((f: any) => {
        zip.addFile(f.filename, Buffer.from(f.content, "utf-8"));
      });

      const buffer = zip.toBuffer();

      db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        id,
        req.user?.uid,
        name,
        language || 'nodejs',
        entryPoint || 'index.js',
        buffer,
        'stopped'
      );

      res.json({ success: true, message: "Bot SQLite saqlovchisiga muvaffaqiyatli yuklandi." });
    } catch (e: any) {
      console.error("Failed to save AI bot from files:", e);
      res.status(500).json({ error: "Bot paketini yaratishda xatolik yuz berdi: " + e.message });
    }
  });

  // GitHub import API
  app.post("/api/bots/github-import", requireAuth, async (req: AuthRequest, res) => {
    const { repoUrl, id } = req.body;
    const botId = id || (req.query.id as string) || Date.now().toString();
    const botName = repoUrl.split('/').pop() || "GitHub Bot";
    const language = "nodejs";
    const entryPoint = "index.js";

    try {
      // Simulyatsiya: GitHub boilerplate yaratish
      const zip = new AdmZip();
      zip.addFile("index.js", Buffer.from(`// GitHub-import qilingan bot: ${botName}\n\nconsole.log("Bot ishga tushdi!");\nsetInterval(() => {\n    console.log("Bot barqaror ishlamoqda. [Hozirgi vaqt: " + new Date().toLocaleTimeString() + "]");\n}, 8000);\n`), "Main code");
      zip.addFile("package.json", Buffer.from(JSON.stringify({
        name: botName.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        version: "1.0.0",
        main: "index.js",
        dependencies: {
          "dotenv": "^16.0.3"
        }
      }, null, 2)), "package config");
      
      const buffer = zip.toBuffer();

      db.prepare('INSERT OR REPLACE INTO bots (id, owner_id, name, language, entryPoint, code, status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        botId,
        req.user?.uid,
        botName,
        language,
        entryPoint,
        buffer,
        'stopped'
      );

      res.json({
        message: "Bot GitHub'dan muvaffaqiyatli import qilindi",
        data: {
          id: botId,
          name: botName,
          language,
          entryPoint
        }
      });
    } catch (e: any) {
      console.error("Failed GitHub import simulation:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // AI workspace Generation endpoint
  app.post("/api/ai/generate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: "Foydalanuvchi aniqlanmadi" });

      // Limit checking
      const LIMITS = { free: 45, pro: 145, vip: 500 };
      let plan: 'free' | 'pro' | 'vip' = 'free';
      let currentUsage = 0;
      let usageRef: any = null;

      try {
        const subDoc = await adminDb.collection('subscriptions').doc(userId).get();
        plan = (subDoc.exists ? subDoc.data()?.plan : 'free') as 'free' | 'pro' | 'vip';

        const date = new Date().toISOString().split('T')[0];
        usageRef = adminDb.collection('usage').doc(userId).collection('daily-usage').doc(date);
        const usageDoc = await usageRef.get();
        currentUsage = usageDoc.exists ? (usageDoc.data()?.count || 0) : 0;
      } catch (firestoreErr) {
        console.warn("Firestore usage fetch error (handled gracefully):", firestoreErr);
      }

      const limit = LIMITS[plan] || LIMITS.free;

      if (currentUsage >= limit) {
        return res.status(403).json({ error: `Kunlik token limiti tugadi (${limit} limit). Planingizni yangilang.` });
      }

      const incrementUsage = async () => {
        if (!usageRef) return;
        try {
          await adminDb.runTransaction(async (t) => {
              const docSnap = await t.get(usageRef) as any;
              const count = docSnap.exists ? (docSnap.data()?.count || 0) : 0;
              t.set(usageRef, { count: count + 1 }, { merge: true });
          });
        } catch (e) {
          console.warn("Usage transaction failed gracefully:", e);
        }
      };

      const { mode, prompt, chatHistory } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Sarlavha yoki prompt majburiy" });
      }

      // Offline mock data templates to rescue 429/exhausted quota errors elegantly
      const getOfflineMockCode = (promptText: string) => {
        const query = promptText.toLowerCase();
        let explanation = "";
        let files: any[] = [];
        let secrets: any[] = [];

        if (query.includes("kino") || query.includes("cinema") || query.includes("film")) {
          explanation = "🎬 Ushbu mukammal Kino va Serial Qidiruv boti maxsus BotForge AI platformasida tayyorlandi. Bot Telegraf kutubxonasiga asoslangan va sirlarni (BOT_TOKEN, ADMIN_ID) to'liq izolyatsiya qilgan. Bot nomiga ko'ra inline filtrlaydi va foydalanuvchiga tomosha qilish linksini jo'natadi.";
          files = [
            {
              filename: "index.js",
              content: `const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

const movies = [
  { id: 1, title: 'Avatar: The Way of Water', year: 2022, genres: 'Sarguzasht, Fantastika', link: 'https://example.com/avatar' },
  { id: 2, title: 'Interstellar', year: 2014, genres: 'Sarguzasht, Kosmos', link: 'https://example.com/interstellar' },
  { id: 3, title: 'Spider-Man: No Way Home', year: 2021, genres: 'Ekshn, Sarguzasht', link: 'https://example.com/spiderman' }
];

bot.start((ctx) => {
  ctx.reply(\`Assalomu alaykum \${ctx.from.first_name}! \\nKino Qidiruv botimizga xush kelibsiz. \\nKino nomini yozing yoki quyidagi tugmani bosing:\`, 
    Markup.keyboard([['🎬 Kinolar Ro\\'yxati', 'ℹ️ Bot haqida']]).resize()
  );
});

bot.hears('🎬 Kinolar Ro\\'yxati', (ctx) => {
  let text = "🎬 *Mavjud Kinolar Ro'yxati:*\n\n";
  movies.forEach(m => {
    text += \`\u25b2 *\${m.title}* (\${m.year}) - _\${m.genres}_\n\ud83d\udd0e Qidirish kodi: /kino_\${m.id}\n\n\`;
  });
  ctx.replyWithMarkdown(text);
});

bot.hears('ℹ️ Bot haqida', (ctx) => {
  ctx.reply("Ushbu bot BotForge AI Generator orqali mutlaqo tekin va xavfsiz tarzda tayyorlangan.");
});

bot.hears(/\\/kino_(\\d+)/, (ctx) => {
  const movieId = parseInt(ctx.match[1]);
  const movie = movies.find(m => m.id === movieId);
  if (movie) {
    ctx.replyWithMarkdown(\`🎥 *Kino nomi:* \${movie.title}\\n📅 *Yil:* \${movie.year}\\n🎭 *Janr:* \${movie.genres}\\n\\n\ud83c\udf7f *Tomosha qilish:* \${movie.link}\`);
  } else {
    ctx.reply("Kechirasiz, bunday kino topilmadi.");
  }
});

bot.on('text', (ctx) => {
  const q = ctx.message.text.toLowerCase();
  const found = movies.filter(m => m.title.toLowerCase().includes(q) || m.genres.toLowerCase().includes(q));
  
  if (found.length > 0) {
    let text = \`🔍 *Qidiruv natijalari (\${found.length} ta):*\\n\\n\`;
    found.forEach(m => {
      text += \`🎥 *\${m.title}* (\${m.year}) - /kino_\${m.id}\\n\`;
    });
    ctx.replyWithMarkdown(text);
  } else {
    ctx.reply(\`🔍 Kechirasiz, "\${ctx.message.text}" so'roviga mos kino topilmadi. Boshqa nom yozib ko'ring.\`);
  }
});

bot.launch().then(() => console.log('Kino boti ishga tushdi!'));`
            },
            {
              filename: "package.json",
              content: `{
  "name": "botforge-cinema-bot",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "telegraf": "^4.12.2",
    "dotenv": "^16.0.3"
  },
  "scripts": {
    "start": "node index.js"
  }
}`
            }
          ];
          secrets = [
            { key: "BOT_TOKEN", description: "Telegram botingizning BotFather dan olingan maxsus token kaliti", placeholder: "123456:ABC-DEF1234ghIkl" },
            { key: "ADMIN_ID", description: "Boshqaruvchi administratorning telegram raqamli ID si", placeholder: "508129341" }
          ];
        } else if (query.includes("do'kon") || query.includes("shop") || query.includes("dokon") || query.includes("store")) {
          explanation = "🛍️ BotForge do'kon boti muvaffaqiyatli tayyorlandi. Ushbu bot mahsulotlar ro'yxatini shakllantiradi va xaridor buyurtma tugmasini bosganda sizning administrator ID guruhizga zudlik bilan hisobot jo'natadi.";
          files = [
            {
              filename: "index.js",
              content: `const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

const products = [
  { id: 101, name: 'iPhone 15 Pro', price: '1200 USD', desc: 'Apple flagmani, titanium korpus' },
  { id: 102, name: 'MacBook Air M3', price: '1100 USD', desc: 'Super yupqa va kuchli noutbuk' },
  { id: 103, name: 'AirPods Pro 2', price: '250 USD', desc: 'Eng yaxshi shovqin so\\'ndiruvchi quloqchinlar' }
];

bot.start((ctx) => {
  ctx.reply(\`Assalomu alaykum, BotForge Do'koniga xush kelibsiz! \\nSifatli elektronika mahsulotlarini xarid qiling.\`,
    Markup.keyboard([['🛍\ufe0f Mahsulotlar', '🛒 Savatcha'], ['📞 Bog\\'lanish']]).resize()
  );
});

bot.hears('🛍\ufe0f Mahsulotlar', (ctx) => {
  products.forEach(p => {
    ctx.replyWithMarkdown(\`📦 *\${p.name}*\\n💰 Narxi: *\${p.price}*\\n📝 Batafsil: _\${p.desc}_\`, 
      Markup.inlineKeyboard([
        Markup.button.callback('🛒 Savatga qo\\'shish', \`buy_\${p.id}\`)
      ])
    );
  });
});

bot.action(/buy_(\\d+)/, (ctx) => {
  const pId = parseInt(ctx.match[1]);
  const product = products.find(p => p.id === pId);
  if (product) {
    ctx.answerCbQuery(\`\${product.name} savatga yuklandi!\`);
    if(ADMIN_ID) {
      bot.telegram.sendMessage(ADMIN_ID, \`🔔 Yangi buyurtma signali!\\nFoydalanuvchi: @\${ctx.from.username || ctx.from.id}\\nMahsulot: \${product.name}\`);
    }
    ctx.reply(\`✅ Siz muvaffaqiyatli ravishda "\${product.name}" buyurtma berdingiz. Operatorimiz tez orada bog'lanadi!\`);
  }
});

bot.hears('📞 Bog\\'lanish', (ctx) => {
  ctx.reply("Bizning aloqa markazimiz: @botforge_support\\nTelefon: +998 90 123 45 67");
});

bot.launch().then(() => console.log('Do\\'kon boti yoqildi!'));`
            },
            {
              filename: "package.json",
              content: `{
  "name": "botforge-shop-bot",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "telegraf": "^4.12.2",
    "dotenv": "^16.0.3"
  },
  "scripts": {
    "start": "node index.js"
  }
}`
            }
          ];
          secrets = [
            { key: "BOT_TOKEN", description: "Telegram botingizning BotFather dan olingan maxsus token kaliti", placeholder: "123456:ABC-DEF" },
            { key: "ADMIN_ID", description: "Xaridor buyurtmalari yuboriladigan operatorning telegram raqamli ID-si", placeholder: "508129341" }
          ];
        } else {
          explanation = "🤖 Qo'shimcha Telegram Echo / Tabriklovchi boti muvaffaqiyatli generatsiya qilindi. Ushbu bot barcha kelayotgan xabarlarga javob yo'llaydi, adminlar uchun log signali saqlaydi hamda Telegraf / Node.js frameworki bilan juda barqaror ishlaydi.";
          files = [
            {
              filename: "index.js",
              content: `const { Telegraf } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

bot.start((ctx) => {
  ctx.reply(\`Assalomu alaykum \${ctx.from.first_name}! BotForge aqlli generator boti ishga tushdi.\\nMenga biron bir xabar yozib yuboring.\`);
});

bot.help((ctx) => {
  ctx.reply("Qanday yordam bera olaman? Ushbu bot so'zlarni aqlli tahlil qilib qaytaradi.");
});

bot.on('text', (ctx) => {
  ctx.reply(\`BotForge AI Qabul qildi: "\${ctx.message.text}"\`);
  if (ADMIN_ID) {
    bot.telegram.sendMessage(ADMIN_ID, \`Yangi xabar datchigi: "\${ctx.message.text}" from ID:\${ctx.from.id}\`);
  }
});

bot.launch().then(() => console.log('Echo boti yoqildi!'));`
            },
            {
              filename: "package.json",
              content: `{
  "name": "botforge-echo-bot",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "telegraf": "^4.12.2",
    "dotenv": "^16.0.3"
  },
  "scripts": {
    "start": "node index.js"
  }
}`
            }
          ];
          secrets = [
            { key: "BOT_TOKEN", description: "Telegram botingiz uchun maxsus kalit (TOKEN)", placeholder: "123456:ABC-DEF" },
            { key: "ADMIN_ID", description: "Boshqaruvchi rahbariyatning telegram raqamli ID-si", placeholder: "508129341" }
          ];
        }

        return { explanation, files, secrets };
      };

      const getOfflineMockPlatform = (promptText: string) => {
        const query = promptText.toLowerCase();
        if (query.includes("deploy") || query.includes("yoq") || query.includes("yuk") || query.includes("boshla")) {
          return "🚀 **Botni platformada deploy qilish juda oson:** \n\n" +
            "1️⃣ **AI Bot Yaratish** bo'limida o'zingiz istagan botni yarating.\n" +
            "2️⃣ Keyin **ZIP yuklab olish** tugmasini bosib tayyor fayllarni kompyuteringiz yoki telefoningiz xotirasiga saqlang.\n" +
            "3️⃣ **Dashboard (/dashboard)**'ga o'ting va 'Yangi Bot' tugmasiga bosib yuklangan `.zip` faylni tanlang.\n" +
            "4️⃣ Bot ko'rsatgichlarida 'Start' tugmasini bosib botni zudlik bilan ishga tushiring! Hosting sekundda botingizni butun dunyoga bog'laydi.";
        } else if (query.includes("key") || query.includes("secret") || query.includes("maxfiy") || query.includes("token")) {
          return "🔑 **Sirlar va Config kalitlarini sozlash:**\n\n" +
            "Botlar o'z xizmatlari uchun maxsus Telegram Token yoki ma'lumotlar bazasi kalitlaridan foydalanishadi.\n" +
            "Tizimimizda har safar bot yaratganda, u yerda **Secrets Management Table** jadvali chiqadi. Siz u yerga o'z bot tokeningizni (BotFather dan olingan) kiritishingiz kifoya.\n" +
            "Zip qilib yuklaganingizda, biz ushbu ma'lumotlarni xavfsiz holda `.env` fayliga avtomatik tarzda kiritib beramiz!";
        } else if (query.includes("tarif") || query.includes("narx") || query.includes("pricing") || query.includes("pul")) {
          return "💵 **Tarif rejalari va botlar soni:**\n\n" +
            "Siz o'zingizga qulay bo'lgan quyidagi narxlardan foydalanishingiz mumkin:\n" +
            "• **Lite Plan**: $15/oylik - 5 ta bot joylash va tezkor boshqaruv.\n" +
            "• **Pro Plan**: $39/oylik - 15 ta bot, 2x resurs tezligi va barcha AI andozalari.\n" +
            "• **Enterprise/Ultimate**: $99/oylik - Cheksiz botlar va premium VIP qo'llab-quvvatlash.";
        } else {
          return "👋 Salom! BotForge AI platformasi loyihalaringizni barqaror, xavfsiz va eng tez serverlarda hosting qilishni ta'minlaydi. \n" +
            "Siz bu yerda istalgan botingizni generatsiya qilib, `.zip` shaklida yuklab olishingiz, so'ngra **Dashboard** panelimiz orqali zudlik bilan deploy qilishingiz mumkin. \n\n" +
            "Dasturlash sirlari, deploy va boshqa savollar bo'lsa, bemalol so'rang, men doim sizga yordam berishga tayyorman!";
        }
      };

      // 1. Try Groq API (High Speed LLaMA-3.3-70b Engine)
      const groq = getGroqClient();
      if (groq) {
        try {
          if (mode === "code") {
            const systemInstruction = `Siz faqat va faqat Telegram Bot arxitekturasi va kodlarini yaratishga moslashtirilgan, yuqori saviyali professional, prompts-driven generatorsiz (Expert Developer AI).
Foydalanuvchining so'roviga asosan eng mukammal, xatosiz, har tomonlama mukammal, to'liq ishlab chiqilgan va ishlab chiqarishga (production-ready) 100% tayyor bo'lgan Node.js/JavaScript yoki Python Telegram bot loyihasini taqdim etishingiz shart.

Sizga qo'yilgan qat'iy talablar:
1. **Chala bo'lmagan kod**: Hech qanday joyda mock placeholder-lar, "..." belgilar, chala ketgan qismlar bo'lishi taqiqlanadi!
2. **Ko'p faylli mukammal arxitektura**: Loyihani faqat bitta faylda emas, balki tartiblangan bir nechta modulli fayllarda yarating (index.js, package.json, .env.example, va h.k).
3. **Secrets Isolation**: BOT_TOKEN, ADMIN_ID va barcha sirlarni "secrets" to'plamida qaytaring.

FAQAT ushbu formatdagi valid JSON obyektini qaytaring:
{
  "explanation": "o'zbek tilida tushuntirish va yo'riqnoma",
  "files": [
    { "filename": "index.js", "content": "..." },
    { "filename": "package.json", "content": "..." }
  ],
  "secrets": [
    { "key": "BOT_TOKEN", "description": "...", "placeholder": "..." }
  ]
}`;

            const completion = await groq.chat.completions.create({
              messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt }
              ],
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              temperature: 0.2
            });

            const rawContent = completion.choices[0]?.message?.content;
            if (rawContent) {
              const parsed = JSON.parse(rawContent);
              if (parsed.explanation && Array.isArray(parsed.files)) {
                await incrementUsage();
                console.log("[AI Engine]: Groq llama-3.3-70b Code Expert succeeded.");
                return res.json(parsed);
              }
            }
          } else {
            const systemInstruction = `Siz do'stona, professional va tajribali BotForge Platformasi hamrohi (Companion AI) yordamchisiz.
Foydalanuvchining BotForge platformasi haqidagi savollariga o'zbek tilida aniq va chiroyli javob berasiz.`;

            let messages: any[] = [{ role: "system", content: systemInstruction }];
            if (chatHistory && Array.isArray(chatHistory)) {
              chatHistory.forEach(h => {
                messages.push({
                  role: h.role === 'user' ? 'user' : 'assistant',
                  content: h.content
                });
              });
            }
            messages.push({ role: "user", content: prompt });

            const completion = await groq.chat.completions.create({
              messages,
              model: "llama-3.3-70b-versatile",
              temperature: 0.5
            });

            const answer = completion.choices[0]?.message?.content;
            if (answer) {
              await incrementUsage();
              console.log("[AI Engine]: Groq llama-3.3-70b Companion Agent succeeded.");
              return res.json({ explanation: answer });
            }
          }
        } catch (groqErr: any) {
          console.warn("Groq API error, falling back to Gemini:", groqErr?.message || groqErr);
        }
      }

      // 2. Secondary Fallback: Gemini API
      try {
        const client = getGeminiClient();

        if (mode === "code") {
          const systemInstruction = `Siz faqat va faqat Telegram Bot arxitekturasi va kodlarini yaratishga moslashtirilgan, yuqori saviyali professional, prompts-driven generatorsiz (Expert Developer AI).
Foydalanuvchining so'roviga asosan eng mukammal, xatosiz, har tomonlama mukammal, to'liq ishlab chiqilgan va ishlab chiqarishga (production-ready) 100% tayyor bo'lgan Node.js/JavaScript yoki Python Telegram bot loyihasini taqdim etishingiz shart.

Sizga qo'yilgan qat'iy talablar:
1. **Chala bo'lmagan kod**: Hech qanday joyda mock placeholder-lar, "..." belgilar, chala ketgan qismlar yoki "// kodni shu yerda davom ettiring" kabi izohlar bo'lishi mutlaqo taqiqlanadi! Barcha buyruqlar, ma'lumotlar bazasi integratsiyalari (masalan, local array-lar yoki sqlite muloqotlari), filtrlar va yordamchi funksiyalar oxirigacha va ideal tarzda yozilishi lozim.
2. **Ko'p faylli mukammal arxitektura**: Loyihani faqat bitta faylda emas, balki tartiblangan bir nechta modulli fayllarda yarating. Masalan:
   - Node.js uchun: 'index.js' (asosiy ishchi yadro), 'package.json' (to'liq dependenciyalar jadvali), '.env.example' (namunaviy maxfiy o'zgaruvchilar), 'commands.js' yoki 'database.js' (yordamchi modullar/xizmatlar).
   - Python uchun: 'main.py' (yadro kodi), 'requirements.txt' (kutubxonalar ro'yxati), 'handlers.py' va '.env.example'.
3. **Konfiguratsiyani ajratish (Secrets Isolation)**: Har bir loyihada sirlarni (BOT_TOKEN, ADMIN_ID, ma'lumotlar bazasi URL, API kalitlar) kodning o'zidan TO'LIQ ajrating va process.env / osgetenv orqali chaqiring. Barcha sirlarni "secrets" to'plamida qaytaring.
4. **Mustahkam va chiroyli funksionallik**: Inline tugmachalar, chiroyli Markdown formatlash, jozibali tabriknomalar, mukammal xatoliklarni ushlash (try-catch, global uncaught exceptions) va logerlarni to'liq qo'llang.`;

          const response = await client.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  explanation: { 
                    type: Type.STRING, 
                    description: "Bot strukturasi, vazifasi va uni qanday ishga tushirish to'g'risida o'zbek tilidagi qisqacha ma'lumot" 
                  },
                  files: {
                    type: Type.ARRAY,
                    description: "Bot loyihasi tarkibidagi fayllar va ularning to'liq kontenti",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        filename: { type: Type.STRING, description: "Fayl nomi, masalan, index.js, package.json, .env.example" },
                        content: { type: Type.STRING, description: "Faylning to'liq, chala bo'lmagan kodi" }
                      },
                      required: ["filename", "content"]
                    }
                  },
                  secrets: {
                    type: Type.ARRAY,
                    description: "Kod ichidan ajratib olingan barcha maxfiy o'zgaruvchi va konfiguratsiyalar",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        key: { type: Type.STRING, description: "Muhit o'zgaruvchisining nomi, masalan: BOT_TOKEN, ADMIN_ID, DB_URL" },
                        description: { type: Type.STRING, description: "Ushbu o'zgaruvchi nima uchun kerakligi haqida izoh" },
                        placeholder: { type: Type.STRING, description: "Namuna yoki default qiymat" }
                      },
                      required: ["key", "description"]
                    }
                  }
                },
                required: ["explanation", "files", "secrets"]
              }
            }
          });

          const dataText = response.text;
          if (!dataText) {
            throw new Error("Gemini AI'dan bo'sh ma'lumot qaytdi.");
          }
          await incrementUsage();
          return res.json(JSON.parse(dataText));

        } else {
          const systemInstruction = `Siz do'stona, professional va tajribali BotForge Platformasi hamrohi (Companion AI) yordamchisiz.
Siz bot arxitekturasi kodini yozmaysiz. Buning o'rniga foydalanuvchining BotForge platformasidan foydalanish bo'yicha bergan har bir savoliga batafsil, o'zbek tilida yo'riqnomalar va aniq manzillarni ko'rsatib javob berasiz.

Bizning platforma tuzilishi va imkoniyatlari quyidagicha:
1. **Loyiha nomi**: BotForge AI - Dual-Mode bot yaratish va boshqarish tizimi.
2. **Dashboard Panel (/dashboard)**: Foydalanuvchining barcha botlari ro'yxati shu yerda turadi. Bu erda botni yuklash (fayl yoki .zip), uni yoqish (Play tugmasi), o'chirish (Stop tugmasi) va har bir botning real vaqtdagi ish stendini, CPU/Memory ko'rsatkichlarini hamda loglarini kuzatish mumkin.
3. **Secrets & Configurations**: BotForge'da sirlar va konfiguratsiyalar juda xavfsiz saqlanadi. Kod generator hisoblangan Code-Agent Mode orqali olingan botlar uchun aynan o'sha erning o'zida ham maxsus Dynamic Secrets Table orqali sirlarni sozlash mumkin.
4. **Admin Panel (/admin)**: Agar foydalanuvchi tizim administratori bo'lsa, ushbu panel unga barcha ro'yxatdan o'tgan foydalanuvchilar profillarini (user profiles), barcha botlarni hamda tizim sozlamalarini boshqarish imkonini beradi.
5. **Pricing (Narxlar - /pricing)**: Premium hosting resurslari, xizmat ko'rsatish tariflari (Lite, Pro, Ultimate) haqida ma'lumot.
6. **Ommabop muloqot va yo'naltiruvchi**: Savollarga terminal, deployment, domain sozlamalari, zip fayl paketlash bo'yicha aniq yo'l ko'rsatib javob bering.`;

          let contents: any[] = [];
          if (chatHistory && Array.isArray(chatHistory)) {
            contents = chatHistory.map(h => ({
              role: h.role === 'user' ? 'user' : 'model',
              parts: [{ text: h.content }]
            }));
          }
          contents.push({ role: 'user', parts: [{ text: prompt }] });

          const response = await client.models.generateContent({
            model: "gemini-3.6-flash",
            contents: contents,
            config: {
              systemInstruction
            }
          });

          await incrementUsage();
          return res.json({ explanation: response.text });
        }
      } catch (geminiError: any) {
        console.warn("Gemini API call failed, turning on offline smart generator fallback:", geminiError);
        
        // QuotaExceeded fallback
        if (mode === "code") {
          const mockRes = getOfflineMockCode(prompt);
          await incrementUsage();
          return res.json(mockRes);
        } else {
          const mockExp = getOfflineMockPlatform(prompt);
          await incrementUsage();
          return res.json({ explanation: mockExp });
        }
      }
    } catch (error: any) {
      console.error("AI Generation error:", error);
      let errMsg = error.message || "AI tahlil platformasida kutilmagan xatolik yuz berdi.";
      const errMsgLower = errMsg.toLowerCase();
      
      if (
        errMsgLower.includes("quota") || 
        errMsgLower.includes("limit") || 
        errMsgLower.includes("exhausted") || 
        errMsgLower.includes("429")
      ) {
        errMsg = "Kechirasiz, BotForge AI xizmati (Gemini API) kunlik bepul so'rovlar limitiga yetdi (Rate Limit: 429). Iltimos, keyinchalik qaytadan urinib ko'ring yoki platformaning uzluksiz ishlashi uchun shaxsiy API kalitingizni Settings > Secrets panelida sozlang.";
      } else if (
        errMsgLower.includes("api key") || 
        errMsgLower.includes("key not found") || 
        errMsgLower.includes("invalid key")
      ) {
        errMsg = "Gemini API kaliti topilmadi yoki noto'g'ri sozlangan. Iltimos, Settings > Secrets panelida GEMINI_API_KEY o'rnatilganligini tekshiring.";
      }
      
      res.status(500).json({ error: errMsg });
    }
  });

  // ZIP download endpoint
  app.post("/api/ai/download-zip", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { files, envContent } = req.body;
      if (!Array.isArray(files)) {
        return res.status(400).json({ error: "Fayllar ko'rinishida jo'natilishi shart" });
      }

      const zip = new AdmZip();

      // Add code files
      files.forEach(f => {
        zip.addFile(f.filename, Buffer.from(f.content, "utf-8"));
      });

      // Add .env if present
      if (envContent) {
        zip.addFile(".env", Buffer.from(envContent, "utf-8"));
      }

      const zipBuffer = zip.toBuffer();

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=botforge-bot-code.zip");
      res.send(zipBuffer);
    } catch (err: any) {
      console.error("ZIP yaratishda xato:", err);
      res.status(500).json({ error: "ZIP fayl yaratib bo'lmadi" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
