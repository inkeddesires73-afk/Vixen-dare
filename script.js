// ==========================================
// 1. STATE & STORAGE
// ==========================================
let userProgress = {
    activeTasks: [],
    completedTasks: [],
    skippedTasks: [],
    completedTaskDetails: {},
    environment: 'bar_pub',
    lastSavedCount: 0 
};

const ENVIRONMENTS = {
    city: {
        label: 'På stan',
        description: 'Ni rör er mellan vuxna sociala platser i stan. Nya uppdrag väljs för möten som kan uppstå längs kvällen.'
    },
    bar_pub: {
        label: 'Bar eller pub',
        description: 'Ni är på en bar eller pub där samtal med nya vuxna människor får växa naturligt under kvällen.'
    },
    club: {
        label: 'Uteställe eller klubb',
        description: 'Ni är i en klubbmiljö med musik, rörelse och plats för spontana samtal med vuxna människor.'
    },
    private_party: {
        label: 'Privat fest',
        description: 'Ni är på en privat vuxenfest där stämningen och sällskapet redan känns bekant och tryggt.'
    },
    swingers_club: {
        label: 'Swingersklubb',
        description: 'Ni är på en vuxenklubb med tydliga husregler och utrymme att ta saker i er egen takt.'
    }
};

try {
    const saved = localStorage.getItem('vixen_progress');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
            userProgress = {
                activeTasks: Array.isArray(parsed.activeTasks) ? parsed.activeTasks : [],
                completedTasks: Array.isArray(parsed.completedTasks) ? parsed.completedTasks : [],
                skippedTasks: Array.isArray(parsed.skippedTasks) ? parsed.skippedTasks : [],
                completedTaskDetails: parsed.completedTaskDetails && typeof parsed.completedTaskDetails === 'object' ? parsed.completedTaskDetails : {},
                environment: typeof parsed.environment === 'string' ? parsed.environment : 'bar_pub',
                lastSavedCount: typeof parsed.lastSavedCount === 'number' ? parsed.lastSavedCount : 0
            };
            if (typeof parsed.lastSavedCount === 'undefined') {
                userProgress.lastSavedCount = userProgress.completedTasks.length;
            }
        }
    }
} catch (e) {
    console.error("Kunde inte läsa från minnet:", e);
}

function normalizeProgress(progress) {
    const validIds = new Set(VIXEN_DATABASE.map(task => task.id));
    const uniqueValidIds = ids => [...new Set(ids.filter(id => typeof id === 'string' && validIds.has(id)))];
    const completedTasks = uniqueValidIds(progress.completedTasks || []);
    const skippedTasks = uniqueValidIds((progress.skippedTasks || []).filter(id => !completedTasks.includes(id)));
    const activeTasks = uniqueValidIds((progress.activeTasks || []).filter(id =>
        !completedTasks.includes(id) && !skippedTasks.includes(id)
    ));
    const rawDetails = progress.completedTaskDetails && typeof progress.completedTaskDetails === 'object'
        ? progress.completedTaskDetails
        : {};
    const completedTaskDetails = {};

    completedTasks.forEach(id => {
        const detail = rawDetails[id] && typeof rawDetails[id] === 'object' ? rawDetails[id] : {};
        completedTaskDetails[id] = {
            completedAt: typeof detail.completedAt === 'string' ? detail.completedAt : '',
            reflection: typeof detail.reflection === 'string' ? detail.reflection.slice(0, 2000) : ''
        };
    });

    return {
        activeTasks,
        completedTasks,
        skippedTasks,
        completedTaskDetails,
        environment: ENVIRONMENTS[progress.environment] ? progress.environment : 'bar_pub',
        lastSavedCount: Math.max(0, Math.min(
            typeof progress.lastSavedCount === 'number' ? progress.lastSavedCount : completedTasks.length,
            completedTasks.length
        ))
    };
}

function saveToDevice() {
    try {
        localStorage.setItem('vixen_progress', JSON.stringify(userProgress));
    } catch (e) {
        console.error("Kunde inte spara på enheten:", e);
        alert("Kunde inte spara dina framsteg på den här enheten.");
    }
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
        !userProgress.skippedTasks.includes(t.id) &&
        isTaskCompatibleWithEnvironment(t, userProgress.environment)
    );

    if (available.length === 0) { 
        alert("Det finns inga fler passande uppdrag på nivå " + level + " i den valda miljön.");
        return; 
    }

    const randomAmount = Math.floor(Math.random() * 3) + 3;
    const count = Math.min(randomAmount, available.length);
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, count);

    selected.forEach(task => { 
        userProgress.activeTasks.push(task.id); 
    });
    
    saveToDevice();
}

function getTaskEnvironments(task) {
    if (Array.isArray(task.environments) && task.environments.length) return task.environments;

    const text = task.text.toLowerCase();
    if (text.includes('swingersklubb')) return ['swingers_club'];
    if (text.includes('privat fest') || text.includes('hemma') || text.includes('bjud hem')) return ['private_party'];
    if (text.includes('klubb')) return ['club', 'swingers_club'];
    if (text.includes('bar') || text.includes('pub') || text.includes('uteställe')) return ['bar_pub', 'club'];
    if (text.includes('på stan') || text.includes('gatan') || text.includes('butik')) return ['city'];
    return Object.keys(ENVIRONMENTS);
}

function isTaskCompatibleWithEnvironment(task, environment) {
    return getTaskEnvironments(task).includes(environment);
}

function setEnvironment(environment) {
    if (!ENVIRONMENTS[environment]) return;
    userProgress.environment = environment;
    saveToDevice();
}

function completeTask(id) {
    userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
    userProgress.skippedTasks = userProgress.skippedTasks.filter(tid => tid !== id);
    if (!userProgress.completedTasks.includes(id)) {
        userProgress.completedTasks.push(id);
    }
    userProgress.completedTaskDetails[id] = userProgress.completedTaskDetails[id] || {
        completedAt: new Date().toISOString(),
        reflection: ''
    };
    saveToDevice();
}

function saveReflection(id, reflection) {
    if (!userProgress.completedTasks.includes(id)) return;
    const previous = userProgress.completedTaskDetails[id] || {};
    userProgress.completedTaskDetails[id] = {
        completedAt: previous.completedAt || new Date().toISOString(),
        reflection: String(reflection).slice(0, 2000)
    };
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

// FIX: Varningsrutan är nu helt borttagen. Uppdraget stängs direkt vid klick på krysset.
function cancelActiveTask(id) {
    userProgress.activeTasks = userProgress.activeTasks.filter(tid => tid !== id);
    saveToDevice();
}

// ==========================================
// 3. THE VAULT & SÄKERHET
// ==========================================

function buildVixenKey() {
    userProgress.lastSavedCount = userProgress.completedTasks.length;
    saveToDevice();

    const dataString = JSON.stringify(userProgress);
    return btoa(unescape(encodeURIComponent(dataString)));
}

function showVixenKey(vixenKey) {
    const area = document.getElementById('backup-key-area');
    const copyBtn = document.getElementById('copy-backup-btn');

    if (area) {
        area.value = vixenKey;
        area.style.display = 'block';
        area.select();
    }

    if (copyBtn) {
        copyBtn.style.display = 'block';
    }
}

function exportProgress() {
    const vixenKey = buildVixenKey();
    showVixenKey(vixenKey);
    alert("Ny Vixen Key genererad. Spara eller kopiera denna kod!");
    checkUnsavedProgress();
}

function copyBackupKey() {
    const area = document.getElementById('backup-key-area');
    if (!area) return;

    if (!area.value.trim()) {
        const vixenKey = buildVixenKey();
        showVixenKey(vixenKey);
    }

    area.focus();
    area.select();

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(area.value)
            .then(() => alert("Vixen Key kopierad."))
            .catch(() => {
                document.execCommand('copy');
                alert("Vixen Key kopierad.");
            });
    } else {
        document.execCommand('copy');
        alert("Vixen Key kopierad.");
    }
}

function importProgress() {
    const key = document.getElementById('import-key-input').value.trim();
    if (!key) return;
    if(!confirm("Detta skriver över nuvarande data. Fortsätt?")) return;

    try {
        const decoded = decodeURIComponent(escape(atob(key)));
        const data = JSON.parse(decoded);

        const hasValidShape = data &&
            Array.isArray(data.activeTasks) &&
            Array.isArray(data.completedTasks) &&
            Array.isArray(data.skippedTasks);

        if (!hasValidShape) {
            alert("Nyckeln innehåller ingen giltig Vixen Dare-backup.");
            return;
        }

        userProgress = normalizeProgress(data);

        saveToDevice();
        location.reload();
    } catch (e) {
        alert("Ogiltig nyckel.");
    }
}

function panicReset() {
    if(confirm("Radera ALLA framsteg permanent?")) {
        localStorage.removeItem('vixen_progress');
        localStorage.removeItem('vixen_visited_before');
        location.reload();
    }
}

// ==========================================
// 4. RENDERING
// ==========================================

function checkUnsavedProgress() {
    const unsavedCount = userProgress.completedTasks.length - userProgress.lastSavedCount;
    const vaultBtn = document.getElementById('export-btn'); 
    const vaultInfo = document.getElementById('vault-info-text');

    if (unsavedCount >= 3) { 
        if (vaultBtn) vaultBtn.classList.add('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = `⚠️ Du har <strong>${unsavedCount}</strong> osparade framsteg!`;
    } else {
        if (vaultBtn) vaultBtn.classList.remove('pulsing-warning');
        if (vaultInfo) vaultInfo.innerHTML = "Spara din backup med en <strong>Vixen Key</strong>.";
    }
}

function renderLists() {
    const activeEl = document.getElementById('active-list');
    const skippedEl = document.getElementById('skipped-list');
    const historyEl = document.getElementById('history-list');
    const statsEl = document.getElementById('stats');
    const journeySummaryEl = document.getElementById('journey-summary');
    const levelProgressEl = document.getElementById('level-progress');
    const environmentSelect = document.getElementById('environment-select');
    const environmentContextEl = document.getElementById('environment-context-text');

    if (environmentSelect) environmentSelect.value = userProgress.environment;
    if (environmentContextEl) environmentContextEl.textContent = ENVIRONMENTS[userProgress.environment].description;

    if (activeEl) {
        activeEl.innerHTML = '';
        userProgress.activeTasks.forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                activeEl.innerHTML += `
                <article class="task-card n${t.level}">
                    <div class="task-card-top">
                        <span class="task-level">Nivå ${t.level}</span>
                        <button type="button" class="close-card-x" onclick="cancelActiveTask('${t.id}')" title="Stäng uppdrag" aria-label="Stäng uppdrag">×</button>
                    </div>
                    <p>${t.text}</p>
                    <div class="card-btns">
                        <button type="button" class="done-btn" onclick="completeTask('${t.id}')">Slutfört</button>
                        <button type="button" class="skip-btn" onclick="skipTask('${t.id}')">Lägg åt sidan</button>
                    </div>
                </article>`;
            }
        });
    }

    if (skippedEl) {
        skippedEl.innerHTML = '';
        userProgress.skippedTasks.forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                skippedEl.innerHTML += `
                <article class="task-card skipped">
                    <div class="task-card-top"><span class="task-level">Nivå ${t.level} · Vilande</span></div>
                    <p>${t.text}</p>
                    <button type="button" class="retry-btn" onclick="reactivateTask('${t.id}')">Ta tillbaka</button>
                </article>`;
            }
        });
    }

    if (historyEl) {
        historyEl.innerHTML = '';
        userProgress.completedTasks.slice().reverse().forEach(id => {
            const t = VIXEN_DATABASE.find(x => x.id === id);
            if(t) {
                const detail = userProgress.completedTaskDetails[id] || {};
                const completedAt = detail.completedAt ? new Date(detail.completedAt) : null;
                const dateText = completedAt && !Number.isNaN(completedAt.getTime())
                    ? completedAt.toLocaleDateString('sv-SE')
                    : 'Tidigare slutfört';
                historyEl.innerHTML += `<li><span class=\"history-lvl\">N${t.level}</span><div class=\"history-copy\">${t.text}<span class=\"history-date\">${dateText}</span><details class=\"reflection\"><summary>Reflektion</summary><textarea maxlength=\"2000\" placeholder=\"Vad tar du med dig från detta?\" onchange=\"saveReflection('${t.id}', this.value)\">${escapeHtml(detail.reflection || '')}</textarea></details></div></li>`;
            }
        });
    }

    if (statsEl) {
        statsEl.innerText = `Klarade: ${userProgress.completedTasks.length} | Vilande: ${userProgress.skippedTasks.length}`;
    }

    if (journeySummaryEl) {
        const total = VIXEN_DATABASE.length;
        journeySummaryEl.textContent = `${userProgress.completedTasks.length} av ${total} uppdrag genomförda. Din historik stannar på den här enheten.`;
    }

    if (levelProgressEl) {
        levelProgressEl.innerHTML = '';
        for (let level = 1; level <= 5; level++) {
            const total = VIXEN_DATABASE.filter(task => task.level === level).length;
            const completed = userProgress.completedTasks.filter(id =>
                VIXEN_DATABASE.find(task => task.id === id)?.level === level
            ).length;
            const percent = total ? Math.round((completed / total) * 100) : 0;
            levelProgressEl.innerHTML += `<div class=\"level-progress-row n${level}\"><span>N${level}</span><div class=\"level-progress-track\"><div class=\"level-progress-fill\" style=\"width:${percent}%\"></div></div><span>${completed}/${total}</span></div>`;
        }
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>\"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));
}

function closeWelcomeModal() {
    localStorage.setItem('vixen_visited_before', 'true');
    const modal = document.getElementById('welcome-modal');
    if (modal) modal.style.display = 'none';
}

window.onload = function() {
    userProgress = normalizeProgress(userProgress);
    saveToDevice();
    renderLists();
    checkUnsavedProgress(); 
    if (!localStorage.getItem('vixen_visited_before')) {
        const modal = document.getElementById('welcome-modal');
        if (modal) modal.style.display = 'flex';
    }
};
