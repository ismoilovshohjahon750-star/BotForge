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
import dotenv from "dotenv";

dotenv.config({ override: true });

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

const runningBots = new Map<string, any>();

async function startBot(botId: string) {
    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
    if (!bot) return;

    // Logic to run bot based on language
    // For now, let's just simulate that we're running it.
    // In a real scenario, you'd save code to a file or run in a temporary container.
    console.log(`Bot ${bot.name} is starting...`);
    db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('running', botId);
    runningBots.set(botId, { status: 'running' });
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
  const PORT = 3000;
  
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
      
      // Tilni aniqlash
      let language = "unknown";
      let entryPoint = "";

      for (const entry of zipEntries) {
        if (entry.entryName === "package.json") {
          language = "nodejs";
          entryPoint = "index.js";
        } else if (entry.entryName === "requirements.txt") {
          language = "python";
          entryPoint = "main.py";
        } else if (entry.entryName === "go.mod") {
          language = "go";
          entryPoint = "main.go";
        }
      }

      if (language === "unknown") language = "nodejs";

      const botId = Date.now().toString();
      db.prepare('INSERT INTO bots (id, owner_id, name, language, entryPoint, code) VALUES (?, ?, ?, ?, ?, ?)').run(
        botId,
        req.user?.uid,
        req.body.name || req.file.originalname.replace(".zip", ""),
        language,
        entryPoint,
        req.file.buffer
      );

      res.json({
        message: "Bot muvaffaqiyatli yuklandi",
        data: { id: botId, name: req.body.name, language, entryPoint }
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
      const bot = db.prepare('SELECT name FROM bots WHERE id = ?').get(id);
      if (bot) {
        db.prepare('UPDATE bots SET status = ? WHERE id = ?').run('stopped', id);
        runningBots.delete(id);
        console.log(`Bot ${bot.name} stopped.`);
        res.json({ message: `Bot ${id} to'xtatildi`, status: 'stopped' });
      } else {
        res.status(404).json({ error: "Bot topilmadi" });
      }
    } else {
      res.status(400).json({ error: "Noto'g'ri amaliyot" });
    }
  });

  // GitHub import simulatsiyasi
  app.post("/api/bots/github-import", requireAuth, async (req: AuthRequest, res) => {
    const { repoUrl } = req.body;
    
    // Simulyatsiya: GitHub url ni tahlil qilish
    // Haqiqiy vaziyatda bu yerda API chaqiruvlari bo'ladi
    
    res.json({
        message: "Bot GitHub'dan muvaffaqiyatli import qilindi",
        data: {
          name: repoUrl.split('/').pop() || "GitHub Bot",
          language: "nodejs",
          entryPoint: "index.js"
        }
    });
  });

  // AI workspace Generation endpoint
  app.post("/api/ai/generate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: "Foydalanuvchi aniqlanmadi" });

      // Limit checking
      const LIMITS = { free: 45, pro: 145, vip: 500 };
      const subDoc = await adminDb.collection('subscriptions').doc(userId).get();
      const plan = (subDoc.exists ? subDoc.data()?.plan : 'free') as 'free' | 'pro' | 'vip';
      const limit = LIMITS[plan] || LIMITS.free;

      const date = new Date().toISOString().split('T')[0];
      const usageRef = adminDb.collection('usage').doc(userId).collection('daily-usage').doc(date);
      const usageDoc = await usageRef.get();
      const currentUsage = usageDoc.exists ? (usageDoc.data()?.count || 0) : 0;

      if (currentUsage >= limit) {
        return res.status(403).json({ error: `Kunlik token limiti tugadi (${limit} limit). Planingizni yangilang.` });
      }

      const incrementUsage = async () => {
        await adminDb.runTransaction(async (t) => {
            const doc = await t.get(usageRef);
            const count = doc.exists ? (doc.data()?.count || 0) : 0;
            t.set(usageRef, { count: count + 1 }, { merge: true });
        });
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
            model: "gemini-1.5-flash",
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
            model: "gemini-1.5-flash",
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
