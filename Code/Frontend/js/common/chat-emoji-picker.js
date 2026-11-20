(() => {
    const emojis = [
        "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🙂",
        "😉", "😊", "😍", "🥰", "😘", "😎", "🤔", "🙄",
        "😴", "😢", "😭", "😡", "👍", "👎", "👏", "🙌",
        "🙏", "💪", "❤️", "💙", "💚", "💛", "🎉", "🔥",
        "✨", "💯", "✅", "❌", "💡", "📚", "💻", "📝",
        "🚀", "☕", "🌟", "🤝", "💬", "🎓", "🙋", "😇"
    ];

    document.querySelectorAll("[data-chat-emoji]").forEach(toggle => {
        const picker = document.getElementById(toggle.dataset.chatEmoji);
        const input = document.getElementById(toggle.dataset.chatEmojiInput);
        if (!picker || !input) return;

        emojis.forEach(emoji => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "chat-emoji-option";
            option.textContent = emoji;
            option.setAttribute("aria-label", emoji);
            option.addEventListener("click", () => {
                const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
                const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
                input.setRangeText(emoji, start, end, "end");
                input.focus();
                picker.hidden = true;
                toggle.setAttribute("aria-expanded", "false");
            });
            picker.appendChild(option);
        });

        toggle.addEventListener("click", event => {
            event.stopPropagation();
            const willOpen = picker.hidden;
            document.querySelectorAll(".chat-emoji-picker").forEach(otherPicker => {
                otherPicker.hidden = true;
            });
            document.querySelectorAll("[data-chat-emoji]").forEach(otherToggle => {
                otherToggle.setAttribute("aria-expanded", "false");
            });
            picker.hidden = !willOpen;
            toggle.setAttribute("aria-expanded", String(willOpen));
        });

        picker.addEventListener("click", event => event.stopPropagation());
    });

    document.addEventListener("click", () => {
        document.querySelectorAll(".chat-emoji-picker").forEach(picker => {
            picker.hidden = true;
        });
        document.querySelectorAll("[data-chat-emoji]").forEach(toggle => {
            toggle.setAttribute("aria-expanded", "false");
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".chat-emoji-picker").forEach(picker => {
            picker.hidden = true;
        });
        document.querySelectorAll("[data-chat-emoji]").forEach(toggle => {
            toggle.setAttribute("aria-expanded", "false");
        });
    });
})();
