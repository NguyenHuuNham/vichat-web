(function () {
    // ==========================================
    // 0. AUTO-LOAD CORE
    // ==========================================
    if (!window.ChatBot_Core) {
        // Tự động tìm đường dẫn của script hiện tại để load Core cùng thư mục
        const scripts = document.getElementsByTagName('script');
        const currentScript = scripts[scripts.length - 1]; // Giả định là script này đang chạy
        const scriptDir = currentScript.src.substring(0, currentScript.src.lastIndexOf('/') + 1);

        const script = document.createElement('script');
        script.src = scriptDir + 'chatbot-core.js';
        script.async = true;
        document.head.appendChild(script);
    }

    if (window.ChatBot_UI) return;

    // ==========================================
    // 1. LOG UTILITY (Generic)
    // ==========================================
    window.ChatBot_Log = {
        _style: {
            tag: 'font-weight:600; padding:2px 6px; border-radius:3px; color:#fff;',
            reset: 'color:inherit; font-weight:normal;',
        },
        _fmt(color, label) {
            return [`%c ${label} %c`, `background:${color};` + this._style.tag, this._style.reset];
        },
        info(label, ...args) {
            const [fmt, s1, s2] = this._fmt('#2196f3', label);
            console.log(fmt, s1, s2, ...args);
        },
        ok(label, ...args) {
            const [fmt, s1, s2] = this._fmt('#4caf50', label);
            console.log(fmt, s1, s2, ...args);
        },
        warn(label, ...args) {
            const [fmt, s1, s2] = this._fmt('#ff9800', label);
            console.warn(fmt, s1, s2, ...args);
        },
        error(label, ...args) {
            const [fmt, s1, s2] = this._fmt('#f44336', label);
            console.error(fmt, s1, s2, ...args);
        }
    };

    // ==========================================
    // 2. CSS STYLES (Generic Chatbot)
    // ==========================================
    const primaryColor = "#0e3f75";
    const style = document.createElement("style");
    style.innerHTML = `
        #cb-root {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        #cb-root * { box-sizing: border-box; }

        .cb-toggle {
            position: fixed; bottom: 30px; right: 30px;
            width: 60px; height: 60px;
            background: ${primaryColor};
            color: white; border-radius: 50%;
            display: flex; justify-content: center; align-items: center;
            font-size: 30px; cursor: pointer;
            box-shadow: 0 6px 20px rgba(0,0,0,0.2);
            transition: transform 0.3s; z-index: 999999;
            user-select: none;
        }
        .cb-toggle:hover { transform: scale(1.1) rotate(10deg); }

        .cb-window {
            position: fixed; bottom: 100px; right: 30px;
            width: 380px; height: 600px;
            background: white; border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            display: none; flex-direction: column;
            z-index: 999999; overflow: hidden;
            opacity: 0; transform: translateY(20px);
            transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .cb-window.cb-open { display: flex; opacity: 1; transform: translateY(0); }

        .cb-header {
            background: ${primaryColor};
            color: #fff; padding: 15px 20px;
            display: flex; align-items: center; justify-content: space-between;
        }
        .cb-header .cb-title {
            display: flex; flex-direction: column; gap: 2px;
        }
        .cb-header-identity { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; }
        .cb-header-status-row { display: flex; align-items: center; gap: 5px; font-size: 11px; opacity: 0.9; }
        
        .cb-header-controls { display: flex; align-items: center; gap: 15px; }
        .cb-status {
            width: 8px; height: 8px; background: #ccc;
            border-radius: 50%; transition: background 0.3s;
        }
        .cb-status.online { background: #10b981; }
        .cb-status.connecting { animation: cb-blink 1s infinite; background: #f59e0b; }
        .cb-status.offline { background: #ef4444; }

        @keyframes cb-blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        .cb-close {
            cursor: pointer; font-size: 18px; font-weight: bold;
            width: 30px; height: 30px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.15); transition: background 0.2s;
        }
        .cb-close:hover { background: rgba(255,255,255,0.3); }
        .cb-clear {
            cursor: pointer; opacity: 0.8; transition: all 0.2s;
            width: 30px; height: 30px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.12);
        }
        .cb-clear:hover { opacity: 1; background: rgba(255,255,255,0.25); }
        .cb-clear svg { width: 15px; height: 15px; fill: white; }

        /* 🚀 RICH UI CARD STYLES */
        .cb-msg-card {
            background: #e0f2fe;
            border-radius: 12px;
            border-left: 4px solid #0e3f75;
            padding: 12px;
            margin: 8px 0 12px 0;
            border: 1px solid #bae6fd;
            animation: cb-fadeIn 0.3s ease;
        }
        .cb-card-title {
            font-weight: bold; color: #0e3f75;
            margin-bottom: 8px; display: flex; align-items: center; gap: 6px; font-size: 15px;
        }
        .cb-card-item {
            display: flex; justify-content: space-between; padding: 6px 0;
            border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }
        .cb-card-item:last-child { border-bottom: none; }
        .cb-card-label { color: #64748b; font-size: 13px; }
        .cb-card-value { font-weight: 600; font-size: 13px; }
        .cb-card-tag {
            background: #cffafe; color: #0e3f75; padding: 2px 6px;
            border-radius: 4px; font-size: 11px; font-weight: bold;
        }

        /* 📊 TABLE STYLES */
        .cb-table-container { width: 100%; overflow-x: auto; margin: 8px 0; border-radius: 8px; border: 1px solid #e2e8f0; }
        .cb-table-container table { width: 100%; border-collapse: collapse; font-size: 13px; background: white; }
        .cb-table-container th, .cb-table-container td { padding: 10px; border: 1px solid #e2e8f0; text-align: left; }
        .cb-table-container th { background: #f8fafc; font-weight: bold; color: #475569; }

        .cb-confirm-modal {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
            z-index: 3000; display: none; justify-content: center; align-items: center;
        }
        .cb-confirm-modal.cb-show { display: flex; animation: cb-fadeIn 0.2s; }
        .cb-confirm-box {
            background: white; padding: 25px; border-radius: 12px; width: 85%;
            text-align: center; color: #333; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        }
        .cb-confirm-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
        .cb-confirm-actions button {
            flex: 1; padding: 12px; border: none; border-radius: 8px;
            cursor: pointer; font-weight: 600; transition: 0.2s;
        }
        .cb-btn-cancel { background: #f1f5f9; color: #475569; }
        .cb-btn-delete { background: #ef4444; color: white; }

        .cb-body {
            flex: 1; padding: 20px; overflow-y: auto; background: #fdfbf7;
            display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth;
        }

        .cb-message {
            max-width: 100%; padding: 10px 14px; border-radius: 14px;
            font-size: 14px; line-height: 1.5; word-wrap: break-word;
            animation: cb-fadeIn 0.3s ease;
        }
        .cb-message.me {
            align-self: flex-end; background: ${primaryColor};
            color: #fff; border-radius: 14px 14px 2px 14px;
        }
        .cb-message.bot {
            align-self: flex-start; background: #f0f2f5; color: #1c1e21;
            border-radius: 14px 14px 14px 4px;
        }
        .cb-time { font-size: 10px; color: #94a3b8; margin-top: 4px; text-align: right; display: block; }
        .cb-message.me .cb-time { color: rgba(255,255,255,0.8); }

        .cb-bot-container { display: flex; flex-direction: column; gap: 5px; align-self: flex-start; max-width: 95%; }
        .cb-bot-row { display: flex; align-items: flex-start; gap: 8px; }
        .cb-bot-avatar { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #fde68a; padding: 2px; background: white; flex-shrink: 0; }
        
        .cb-bot-msg-group { display: flex; flex-direction: column; gap: 4px; flex: 1; }

        .cb-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin-top: 6px; padding: 0; }
        .cb-action-btn {
            background: #ffffff; color: #0e3f75; border: 1px solid #bae6fd;
            padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
            cursor: pointer; transition: 0.2s; width: fit-content; min-width: 150px; text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .cb-action-btn:hover { background: #f0f9fe; border-color: #0e3f75; transform: translateY(-1px); box-shadow: 0 3px 6px rgba(0,0,0,0.1); }

        .cb-typing { display: none; align-items: center; gap: 8px; margin-bottom: 10px; }
        .cb-typing-only { display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px; border-radius: 18px; }
        .cb-typing-only span { width: 6px; height: 6px; background: #0e3f75; border-radius: 50%; display: inline-block; animation: cb-bounce 1.4s infinite ease-in-out both; }

        @keyframes cb-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        @keyframes cb-fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        /* Hide send btn on desktop */
        @media (min-width: 768px) {
            .cb-send-btn { display: none !important; }
        }

        .cb-quick-menu {
            position: absolute; bottom: 85px; left: 10px; right: 10px;
            background: white; border-radius: 12px; padding: 12px;
            box-shadow: 0 -5px 25px rgba(0,0,0,0.15);
            display: none; grid-template-columns: 1fr 1fr; gap: 10px;
            z-index: 2001; border: 1px solid #fef3c7;
        }
        .cb-quick-menu.cb-show { display: grid; animation: cb-fadeIn 0.2s; }
        .cb-quick-menu button {
            padding: 10px; background: #e0f2fe; border: 1px solid #bae6fd;
            border-radius: 8px; text-align: left; cursor: pointer; font-size: 13px; color: #0e3f75; font-weight: 500;
        }
        .cb-quick-menu button:hover { background: #bae6fd; }

        .cb-footer { padding: 15px; background: white; border-top: 1px solid #f3f4f6; display: flex; gap: 10px; align-items: center; }
        .cb-footer input { flex: 1; padding: 12px 18px; border-radius: 25px; border: 1px solid #e2e8f0; outline: none; background: #f8fafc; transition: 0.3s; }
        .cb-footer input:focus { background: white; border-color: #0e3f75; }
        .cb-send-btn, .cb-menu-btn { width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
        .cb-send-btn { background: ${primaryColor}; color: white; font-size: 18px; box-shadow: 0 4px 10px rgba(225,173,1,0.3); }
        .cb-send-btn:hover:not(:disabled) { transform: scale(1.05); }
        .cb-send-btn:disabled { background: #cbd5e1; cursor: not-allowed; box-shadow: none; }
        .cb-menu-btn { background: #e0f2fe; color: #0e3f75; font-size: 22px; }

        /* 📱 MOBILE: Fullscreen khi màn hình nhỏ */
        @media (max-width: 480px) {
            .cb-toggle {
                bottom: 16px; right: 16px;
                width: 52px; height: 52px; font-size: 24px;
            }
            .cb-window {
                position: fixed !important;
                inset: 0 !important;
                width: 100% !important;
                height: 100% !important;
                bottom: 0 !important; right: 0 !important;
                border-radius: 0 !important;
                max-height: 100dvh;
            }
            .cb-header { padding: 14px 16px; }
            .cb-body { padding: 14px; }
            .cb-footer { padding: 10px 14px; }
            .cb-footer input { font-size: 16px; } /* tránh iOS zoom */
            .cb-quick-menu { bottom: 75px; left: 8px; right: 8px; }
        }
    `;
    document.head.appendChild(style);

    // ==========================================
    // 3. UI OBJECT — THE "FACE" OF THE BOT
    // ==========================================
    window.ChatBot_UI = {
        botAvatar: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
        toggleIcon: "https://cdn-icons-png.flaticon.com/512/3368/3368362.png",

        init() {
            if (document.getElementById("cb-root")) return;

            const root = document.createElement("div");
            root.id = "cb-root";
            root.innerHTML = `
                <div class="cb-toggle" onclick="ChatBot_UI.toggleWindow()">
                    <img src="${this.toggleIcon}" width="30" style="filter: brightness(0) invert(1);">
                </div>
                <div class="cb-window" id="cb-window">
                    <div class="cb-header">
                        <div class="cb-title">
                            <div class="cb-header-identity">
                                <img src="${this.botAvatar}" width="22" style="filter: brightness(0) invert(1);">
                                Trợ lý Ảo
                            </div>
                            <div class="cb-header-status-row">
                                <span class="cb-status" id="cb-status"></span>
                                <span id="cb-status-text">Đang kết nối...</span>
                            </div>
                        </div>
                        <div class="cb-header-controls">
                            <span class="cb-clear" onclick="ChatBot_UI.showClearConfirm()" title="Xóa lịch sử">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l1 1h4v2H4V4h4L9 3zm-4 5h14l-1 13H6L5 8zm5 2v9h1v-9h-1zm4 0v9h1v-9h-1z"/></svg>
                            </span>
                            <span class="cb-close" onclick="ChatBot_UI.toggleWindow()">✕</span>
                        </div>
                    </div>
                    <div class="cb-confirm-modal" id="cb-confirm">
                        <div class="cb-confirm-box">
                            <p>Bạn có chắc chắn muốn xóa sạch toàn bộ lịch sử trò chuyện này không?</p>
                            <div class="cb-confirm-actions">
                                <button class="cb-btn-cancel" onclick="ChatBot_UI.hideClearConfirm()">Hủy</button>
                                <button class="cb-btn-delete" onclick="ChatBot_Core.clearChat();ChatBot_UI.hideClearConfirm();">Xác nhận xóa</button>
                            </div>
                        </div>
                    </div>
                    <div class="cb-body" id="cb-messages"></div>
                    <div class="cb-quick-menu" id="cb-quickMenu">
                        <button onclick="ChatBot_Core.sendMessage('Bạn có thể giúp tôi gì?')">❓ Hỏi</button>
                        <button onclick="ChatBot_Core.sendMessage('Các dịch vụ')">🛠️ Dịch vụ</button>
                        <button onclick="ChatBot_Core.sendMessage('Hỗ trợ')">🎧 Hỗ trợ</button>
                        <button onclick="ChatBot_Core.sendMessage('Thông tin')">ℹ️ Thông tin</button>
                        <button onclick="ChatBot_Core.sendMessage('Liên hệ')">📞 Liên hệ</button>
                        <button onclick="ChatBot_Core.sendMessage('Bạn là ai?')">🤖 Giới thiệu</button>
                    </div>
                    <div class="cb-typing" id="cb-typing">
                        <img src="${this.botAvatar}" class="cb-bot-avatar">
                        <div class="cb-typing-only"><span></span><span></span><span></span></div>
                    </div>
                    <div class="cb-footer">
                        <button class="cb-menu-btn" onclick="ChatBot_UI.toggleMenu()">☰</button>
                        <input type="text" id="cb-msgInput" placeholder="Nhập câu hỏi của bạn..." disabled maxlength="1000">
                        <button class="cb-send-btn" id="cb-sendBtn" onclick="ChatBot_Core.handleSend()" disabled>➤</button>
                    </div>
                </div>
            `;
            document.body.appendChild(root);

            const input = document.getElementById('cb-msgInput');
            if (input) {
                input.addEventListener("keypress", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        ChatBot_Core.handleSend();
                    }
                });
            }
        },

        toggleWindow() {
            const win = document.getElementById('cb-window');
            if (!win) return;
            if (win.classList.contains('cb-open')) {
                win.classList.remove('cb-open');
                document.getElementById('cb-quickMenu')?.classList.remove('cb-show');
                setTimeout(() => win.style.display = 'none', 300);
            } else {
                win.style.display = 'flex';
                void win.offsetWidth;
                win.classList.add('cb-open');
                this.scrollToBottom();
                if (window.ChatBot_Core && !ChatBot_Core.initialized) ChatBot_Core.init();
            }
        },

        toggleMenu() {
            document.getElementById('cb-quickMenu')?.classList.toggle('cb-show');
        },

        showClearConfirm() {
            document.getElementById('cb-confirm')?.classList.add('cb-show');
        },

        hideClearConfirm() {
            document.getElementById('cb-confirm')?.classList.remove('cb-show');
        },

        setTyping(show) {
            const indicator = document.getElementById('cb-typing');
            if (indicator) indicator.style.display = show ? 'flex' : 'none';
            if (show) this.scrollToBottom();
        },

        setStatus(cls) {
            const el = document.getElementById('cb-status');
            const txt = document.getElementById('cb-status-text');
            if (el) el.className = 'cb-status ' + cls;
            if (txt) {
                if (cls === 'online') txt.innerText = 'Hoạt động';
                else if (cls === 'connecting') txt.innerText = 'Đang kết nối...';
                else txt.innerText = 'Ngoại tuyến';
            }
        },

        // 🚀 SMART SCROLL: Chỉ cuộn nếu user đang ở gần đáy
        scrollToBottom(isForce = false) {
            const box = document.getElementById('cb-messages');
            if (!box) return;
            const threshold = 30;
            const isAtBottom = (box.scrollHeight - box.scrollTop) <= (box.clientHeight + threshold);
            if (isAtBottom || isForce) {
                box.scrollTo({ top: box.scrollHeight, behavior: isForce ? 'smooth' : 'instant' });
            }
        },

        // 📝 RENDERING LOGIC (Full restored)
        appendMessage(sender, text, type, options = {}) {
            if (!text || typeof text !== 'string' || text.startsWith("/")) return;

            const box = document.getElementById('cb-messages');
            if (!box) return;

            // Xóa button actions cũ nếu user vừa nhắn tin mới
            if (type === 'me') {
                const lastActions = box.querySelectorAll('.cb-actions');
                if (lastActions.length > 0) lastActions[lastActions.length - 1].remove();
            }

            if (type === 'me') {
                const div = document.createElement('div');
                div.className = 'cb-message me';
                div.innerHTML = `${this.markdown(text)}<span class="cb-time">${this.getTime()}</span>`;
                box.appendChild(div);
                this.scrollToBottom(true);
                return;
            }

            // BOT MESSAGE (With Card & Typewriter)
            const container = document.createElement('div');
            container.className = 'cb-bot-container';
            if (options.tempId) container.id = options.tempId;

            let cardHtml = "";
            if (options.card) {
                const card = options.card;
                let itemsHtml = (card.items || []).map(it => `
                    <div class="cb-card-item">
                        <span class="cb-card-label">${it.label}</span>
                        <span class="cb-card-value">${it.value} ${it.tag ? `<span class="cb-card-tag">${it.tag}</span>` : ''}</span>
                    </div>
                `).join('');

                cardHtml = `
                    <div class="cb-msg-card">
                        <div class="cb-card-title">${card.icon || ''} ${card.title || 'Thông tin'}</div>
                        <div class="cb-card-content">${itemsHtml}</div>
                        ${card.footer ? `<div style="margin-top:8px; font-size:11px; color:#94a3b8; font-style:italic;">${card.footer}</div>` : ''}
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="cb-bot-row">
                    <img src="${this.botAvatar}" class="cb-bot-avatar">
                    <div class="cb-bot-msg-group">
                        ${cardHtml}
                        <div class="cb-message bot"></div>
                        <div class="cb-actions" style="display:none"></div>
                    </div>
                </div>
            `;

            box.appendChild(container);
            const msgDiv = container.querySelector('.cb-message.bot');
            const actionDiv = container.querySelector('.cb-actions');

            // ⌨️ TYPEWRITER EFFECT (High speed as requested)
            let i = 0;
            let currentText = "";
            const typewriter = () => {
                if (i < text.length) {
                    currentText += text.charAt(i);
                    msgDiv.innerHTML = this.markdown(currentText) + `<span class="cb-time">${this.getTime()}</span>`;
                    i++;
                    this.scrollToBottom();
                    setTimeout(typewriter, 3);
                } else {
                    // Show buttons after typing finish
                    if (options.buttons && options.buttons.length > 0) {
                        actionDiv.innerHTML = options.buttons.map(b => {
                            const val = b.value;
                            if (val.startsWith("http")) {
                                return `<button class="cb-action-btn" onclick="window.open('${val}','_blank')">${b.label}</button>`;
                            }
                            return `<button class="cb-action-btn" onclick="ChatBot_Core.sendMessage('${val.replace(/'/g, "\\'")}')">${b.label}</button>`;
                        }).join('');
                        actionDiv.style.display = 'flex';
                        this.scrollToBottom(true);
                    }
                }
            };
            typewriter();
        },

        markdown(text) {
            if (!text) return "";
            let t = text.trim();

            // Support Table Rendering (From script.js)
            if (t.includes('|')) {
                const lines = t.split('\n');
                let tableHtml = '<div class="cb-table-container"><table>';
                let inTable = false;
                let finalOutput = [];
                for (let line of lines) {
                    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
                        if (!inTable) { inTable = true; tableHtml = '<div class="cb-table-container"><table>'; }
                        const cells = line.split('|').filter(c => c.trim() !== '' || line.indexOf(c) > 0 && line.indexOf(c) < line.length - 1);
                        if (line.includes('---')) continue;
                        tableHtml += '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
                    } else {
                        if (inTable) { inTable = false; tableHtml += '</table></div>'; finalOutput.push(tableHtml); }
                        finalOutput.push(line);
                    }
                }
                if (inTable) { tableHtml += '</table></div>'; finalOutput.push(tableHtml); }
                t = finalOutput.join('\n');
            }

            return t
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                .replace(/\*(.*?)\*/g, '<i>$1</i>')
                .replace(/\n/g, '<br>');
        },

        getTime() {
            const d = new Date();
            return d.getHours().toString().padStart(2, '0') + ":" + d.getMinutes().toString().padStart(2, '0');
        },

        clearUI() {
            const box = document.getElementById('cb-messages');
            if (box) box.innerHTML = '';
            this.hideClearConfirm();
        }
    };

    // Auto injection
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ChatBot_UI.init());
    } else {
        ChatBot_UI.init();
    }
})();
