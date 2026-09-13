/* Vixen Dare cloud backup. Kept separate from the game engine on purpose. */
(function () {
    'use strict';

    const CONFIG = window.VIXEN_CLOUD_CONFIG || {};
    const STATE_PREFIX = 'vixen_cloud_state_v1_';
    const PENDING_EMAIL_KEY = 'vixen_cloud_pending_email_v1';
    const cloud = {
        client: null,
        user: null,
        hooks: null,
        syncing: false,
        applyingRemote: false,
        configured: false
    };

    const $ = id => document.getElementById(id);
    const clone = value => JSON.parse(JSON.stringify(value));
    const stateKey = userId => `${STATE_PREFIX}${userId}`;
    const meaningful = progress => Boolean(progress && (
        progress.activeTasks?.length || progress.completedTasks?.length || progress.skippedTasks?.length ||
        Object.keys(progress.completedTaskDetails || {}).length
    ));

    function setStatus(message, tone) {
        const status = $('cloud-backup-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.tone = tone || 'quiet';
    }

    function setSignedInUi(signedIn) {
        const auth = $('cloud-auth-form');
        const account = $('cloud-account-actions');
        const activate = $('cloud-activate-btn');
        if (auth) auth.hidden = signedIn;
        if (account) account.hidden = !signedIn;
        const deleted = Boolean(cloud.user && readState(cloud.user.id).deletedAt);
        if (activate) {
            activate.hidden = signedIn && !deleted;
            activate.textContent = deleted ? 'BÖRJA OM MOLNBACKUP' : 'Aktivera molnbackup';
        }
    }

    function openAuth() {
        if (cloud.user && currentState().deletedAt) {
            void resumeAfterDeletion();
            return;
        }
        const form = $('cloud-auth-form');
        if (form) form.hidden = false;
        $('cloud-email')?.focus();
    }

    function readState(userId) {
        try { return JSON.parse(localStorage.getItem(stateKey(userId))) || {}; } catch (_) { return {}; }
    }

    function writeState(userId, value) {
        localStorage.setItem(stateKey(userId), JSON.stringify(value));
    }

    function clearState(userId) {
        localStorage.removeItem(stateKey(userId));
    }

    function uuid() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
        else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function currentState() {
        return cloud.user ? readState(cloud.user.id) : {};
    }

    function storeCurrent(next) {
        if (cloud.user) writeState(cloud.user.id, next);
    }

    function showConflict(remote) {
        const panel = $('cloud-conflict-actions');
        if (panel) panel.hidden = false;
        const next = currentState();
        next.conflictRemote = remote;
        storeCurrent(next);
        setStatus('Molnversionen har ändrats på en annan enhet. Båda versionerna är bevarade tills du väljer.', 'warning');
    }

    async function fetchRemote(userId) {
        const [{ data: progress, error: progressError }, { data: tombstone, error: tombstoneError }] = await Promise.all([
            cloud.client.from('vixen_progress').select('revision,payload,last_mutation_id,updated_at').eq('user_id', userId).maybeSingle(),
            cloud.client.from('vixen_progress_tombstones').select('deleted_at').eq('user_id', userId).maybeSingle()
        ]);
        if (progressError) throw progressError;
        if (tombstoneError) throw tombstoneError;
        return { progress, tombstone };
    }

    async function applyRemote(remote) {
        cloud.applyingRemote = true;
        try {
            await cloud.hooks.applyProgress(cloud.hooks.normalizeProgress(remote.payload));
            const next = currentState();
            next.revision = remote.revision;
            next.pending = null;
            next.conflictRemote = null;
            storeCurrent(next);
            const conflict = $('cloud-conflict-actions');
            if (conflict) conflict.hidden = true;
            setStatus('Molnbackupen är återställd på den här enheten.', 'success');
        } finally {
            cloud.applyingRemote = false;
        }
    }

    async function establishSession() {
        const { data: { user }, error } = await cloud.client.auth.getUser();
        if (error || !user) {
            cloud.user = null;
            setSignedInUi(false);
            setStatus('Logga in igen för att fortsätta molnbackupen.', 'warning');
            return;
        }
        cloud.user = user;
        setSignedInUi(true);
        const state = readState(user.id);
        const { progress: remote, tombstone } = await fetchRemote(user.id);

        if (tombstone && !remote) {
            state.deletedAt = tombstone.deleted_at;
            state.pending = null;
            writeState(user.id, state);
            setStatus('Molnbackupen är raderad. Du kan börja om med denna enhets data när du vill.', 'quiet');
            return;
        }

        if (!remote) {
            state.deletedAt = null;
            writeState(user.id, state);
            if (meaningful(cloud.hooks.getProgress())) {
                queueProgress(cloud.hooks.getProgress());
            } else {
                setStatus('Molnbackup är aktiv. Dina nästa ändringar sparas automatiskt.', 'success');
            }
            return;
        }

        if (!meaningful(cloud.hooks.getProgress())) {
            await applyRemote(remote);
            return;
        }

        if (state.revision === remote.revision && !state.pending) {
            setStatus('Sparat i molnet.', 'success');
            return;
        }
        showConflict(remote);
    }

    async function acknowledgeOrConflict(pending, remote) {
        if (remote?.last_mutation_id === pending.mutationId) {
            const state = currentState();
            state.revision = remote.revision;
            state.pending = null;
            storeCurrent(state);
            setStatus('Sparat i molnet.', 'success');
            return true;
        }
        showConflict(remote);
        return false;
    }

    async function flush() {
        if (!cloud.configured || !cloud.user || cloud.syncing || !navigator.onLine) return;
        const state = currentState();
        const pending = state.pending;
        if (!pending || pending.accountId !== cloud.user.id || state.deletedAt) return;

        cloud.syncing = true;
        setStatus('Sparar…', 'quiet');
        try {
            const remoteState = await fetchRemote(cloud.user.id);
            if (remoteState.tombstone && !remoteState.progress) {
                state.deletedAt = remoteState.tombstone.deleted_at;
                state.pending = null;
                storeCurrent(state);
                setStatus('Molnbackupen har raderats. Den gamla enheten skickar inte upp data igen.', 'warning');
                return;
            }

            const remote = remoteState.progress;
            if (!remote) {
                const { data, error } = await cloud.client.from('vixen_progress').insert({
                    user_id: cloud.user.id,
                    revision: 1,
                    payload: pending.snapshot,
                    last_mutation_id: pending.mutationId
                }).select('revision,last_mutation_id').single();
                if (error) {
                    const latest = await fetchRemote(cloud.user.id);
                    await acknowledgeOrConflict(pending, latest.progress);
                    return;
                }
                state.revision = data.revision;
                state.pending = null;
                storeCurrent(state);
                setStatus('Sparat i molnet.', 'success');
                return;
            }

            if (remote.revision !== pending.expectedRevision) {
                await acknowledgeOrConflict(pending, remote);
                return;
            }

            const { data, error } = await cloud.client.from('vixen_progress')
                .update({
                    revision: pending.expectedRevision + 1,
                    payload: pending.snapshot,
                    last_mutation_id: pending.mutationId,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', cloud.user.id)
                .eq('revision', pending.expectedRevision)
                .select('revision,last_mutation_id');
            if (error || !data?.length) {
                const latest = await fetchRemote(cloud.user.id);
                await acknowledgeOrConflict(pending, latest.progress);
                return;
            }
            state.revision = data[0].revision;
            state.pending = null;
            storeCurrent(state);
            setStatus('Sparat i molnet.', 'success');
        } catch (_) {
            setStatus('Sparat på enheten – väntar på internet.', 'warning');
        } finally {
            cloud.syncing = false;
        }
    }

    function queueProgress(progress) {
        if (!cloud.configured || !cloud.user || cloud.applyingRemote) return;
        const state = currentState();
        if (state.deletedAt) return;
        state.pending = {
            accountId: cloud.user.id,
            expectedRevision: Number.isInteger(state.revision) ? state.revision : 0,
            mutationId: state.pending?.mutationId || uuid(),
            snapshot: clone(progress)
        };
        storeCurrent(state);
        if (!navigator.onLine) {
            setStatus('Sparat på enheten – väntar på internet.', 'warning');
            return;
        }
        window.setTimeout(flush, 250);
    }

    async function sendCode() {
        const email = $('cloud-email')?.value.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setStatus('Skriv en giltig e-postadress.', 'warning');
            return;
        }
        setStatus('Skickar inloggningslänk…', 'quiet');
        const { error } = await cloud.client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
        if (error) {
            setStatus('Inloggningslänken kunde inte skickas just nu. Försök igen om en liten stund.', 'warning');
            return;
        }
        sessionStorage.setItem(PENDING_EMAIL_KEY, email);
        $('cloud-code-row').hidden = false;
        setStatus('Länken är skickad. Öppna den i mejlet för att aktivera backupen.', 'success');
    }

    async function useThisDevice() {
        const state = currentState();
        const remote = state.conflictRemote;
        if (!remote) return;
        state.revision = remote.revision;
        state.pending = {
            accountId: cloud.user.id,
            expectedRevision: remote.revision,
            mutationId: uuid(),
            snapshot: clone(cloud.hooks.getProgress())
        };
        state.conflictRemote = null;
        storeCurrent(state);
        $('cloud-conflict-actions').hidden = true;
        await flush();
    }

    async function useCloudVersion() {
        const remote = currentState().conflictRemote;
        if (remote) await applyRemote(remote);
    }

    async function listVersions() {
        if (!cloud.user) return;
        const { data, error } = await cloud.client.from('vixen_progress_versions')
            .select('revision,payload,created_at').eq('user_id', cloud.user.id).order('revision', { ascending: false }).limit(5);
        if (error) {
            setStatus('Kunde inte hämta tidigare molnversioner just nu.', 'warning');
            return;
        }
        const target = $('cloud-version-list');
        target.innerHTML = '';
        data.forEach(version => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vault-btn secondary-vault-btn cloud-version-btn';
            button.textContent = `ÅTERSTÄLL VERSION FRÅN ${new Date(version.created_at).toLocaleString('sv-SE')}`;
            button.onclick = () => restoreVersion(version);
            target.appendChild(button);
        });
        target.hidden = !data.length;
    }

    async function restoreVersion(version) {
        if (!confirm('Återställa denna tidigare molnversion på enheten? Den nuvarande molnversionen blir kvar i historiken.')) return;
        await applyRemote(version);
        queueProgress(cloud.hooks.getProgress());
    }

    async function deleteCloudBackup() {
        if (!cloud.user || !confirm('Radera molnbackupen och dess tidigare versioner? Lokala framsteg på denna enhet påverkas inte.')) return;
        setStatus('Raderar molnbackupen…', 'quiet');
        const userId = cloud.user.id;
        const { error: markerError } = await cloud.client.from('vixen_progress_tombstones').upsert({ user_id: userId, deleted_at: new Date().toISOString() });
        if (markerError) { setStatus('Kunde inte radera molnbackupen just nu.', 'warning'); return; }
        const [{ error: progressError }, { error: versionsError }] = await Promise.all([
            cloud.client.from('vixen_progress').delete().eq('user_id', userId),
            cloud.client.from('vixen_progress_versions').delete().eq('user_id', userId)
        ]);
        if (progressError || versionsError) { setStatus('Molnbackupen kunde inte raderas helt. Försök igen.', 'warning'); return; }
        const state = currentState();
        state.deletedAt = new Date().toISOString();
        state.pending = null;
        state.conflictRemote = null;
        storeCurrent(state);
        $('cloud-version-list').hidden = true;
        setStatus('Molnbackupen är raderad. Dina lokala framsteg finns kvar.', 'success');
    }

    async function resumeAfterDeletion() {
        if (!cloud.user || !confirm('Börja om med molnbackup från denna enhets lokala framsteg?')) return;
        const { error } = await cloud.client.from('vixen_progress_tombstones').delete().eq('user_id', cloud.user.id);
        if (error) { setStatus('Kunde inte starta molnbackup igen just nu.', 'warning'); return; }
        const state = currentState();
        state.deletedAt = null;
        state.revision = 0;
        storeCurrent(state);
        queueProgress(cloud.hooks.getProgress());
    }

    async function signOut() {
        if (!cloud.client) return;
        const oldUser = cloud.user;
        cloud.user = null;
        if (oldUser) {
            const state = readState(oldUser.id);
            state.pending = null;
            writeState(oldUser.id, state);
        }
        await cloud.client.auth.signOut();
        setSignedInUi(false);
        setStatus('Molnbackup är avstängd på den här enheten. Lokala framsteg finns kvar.', 'quiet');
    }

    function initialize(hooks) {
        cloud.hooks = hooks;
        cloud.configured = Boolean(CONFIG.url && CONFIG.publishableKey);
        if (!cloud.configured) {
            $('cloud-activate-btn').onclick = () => setStatus('Molnbackupen kopplas in när Supabase-projektet har lagts till. Lokala framsteg fungerar redan som vanligt.', 'quiet');
            setStatus('Molnbackup är inte kopplad i denna version ännu.', 'quiet');
            return;
        }
        if (!window.supabase?.createClient) {
            setStatus('Molnbackupens anslutning kunde inte laddas. Lokala framsteg fungerar fortfarande.', 'warning');
            return;
        }
        cloud.client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        $('cloud-send-code').onclick = () => { void sendCode(); };
        $('cloud-signout-btn').onclick = () => { void signOut(); };
        $('cloud-delete-btn').onclick = () => { void deleteCloudBackup(); };
        $('cloud-versions-btn').onclick = () => { void listVersions(); };
        $('cloud-use-device-btn').onclick = () => { void useThisDevice(); };
        $('cloud-use-cloud-btn').onclick = () => { void useCloudVersion(); };
        $('cloud-resume-btn').onclick = () => { void resumeAfterDeletion(); };
        window.addEventListener('online', () => { void flush(); });
        cloud.client.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') { cloud.user = null; setSignedInUi(false); }
        });
        void establishSession().catch(() => setStatus('Molnbackupen kan inte nås just nu. Lokala framsteg fungerar fortfarande.', 'warning'));
    }

    window.VixenCloud = { initialize, queueProgress, openAuth };
})();
