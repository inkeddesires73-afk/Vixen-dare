// ==========================================
// 1. STATE & STORAGE
// ==========================================
let userProgress = {
    activeTasks: [],
    completedTasks: [],
    skippedTasks: [],
    lastSavedCount: 0 // NYTT: Håller koll på när vi senast gjorde backup
};

// Ladda data vid start
try {
    const saved = localStorage.getItem('vixen_progress');
    if (saved) {
        userProgress = JSON.parse(saved);
        // Bakåtkompatibilitet
        if (!userProgress.skippedTasks) userProgress.skippedTasks = [];
        if (typeof userProgress.lastSavedCount === 'undefined') userProgress.lastSavedCount = userProgress.completedTasks.length;
    }
} catch (e) {
    console.error("Kunde inte läsa från minnet:", e);
}

// Spara till enhetens minne (Lokalt)
function saveToDevice() {
    localStorage.setItem('vixen_progress', JSON.stringify(userProgress));
    renderLists();
    checkUnsavedProgress(); // NYTT: Kolla om vi behöver varna
}

// ==========================================
// 2. KÄRNLOGIK (MOTORN)
// ==========================================

function drawTasks(level) {
    if (typeof VIXEN_DATABASE === 'undefined') { alert("Systemfel: tasks.js saknas!"); return; }

    const available = VIXEN_DATABASE.filter(t => 
        t.level === level && 
        !userProgress.activeTasks.includes(t.id) && 
        !userProgress.completedTasks.includes(t.id) &&
        !userProgress.skippedTasks.includes(t.id)
    );

    if (available.length === 0) { alert("Nivå " + level + " är helt avklarad!"); return; }

    const randomAmount = Math.floor(Math.random() * 3) + 3;
    const count = Math.min(randomAmount, available.length);
    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    selected.forEach(task => { userProgress.activeTasks.push(task.id); });
    saveToDevice();
}

function completeTask(id) {
    userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
    userProgress.skippedTasks = userProgress.skippedTasks.filter(tid => tid !== id);
    if (!userProgress.completedTasks.includes(id)) {
        userProgress.completedTasks.push(id);
    }
    saveToDevice();
}

function skipTask(id) {
    userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
    if (!userProgress.skippedTasks.includes(id)) {
        userProgress.skippedTasks.push(id);
    }
    saveToDevice();
}

function reactivateTask(id) {
    userProgress.skippedTasks = userProgress.skippedTasks.filter(tid => tid !== id);
    if (!userProgress.activeTasks.includes(id)) {
        userProgress.activeTasks.push(id);
    }
    saveToDevice();
}

// ==========================================
// 3. THE VAULT & SÄKERHET (Uppdaterad)
// ==========================================

function exportProgress() {
    // NYTT: Innan vi skapar nyckeln, uppdatera räknaren för "senast sparad"
    userProgress.lastSavedCount = userProgress.completedTasks.length;
    saveToDevice(); // Spara detta nya tillstånd lokalt direkt

    const dataString = JSON.stringify(userProgress);
    const vixenKey = btoa(unescape(encodeURIComponent(dataString)));
    const area = document.getElementById('backup-key-area');
    if (area) {
        area.value = vixenKey;
        area.style.display = 'block';
        area.select();
        // NYTT: Ge feedback på att räknaren nollställts
        alert("Ny Vixen Key genererad. Dina nuvarande framsteg är säkrade i denna nyckel.");
        checkUnsavedProgress(); // Uppdatera varningen (den borde försvinna nu)
    }
}

function importProgress() {
    const key = document.getElementById('import-key-input').value.trim();
    if (!key) return;
    if(!confirm("VARNING: Detta skriver över dina nuvarande framsteg med datan från nyckeln. Vill du fortsätta?")) return;

    try {
        const decoded = decodeURIComponent(escape(atob(key)));
        const data = JSON.parse(decoded);
        if (data.completedTasks) {
            userProgress = data;
            // Säkra upp om man importerar en gammal nyckel
            if (typeof userProgress.lastSavedCount === 'undefined') {
                 userProgress.lastSavedCount = userProgress.completedTasks.length;
            }
            saveToDevice();
            location.reload();
        }
    } catch (e) {
        alert("Nyckeln är ogiltig.");
    }
}
// ==========================================
// PANIK-KNAPPEN (Nödbromsen)
// ==========================================
function panicReset() {
    // En skarp varning så man inte råkar klicka fel
    if(confirm("⚠️ VARNING ⚠️\n\nDetta raderar ALLA dina framsteg permanent från denna enhet.\n\nÄr du absolut säker?")) {
        localStorage.clear(); // Tömmer webbläsarens minne helt
        location.reload();    // Laddar om sidan så den startar om från noll
    }
}

// ==========================================
// 4. RENDERING & UI-HJÄLP
// ==========================================

// NY FUNKTION: Kollar differensen och varnar
function checkUnsavedProgress() {
    const unsavedCount = userProgress.completedTasks.length - userProgress.lastSavedCount;
    const vaultBtn = document.getElementById('export-btn'); // Vi behöver ett ID på knappen i HTML
    const vaultInfo = document.getElementById('vault-info-text');

    if (unsavedCount >= 3) { // VARNA OM MER ÄN 3 UPPDRAG ÄR OSPARADE
        if (vaultBtn) vaultBtn.classList.add('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = `⚠️ Du har <strong>${unsavedCount}</strong> osparade framsteg! Generera en ny nyckel nu.`;
        if (vaultInfo) vaultInfo.style.color = 'var(--accent-n4)'; // Röd färg
    } else {
        if (vaultBtn) vaultBtn.classList.remove('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = "Säkra din resa med en <strong>Vixen Key</strong>.";
        if (vaultInfo) vaultInfo.style.color = '#999'; // Standardfärg
    }
}


function renderLists() {
    // ... (Samma renderingskod som förut) ...
    const activeEl = document.getElementById('active-list');
    const skippedEl = document.getElementById('skipped-list');
    const historyEl = document.getElementById('history-list');
    const statsEl = document.getElementById('stats');

    if (activeEl) {
        activeEl.innerHTML = '';
        userProgress.activeTasks.forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                activeEl.innerHTML += `
                <div class="task-card n${t.level}">
                    <p>${t.text}</p>
                    <div class="card-btns">
                        <button class="done-btn" onclick="completeTask('${t.id}')">SLUTFÖRT</button>
                        <button class="skip-btn" onclick="skipTask('${t.id}')">SKIPPA</button>
                    </div>
                </div>`;
            }
        });
    }

    if (skippedEl) {
        skippedEl.innerHTML = '';
        userProgress.skippedTasks.forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                skippedEl.innerHTML += `
                <div class="task-card skipped">
                    <p><em>N${t.level}:</em> ${t.text}</p>
                    <button class="retry-btn" onclick="reactivateTask('${t.id}')">TA TILLBAKA</button>
                </div>`;
            }
        });
    }

    if (historyEl) {
        historyEl.innerHTML = '';
        if (userProgress.completedTasks.length === 0) {
            historyEl.innerHTML = '<li style="opacity:0.5;">Ingen historik än...</li>';
        } else {
            userProgress.completedTasks.slice().reverse().forEach(id => {
                const t = VIXEN_DATABASE.find(x => x.id === id);
                if(t) historyEl.innerHTML += `<li><span class="history-lvl">N${t.level}</span> ${t.text}</li>`;
            });
        }
    }

    if (statsEl) {
        statsEl.innerText = `Klarade: ${userProgress.completedTasks.length} | Vilande: ${userProgress.skippedTasks.length}`;
    }
}

// ONBOARDING (Samma som förut)
function closeWelcomeModal() {
    localStorage.setItem('vixen_visited_before', 'true');
    document.getElementById('welcome-modal').style.display = 'none';
}
function checkFirstTimeVisitor() {
    const hasVisited = localStorage.getItem('vixen_visited_before');
    const modal = document.getElementById('welcome-modal');
    if (!hasVisited && modal) { modal.style.display = 'flex'; } 
    else if (modal) { modal.style.display = 'none'; }
}

window.onload = function() {
    renderLists();
    checkUnsavedProgress(); // Kör kollen vid start
    checkFirstTimeVisitor();
};