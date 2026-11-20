document.addEventListener("DOMContentLoaded", () => {
    const panel = document.getElementById("studentAiPanel");
    const launcher = document.getElementById("studentAiLauncher");
    const openButton = document.getElementById("openAiAdvisor");
    const closeButton = document.getElementById("closeAiAdvisor");
    const form = document.getElementById("studentAiForm");
    const input = document.getElementById("studentAiInput");
    const sendButton = document.getElementById("studentAiSend");
    const messages = document.getElementById("studentAiMessages");
    const history = [];

    if (!panel || !launcher || !form || !input || !sendButton || !messages) return;

    let activeAuth = null;
    try {
        activeAuth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    } catch (error) {
        console.error("Không thể đọc thông tin phiên đăng nhập:", error);
    }
    if (activeAuth?.user?.role !== "STUDENT") return;

    const majorInput = document.getElementById("aiMajor");
    if (majorInput && activeAuth.user.major) majorInput.value = activeAuth.user.major;

    const openPanel = () => {
        panel.hidden = false;
        launcher.setAttribute("aria-expanded", "true");
        input.focus();
    };
    const closePanel = () => {
        panel.hidden = true;
        launcher.setAttribute("aria-expanded", "false");
        launcher.focus();
    };
    let launcherDragState = null;
    let suppressLauncherClick = false;
    const clampLauncherToViewport = () => {
        const rect = launcher.getBoundingClientRect();
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
        const top = Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8));
        launcher.style.left = `${left}px`;
        launcher.style.top = `${top}px`;
    };
    launcher.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const rect = launcher.getBoundingClientRect();
        launcherDragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top,
            moved: false
        };
        launcher.setPointerCapture(event.pointerId);
    });
    launcher.addEventListener("pointermove", event => {
        if (!launcherDragState || event.pointerId !== launcherDragState.pointerId) return;
        const deltaX = event.clientX - launcherDragState.startX;
        const deltaY = event.clientY - launcherDragState.startY;
        if (!launcherDragState.moved && Math.hypot(deltaX, deltaY) < 5) return;
        if (!launcherDragState.moved) {
            launcherDragState.moved = true;
            launcher.style.right = "auto";
            launcher.style.bottom = "auto";
            launcher.classList.add("is-dragging");
            suppressLauncherClick = true;
        }
        launcher.style.left = `${launcherDragState.left + deltaX}px`;
        launcher.style.top = `${launcherDragState.top + deltaY}px`;
        clampLauncherToViewport();
    });
    const stopLauncherDrag = event => {
        if (!launcherDragState || event.pointerId !== launcherDragState.pointerId) return;
        const dragged = launcherDragState.moved;
        launcherDragState = null;
        launcher.classList.remove("is-dragging");
        if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
        if (dragged) setTimeout(() => { suppressLauncherClick = false; }, 250);
    };
    launcher.addEventListener("pointerup", stopLauncherDrag);
    launcher.addEventListener("pointercancel", stopLauncherDrag);
    launcher.addEventListener("click", event => {
        if (suppressLauncherClick) {
            event.preventDefault();
            suppressLauncherClick = false;
            return;
        }
        panel.hidden ? openPanel() : closePanel();
    });
    const panelHeader = panel.querySelector(".student-ai-panel-header");
    if (panelHeader) {
        let dragState = null;
        const clampPanelToViewport = () => {
            const rect = panel.getBoundingClientRect();
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
            const top = Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8));
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
        };

        panelHeader.addEventListener("pointerdown", event => {
            if (event.button !== 0 || event.target.closest("button")) return;
            const rect = panel.getBoundingClientRect();
            dragState = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top
            };
            panel.style.left = `${rect.left}px`;
            panel.style.top = `${rect.top}px`;
            panel.style.right = "auto";
            panel.style.bottom = "auto";
            panelHeader.classList.add("is-dragging");
            panelHeader.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        panelHeader.addEventListener("pointermove", event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            panel.style.left = `${event.clientX - dragState.offsetX}px`;
            panel.style.top = `${event.clientY - dragState.offsetY}px`;
            clampPanelToViewport();
        });
        const stopDragging = event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            dragState = null;
            panelHeader.classList.remove("is-dragging");
            if (panelHeader.hasPointerCapture(event.pointerId)) {
                panelHeader.releasePointerCapture(event.pointerId);
            }
        };
        panelHeader.addEventListener("pointerup", stopDragging);
        panelHeader.addEventListener("pointercancel", stopDragging);
        window.addEventListener("resize", () => {
            if (launcher.style.left) clampLauncherToViewport();
            if (!panel.hidden && panel.style.left) clampPanelToViewport();
        });
    }
    openButton?.addEventListener("click", openPanel);
    closeButton?.addEventListener("click", closePanel);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) closePanel();
    });

    const appendMessage = (content, className) => {
        const bubble = document.createElement("div");
        bubble.className = `student-ai-message ${className}`;
        bubble.textContent = String(content || "").replace(/\*\*(.+?)\*\*/g, "$1");
        messages.appendChild(bubble);
        messages.scrollTop = messages.scrollHeight;
        return bubble;
    };

    const appendTypingIndicator = () => {
        const row = document.createElement("div");
        row.className = "student-ai-typing-row";

        const avatar = document.createElement("span");
        avatar.className = "student-ai-typing-avatar";
        avatar.setAttribute("aria-hidden", "true");
        const botMark = document.querySelector(".student-ai-icon .student-ai-bot-mark");
        if (botMark) avatar.appendChild(botMark.cloneNode(true));

        const indicator = document.createElement("div");
        indicator.className = "student-ai-message assistant typing";
        indicator.setAttribute("role", "status");
        indicator.setAttribute("aria-label", "AI đang xử lý câu hỏi");
        for (let index = 0; index < 3; index += 1) {
            const dot = document.createElement("span");
            dot.className = "student-ai-typing-dot";
            dot.setAttribute("aria-hidden", "true");
            indicator.appendChild(dot);
        }

        row.append(avatar, indicator);
        messages.appendChild(row);
        messages.scrollTop = messages.scrollHeight;
        return row;
    };

    input.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        form.requestSubmit();
    });

    document.querySelectorAll("[data-ai-prompt]").forEach(button => {
        button.addEventListener("click", () => {
            input.value = button.dataset.aiPrompt || "";
            form.requestSubmit();
        });
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const message = input.value.trim();
        if (!message || sendButton.disabled) return;

        const statedMajor = message.match(/^(?:còn\s+)?ngành\s+(.+?)(?:\s+thì\s+sao)?[?.!]*$/i)?.[1]?.trim()
            || message.match(/^em học ngành\s+(.+?)[?.!]*$/i)?.[1]?.trim();
        if (statedMajor && majorInput) {
            if (majorInput.value.trim().toLowerCase() !== statedMajor.toLowerCase()) {
                history.length = 0;
            }
            majorInput.value = statedMajor;
        }

        appendMessage(message, "user");
        input.value = "";
        sendButton.disabled = true;
        const typing = appendTypingIndicator();

        try {
            const response = await window.apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/ai/student-advisor/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    history: history.slice(-8),
                    profile: {
                        major: majorInput?.value || "",
                        skills: document.getElementById("aiSkills")?.value || "",
                        interests: document.getElementById("aiInterests")?.value || ""
                    }
                })
            });
            let result;
            try {
                result = await response.json();
            } catch (error) {
                throw new Error("Máy chủ trả về phản hồi không hợp lệ.");
            }
            if (!response.ok) throw new Error(result.message || "Không thể kết nối trợ lý AI.");

            typing.remove();
            appendMessage(result.reply, "assistant");
            history.push({ role: "user", content: message }, { role: "assistant", content: result.reply });
            if (history.length > 12) history.splice(0, history.length - 12);
        } catch (error) {
            typing.remove();
            appendMessage(error.message || "Không thể kết nối trợ lý AI. Vui lòng thử lại.", "assistant");
            console.error("Lỗi gửi câu hỏi cho trợ lý AI:", error);
        } finally {
            sendButton.disabled = false;
            input.focus();
        }
    });
});
