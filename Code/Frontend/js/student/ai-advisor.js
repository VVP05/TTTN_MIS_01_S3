document.addEventListener("DOMContentLoaded", () => {
    const panel = document.getElementById("studentAiPanel");
    const launcher = document.getElementById("studentAiLauncher");
    const openButton = document.getElementById("openAiAdvisor");
    const closeButton = document.getElementById("closeAiAdvisor");
    const resetButton = document.getElementById("resetAiAdvisor");
    const form = document.getElementById("studentAiForm");
    const input = document.getElementById("studentAiInput");
    const sendButton = document.getElementById("studentAiSend");
    const messages = document.getElementById("studentAiMessages");
    const pill = document.getElementById("studentAiPill");
    const teaser = document.getElementById("studentAiTeaser");
    const teaserOpenButton = document.getElementById("studentAiTeaserOpen");
    const teaserCloseButton = document.getElementById("studentAiTeaserClose");
    const teaserText = document.getElementById("studentAiTeaserText");
    const teaserTyping = document.getElementById("studentAiTeaserTyping");
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

    const teaserDismissKey = "studentAiTeaserDismissed";
    let teaserDismissed = false;
    try {
        teaserDismissed = Boolean(sessionStorage.getItem(teaserDismissKey));
    } catch (error) {
        teaserDismissed = false;
    }

    const dismissTeaser = () => {
        teaserDismissed = true;
        try {
            sessionStorage.setItem(teaserDismissKey, "1");
        } catch (error) {
            // ignore
        }
        clearTeaserSequence();
        hideTeaser();
    };

    let teaserStartTimer = null;
    let teaserHideTimer = null;
    let teaserRepeatTimer = null;
    let teaserCycleActive = false;
    const teaserTimers = [];

    const clearTeaserSequence = () => {
        if (teaserStartTimer) clearTimeout(teaserStartTimer);
        teaserStartTimer = null;
        if (teaserRepeatTimer) clearTimeout(teaserRepeatTimer);
        teaserRepeatTimer = null;
        teaserTimers.forEach(timer => clearTimeout(timer));
        teaserTimers.length = 0;
        if (teaserHideTimer) clearTimeout(teaserHideTimer);
        teaserHideTimer = null;
    };

    const positionTeaser = () => {
        if (!teaser || teaser.hidden) return;
        if (launcher.style.left) {
            const launcherRect = launcher.getBoundingClientRect();
            teaser.style.left = `${Math.max(8, launcherRect.left - teaser.offsetWidth - 14)}px`;
            teaser.style.top = `${Math.max(8, launcherRect.top - 20)}px`;
            teaser.style.right = "auto";
            teaser.style.bottom = "auto";
        } else {
            teaser.style.left = "";
            teaser.style.top = "";
            teaser.style.right = "";
            teaser.style.bottom = "";
        }
    };

    const hideTeaser = () => {
        if (!teaser || teaser.hidden) return;
        teaser.classList.remove("is-visible");
        teaser.classList.add("is-hiding");
        clearTeaserSequence();
        if (teaserHideTimer) clearTimeout(teaserHideTimer);
        teaserHideTimer = setTimeout(() => {
            teaser.hidden = true;
            teaser.classList.remove("is-hiding");
            teaserCycleActive = false;
            teaserHideTimer = null;
        }, 250);
    };

    const messagesSequence = [
        { text: "Hihi chào bạn nha  ✨", hold: 2200 },
        { text: "Chúc bạn một ngày tốt lành nhe 🫶", hold: 2200 },
        { text: "Bạn cần mình hỗ trợ gì không nào? 💭", hold: 10000 }
    ];

    const showSingleMessage = (index = 0) => {
        if (!teaserCycleActive || teaserDismissed || !panel.hidden) return;
        if (index >= messagesSequence.length) {
            teaserCycleActive = false;
            // Sau khi câu cuối kết thúc, nếu người dùng vẫn chưa mở chat, lặp lại sau 15s để luôn sẵn sàng
            teaserRepeatTimer = setTimeout(() => {
                if (!teaserDismissed && panel.hidden) startTeaser();
            }, 15000);
            return;
        }

        const current = messagesSequence[index];

        // 1. Hiện bóng thoại với typing 3 chấm (khoảng 0.6 giây)
        teaser.hidden = false;
        teaser.classList.remove("is-hiding");
        teaser.classList.add("is-visible");
        if (teaserTyping) teaserTyping.hidden = false;
        if (teaserText) teaserText.textContent = "";
        requestAnimationFrame(positionTeaser);

        // 2. Sau 600ms typing -> hiện câu chữ
        teaserTimers.push(setTimeout(() => {
            if (!teaserCycleActive || teaserDismissed || !panel.hidden) return;
            if (teaserTyping) teaserTyping.hidden = true;
            if (teaserText) teaserText.textContent = current.text;
            requestAnimationFrame(positionTeaser);

            // 3. Giữ câu chữ trên màn hình rồi fade out biến mất (câu trước xong rồi mất mới tới câu sau)
            teaserTimers.push(setTimeout(() => {
                if (!teaserCycleActive || teaserDismissed || !panel.hidden) return;
                teaser.classList.remove("is-visible");
                teaser.classList.add("is-hiding");

                // 4. Chờ mờ dần 250ms -> ẩn đi và chuyển sang câu tiếp theo
                teaserTimers.push(setTimeout(() => {
                    teaser.hidden = true;
                    teaser.classList.remove("is-hiding");
                    showSingleMessage(index + 1);
                }, 250));
            }, current.hold));
        }, 600));
    };

    const startTeaser = () => {
        if (!teaser || teaserDismissed || teaserCycleActive || !panel.hidden) return;

        teaserCycleActive = true;

        // Chế độ giảm chuyển động
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReducedMotion) {
            teaser.hidden = false;
            teaser.classList.remove("is-hiding");
            teaser.classList.add("is-visible");
            if (teaserTyping) teaserTyping.hidden = true;
            if (teaserText) teaserText.textContent = messagesSequence[2].text;
            requestAnimationFrame(positionTeaser);
            teaserHideTimer = setTimeout(() => hideTeaser(), 10000);
            return;
        }

        showSingleMessage(0);
    };

    let panelCloseTimer = null;
    const openPanel = () => {
        clearTeaserSequence();
        hideTeaser();
        if (pill) pill.classList.add("is-collapsed");
        if (panelCloseTimer) {
            clearTimeout(panelCloseTimer);
            panelCloseTimer = null;
        }
        panel.hidden = false;
        requestAnimationFrame(() => {
            panel.classList.add("is-open");
            messages.scrollTop = messages.scrollHeight;
        });
        launcher.setAttribute("aria-expanded", "true");
        input.focus();
    };
    const closePanel = () => {
        clearTeaserSequence();
        hideTeaser();
        panel.classList.remove("is-open");
        if (panelCloseTimer) clearTimeout(panelCloseTimer);
        panelCloseTimer = setTimeout(() => {
            panel.hidden = true;
            panelCloseTimer = null;
        }, 250);
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
        if (dragged && teaser && !teaser.hidden) requestAnimationFrame(positionTeaser);
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
            if (teaser && !teaser.hidden) requestAnimationFrame(positionTeaser);
        });
    }
    openButton?.addEventListener("click", openPanel);
    closeButton?.addEventListener("click", closePanel);
    
    // Bấm vào bong bóng lời chào thì mở khung chat
    teaserOpenButton?.addEventListener("click", event => {
        if (event.target.closest("#studentAiTeaserClose")) return;
        openPanel();
    });

    // Nút tắt (X) ở bong bóng để tắt lời chào
    teaserCloseButton?.addEventListener("click", event => {
        event.stopPropagation();
        dismissTeaser();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !panel.hidden) closePanel();
    });
    if (!teaserDismissed && teaser) teaserStartTimer = setTimeout(startTeaser, 1500);

    // Tự thu gọn nhãn chữ sau 8 giây hoặc khi cuộn trang
    if (pill) {
        let pillCollapsed = false;
        const collapsePill = () => {
            if (pillCollapsed) return;
            pillCollapsed = true;
            pill.classList.add("is-collapsed");
        };
        const pillTimer = setTimeout(collapsePill, 8000);
        const onScroll = () => {
            collapsePill();
            window.removeEventListener("scroll", onScroll);
            clearTimeout(pillTimer);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        pill.addEventListener("click", () => {
            openPanel();
            collapsePill();
        });
    }

    const appendMessage = (content, className) => {
        const row = document.createElement("div");
        row.className = `student-ai-message-row ${className}`;
        if (className === "assistant") {
            const avatar = document.createElement("span");
            avatar.className = "student-ai-message-avatar";
            avatar.setAttribute("aria-hidden", "true");
            const botMark = document.querySelector(".student-ai-icon .student-ai-bot-mark");
            if (botMark) avatar.appendChild(botMark.cloneNode(true));
            row.appendChild(avatar);
        }

        const contentGroup = document.createElement("div");
        contentGroup.className = "student-ai-message-content";
        const bubble = document.createElement("div");
        bubble.className = `student-ai-message ${className}`;
        bubble.textContent = String(content || "").replace(/\*\*(.+?)\*\*/g, "$1");
        const timestamp = document.createElement("time");
        timestamp.className = "student-ai-message-time";
        timestamp.dateTime = new Date().toISOString();
        timestamp.textContent = new Date().toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
        });
        contentGroup.append(bubble, timestamp);
        row.appendChild(contentGroup);
        messages.appendChild(row);
        messages.scrollTop = messages.scrollHeight;
        return row;
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

    const welcomeMessage = "Chào bạn! Bạn đang học ngành gì và thích mảng nào? Mình sẽ gợi ý một số hướng đề tài phù hợp, đồng thời tham khảo kho đề tài đang mở.";
    const updateSendButton = () => {
        sendButton.disabled = !input.value.trim();
    };
    appendMessage(welcomeMessage, "assistant");
    updateSendButton();
    input.addEventListener("input", updateSendButton);

    resetButton?.addEventListener("click", () => {
        history.length = 0;
        messages.replaceChildren();
        appendMessage(welcomeMessage, "assistant");
        input.value = "";
        updateSendButton();
        input.focus();
    });

    input.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        form.requestSubmit();
    });

    document.querySelectorAll("[data-ai-prompt]").forEach(button => {
        button.addEventListener("click", () => {
            input.value = button.dataset.aiPrompt || "";
            input.dispatchEvent(new Event("input", { bubbles: true }));
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
            updateSendButton();
            input.focus();
        }
    });
});
