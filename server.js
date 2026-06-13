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

// 3. مفتاح الأمان (حدثه في كود الـ ESP والفلتر ليكون متطابقاً)
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

// قواعد البيانات المؤقتة (قيد التشغيل)
let devicesData = {};
let commands = {};
let users = []; // 💾 مصفوفة لحفظ حسابات المستخدمين الجدد

// --- المسارات (Endpoints) ---

// 🆕 1. مسار تسجيل حساب جديد من الفلتر (Register)
app.post("/device/register", authMiddleware, (req, res) => {
    const { name, email, phone, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "الإيميل والباسورد مطلوبين!" });
    }

    // التأكد إن الإيميل مش متسجل قبل كده
    const userExists = users.find(u => u.email === email.toLowerCase());
    if (userExists) {
        return res.status(400).json({ message: "هذا الحساب مسجل بالفعل!" });
    }

    // حفظ الحساب الجديد في الـ Array
    const newUser = {
        name,
        email: email.toLowerCase(),
        phone,
        password, // ملاحظة: في المشاريع الحقيقية بنشفر الباسورد، بس ده ممتاز للمشروع الحالي
        provider: "email" // تسجيل عادي
    };

    users.push(newUser);
    console.log(`🆕 مستخدم جديد سجل: ${email}`);
    res.status(201).json({ message: "تم تسجيل الحساب بنجاح!" });
});

// 🆕 2. مسار تسجيل الدخول (Email & Password أو Google/Apple)
app.post("/device/login", authMiddleware, (req, res) => {
    const { email, password, isSocialLogin, provider } = req.body;

    if (!email) {
        return res.status(400).json({ message: "الإيميل مطلوب!" });
    }

    const cleanEmail = email.toLowerCase();

    // 🌟 حالة أ: لو المستخدم جاي من (جوجل أو أبل)
    if (isSocialLogin === true) {
        let user = users.find(u => u.email === cleanEmail);
        
        // لو أول مرة يدخل بجوجل/أبل، بنعمله حساب عندنا فوراً في ثواني
        if (!user) {
            user = {
                name: req.body.name || "Social User",
                email: cleanEmail,
                provider: provider || "social"
            };
            users.push(user);
            console.log(`🔗 تم إنشاء حساب تلقائي لجوجل/أبل: ${cleanEmail}`);
        }
        
        console.log(`🔓 تم دخول مستخدم بواسطة ${provider}: ${cleanEmail}`);
        return res.status(200).json({ message: "تم تسجيل الدخول بنجاح!", user });
    }

    // 📧 حالة ب: تسجيل دخول عادي (إيميل وباسورد)
    const user = users.find(u => u.email === cleanEmail);
    if (!user || user.password !== password) {
        return res.status(401).json({ message: "الإيميل أو كلمة المرور غير صحيحة!" });
    }

    console.log(`🔓 تم دخول مستخدم عادي: ${cleanEmail}`);
    res.status(200).json({ message: "تم تسجيل الدخول بنجاح!", user });
});

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
    
    commands[id] = null; 
    res.json({ command: cmd });
});

// 5. تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});