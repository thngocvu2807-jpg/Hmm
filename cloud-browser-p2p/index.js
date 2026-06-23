const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOM_ID = process.env.ROOM_ID || 'phong_dich_thuat_1'; // Bạn có thể đổi trong setting của Render

// API giữ server sống
app.get('/', (req, res) => {
    res.send(`🟢 Máy ảo A (Tàng hình) đang chạy ngon lành tại phòng: ${ROOM_ID}`);
});

app.listen(PORT, () => {
    console.log(`Server khởi chạy tại port ${PORT}`);
    startGhostMachine();
});

async function startGhostMachine() {
    console.log("Đang khởi động Trình duyệt Tàng hình...");
    
    // Khởi chạy trình duyệt Chromium ẩn (bỏ qua cảnh báo bảo mật để không bị chặn)
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = await browser.newPage();
    
    // Tắt Content Security Policy để tiêm được thư viện PeerJS vào web bị chặn
    await page.setBypassCSP(true);
    
    // Đặt kích thước màn hình giả lập (Chuẩn PC)
    await page.setViewport({ width: 1366, height: 768 });

    // HÀM TIÊM MÃ TỰ ĐỘNG: Code này sẽ được tự động tiêm vào MỌI TRANG WEB mà trình duyệt ảo này đi tới
    await page.evaluateOnNewDocument(`
        window._GHOST_ROOM_ID = "${ROOM_ID}";
        
        // Tiêm logic Máy A (Bản V9)
        function initGhostA() {
            if (window._p2pGhostInitialized) return;
            window._p2pGhostInitialized = true;

            const STATE = {
                roomId: window._GHOST_ROOM_ID,
                role: 'A',
                peer: null, conn: null,
                mySuffix: 0, observer: null
            };

            function processHTML(htmlString) {
                const doc = new DOMParser().parseFromString(htmlString, 'text/html');
                doc.querySelectorAll('img, script, link, a').forEach(el => {
                    ['src', 'href'].forEach(attr => {
                        const val = el.getAttribute(attr);
                        if (val && !val.startsWith('http') && !val.startsWith('data:') && !val.startsWith('#')) {
                            try { el.setAttribute(attr, new URL(val, window.location.origin).href); } catch (e) {}
                        }
                    });
                });
                return doc.body.innerHTML;
            }

            function loadPeerJS(callback) {
                if (window.Peer) return callback();
                const script = document.createElement('script');
                script.src = "https://unpkg.com/peerjs@1.4.7/dist/peerjs.min.js";
                script.onload = callback;
                document.head.appendChild(script);
            }

            function initConnection() {
                if (STATE.peer) STATE.peer.destroy();
                
                const baseMyId = \`\${STATE.roomId}_\${STATE.role}\`;
                const myPeerId = baseMyId + (STATE.mySuffix === 0 ? '' : \`_\${STATE.mySuffix}\`);
                const baseTargetId = \`\${STATE.roomId}_B\`;

                STATE.peer = new Peer(myPeerId, { config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });

                STATE.peer.on('connection', (conn) => {
                    STATE.conn = conn; handleConnectionEvents(STATE.role, baseTargetId);
                });

                STATE.peer.on('error', (err) => {
                    if (err.type === 'unavailable-id') {
                        STATE.mySuffix = (STATE.mySuffix + 1) % 4; 
                        initConnection();
                    }
                });
            }

            function handleConnectionEvents(role, baseTargetId) {
                if (!STATE.conn) return;

                STATE.conn.on('open', () => {
                    setTimeout(sendSyncHTML, 200); 
                    
                    if (STATE.observer) STATE.observer.disconnect();
                    let syncTimeout = null;
                    STATE.observer = new MutationObserver(() => {
                        clearTimeout(syncTimeout);
                        syncTimeout = setTimeout(() => {
                            if (STATE.conn && STATE.conn.open) sendSyncHTML(); 
                        }, 250); 
                    });
                    STATE.observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
                });

                STATE.conn.on('data', (data) => {
                    if (!data) return;

                    if (data.type === 'PING') { STATE.conn.send({ type: 'PONG' }); return; }

                    if (data.type === 'COMMAND_NAVIGATE') {
                        if (!data.url || String(data.url) === 'null' || data.url.includes('about:blank')) return; 
                        STATE.conn.send({ type: 'NAVIGATING_AWAY' });
                        setTimeout(() => { window.location.href = data.url; }, 100);
                    } 
                    else if (data.type === 'CONTROL_CLICK') {
                        let targetEl = null;
                        try { targetEl = document.querySelector(data.selector); } catch(e){}

                        if (!targetEl && data.text) {
                            const elements = Array.from(document.body.querySelectorAll('*'));
                            for (let el of elements) {
                                if (el.innerText && el.innerText.trim() === data.text && el.children.length === 0) {
                                    targetEl = el; break;
                                }
                            }
                        }

                        if (targetEl) {
                            const eventsToFire = ['pointerdown', 'touchstart', 'mousedown', 'pointerup', 'touchend', 'mouseup', 'click'];
                            eventsToFire.forEach(ev => {
                                try { targetEl.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true, view: window })); } catch(e){}
                            });
                        } else {
                            if (data.url && String(data.url) !== 'null' && !data.url.includes('about:blank')) {
                                STATE.conn.send({ type: 'NAVIGATING_AWAY' });
                                setTimeout(() => { window.location.href = data.url; }, 100);
                            }
                        }
                    }
                    else if (data.type === 'SYNC_SCROLL') {
                        let scrolledByAnchor = false;
                        if (data.anchor) {
                            try {
                                const anchorEl = document.querySelector(data.anchor);
                                if (anchorEl) {
                                    anchorEl.scrollIntoView({ behavior: 'auto', block: 'start' });
                                    scrolledByAnchor = true;
                                }
                            } catch(e) {}
                        }
                        
                        if (!scrolledByAnchor) {
                            const targetX = data.x * (document.documentElement.scrollWidth - window.innerWidth);
                            const targetY = data.y * (document.documentElement.scrollHeight - window.innerHeight);
                            window.scrollTo({ left: targetX, top: targetY, behavior: 'auto' });
                        }
                    }
                });
            }

            function sendSyncHTML() {
                if (!STATE.conn || !STATE.conn.open) return;
                const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(el => {
                    if (el.tagName === 'LINK') {
                        const clone = el.cloneNode();
                        try { clone.setAttribute('href', new URL(el.getAttribute('href'), window.location.origin).href); }catch(e){}
                        return clone.outerHTML;
                    } return el.outerHTML;
                }).join('\\n');

                STATE.conn.send({
                    type: 'SYNC_DATA', 
                    title: document.title, 
                    htmlClass: document.documentElement.className,
                    bodyClass: document.body.className, 
                    styles: styles, 
                    html: processHTML(document.body.innerHTML),
                    baseURI: window.location.origin
                });
            }

            // Đợi trang load xong là chạy
            window.addEventListener('DOMContentLoaded', () => {
                loadPeerJS(initConnection);
            });
        }
        
        // Gọi kích hoạt
        initGhostA();
    `);

    // Khởi tạo điểm đến ban đầu (Trang trắng chứa máy A để chờ bạn gọi lệnh)
    console.log("Đã tiêm mã P2P V9 thành công. Mở cổng chờ kết nối...");
    await page.goto('https://example.com'); 
    
    // Trình duyệt sẽ treo ở đây mãi mãi để phục vụ bạn.
}
