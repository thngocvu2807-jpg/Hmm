const express = require('express');
const puppeteer = require('puppeteer');
const https = require('https');

const app = express();
app.use(express.json()); 
const PORT = process.env.PORT || 3000;

// =========================================================================
// TRẠM THÔNG TIN THEO DÕI BOT
// =========================================================================
let botStatus = {
    state: 'Đang rảnh rỗi (Chờ lệnh)...',
    isRunning: false,
    currentUrl: 'Chưa có',
    currentChapter: 'Chưa có',
    totalTranslated: 0,
    totalErrors: 0,
    logs: []
};

let shouldStopBot = false; 

function addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString('vi-VN');
    botStatus.logs.unshift({ time, msg, type });
    if (botStatus.logs.length > 50) botStatus.logs.pop(); 
    console.log(`[${time}] ${msg}`);
}

// =========================================================================
// API & GIAO DIỆN WEB DASHBOARD
// =========================================================================
app.get('/api/status', (req, res) => res.json(botStatus));

app.post('/api/start', async (req, res) => {
    const { url, apiKey, shareCode, model, prompt } = req.body;

    if (botStatus.isRunning) return res.status(400).json({ error: 'Bot đang chạy rồi!' });
    if (!url) return res.status(400).json({ error: 'Vui lòng nhập Link truy cập!' });
    if (!apiKey) return res.status(400).json({ error: 'Vui lòng nhập Gemini API Key!' });
    if (!url.startsWith('http')) return res.status(400).json({ error: 'Link phải bắt đầu bằng http hoặc https' });

    res.json({ success: true, message: 'Đã nhận lệnh khởi động!' });
    
    const config = {
        startUrl: url.trim(),
        geminiKey: apiKey.trim(),
        shareCode: shareCode.trim() || 'VIP_BOT_1',
        model: model.trim() || 'gemini-3.1-flash-lite',
        customPrompt: prompt.trim()
    };

    shouldStopBot = false;
    startFarmBot(config);
});

app.post('/api/stop', (req, res) => {
    if (!botStatus.isRunning) return res.status(400).json({ error: 'Bot vốn đã dừng!' });
    shouldStopBot = true;
    botStatus.state = 'Đang tiến hành ngắt kết nối...';
    addLog('Nhận lệnh DỪNG. Bot sẽ dừng sau khi xử lý xong tác vụ hiện tại.', 'warn');
    res.json({ success: true });
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🤖 Trạm Điều Khiển Nông Trại AI (DOM TRANSLATE)</title>
        <style>
            body { background: #0f172a; color: #cbd5e1; font-family: monospace; margin: 0; padding: 20px; }
            .container { max-width: 900px; margin: auto; background: #1e293b; padding: 20px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #334155; }
            h1 { color: #38bdf8; text-align: center; border-bottom: 2px dashed #334155; padding-bottom: 10px; margin-top: 0;}
            .control-panel { background: #020617; padding: 15px; border-radius: 8px; border: 1px solid #3b82f6; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px; }
            .input-group { display: flex; gap: 10px; flex-wrap: wrap; }
            input, select, textarea { flex: 1; padding: 10px; border-radius: 5px; border: 1px solid #475569; background: #1e293b; color: #fff; font-family: monospace; font-size: 14px; min-width: 200px; }
            textarea { resize: vertical; min-height: 80px; width: 100%; box-sizing: border-box;}
            .btn-group { display: flex; gap: 10px; margin-top: 10px;}
            button { flex: 1; padding: 12px 20px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; transition: 0.2s; font-family: monospace; font-size: 15px;}
            button:hover { opacity: 0.8; }
            .btn-start { background: #10b981; color: #fff; }
            .btn-stop { background: #ef4444; color: #fff; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
            .card { background: #0f172a; padding: 15px; border-radius: 8px; border: 1px solid #334155; }
            .label { color: #94a3b8; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
            .value { color: #fff; font-size: 15px; font-weight: bold; word-break: break-all; }
            .val-green { color: #10b981; } .val-red { color: #ef4444; } .val-yellow { color: #f59e0b; }
            #log-box { background: #000; padding: 15px; border-radius: 8px; height: 350px; overflow-y: auto; font-size: 13px; line-height: 1.5; border: 1px solid #334155; }
            .log-time { color: #64748b; margin-right: 10px; }
            .log-info { color: #38bdf8; } .log-success { color: #10b981; } .log-error { color: #ef4444; } .log-warn { color: #f59e0b; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌐 BOT CÀO & DỊCH TOÀN BỘ DOM</h1>
            
            <div class="control-panel">
                <div class="label" style="color: #3b82f6;">⚙️ CẤU HÌNH BOT CÀO DỮ LIỆU:</div>
                <div class="input-group">
                    <input type="text" id="bot-api" placeholder="Nhập Gemini API Key (Bắt buộc)..." />
                    <input type="text" id="bot-share" placeholder="Mã Share Code (Mặc định: VIP_BOT_1)" value="VIP_BOT_1" />
                    <select id="bot-model">
                        <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Siêu nhanh - Khuyên dùng)</option>
                        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                    </select>
                </div>
                <textarea id="bot-prompt">Bạn là một dịch giả xuất sắc. Tôi sẽ gửi cho bạn một danh sách các đoạn văn bản (Text nodes) được trích xuất từ một trang web truyện. Nhiệm vụ của bạn là dịch tất cả sang tiếng Việt mượt mà. 
QUY TẮC BẮT BUỘC SỐNG CÒN: Phải giữ nguyên định dạng đánh số [Đoạn X]. Không được gộp đoạn, không bỏ sót đoạn nào.</textarea>
                <input type="url" id="bot-url" placeholder="Nhập Link chương đầu tiên (Ví dụ: https://www.69shuba.com/txt/83216/39104252)" />
                
                <div class="btn-group">
                    <button class="btn-start" onclick="startBot()" id="btnStart">▶ KHỞI ĐỘNG CÀO DỊCH DOM 24/24</button>
                    <button class="btn-stop" onclick="stopBot()" id="btnStop">⏹ DỪNG LẠI</button>
                </div>
            </div>

            <div class="grid">
                <div class="card"><div class="label">Trạng Thái Hoạt Động:</div><div class="value val-yellow" id="ui-state">Đang tải...</div></div>
                <div class="card"><div class="label">Tiêu đề trang hiện tại:</div><div class="value val-green" id="ui-chapter">Chưa có</div></div>
                <div class="card"><div class="label">Số trang đã dịch (Thành công):</div><div class="value val-green" id="ui-success">0</div></div>
                <div class="card"><div class="label">Số lần gặp lỗi / sụp đổ:</div><div class="value val-red" id="ui-errors">0</div></div>
                <div class="card" style="grid-column: span 2;"><div class="label">Đang làm việc tại URL:</div><div class="value" id="ui-url">Chưa có</div></div>
            </div>
            
            <div class="label" style="margin-bottom: 5px;">NHẬT KÝ HỆ THỐNG TRỰC TIẾP (LIVE LOGS):</div>
            <div id="log-box"></div>
        </div>

        <script>
            async function startBot() {
                const url = document.getElementById('bot-url').value;
                const apiKey = document.getElementById('bot-api').value;
                const shareCode = document.getElementById('bot-share').value;
                const model = document.getElementById('bot-model').value;
                const prompt = document.getElementById('bot-prompt').value;

                if(!url) return alert("Vui lòng nhập link!");
                if(!apiKey) return alert("Vui lòng nhập Gemini API Key!");

                document.getElementById('btnStart').innerText = "Đang gửi lệnh...";
                try {
                    const res = await fetch('/api/start', {
                        method: 'POST', headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify({ url, apiKey, shareCode, model, prompt })
                    });
                    const data = await res.json();
                    if(data.error) alert("Lỗi: " + data.error);
                } catch(e) { alert("Lỗi mạng!"); }
                document.getElementById('btnStart').innerText = "▶ KHỞI ĐỘNG CÀO DỊCH DOM 24/24";
            }

            async function stopBot() {
                try {
                    const res = await fetch('/api/stop', { method: 'POST' });
                    const data = await res.json();
                    if(data.error) alert("Lỗi: " + data.error);
                } catch(e) { alert("Lỗi mạng!"); }
            }

            async function fetchStatus() {
                try {
                    const res = await fetch('/api/status');
                    const data = await res.json();
                    document.getElementById('ui-state').innerText = data.state;
                    document.getElementById('ui-url').innerText = data.currentUrl;
                    document.getElementById('ui-chapter').innerText = data.currentChapter;
                    document.getElementById('ui-success').innerText = data.totalTranslated;
                    document.getElementById('ui-errors').innerText = data.totalErrors;
                    
                    const logBox = document.getElementById('log-box');
                    logBox.innerHTML = data.logs.map(l => 
                        \`<div><span class="log-time">[\${l.time}]</span><span class="log-\${l.type}">\${l.msg}</span></div>\`
                    ).join('');
                } catch(e) {}
            }
            setInterval(fetchStatus, 2000); 
            fetchStatus();
        </script>
    </body>
    </html>
    `);
});

app.listen(PORT, () => {
    addLog(`Server API khởi chạy thành công tại port ${PORT}`, 'success');
    startAntiSleep();
});

// Giữ server sống trên Render
function startAntiSleep() {
    const MY_URL = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${PORT}`;
    setInterval(() => {
        if (MY_URL.includes('onrender')) {
            https.get(MY_URL).on('error', () => {});
        }
    }, 10 * 60 * 1000);
}

// =========================================================================
// HỆ THỐNG BOT CÀY CUỐC 24/24 THÔNG MINH - DOM TRANSLATION MODE
// =========================================================================
async function startFarmBot(config) {
    botStatus.isRunning = true;
    botStatus.state = 'Đang khởi chạy Chrome ảo...';
    let currentUrl = config.startUrl;
    addLog(`Chuẩn bị quét toàn bộ DOM tại: ${currentUrl}`, 'info');
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // Chặn tải Ảnh, CSS, Fonts để chống văng bộ nhớ
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if(['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
            else req.continue();
        });

        await page.exposeFunction('reportStatusToNode', (type, message) => { addLog(message, type); });

        await page.evaluateOnNewDocument(`
            window.BOT_SHARE_CODE = "${config.shareCode}";
            window.GEMINI_API_KEY = "${config.geminiKey}";
            window.BOT_MODEL = "${config.model}";
            window.BOT_PROMPT = \`${config.customPrompt}\`;
        `);

        // Thuật toán Mã hóa, SHA256 và Nostr P2P
        await page.evaluateOnNewDocument(`
            window.BOT_CRYPTO = {
                bufferToBase64(buffer) {
                    let binary = ''; const bytes = new Uint8Array(buffer);
                    for (let i=0; i<bytes.byteLength; i+=0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000));
                    return btoa(binary);
                },
                async hashSHA256(text) {
                    const bytes = new TextEncoder().encode(text.trim());
                    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
                    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
                },
                async deriveSecretKey(secretString, textHash) {
                    const encoder = new TextEncoder();
                    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secretString), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
                    const signature = await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(textHash));
                    return await crypto.subtle.importKey('raw', signature.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
                },
                async encryptAndCompress(plainText, secretString, textHash) {
                    try {
                        const bytes = new TextEncoder().encode(plainText);
                        const cs = new CompressionStream('gzip');
                        const writer = cs.writable.getWriter();
                        writer.write(bytes); writer.close();
                        const res = new Response(cs.readable);
                        const compressedBytes = new Uint8Array(await res.arrayBuffer());

                        const secretKey = await this.deriveSecretKey(secretString, textHash);
                        const iv = crypto.getRandomValues(new Uint8Array(12));
                        const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, secretKey, compressedBytes);
                        
                        const encryptedBytes = new Uint8Array(encryptedBuffer);
                        const combined = new Uint8Array(iv.length + encryptedBytes.length);
                        combined.set(iv); combined.set(encryptedBytes, iv.length);
                        return this.bufferToBase64(combined);
                    } catch (err) { return null; }
                }
            };

            window.publishToNostr = async (tagD, contentData) => {
                return new Promise(async (resolve) => {
                    try {
                        if (!window.NostrTools) {
                            await new Promise(r => {
                                const s = document.createElement('script');
                                s.src = "https://unpkg.com/nostr-tools@1.17.0/lib/nostr.bundle.js";
                                s.onload = r; document.head.appendChild(s);
                            });
                        }
                        
                        const tools = window.NostrTools;
                        const privateKeyHex = await window.BOT_CRYPTO.hashSHA256(window.BOT_SHARE_CODE);
                        let pubKeyHex;
                        try { pubKeyHex = tools.getPublicKey(privateKeyHex); } 
                        catch(e) { 
                            const hexToBytes = (h) => new Uint8Array(h.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                            pubKeyHex = tools.getPublicKey(hexToBytes(privateKeyHex)); 
                        }

                        const encryptedPayload = await window.BOT_CRYPTO.encryptAndCompress(JSON.stringify(contentData), window.BOT_SHARE_CODE, tagD);
                        if (!encryptedPayload) return resolve(false);

                        let event = {
                            kind: 30002, pubkey: pubKeyHex, created_at: Math.floor(Date.now() / 1000),
                            tags: [["d", tagD], ["t", "vip_hub_p2p"]], content: encryptedPayload
                        };

                        if (typeof tools.finalizeEvent === 'function') {
                            const hexToBytes = (h) => new Uint8Array(h.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                            event = tools.finalizeEvent(event, hexToBytes(privateKeyHex));
                        } else {
                            event.id = tools.getEventHash(event);
                            event.sig = tools.getSignature(event, privateKeyHex);
                        }

                        const ws = new WebSocket('wss://relay.damus.io');
                        ws.onopen = () => { ws.send(JSON.stringify(["EVENT", event])); setTimeout(() => { ws.close(); resolve(true); }, 2500); };
                        ws.onerror = () => resolve(false);
                    } catch (e) { resolve(false); }
                });
            };
            
            // Hàm gọi AI dịch theo mảng
            window.callGeminiAPI = async (textNodesArray) => {
                const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${window.BOT_MODEL}:generateContent?key=\${window.GEMINI_API_KEY}\`;
                
                // Nén mảng thành chuỗi có đánh số để bắt AI trả về đúng cấu trúc
                let textToTranslate = "";
                textNodesArray.forEach((text, index) => {
                    textToTranslate += \`[Đoạn \${index}]: \${text}\\n\`;
                });

                const finalPrompt = window.BOT_PROMPT + "\\n\\nĐỊNH DẠNG ĐẦU RA BẮT BUỘC (Trả về tiếng Việt):\\n[Đoạn 0]: <Bản dịch>\\n[Đoạn 1]: <Bản dịch>\\n\\n[NỘI DUNG CẦN DỊCH]:\\n" + textToTranslate;

                try {
                    const res = await fetch(url, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }], generationConfig: { temperature: 0.1 } })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error.message);
                    return data.candidates[0].content.parts[0].text;
                } catch(e) { 
                    await window.reportStatusToNode('error', 'Lỗi API: ' + e.message);
                    return null; 
                }
            };
        `);

        // VÒNG LẶP CÀY CUỐC 
        while (currentUrl && !shouldStopBot) {
            botStatus.currentUrl = currentUrl;
            botStatus.state = 'Đang tải trang web...';
            addLog(`Đang truy cập: ${currentUrl}`, 'info');
            
            try {
                await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(r => setTimeout(r, 1500)); // Đợi JS nhả DOM

                const result = await page.evaluate(async () => {
                    await window.reportStatusToNode('info', 'Trang đã tải, đang quét TOÀN BỘ Text Nodes (DOM)...');
                    
                    // THUẬT TOÁN QUÉT TOÀN BỘ TEXT NODES (Như Google Translate Extension)
                    const nodesToTranslate = [];
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                    let node;
                    
                    while (node = walker.nextNode()) {
                        const parent = node.parentNode;
                        if (parent && ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(parent.nodeName)) continue;
                        
                        const text = node.nodeValue.trim();
                        // Chỉ lấy các đoạn chứa chữ cái, tránh dịch icon, khoảng trắng, hoặc rác HTML
                        if (text.length > 0 && /[a-zA-Z\u00C0-\u00FF\u0100-\u017F\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)) {
                            nodesToTranslate.push(text);
                        }
                    }

                    // Lấy thêm Text từ nút bấm, placeholder (Ô nhập liệu), và alt ảnh
                    document.querySelectorAll('input[type="button"], input[type="submit"]').forEach(el => { if(el.value.trim()) nodesToTranslate.push(el.value.trim()); });
                    document.querySelectorAll('input[placeholder]').forEach(el => { if(el.placeholder.trim()) nodesToTranslate.push(el.placeholder.trim()); });
                    document.querySelectorAll('img[alt]').forEach(el => { if(el.alt.trim()) nodesToTranslate.push(el.alt.trim()); });

                    // Lọc trùng lặp để tiết kiệm Token cho API
                    const uniqueTexts = [...new Set(nodesToTranslate)];

                    let title = document.title;
                    const titleEl = document.querySelector('h1, .chapter-title, .title');
                    if (titleEl) title = titleEl.innerText;

                    if (uniqueTexts.length === 0) return { error: "DOM trống hoặc bị ẩn hoàn toàn." };

                    await window.reportStatusToNode('warn', `Tìm thấy ${uniqueTexts.length} cụm từ/đoạn văn độc lập. Bắt đầu gửi AI dịch...`);
                    
                    // GỌI AI DỊCH THUẬT THEO MẢNG
                    // Lưu ý: Nếu web quá lớn (>500 nodes), API có thể bị quá tải. Gemini 3.1 Flash xử lý rất tốt text lớn.
                    const aiResponse = await window.callGeminiAPI(uniqueTexts);
                    
                    if (!aiResponse) return { error: "Lỗi phản hồi từ Gemini." };

                    await window.reportStatusToNode('info', `Đã nhận bản dịch. Đang trích xuất và ghép Hash...`);

                    // PHÂN TÍCH KẾT QUẢ AI VÀ TẠO TỪ ĐIỂN MAPPING (HASH -> BẢN DỊCH)
                    const mappingDict = {};
                    const regex = /(?:\[Đoạn (\d+)\]):?\s*([\s\S]*?)(?=\n\[Đoạn \d+\]|$)/g;
                    let match;
                    let mappedCount = 0;

                    while ((match = regex.exec(aiResponse)) !== null) {
                        const idx = parseInt(match[1]);
                        const transText = match[2].replace(/\*\*/g, '').replace(/\[Đoạn \d+\]/g, '').trim();
                        
                        if (uniqueTexts[idx] && transText.length > 0) {
                            const originalText = uniqueTexts[idx];
                            const hash = await window.BOT_CRYPTO.hashSHA256(originalText);
                            mappingDict[hash] = transText;
                            mappedCount++;
                        }
                    }

                    await window.reportStatusToNode('success', `Giải mã thành công ${mappedCount}/${uniqueTexts.length} đoạn. Đang đẩy Data Node lên P2P...`);

                    // LƯU TRỮ LÊN NOSTR (ĐÚNG CẤU TRÚC ĐỂ APP_READ.JS NHẬN DIỆN VÀ ĐẮP LÊN WEB TỨC THỜI)
                    const getUrlHash = (url) => {
                        let u = url.split('?')[0].split('#')[0]; if (u.endsWith('/')) u = u.slice(0, -1);
                        const encoded = encodeURIComponent(u).replace(/%([0-9A-F]{2})/g, (m, p1) => String.fromCharCode('0x' + p1));
                        return btoa(encoded).replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_').substring(0, 100);
                    };
                    const getSmartNovelId = (urlStr) => {
                        try {
                            let url = new URL(urlStr);
                            let domain = url.hostname.replace(/^(www|m|h5|wap)\\./i, '');
                            let cleanPath = url.pathname.replace(/\\.[a-zA-Z0-9]+$/g, '');
                            let numMatches = cleanPath.match(/\\b\\d{4,}\\b/g);
                            if (numMatches && numMatches.length > 0) return "DOC_" + domain.replace(/\\./g, '_') + "_" + numMatches[0];
                        } catch(e) {} return "DOC_UNKNOWN";
                    };

                    const cidHash = getUrlHash(window.location.href);
                    const smartHash = getSmartNovelId(window.location.href) + '_' + cidHash;

                    const keyUrlHash = await window.BOT_CRYPTO.hashSHA256(cidHash + "_dom_mapping");
                    const keySmartHash = await window.BOT_CRYPTO.hashSHA256(smartHash + "_dom_mapping");
                    
                    // Gói hàng: mappingDict chính là mấu chốt để web dịch
                    const syncPayload = { mapping: mappingDict, time: Date.now() };
                    
                    await window.publishToNostr(keyUrlHash, syncPayload);
                    await window.publishToNostr(keySmartHash, syncPayload);

                    // Lấy đại đoạn văn dài nhất làm summary cho thư viện
                    let longestTrans = Object.values(mappingDict).reduce((a, b) => a.length > b.length ? a : b, "");
                    const chapPayload = { chapters: [{ id: cidHash, n: "DOM Translated Novel", c: title, u: window.location.href, t: Date.now(), a: "AI " + window.BOT_MODEL, summary: longestTrans.substring(0, 250) + "..." }], time: Date.now() };
                    const keyChapters = await window.BOT_CRYPTO.hashSHA256("P2P_CHAPTERS_" + window.BOT_SHARE_CODE);
                    await window.publishToNostr(keyChapters, chapPayload);

                    // TÌM CHƯƠNG TIẾP THEO (Vẫn dùng Regex trên nội dung nguyên bản)
                    let nextUrl = null;
                    const links = document.querySelectorAll('a');
                    for (let a of links) {
                        let text = a.innerText.toLowerCase();
                        if (text.includes('next') || text.includes('tiếp') || text.includes('sau') || text.includes('下一章') || text.includes('下一页')) {
                            if(a.href && a.href !== window.location.href && !a.href.includes('index') && !a.href.includes('list')) {
                                nextUrl = a.href; 
                                break;
                            }
                        }
                    }

                    return { success: true, nextUrl: nextUrl, title: title, mapped: mappedCount };
                });

                if (result.error) {
                    botStatus.totalErrors++; botStatus.state = 'Lỗi cào dữ liệu!';
                    addLog("❌ Lỗi Bot: " + result.error, 'error'); break; 
                }

                botStatus.totalTranslated++; botStatus.currentChapter = result.title; botStatus.state = 'Đang nghỉ ngơi (Chống Block)...';
                addLog(`✅ Thành công đẩy lên P2P: ${result.title} (Map được ${result.mapped} cụm từ)`, 'success');
                
                if (result.nextUrl && result.nextUrl.startsWith('http')) {
                    currentUrl = result.nextUrl;
                    await new Promise(r => setTimeout(r, 6000)); // Nghỉ 6s tránh bị web ban IP
                } else {
                    botStatus.state = 'ĐÃ HẾT TRUYỆN';
                    addLog("🎉 KHÔNG TÌM THẤY CHƯƠNG TIẾP THEO. Kết thúc cày cuốc.", 'info');
                    currentUrl = null;
                }

            } catch (error) {
                botStatus.totalErrors++; botStatus.state = 'Sụp đổ trình duyệt ảo!';
                addLog(`Lỗi Timeout trang web, thử tải lại sau 15 giây... (${error.message})`, 'error');
                await new Promise(r => setTimeout(r, 15000));
            }
        }
        
    } catch (e) {
        addLog("Lỗi nghiêm trọng khi khởi động Puppeteer: " + e.message, 'error');
    } finally {
        if (browser) await browser.close();
        botStatus.isRunning = false;
        botStatus.state = 'Đã tắt máy (Chờ lệnh mới)';
        addLog("🛑 Tiến trình Bot đã được giải phóng hoàn toàn khỏi bộ nhớ.", 'warn');
    }
}
