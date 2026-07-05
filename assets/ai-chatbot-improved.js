/* AstroAura Chatbot — build 2026-05-12-r3 */
(function () {
  if (!window.AI_CHATBOT_CONFIG) return;

  var CONFIG = window.AI_CHATBOT_CONFIG;

  var DEFAULT_PROMPTS = [
    "Mere Rashi ke liye Rudraksha?",
    "Konsa gemstone suit karega?",
    "Authenticity kaise verify hoti hai?",
    "Order kaise track karoon?"
  ];

  var STATE = {
    isOpen: false,
    isStreaming: false,
    currentBotBubble: null,
    chatHistory: [],
    socket: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 6,
    messageQueue: [],
    unread: 0
  };

  var SVG_NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, content) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (key === "class") node.className = val;
        else if (key === "text") node.textContent = val;
        else if (key === "html") node.innerHTML = val;
        else if (key === "on" && typeof val === "object") {
          Object.keys(val).forEach(function (event) {
            node.addEventListener(event, val[event]);
          });
        } else if (key === "dataset" && typeof val === "object") {
          Object.keys(val).forEach(function (k) { node.dataset[k] = val[k]; });
        } else if (val === true) node.setAttribute(key, "");
        else if (val !== false && val != null) node.setAttribute(key, val);
      });
    }
    if (content != null) {
      if (Array.isArray(content)) {
        content.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof content === "string") {
        node.textContent = content;
      } else {
        node.appendChild(content);
      }
    }
    return node;
  }

  function icon(d, opts) {
    opts = opts || {};
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", opts.viewBox || "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", opts.strokeWidth || 2);
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  var ICONS = {
    chat:   "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
    close:  "M18 6L6 18M6 6l12 12",
    minim:  "M5 12h14",
    send:   "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
    plus:   "M12 5v14M5 12h14",
    star:   "M12 2l2.4 6.4L21 11l-6.6 2.6L12 20l-2.4-6.4L3 11l6.6-2.6L12 2z"
  };

  function buildLogo(className) {
    if (CONFIG.logoUrl) {
      return el("img", {
        class: className,
        src: CONFIG.logoUrl,
        alt: CONFIG.shopName || "AstroAura",
        loading: "eager",
        decoding: "async"
      });
    }
    var fallback = el("span", { class: className + " " + className + "--fallback" });
    fallback.appendChild(icon(ICONS.star, { strokeWidth: 1.8 }));
    return fallback;
  }

  function buildWsUrl(raw) {
    try {
      var u = new URL(raw, window.location.href);
      var pageIsHttps = window.location.protocol === "https:";

      if (u.protocol === "http:")  u.protocol = pageIsHttps ? "wss:" : "ws:";
      if (u.protocol === "https:") u.protocol = "wss:";
      if (u.protocol === "ws:" && pageIsHttps) u.protocol = "wss:";

      var apiPath = (CONFIG.apiPath || "").replace(/\/$/, "");
      var currentPath = u.pathname.replace(/\/$/, "");
      if (!/\/ws$/i.test(currentPath)) {
        u.pathname = (apiPath ? apiPath : currentPath) + "/ws";
      }
      return u.toString();
    } catch (e) {
      console.warn("[AstroAura Chat] Could not build WebSocket URL:", e);
      return null;
    }
  }

  function buildUI() {
    var root = el("div", {
      class: "aa-chat aa-chat--" + (CONFIG.position === "bottom-left" ? "left" : "right"),
      role: "region",
      "aria-label": "Chat with AstroAura Assistant"
    });

    var fab = el("button", {
      class: "aa-chat__fab",
      type: "button",
      "aria-label": "Open chat",
      "aria-expanded": "false"
    });
    fab.appendChild(buildLogo("aa-chat__fab-logo"));
    var fabBadge = el("span", { class: "aa-chat__fab-badge", "aria-hidden": "true" });
    fab.appendChild(fabBadge);
    var fabDot = null;

    var panel = el("aside", {
      class: "aa-chat__panel",
      role: "dialog",
      "aria-label": CONFIG.title || "AstroAura Assistant",
      "aria-hidden": "true"
    });

    var avatar = el("div", { class: "aa-chat__avatar" });
    avatar.appendChild(buildLogo("aa-chat__avatar-logo"));

    var titleBlock = el("div", { class: "aa-chat__titlebar" }, [
      el("div", { class: "aa-chat__title" }, CONFIG.title || "AstroAura Assistant"),
      el("div", { class: "aa-chat__subtitle" }, "Your spiritual companion")
    ]);

    var btnMin = el("button", { class: "aa-chat__icon-btn", type: "button", "aria-label": "Minimise chat" });
    btnMin.appendChild(icon(ICONS.minim));
    var btnClose = el("button", { class: "aa-chat__icon-btn", type: "button", "aria-label": "Close chat" });
    btnClose.appendChild(icon(ICONS.close));

    var header = el("header", { class: "aa-chat__header" }, [
      avatar, titleBlock,
      el("div", { class: "aa-chat__header-actions" }, [btnMin, btnClose])
    ]);

    var messages = el("div", {
      class: "aa-chat__messages",
      role: "log",
      "aria-live": "polite",
      "aria-relevant": "additions"
    });

    var inputField = el("input", {
      class: "aa-chat__input",
      type: "text",
      placeholder: "Ask anything…",
      "aria-label": "Type your message",
      autocomplete: "off"
    });

    var sendBtn = el("button", { class: "aa-chat__send", type: "button", "aria-label": "Send message" });
    sendBtn.appendChild(icon(ICONS.send));

    var inputRow = el("div", { class: "aa-chat__input-row" }, [inputField, sendBtn]);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(inputRow);

    root.appendChild(fab);
    root.appendChild(panel);

    return { root: root, fab: fab, fabDot: fabDot, fabBadge: fabBadge,
             panel: panel, header: header, messages: messages,
             input: inputField, send: sendBtn, btnMin: btnMin, btnClose: btnClose };
  }

  function setUnread(ui, n) {
    STATE.unread = n;
    if (n > 0) {
      ui.fabBadge.textContent = n > 99 ? "99+" : String(n);
      ui.fabBadge.classList.add("is-visible");
    } else {
      ui.fabBadge.classList.remove("is-visible");
    }
  }

  function openPanel(ui) {
    STATE.isOpen = true;
    ui.root.classList.add("is-open");
    ui.panel.setAttribute("aria-hidden", "false");
    ui.fab.setAttribute("aria-expanded", "true");
    ui.fab.setAttribute("aria-label", "Close chat");
    setUnread(ui, 0);
    setTimeout(function () { ui.input.focus(); }, 120);
  }

  function closePanel(ui) {
    STATE.isOpen = false;
    ui.root.classList.remove("is-open");
    ui.panel.setAttribute("aria-hidden", "true");
    ui.fab.setAttribute("aria-expanded", "false");
    ui.fab.setAttribute("aria-label", "Open chat");
    ui.fab.focus();
  }

  function scrollToBottom(messages) {
    messages.scrollTop = messages.scrollHeight;
  }

  function appendBubble(ui, sender, text) {
    var msg = el("div", { class: "aa-chat__msg aa-chat__msg--" + sender });
    var bubble = el("div", { class: "aa-chat__bubble" });
    if (text) bubble.textContent = text;
    msg.appendChild(bubble);
    ui.messages.appendChild(msg);
    scrollToBottom(ui.messages);

    if (sender === "bot" && !STATE.isOpen) {
      setUnread(ui, STATE.unread + 1);
    }
    return bubble;
  }

  function appendPrompts(ui, prompts) {
    var wrap = el("div", { class: "aa-chat__prompts" });
    prompts.forEach(function (p) {
      var chip = el("button", {
        class: "aa-chat__prompt-chip",
        type: "button",
        on: {
          click: function () {
            ui.input.value = p;
            handleSend(ui);
          }
        }
      }, p);
      wrap.appendChild(chip);
    });
    ui.messages.appendChild(wrap);
    scrollToBottom(ui.messages);
  }

  function appendProductCard(bubble, product) {
    var thumb = el("div", { class: "aa-chat__product-thumb" });
    if (product.gradient) thumb.style.background = product.gradient;

    var info = el("div", { class: "aa-chat__product-info" }, [
      el("span", { class: "aa-chat__product-name" }, product.name),
      el("span", { class: "aa-chat__product-detail" }, product.detail || ""),
      el("span", { class: "aa-chat__product-price" }, product.price || "")
    ]);

    var cta = el("a", {
      class: "aa-chat__product-cta",
      href: product.url || "#",
      "aria-label": "View product"
    });
    cta.appendChild(icon(ICONS.plus, { strokeWidth: 2.2 }));

    var card = el("div", { class: "aa-chat__product" }, [thumb, info, cta]);
    bubble.appendChild(card);
  }

  function showTyping(ui) {
    if (ui.messages.querySelector(".aa-chat__typing")) return;
    var typing = el("div", { class: "aa-chat__typing", "aria-label": "Assistant is typing" }, [
      el("span", { class: "aa-chat__typing-dot" }),
      el("span", { class: "aa-chat__typing-dot" }),
      el("span", { class: "aa-chat__typing-dot" })
    ]);
    ui.messages.appendChild(typing);
    scrollToBottom(ui.messages);
  }

  function hideTyping(ui) {
    var t = ui.messages.querySelector(".aa-chat__typing");
    if (t) t.remove();
  }

  function setConnectionState(ui, online) {
    ui.root.classList.toggle("is-offline", !online);
  }

  function connect(ui) {
    if (!CONFIG.wsUrl) return;
    var url = buildWsUrl(CONFIG.wsUrl);
    if (!url) return;

    try {
      var ws = new WebSocket(url);
      STATE.socket = ws;

      ws.onopen = function () {
        STATE.reconnectAttempts = 0;
        setConnectionState(ui, true);
        flushQueue();
      };

      ws.onmessage = function (event) {
        try {
          var data = JSON.parse(event.data);
          handleMessage(ui, data);
        } catch (e) {
          console.warn("[AstroAura Chat] Bad message payload:", e);
        }
      };

      ws.onerror = function () {
        setConnectionState(ui, false);
      };

      ws.onclose = function () {
        setConnectionState(ui, false);
        scheduleReconnect(ui);
      };
    } catch (e) {
      console.warn("[AstroAura Chat] WebSocket init failed:", e);
      setConnectionState(ui, false);
      scheduleReconnect(ui);
    }
  }

  function scheduleReconnect(ui) {
    if (STATE.reconnectAttempts >= STATE.maxReconnectAttempts) {
      showSystemMessage(ui, "I'm having trouble connecting. Please try again in a moment.");
      return;
    }
    STATE.reconnectAttempts += 1;
    var delay = Math.min(1000 * Math.pow(2, STATE.reconnectAttempts - 1), 30000);
    delay += Math.floor(Math.random() * 400);
    setTimeout(function () {
      if (!STATE.socket || STATE.socket.readyState === 3) connect(ui);
    }, delay);
  }

  function showSystemMessage(ui, text) {
    hideTyping(ui);
    var msg = el("div", { class: "aa-chat__system" }, text);
    ui.messages.appendChild(msg);
    scrollToBottom(ui.messages);
  }

  function flushQueue() {
    if (!STATE.socket || STATE.socket.readyState !== 1) return;
    while (STATE.messageQueue.length) {
      var msg = STATE.messageQueue.shift();
      try { STATE.socket.send(JSON.stringify(msg)); }
      catch (e) { STATE.messageQueue.unshift(msg); break; }
    }
  }

  function handleMessage(ui, data) {
    if (data.type === "chat" && data.data) {
      if (!STATE.isStreaming) {
        hideTyping(ui);
        STATE.currentBotBubble = appendBubble(ui, "bot", "");
        STATE.isStreaming = true;
      }
      STATE.currentBotBubble.appendChild(document.createTextNode(data.data));
      scrollToBottom(ui.messages);
    }
    if (data.type === "product" && data.product && STATE.currentBotBubble) {
      appendProductCard(STATE.currentBotBubble, data.product);
      scrollToBottom(ui.messages);
    }
    if (data.complete) {
      STATE.isStreaming = false;
      if (STATE.currentBotBubble && STATE.currentBotBubble.textContent.trim()) {
        STATE.chatHistory.push({ role: "assistant", content: STATE.currentBotBubble.textContent.trim() });
        if (STATE.chatHistory.length > 20) STATE.chatHistory = STATE.chatHistory.slice(-20);
      }
      STATE.currentBotBubble = null;
    }
    if (data.error) {
      hideTyping(ui);
      showSystemMessage(ui, "Sorry — " + data.error);
    }
  }

  function handleSend(ui) {
    var text = ui.input.value.trim();
    if (!text) return;

    appendBubble(ui, "user", text);
    STATE.chatHistory.push({ role: "user", content: text });
    if (STATE.chatHistory.length > 20) STATE.chatHistory = STATE.chatHistory.slice(-20);

    ui.input.value = "";
    showTyping(ui);

    var payload = {
      type: "chat",
      question: text,
      chat_history: STATE.chatHistory,
      meta: {
        shop: window.shopUrl || (window.Shopify && window.Shopify.shop) || "",
        page: window.location.href,
        ua: navigator.userAgent
      }
    };

    if (!STATE.socket || STATE.socket.readyState !== 1) {
      STATE.messageQueue.push(payload);
      connect(ui);
    } else {
      STATE.messageQueue.push(payload);
      flushQueue();
    }

    setTimeout(function () {
      if (STATE.isStreaming) return;
      if (STATE.socket && STATE.socket.readyState === 1) return;
      hideTyping(ui);
      showSystemMessage(ui, "I'm having trouble connecting right now. Please try again in a moment.");
    }, 8000);
  }

  function init() {
    if (document.getElementById("aa-chat-root")) return;
    var ui = buildUI();
    ui.root.id = "aa-chat-root";
    document.body.appendChild(ui.root);

    ui.fab.addEventListener("click", function () {
      STATE.isOpen ? closePanel(ui) : openPanel(ui);
    });
    ui.btnClose.addEventListener("click", function () { closePanel(ui); });
    ui.btnMin.addEventListener("click", function () { closePanel(ui); });

    ui.send.addEventListener("click", function () { handleSend(ui); });
    ui.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend(ui);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && STATE.isOpen) closePanel(ui);
    });

    if (CONFIG.welcome) {
      appendBubble(ui, "bot", CONFIG.welcome);
    }
    appendPrompts(ui, DEFAULT_PROMPTS);

    if (CONFIG.wsUrl) connect(ui);

    window.addEventListener("online", function () {
      if (!STATE.socket || STATE.socket.readyState === 3) connect(ui);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" &&
          (!STATE.socket || STATE.socket.readyState === 3)) {
        connect(ui);
      }
    });

    window.AAChat = {
      open: function () { openPanel(ui); },
      close: function () { closePanel(ui); }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
