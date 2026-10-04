
window.addEventListener("event-handshake", event => {
    const request = event.detail;

    switch (request) {
        case "context": {
            const context = window.ytcfg?.data_?.INNERTUBE_CONTEXT;
            window.dispatchEvent(new CustomEvent("event-handshake-response", { detail: context ?? null }));
            break;
        }
        case "initial-data": {
            const initialData = window.ytInitialData;
            window.dispatchEvent(new CustomEvent("event-handshake-response", { detail: initialData ?? null }));
            break;
        }
        default:
            console.warn(`Playlist Sorter: Unbekannte Anfrage im Handshake: ${request}`);
            window.dispatchEvent(new CustomEvent("event-handshake-response", { detail: null }));
    }
});


document.addEventListener("playlist-sorter-update", (event) => {
    console.log("Playlist Sorter: Update empfangen");

    const action    = JSON.parse(event.detail);
    const app       = document.querySelector("ytd-app");

    if (!app) { console.error("Playlist Sorter: ytd-app nicht gefunden"); return }

    const detail = {
        actionName: "yt-update-playlist-action",
        args: [action, app, {}],
        optionalAction: true,
        returnValue: []
    };

    app.dispatchEvent(new CustomEvent("yt-action", {
        bubbles: true,
        cancelable: false,
        composed: true,
        detail
    }));

    console.log("Playlist Sorter: yt-action dispatched");
});