/*
 * Playlist Sorter
 * Enthält Funktionen zum Sortieren von YouTube-Playlists nach verschiedenen Kriterien.
 */

// Für die Kompatibilität zwischen Chrome und Firefox
const browserAPI    = globalThis.browser ?? globalThis.chrome;
const storage       = browserAPI.storage.local;


/* ---------------------------- Hilfsfunktionen ---------------------------- */
function eventHandshake(request) {
    return new Promise(resolve => {
        const handshake = event => {
            window.removeEventListener("event-handshake-response", handshake);
            resolve(event.detail);
        }
        window.addEventListener("event-handshake-response", handshake);
        window.dispatchEvent(new CustomEvent("event-handshake", { detail: request }));
    });
}


const playlist = {
    id:     null,
    name:   null,

    update() {
        // Playlist-ID
        this.id  = new URLSearchParams(location.search).get('list');
        // Playlist-Name
        const text  = document.querySelector("ytd-playlist-header-renderer #text") || document.querySelector("yt-dynamic-text-view-model");
        this.name   = text?.textContent.trim() || null;
    }
}
const playlistSort = {
    cache:      {},
    syncing:    false,

    async get(playlistId) {
        if (!playlistId) return null;
        // Prüfe, ob die Sortierung bereits im Cache vorhanden ist
        if (this.cache[playlistId] !== undefined) 
            return this.cache[playlistId];
        
        // Ermittle die Sortierung für die Playlist-ID
        const playlistSorts = (await storage.get("playlistSorts")).playlistSorts ?? {};
        const sortId        = playlistSorts[playlistId] ?? null;
        this.cache[playlistId] = sortId;
        
        // Logge die ermittelte Sortierung und gib sie zurück
        console.log("[Get PlaylistSort]", playlistId, " - ", sortId);
        return sortId;
    },
    async set(playlistId, optionId) {
        if (!playlistId) return;

        // Lade gespeicherte Playlist-Sortierungen aus dem lokalen Speicher
        const playlistSorts  = (await storage.get("playlistSorts")).playlistSorts ?? {};

        // Setze die neue Sortierung für die Playlist-ID
        playlistSorts[playlistId] = optionId;
        await storage.set({ playlistSorts });

        // Aktualisiere den Cache mit der neuen Sortierung
        this.cache[playlistId] = optionId;
        console.log("[Set PlaylistSort]", playlistId, " - ", optionId);
    },
    async remove(playlistId) {
        if (!playlistId) return;

        // Lade gespeicherte Playlist-Sortierungen aus dem lokalen Speicher
        const playlistSorts  = (await storage.get("playlistSorts")).playlistSorts ?? {};

        // Entferne die Sortierung für die Playlist-ID
        delete playlistSorts[playlistId];
        await storage.set({ playlistSorts });

        // Entferne die Sortierung aus dem Cache
        delete this.cache[playlistId];
        console.log("[Remove PlaylistSort]", playlistId);
    },
    async sync(playlistId) {
        // Verhindere gleichzeitige Synchronisierungen
        if (this.syncing) return;
        this.syncing = true;

        try {
            // Lade die gespeicherte Sortierung für die Playlist
            const playlistSort  = await this.get(playlistId);
            if (!playlistSort) { return }

            // Ermittle die aktuell angezeigte Sortieroption im UI
            const chip = document.querySelector('#header chip-view-model');
            const text = chip.textContent?.trim();

            // Finde die Sortieroption basierend auf der gespeicherten Sortierung
            const option = sortOptions.find(option => option.id === playlistSort);
            if (!option) { return }
            if (option.textContent === text) { return }

            // Synchronisiere die Sortieroption im UI mit der gespeicherten Sortierung
            console.log("[Sync PlaylistSort]", playlistId, " - ", playlistSort);
            setSortOption(option.textContent);
        } 
        finally { this.syncing = false }
    }
}

/* ---------------------------- Sortieroptionen ---------------------------- */
// Benutzerdefinierte Sortieroptionen
const sortOptions = [
    // "Keine Sortierung"
    {
        id: null,
        textContent: "Keine Sortierung",
        sortFunction: null,
        ascending: true
    },
    // "Videolänge (kürzeste zuerst)"
    {
        id: "playlist-sorter-duration-short",
        textContent: "Videolänge (kürzeste zuerst)",
        sortFunction: sortDuration,
        ascending: true
    },
    // "Videolänge (längste zuerst)"
    {
        id: "playlist-sorter-duration-long",
        textContent: "Videolänge (längste zuerst)",
        sortFunction: sortDuration,
        ascending: false
    }
];
// Erstelle eine neue Sortieroption
function newSortOption(option) {

    // Original-ListView Item für die manuelle Sortierung finden
    const listViewItem = [...document.querySelectorAll("yt-list-item-view-model")]
        .find( item => item.querySelector(".ytListItemViewModelTitle")?.textContent.trim() === "Manuell" );
    if (!listViewItem) { return }

    const sortOption    = listViewItem.cloneNode(true);
    sortOption.id       = option.id;
    
    // Textinhalt
    const sortText          = sortOption.querySelector(".ytListItemViewModelTitle");
    sortText.textContent    = option.textContent;

    // Klick-Event
    sortOption.addEventListener("click", () => {
        // setSortOption(option.textContent);
        sortPlaylistItems(option.id, option.sortFunction, option.ascending);
    });

    
    // Hover-Effekte für die Sortieroption hinzufügen
    const optionElement = sortOption.querySelector(":scope > div");
    sortOption.addEventListener("mouseenter", () => { optionElement?.classList.add("ytListItemViewModelHovered"); });
    sortOption.addEventListener("mouseleave", () => { optionElement?.classList.remove("ytListItemViewModelHovered"); });

    return sortOption;
}
// Füge eine neue Sortieroption zur Liste hinzu
function addSortOption(option) {
    const listView = document.querySelector("yt-list-view-model");
    if (!listView) { return }

    // Prüfen, ob die Sortieroption bereits existiert
    if (document.getElementById(option.id)) { return }

    const sortOption = newSortOption(option);
    if (sortOption) {
        listView.appendChild(sortOption);
        console.log(`[Add SortOption] ${option.id}`);
    }
}
// Setze die aktuell ausgewählte Sortieroption
function setSortOption(textContent) {
    const sortChip  = document.querySelector('#header chip-view-model');
    const chipTitle = sortChip?.querySelector(".ytChipShapeChip > div:first-child");
    if (!chipTitle) { return }

    // sortChip.dataset.selectedId = sortOption.id;
    chipTitle.textContent       = textContent;
}




/* --------------------------- Sortierfunktionen --------------------------- */
// Sortiert nach Videolänge
function sortDuration(items, ascending = true) {
    return [...items].sort(
        (a, b) => ascending 
        ? a.lengthSeconds - b.lengthSeconds 
        : b.lengthSeconds - a.lengthSeconds
    );
}
// Sortiert nach Titel
function sortTitle(items, ascending = true) {
    return [...items].sort(
        (a, b) => ascending 
        ? a.title.localeCompare(b.title) 
        : b.title.localeCompare(a.title)
    );
}


/* ---------------------------- YouTube Elemente --------------------------- */
async function getAuth() {
    const getCookie = (key) => document.cookie.split("; ").find(cookie => cookie.startsWith(key + "="))?.split("=")[1];
    const sapisid   = getCookie("SAPISID") || getCookie("__Secure-3PAPISID") || getCookie("__Secure-1PAPISID");
    const origin    = window.location.origin;
    const time      = Math.floor(Date.now() / 1000);

    const buffer    = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${time} ${sapisid} ${origin}`));
    const hash      = [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");

    return `SAPISIDHASH ${time}_${hash}`;
}




/* --------------------------- Playlist-Elemente --------------------------- */

// Fordere die Playlist-Elemente von YouTube an
async function requestPlaylistItems(token) {
    
    const context       = await eventHandshake("context");
    const Authorization = await getAuth();
    const request       = await fetch(
        "https://www.youtube.com/youtubei/v1/browse",
        {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                Authorization,
                'X-Origin': window.location.origin
            },
            body: JSON.stringify({
                context,
                continuation: token
            })
        }
    );
    if (!request.ok) { throw new Error(`YouTube Request fehlgeschlagen: ${request.status}`) }
    
    return request.json();
}
// Erhalte die Playlist-Elemente aus der Seite
async function getPlaylistItems(playlistId) {
    console.debug("[ENTER] getPlaylistItems");

    let setVideoIdCount = 0;
    let token = null;

    const findToken = (item) => {
        if (!item || typeof item !== 'object') return null
        if (item.continuationCommand?.token) return item.continuationCommand.token

        for (const value of Object.values(item)) {
            const result = findToken(value);
            if (result) { return result }
        }

        return null;
    }
    const findContinuationToken = (list) => {
        let hasVideos = false, continuationToken = null;
        for (const item of list){
            if (item.playlistVideoRenderer) hasVideos = true;
            if (item.continuationItemRenderer) { const t = findToken(item.continuationItemRenderer); if (t) continuationToken = t; }
        }
        return hasVideos && continuationToken ? continuationToken : null;
    };
    const findItems = (data, items) => {
        if (!data || typeof data !== "object")  return;

        if (Array.isArray(data)) {
            
            const continuationToken = findContinuationToken(data);
            if (continuationToken) { token = continuationToken }
            for (const element of data) { findItems(element, items) }
            return;
        }
        if (data.playlistVideoRenderer?.setVideoId) { 
            items.push(data.playlistVideoRenderer);
            setVideoIdCount++;
            return;
        }

        for (const value of Object.values(data)){ findItems(value, items) }
        return token;
    };

    
    try {
        const data = await eventHandshake("initial-data");
        if (!data) { throw new Error("Playlist-Daten nicht gefunden") }
        
        // Bereits geladene Playlist-Videos
        const items = [];
        let token   = findItems(data.contents, items);
        
        while (token) {
            const response  = await requestPlaylistItems(token);
            const nextToken = findItems(response, items);
            
            if (nextToken === token || !nextToken) { break }
            token = nextToken;
        }

        console.debug("setVideoId Count:", setVideoIdCount);

        return items.map(item => {
                return { 
                    index: Number(item?.index?.simpleText), 
                    setVideoId: item?.setVideoId, 
                    videoId: item?.videoId, 
                    title: item?.title?.runs?.[0]?.text, 
                    lengthSeconds: Number(item?.lengthSeconds),
                    lengthText: item?.lengthText?.simpleText 
                };
            });
    }
    catch (error) {
        console.error("Fehler beim Abrufen der Playlist-Elemente:", error);
        return [];
    }
    finally {
        console.debug("[EXIT] getPlaylistItems");
    }

}
// Bearbeite die Playlist-Elemente basierend auf der Sortierung
async function sortPlaylistItems(sortId, sortFunction, ascending = true) {
    const playlistId    = playlist.id;
    const items         = await getPlaylistItems(playlistId);
    console.debug("Playlist Items:", items);

    const sortedItems   = sortFunction(items, ascending);
    const moveActions   = resolveMoveActions(items, sortedItems);
    console.debug("Move Actions:", moveActions);
    
    if (moveActions.length > 0) {

        const response = await sendMoveActions(moveActions);
        if (response.apiStatus !== "STATUS_SUCCEEDED") { return }
        updatePlaylistItems(response.action);
    }
    await playlistSort.set(playlistId, sortId);
}
// Aktualisiere die Playlist-Elemente in der UI
async function updatePlaylistItems(action) {
    
    document.dispatchEvent(
        new CustomEvent("playlist-sorter-update", {detail: JSON.stringify(action)})
    );
}



// Authentifizierung und Verschiebeaktionen für die Playlist
async function sendMoveActions(moveActions) {
    const playlistId    = playlist.id;
    const context       = await eventHandshake("context");

    // Bereite die Authentifizierung und den Request für die Verschiebeaktionen vor
    const auth      = await getAuth();
    const response  = await fetch(
        "https://www.youtube.com/youtubei/v1/browse/edit_playlist?prettyPrint=false",
        {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Authorization": auth,
                "X-Origin": window.location.origin
            },
            body: JSON.stringify({
                context,
                playlistId,
                actions: moveActions
            })
        }
    );
    const data      = await response.json();
    console.log("Move Response HTTP:", response.status);
    console.log("Move Response:", data);

    return {
        httpStatus: response.status,
        apiStatus: data.status,
        action: data.actions?.[0]
    }
}
function resolveMoveActions(items, targetOrder) {
    const currentOrder  = [...items];
    const moveActions   = [];
    
    let position = 0;
    while (position < targetOrder.length) {
        const targetItem   = targetOrder[position];
        const currentItem  = currentOrder[position];

        // Das gewünschte Video befindet sich bereits an der richtigen Position
        if (currentItem.setVideoId === targetItem.setVideoId) {
            position++;
            continue;
        }

        // Verschiebeaktion erstellen
        moveActions.push({
            action: "ACTION_MOVE_VIDEO_AFTER",
            setVideoId: currentItem.setVideoId,
            movedSetVideoIdPredecessor: targetItem.setVideoId
        });

        // Verschiebung lokal durchführen
        const currentIndex  = currentOrder.findIndex(item => item.setVideoId === targetItem.setVideoId);
        const [movedItem]   = currentOrder.splice(position, 1);
        currentOrder.splice(currentIndex, 0, movedItem);
    }

    return moveActions;
}


/* -------------------------------- Listener ------------------------------- */
function addPlaylistSortListener(listView, playlistId) {
    if (!listView) { return }

    listView.addEventListener('click', async event => {
        chipTextObserver.disconnect();
        playlistSort.remove(playlistId);
        setSortOption(event.target.textContent?.trim());
    });
}
// Wird ausgelöst, wenn die Navigation auf YouTube beginnt
window.addEventListener("yt-navigate-start", () => {
    chipTextObserver.disconnect();
});
// Wird ausgelöst, wenn die Navigation auf YouTube abgeschlossen ist
window.addEventListener("yt-navigate-finish", () => {
    chipTextObserver.observe(document.body, { childList: true, subtree: true });
});



// Beobachter für Änderungen im DOM, um neue Sortieroptionen hinzuzufügen
const chipTextObserver  = new MutationObserver(() => {
    playlist.update();
    if (playlist.id) { playlistSort.sync(playlist.id); }
});
const listViewObserver  = new MutationObserver(() => {
    
    // Füge den Playlist-Sortier-Listener hinzu, falls das ListView vorhanden ist
    const listView = document.querySelector("yt-list-view-model");
    if (!listView) return;
    
    listViewObserver.disconnect();

    playlist.update();

    // Neue Sortieroptionen zum Dropdown-Menü hinzufügen
    for (const option of sortOptions) {
        if (option.id)
            addSortOption(option);
    }
    addPlaylistSortListener(listView, playlist.id);
});

listViewObserver.observe(document.body, { childList: true, subtree: true });
