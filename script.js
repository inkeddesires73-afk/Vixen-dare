// ==========================================
// 1. STATE & STORAGE
// ==========================================
let userProgress = {
    activeTasks: [],
    completedTasks: [],
    skippedTasks: [],
    lastSavedCount: 0 // Håller koll på när vi senast gjorde backup
};

// Ladda data vid start
try {
    const saved = localStorage.getItem('vixen_progress');
    if (saved) {
        userProgress = JSON.parse(saved);
        // Bakåtkompatibilitet
        if (!userProgress.skippedTasks) userProgress.skippedTasks = [];
        if (typeof userProgress.lastSavedCount === 'undefined') {
            userProgress.lastSavedCount = userProgress.completedTasks.length;
        }
    }
} catch (e) {
    console.error("Kunde inte läsa från minnet:", e);
}

// Spara till enhetens minne (Lokalt)
function saveToDevice() {
    localStorage.setItem('vixen_progress', JSON.stringify(userProgress));
    renderLists();
    checkUnsavedProgress(); 
}

// ==========================================
// 2. KÄRNLOGIK (MOTORN)
// ==========================================

function drawTasks(level) {
    if (typeof VIXEN_DATABASE === 'undefined') { 
        alert("Systemfel: tasks.js saknas!"); 
        return; 
    }

    const available = VIXEN_DATABASE.filter(t => 
        t.level === level && 
        !userProgress.activeTasks.includes(t.id) && 
        !userProgress.completedTasks.includes(t.id) &&
        !userProgress.skippedTasks.includes(t.id)
    );

    if (available.length === 0) { 
        alert("Nivå " + level + " är helt avklarad!"); 
        return; 
    }

    // Drar 3 till 5 uppdrag (Pentagon-motorn)
    const randomAmount = Math.floor(Math.random() * 3) + 3;
    const count = Math.min(randomAmount, available.length);
    const shuffled = [...available].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    selected.forEach(task => { 
        userProgress.activeTasks.push(task.id); 
    });
    
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

// NYTT: Funktion för att stänga ett felöppnat uppdrag (Krysset)
function cancelActiveTask(id) {
    if(confirm("Vill du ta bort detta uppdrag utan att spara det i historiken?")) {
        userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
        saveToDevice();
    }
}

// ==========================================
// 3. THE VAULT & SÄKERHET
// ==========================================

function exportProgress() {
    userProgress.lastSavedCount = userProgress.completedTasks.length;
    saveToDevice(); 

    const dataString = JSON.stringify(userProgress);
    const vixenKey = btoa(unescape(encodeURIComponent(dataString)));
    const area = document.getElementById('backup-key-area');
    
    if (area) {
        area.value = vixenKey;
        area.style.display = 'block';
        area.select();
        alert("Ny Vixen Key genererad. Dina nuvarande framsteg är säkrade i denna nyckel.");
        checkUnsavedProgress(); 
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

// PANIK-KNAPPEN (Nödbromsen)
function panicReset() {
    if(confirm("⚠️ VARNING ⚠️\n\nDetta raderar ALLA dina framsteg permanent från denna enhet.\n\nÄr du absolut säker?")) {
        localStorage.clear();
        location.reload();
    }
}

// ==========================================
// 4. RENDERING & UI-HJÄLP
// ==========================================

function checkUnsavedProgress() {
    const unsavedCount = userProgress.completedTasks.length - userProgress.lastSavedCount;
    const vaultBtn = document.getElementById('export-btn'); 
    const vaultInfo = document.getElementById('vault-info-text');

    if (unsavedCount >= 3) { 
        if (vaultBtn) vaultBtn.classList.add('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = `⚠️ Du har <strong>${unsavedCount}</strong> osparade framsteg! Generera en ny nyckel nu.`;
        if (vaultInfo) vaultInfo.style.color = '#ff4444'; 
    } else {
        if (vaultBtn) vaultBtn.classList.remove('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = "Säkra din resa med en <strong>Vixen Key</strong>.";
        if (vaultInfo) vaultInfo.style.color = '#999';
    }
}

function renderLists() {
    const activeEl = document.getElementById('active-list');
    const skippedEl = document.getElementById('skipped-list');
    const historyEl = document.getElementById('history-list');
    const statsEl = document.getElementById('stats');

    // AKTIVA UPPDRAG (PENTAGON-VY)
    if (activeEl) {
        activeEl.innerHTML = '';
        userProgress.activeTasks.forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                activeEl.innerHTML += `
                <div class="task-card n${t.level}" style="position: relative;">
                    <span class="close-card-x" onclick="cancelActiveTask('${t.id}')" title="Stäng">×</span>
                    <p>${t.text}</p>
                    <div class="card-btns">
                        <button class="done-btn" onclick="completeTask('${t.id}')">SLUTFÖRT</button>
                        <button class="skip-btn" onclick="skipTask('${t.id}')">SKIPPA</button>
                    </div>
                </div>`;
            }
        });
    }

    // SKIPPADE UPPDRAG (VILANDE)
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

    // HISTORIK (KOMMER IHÅG ALLT)
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

    // STATISTIK I HEADERN
    if (statsEl) {
        statsEl.innerText = `Klarade: ${userProgress.completedTasks.length} | Vilande: ${userProgress.skippedTasks.length}`;
    }
}

// ONBOARDING & MODALS
function closeWelcomeModal() {
    localStorage.setItem('vixen_visited_before', 'true');
    const modal = document.getElementById('welcome-modal');
    if (modal) modal.style.display = 'none';
}

function checkFirstTimeVisitor() {
    const hasVisited = localStorage.getItem('vixen_visited_before');
    const modal = document.getElementById('welcome-modal');
    if (!hasVisited && modal) { 
        modal.style.display = 'flex'; 
    } else if (modal) { 
        modal.style.display = 'none'; 
    }
}

// STARTA SYSTEMET
window.onload = function() {
    renderLists();
    checkUnsavedProgress(); 
    checkFirstTimeVisitor();
};
