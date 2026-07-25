const dev = (reconnect?: boolean) => {
    const socket = new WebSocket("ws://localhost:3000/ws");
    socket.onclose = () => {
        socket.close();
        console.log("websocket connection lost reconnecting");
        dev(reconnect || true);
    }
    socket.onerror = () => {
        socket.close();
        console.log("websocket connection lost reconnecting");
        dev(reconnect || true);
    }
    socket.onopen = () => {
        if (reconnect) {
            console.log("websocket connection back reloading to ensure latest");
            window.location.reload();
        }
    }
    socket.onmessage = (event) => {
        console.log("website updated reloading");
        window.location.reload();
    };
}
export default dev;