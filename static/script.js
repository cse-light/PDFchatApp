// --- DOM Elements ---
const chatbox = document.getElementById('chatbox');
const input = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const pdfInput = document.getElementById('pdfInput');
const fileLabel = document.getElementById('fileLabel');
const pdfInfo = document.getElementById('pdfInfo');
const inputForm = document.getElementById('inputForm');
const pdfPicker = document.getElementById('pdfPicker');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const welcomeCard = document.getElementById('welcomeCard');
const welcomePdfInput = document.getElementById('welcomePdfInput');
const toast = document.getElementById('toast');

let pdfNames = [];
let selectedPDF = '';
let recognizing = false;
let recognition;
let pdfSummaries = {};
let isBotSpeaking = false;

// --- Toast Notifications ---
function showToast(msg, type='') {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('active');
    if (type === 'success') toast.style.background = 'var(--success)';
    else if (type === 'danger') toast.style.background = 'var(--danger)';
    else toast.style.background = '';
    setTimeout(() => { toast.classList.remove('active'); }, 2600);
}

// --- Welcome Card: Drag-and-drop & Upload ---
function showWelcomeCard() {
    welcomeCard.style.display = '';
    setTimeout(() => welcomeCard.classList.add('active'), 5);
    document.querySelector('.main').classList.add('welcome-active');
}
function hideWelcomeCard() {
    welcomeCard.classList.remove('active');
    setTimeout(() => { welcomeCard.style.display = 'none'; }, 350);
    document.querySelector('.main').classList.remove('welcome-active');
}
function updateWelcome() {
    if (!pdfNames || pdfNames.length === 0) showWelcomeCard();
    else hideWelcomeCard();
}
if (welcomePdfInput) {
    welcomePdfInput.addEventListener('change', function() {
        if (this.files && this.files.length > 0) {
            uploadFiles(this.files);
            this.value = '';
        }
    });
}
['dragenter', 'dragover'].forEach(eventName => {
    if (welcomeCard) welcomeCard.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        welcomeCard.style.background = "#e5f2ff";
    });
});
['dragleave', 'drop'].forEach(eventName => {
    if (welcomeCard) welcomeCard.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        welcomeCard.style.background = "";
    });
});
if (welcomeCard) {
    welcomeCard.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadFiles(e.dataTransfer.files);
        }
    });
}

function uploadFiles(files) {
    const formData = new FormData();
    for (let f of files) formData.append("pdfs", f);
    addMessage("⏳ Uploading PDFs...", 'bot', true);
    fetch('/upload', {method: 'POST', body: formData})
        .then(res => res.json())
        .then(data => {
            pdfNames = data.pdf_names;
            pdfSummaries = data.summaries || {};
            updatePDFPicker();
            updateWelcome();
            fileLabel.textContent = "📎 Upload PDF(s)";
            showToast("PDF(s) uploaded!", 'success');
        })
        .catch(() => {
            addMessage("❗ Failed to upload PDFs. Try again.", 'bot', true);
            showToast("Failed to upload!", 'danger');
        });
}

// --- Voice-to-Text (Speech Recognition) ---
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onstart = function() {
        recognizing = true;
        micBtn.classList.add('active');
        micBtn.setAttribute('aria-pressed', 'true');
        micIcon.textContent = "🔴";
    };
    recognition.onresult = function(event) {
        let transcript = event.results[0][0].transcript;
        input.value = transcript;
        recognizing = false;
        micBtn.classList.remove('active');
        micBtn.setAttribute('aria-pressed', 'false');
        micIcon.textContent = "🎤";
        input.focus();
    };
    recognition.onerror = recognition.onend = function() {
        recognizing = false;
        micBtn.classList.remove('active');
        micBtn.setAttribute('aria-pressed', 'false');
        micIcon.textContent = "🎤";
    };
    micBtn.onclick = function(e) {
        e.preventDefault();
        if (recognizing) recognition.stop();
        else recognition.start();
    };
    micBtn.setAttribute('aria-label', "Voice input");
} else {
    micBtn.disabled = true;
    micBtn.title = "Speech recognition not supported";
    micBtn.style.opacity = 0.5;
    micIcon.textContent = "🚫";
}

// --- Text-to-Speech (Bot reply) ---
function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    isBotSpeaking = true;
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.06;
    utterance.onend = () => {
        isBotSpeaking = false;
        micIcon.classList.remove('speaking');
    };
    micIcon.classList.add('speaking');
    window.speechSynthesis.speak(utterance);
}

// --- Chat & Loader ---
function addMessage(text, sender, isSystem=false) {
    if(isSystem) {
        const bubble = document.createElement('div');
        bubble.classList.add('bubble', 'system');
        bubble.innerText = text;
        chatbox.appendChild(bubble);
    } else {
        const row = document.createElement('div');
        row.classList.add('msg-row', sender);
        const avatar = document.createElement('div');
        avatar.classList.add('avatar', sender);
        avatar.innerHTML = sender === 'user' ? "🧑" : "🤖";
        const bubble = document.createElement('div');
        bubble.classList.add('bubble', sender);

        // Markdown support for bot
        if (sender === 'bot' && typeof marked === "function") {
            bubble.innerHTML = marked.parse(text);
        } else {
            bubble.innerText = text;
        }

        if (sender === 'user') {
            row.appendChild(bubble);
            row.appendChild(avatar);
        } else {
            row.appendChild(avatar);
            row.appendChild(bubble);
        }
        chatbox.appendChild(row);

        // Fade in
        setTimeout(() => { bubble.style.opacity = 1; }, 10);

        // Speak bot's reply
        if(!isSystem && sender === 'bot') speakText(text);
    }
    chatbox.scrollTop = chatbox.scrollHeight;
}

function scrollToBottom() {
    chatbox.scrollTop = chatbox.scrollHeight;
}
function showLoader() {
    let loader = document.createElement('div');
    loader.className = 'bubble bot system';
    loader.id = 'chat-loader';
    loader.innerHTML = '<span class="loader"><span></span><span></span><span></span></span> Thinking...';
    chatbox.appendChild(loader);
    chatbox.scrollTop = chatbox.scrollHeight;
}
function removeLoader() {
    let loader = document.getElementById('chat-loader');
    if(loader) loader.remove();
}

// --- PDF Remove & Preview ---
function updatePdfPreviewBar() {
    const bar = document.getElementById('pdfPreviewBar');
    bar.innerHTML = '';
    pdfNames.forEach(name => {
        let box = document.createElement('div');
        box.className = 'pdf-preview-filename';
        box.innerHTML = `<span style="margin-right:5px;">📄</span> ${name}`;
        // Summary info (tooltip)
        if (pdfSummaries && pdfSummaries[name]) {
            box.title = `${pdfSummaries[name].pages} pages, ${pdfSummaries[name].size} KB`;
        }
        // Remove (X) button
        let removeBtn = document.createElement('span');
        removeBtn.textContent = "❌";
        removeBtn.title = "Remove PDF";
        removeBtn.setAttribute('aria-label', `Remove ${name}`);
        removeBtn.style.cursor = "pointer";
        removeBtn.onclick = async function (e) {
            e.stopPropagation();
            if (confirm(`Remove "${name}"?`)) {
                let res = await fetch('/remove_pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: name })
                });
                let data = await res.json();
                pdfNames = data.pdf_names;
                updatePDFPicker();
                updateWelcome();
                showToast(`Removed ${name}`, 'success');
            }
        };
        box.appendChild(removeBtn);
        // Highlight current
        if (selectedPDF === name || (selectedPDF === "__ALL__" && pdfNames.length > 1)) {
            box.classList.add('selected');
        }
        bar.appendChild(box);
    });
}
function updatePDFPicker() {
    pdfPicker.innerHTML = '';
    if (pdfNames.length > 1) {
        const allOpt = document.createElement('option');
        allOpt.value = '__ALL__';
        allOpt.innerText = 'All PDFs';
        pdfPicker.appendChild(allOpt);
    }
    pdfNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.innerText = name;
        pdfPicker.appendChild(opt);
    });
    if (pdfNames.length > 0) {
        selectedPDF = pdfNames.length > 1 ? '__ALL__' : pdfNames[0];
        pdfPicker.value = selectedPDF;
        pdfInfo.innerHTML = selectedPDF === '__ALL__'
            ? `<b>PDF:</b> All PDFs`
            : `<b>PDF:</b> ${selectedPDF}`;
        updatePdfPreviewBar();
        loadChatHistory(selectedPDF);
    } else {
        selectedPDF = '';
        pdfInfo.innerHTML = `No PDF uploaded.`;
        chatbox.innerHTML = '';
        updatePdfPreviewBar();
    }
    updateWelcome();
}
pdfPicker.onchange = function() {
    selectedPDF = this.value;
    pdfInfo.innerHTML = selectedPDF === '__ALL__'
        ? `<b>PDF:</b> All PDFs`
        : `<b>PDF:</b> ${selectedPDF}`;
    updatePdfPreviewBar();
    loadChatHistory(selectedPDF);
};
async function loadChatHistory(pdfName) {
    chatbox.innerHTML = '';
    let res = await fetch('/get_history?pdf_name=' + encodeURIComponent(pdfName));
    let data = await res.json();
    if (!data.history || data.history.length === 0) {
        addMessage("Start chatting about this PDF!", 'bot', true);
    } else {
        data.history.forEach(msg => {
            addMessage(msg.content, msg.role === "user" ? "user" : "bot");
        });
    }
}

// --- File Upload Bar Change Handler ---
pdfInput.addEventListener('change', function() {
    if(this.files && this.files.length > 0)
        fileLabel.textContent = "📎 " + this.files.length + " PDF(s) selected";
    else
        fileLabel.textContent = "📎 Upload PDF(s)";
});

// --- Form Submission: Chat or PDF Upload ---
inputForm.onsubmit = async function(e) {
    e.preventDefault();
    if(pdfInput.files && pdfInput.files.length > 0){
        uploadFiles(pdfInput.files);
        pdfInput.value = '';
        fileLabel.textContent = "📎 Upload PDF(s)";
        return;
    }
    if (!selectedPDF) {
        addMessage("📎 Please upload and select a PDF.", 'bot', true);
        return;
    }
    let msg = input.value.trim();
    if (!msg) return;
    addMessage(msg, 'user');
    input.value = '';
    showLoader();
    fetch('/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: msg, pdf_name: selectedPDF})
    })
    .then(res => res.json())
    .then(data => {
        removeLoader();
        addMessage(data.reply, 'bot');
    })
    .catch(() => {
        removeLoader();
        addMessage("❗ Server error. Please try again later.", 'bot', true);
        showToast("Server error!", 'danger');
    });
};
// Enter to send
input.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        sendBtn.click();
        e.preventDefault();
    }
});

// --- Dark Mode Toggle & Persistence ---
const darkPref = localStorage.getItem('dark');
if (darkPref === '1') document.body.classList.add('dark-mode');
document.getElementById('toggleDark').onclick = function() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('dark', document.body.classList.contains('dark-mode') ? '1' : '0');
};

// --- Remove All PDFs Button ---
document.getElementById('removeAllPdfs').onclick = async function() {
    if (confirm("Remove ALL PDFs?")) {
        let res = await fetch('/remove_all_pdfs', { method: 'POST' });
        let data = await res.json();
        pdfNames = data.pdf_names;
        updatePDFPicker();
        updateWelcome();
        showToast("Removed all PDFs.", 'success');
    }
};

// --- On Load: Restore Session PDFs if Any ---
async function fetchPDFs() {
    let res = await fetch('/get_pdfs');
    let data = await res.json();
    pdfNames = data.pdf_names || [];
    pdfSummaries = data.summaries || {};
    updatePDFPicker();
    updateWelcome();
}
window.onload = () => {
    fetchPDFs();
    input.focus();
};

// --- Sidebar Hamburger Toggle for Mobile (optional) ---
/*
const sidebar = document.querySelector('.sidebar');
const hamburger = document.getElementById('sidebarHamburger');
if (hamburger) {
    hamburger.onclick = () => {
        sidebar.classList.toggle('active');
    };
}
*/

// --- Accessibility: keyboard navigation etc. (optional for more polish) ---

