const express = require("express");
const helmet = require("helmet"); 
const rateLimit = require("express-rate-limit");
require('dotenv').config();

const app = express();

// 1. إعدادات الأمان الأساسية
app.use(helmet());
app.use(express.json());

// 2. حماية السيرفر من الطلبات الكثيرة (Rate Limiting)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100 // حد أقصى 100 طلب من كل IP
});
app.use("/device/", limiter);

// 3. مفتاح الأمان (غير الكلمة دي للي تحبه وحدثها في كود ESP والفلتر)
const API_KEY = process.env.API_KEY || "your_secret_key_here"; 

// 4. وظيفة التحقق من الهوية (Middleware)
const authMiddleware = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) {
        next();
    } else {
        res.status(403).json({ error: "Unauthorized: Invalid API Key" });
    }
};

let devicesData = {};
let commands = {};

// --- المسارات (Endpoints) ---

// 📥 استقبال بيانات من الـ ESP
app.post("/device/data", authMiddleware, (req, res) => {
    const { deviceId, data } = req.body;
    if (!deviceId) return res.status(400).json({ error: "Missing deviceId" });

    devicesData[deviceId] = {
        ...data,
        lastUpdate: new Date().toISOString()
    };
    console.log(`Data received from ${deviceId}:`, data);
    res.json({ status: "ok" });
});

// 📤 التطبيق (Flutter) يجلب البيانات الحالية للجهاز
app.get("/device/:id", (req, res) => {
    const id = req.params.id;
    res.json(devicesData[id] || { message: "No data found for this device" });
});

// 📡 إرسال أمر من التطبيق (Flutter) ليخزن في السيرفر
app.post("/device/command", authMiddleware, (req, res) => {
    const { deviceId, command } = req.body;
    if (!deviceId || !command) return res.status(400).json({ error: "Missing deviceId or command" });

    commands[deviceId] = command;
    res.json({ status: "command queued", deviceId, command });
});

// 📥 الـ ESP يسحب الأمر المخزن له (Polling)
app.get("/device/command/:id", authMiddleware, (req, res) => {
    const id = req.params.id;
    const cmd = commands[id] || null;
    
    // مسح الأمر بعد سحبه لضمان عدم تنفيذه مرتين
    commands[id] = null; 
    res.json({ command: cmd });
});

// 5. تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});