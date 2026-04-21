const express = require("express");
const helmet = require("helmet"); // حماية الرؤوس (Headers)
const rateLimit = require("express-rate-limit"); // منع الهجمات المتكررة
require('dotenv').config();

const app = express();

// إضافات الأمان
app.use(helmet());
app.use(express.json());

// تحديد عدد الطلبات لمنع الـ Spam
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100 
});
app.use("/device/", limiter);

// 🔒 مفتاح أمان بسيط (API KEY) لضمان أن الـ ESP فقط هو من يرسل
const API_KEY = "your_secret_key_here"; 

const authMiddleware = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) {
        next();
    } else {
        res.status(403).json({ error: "Unauthorized" });
    }
};

let devicesData = {};
let commands = {};

// 📥 استقبال البيانات مع التحقق من الهوية
app.post("/device/data", authMiddleware, (req, res) => {
    const { deviceId, data } = req.body;
    if (!deviceId) return res.status(400).json({ error: "Missing ID" });

    devicesData[deviceId] = {
        ...data,
        lastUpdate: new Date().toISOString()
    };
    res.json({ status: "ok" });
});

// 📤 التطبيق يجيب البيانات
app.get("/device/:id", (req, res) => {
    const id = req.params.id;
    res.json(devicesData[id] || { message: "No data found" });
});

// 📡 إرسال أوامر من الفلتر
app.post("/device/command", authMiddleware, (req, res) => {
    const { deviceId, command } = req.body;
    commands[deviceId] = command;
    res.json({ status: "command queued" });
});

// 📥 الـ ESP يسحب الأمر
app.get("/device/command/:id", authMiddleware, (req, res) => {
    const id = req.params.id;
    const cmd = commands[id] || null;
    commands[id] = null; 
    res.json({ command: cmd });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});