(function () {
    if (window.ChatBot_Core) return;

    // ==========================================
    // 1. CONFIGURATION
    // ==========================================
    const CONFIG = {
        TINODE_HOST: "web.vichat.net",
        API_KEY: "AQEAAAABAAD_rAp4DJh05a1HAwFT3A6K",
        BOT_ID: "usr9nOC8W5kIB8",
        SERVER_URL: "https://chatbot.vichat.net",
        PROACTIVE_DELAY: 60000
    };

    window.ChatBot_Core = {
        initialized: false,
        client: null,
        topic: null,
        userID: null,
        isConnected: false,
        widgetKey: window.location.hostname || "localhost",
        proactiveTimer: null,

        // ==========================================
        // 2. LIFECYCLE
        // ==========================================
        async init() {
            if (this.initialized) return;
            if (window.ChatBot_UI) ChatBot_UI.setStatus('connecting');
            if (window.ChatBot_Log) ChatBot_Log.info("⚙️ Core", "Đang khởi tạo kết nối Tinode...");

            if (CONFIG.SERVER_URL) {
                try {
                    const res = await fetch(`${CONFIG.SERVER_URL}/api/widget/config`);
                    const data = await res.json();
                    if (data.status === 'success' && data.bot_id) {
                        CONFIG.BOT_ID = data.bot_id;
                    }
                } catch (e) {
                    if (window.ChatBot_Log) ChatBot_Log.warn("⚠️ Config", "Dùng BOT_ID mặc định");
                }
            }

            let TinodeConstructor = window.tinode?.Tinode || window.Tinode;
            if (!TinodeConstructor) {
                if (window.ChatBot_UI) ChatBot_UI.setStatus('offline');
                return;
            }

            this.client = new TinodeConstructor({
                appName: 'Generic-Chat-Widget',
                host: CONFIG.TINODE_HOST,
                apiKey: CONFIG.API_KEY,
                secure: true
            });

            try {
                await this.client.connect();
                this.isConnected = true;

                const siteKey = this.widgetKey === 'localhost' ? 'default' : this.widgetKey.replace(/\./g, '_');
                const lsKey = `cb_guest_v1_${siteKey}`;
                let guest = localStorage.getItem(lsKey);
                if (!guest) {
                    const rnd = 'g_' + Math.random().toString(36).substr(2, 6);
                    guest = JSON.stringify({ u: rnd, p: "SecurePass_123!" });
                    localStorage.setItem(lsKey, guest);
                }
                const g = JSON.parse(guest);

                try {
                    const ctrl = await this.client.loginBasic(g.u, g.p);
                    this.userID = ctrl.params.user;
                } catch (e) {
                    const ctrl = await this.client.createAccountBasic(g.u, g.p, true);
                    this.userID = ctrl.params.user;
                }

                if (window.ChatBot_UI) ChatBot_UI.setStatus('online');
                this.initialized = true;

                this.topic = this.client.getTopic(CONFIG.BOT_ID) || this.client.newTopicP2P(CONFIG.BOT_ID);
                await this.topic.subscribe({ get: { what: 'desc sub data', data: { limit: 20 } } });

                // Hỗ trợ cả ID cũ và mới để tương thích ngược trong quá trình chuyển đổi
                const input = document.querySelector('[id*="-msgInput"]');
                const btn = document.querySelector('[id*="-sendBtn"]');
                if (input) input.removeAttribute('disabled');
                if (btn) btn.removeAttribute('disabled');

                this.topic.onData = (msg) => {
                    if (!msg || !msg.content || this.client.isMe(msg.from)) return;
                    if (msg.from !== CONFIG.BOT_ID) return;

                    if (window.ChatBot_UI) {
                        ChatBot_UI.setTyping(false);
                        try {
                            const data = JSON.parse(msg.content);
                            if (data.clear_id) document.getElementById(data.clear_id)?.remove();

                            if (data.is_rich_text) {
                                ChatBot_UI.appendMessage("Bot", data.text, "bot", {
                                    buttons: data.buttons,
                                    card: data.card,
                                    tempId: data.temp_id
                                });
                            } else {
                                ChatBot_UI.appendMessage("Bot", data.text || msg.content, "bot", { tempId: data.temp_id });
                            }
                        } catch (e) {
                            ChatBot_UI.appendMessage("Bot", msg.content, "bot");
                        }
                    }
                };

                this.sendGreeting();

            } catch (err) {
                if (window.ChatBot_UI) ChatBot_UI.setStatus('offline');
                this.isConnected = false;
                this.initialized = false;
            }
        },

        handleSend() {
            const input = document.querySelector('[id*="-msgInput"]');
            const text = input?.value.trim();
            if (!text) return;
            input.value = '';
            this.sendMessage(text);
        },

        sendMessage(text, isPassive = false) {
            if (!this.topic) return;
            if (!isPassive) clearTimeout(this.proactiveTimer);

            if (window.ChatBot_UI) {
                ChatBot_UI.appendMessage("Tôi", text, "me");
                ChatBot_UI.setTyping(true);
            }
            const menu = document.querySelector('[id*="-quickMenu"]');
            if (menu) menu.classList.remove('cb-show');

            this.topic.publish(JSON.stringify({
                action: "chat",
                widget_key: this.widgetKey,
                text: text
            }));
        },

        clearChat() {
            clearTimeout(this.proactiveTimer);
            if (window.ChatBot_UI) ChatBot_UI.clearUI();
            if (this.topic) {
                this.topic.publish(JSON.stringify({
                    action: "chat",
                    widget_key: this.widgetKey,
                    text: "/clear"
                }));
            }
        },

        sendGreeting() {
            const key = 'cb_greeted_hv_v1_' + this.userID;
            if (sessionStorage.getItem(key)) return;

            this.topic.publish(`/start_greet|${this.widgetKey}|bạn|`);
            if (window.ChatBot_UI) ChatBot_UI.setTyping(true);
            sessionStorage.setItem(key, 'true');
        },

        startProactiveTimer() {
            this.proactiveTimer = setTimeout(() => {
                const box = document.querySelector('[id*="-messages"]');
                if (box) {
                    const myMsgs = box.querySelectorAll('[class*="-message me"]');
                    if (myMsgs.length === 0) {
                        this.triggerProactiveGreeting();
                    }
                }
            }, CONFIG.PROACTIVE_DELAY);
        },

        async triggerProactiveGreeting() {
            const win = document.getElementById('cb-window');
            if (win && !win.classList.contains('cb-open')) {
                if (window.ChatBot_UI) ChatBot_UI.toggleWindow();
            }

            let retry = 0;
            while (!this.isConnected && retry < 5) {
                await new Promise(r => setTimeout(r, 1000));
                retry++;
            }

            if (this.isConnected) {
                this.sendMessage("/proactive_greet", true);
            }
        }
    };

    ChatBot_Core.startProactiveTimer();

})();
