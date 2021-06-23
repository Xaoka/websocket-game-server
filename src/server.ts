const WebSocketServer = require('ws');

const wss = new WebSocketServer.Server({ port: process.env.PORT || 8090 });

console.log(`Among Us Isolation Server - started`)
const matches = [];

const players = [];

const taskPool =
[
  "door",
  "reactor",
  "oxygen",
  "something else"
]
const imposterTasks =
[
  "kill everyone",
  "cause chaos"
]

const serverState = {};

wss.on('connection', function connection(ws) {
  ws.on('error', function onError(e) {
    console.log(`Client WebsocketError: ${e}`);
    ws.close();
  })
  ws.on('close', function onEnd() {
    console.log("Client closed websocket, cleaning up.")
    players.splice(players.indexOf(playerForWebsocket(ws)), 1); // Make nicer
    // TODO: Tell other players you left
  })
  ws.on('message', function incoming(message) {
    // console.log('received: %s', message);
    try
    {
        let messageData;
        try
        {
          messageData = JSON.parse(message);
        }
        catch (e)
        {
          console.warn(`Invalid message format: ${message}, skipping`);
          return;
        }
        console.dir(messageData);
        console.log(`Type: ${messageData.type}, data: ${JSON.stringify(messageData.data)}`);
        const id = players.map((player) => player.ws).indexOf(ws);
        if (messageData.type == "handshake")
        {
            // console.log(`Sending ${players.length}`)

            console.log(`New Player: ${players.length} (${ws})`);
            players.push({ ws, id: players.length, ready: false, data: messageData.data });
            // ws.send(players.length);
            for (let i = 0; i < players.length; i++)
            {
              const player = players[i];
              // Tell existing players about the new player
              console.log(`Messaging player ${i} (${player.ws})`);
              sendMessage(player.ws, { type: "join", id: players.length, data: messageData.data });
              // Tell the new player about all existing players in the lobby
              sendMessage(ws, { type: "join", id: i, data: player.data });
            }

            for (const state of Object.entries(serverState))
            {
              const type = "network_object";
              sendMessage(ws, { type, data: { target: state[0], value: state[1] } });
            }
        }
        else if (messageData.type == "network_object")
        {
          if (messageData.data.target == "readycheck")
          {
            console.log(`Ready Check`)
            playerForWebsocket(ws).ready = true;
            let allReady = true;
            for (const player of players)
            {
              allReady = player.ready && allReady;
            }
            console.log(`Ready Check: All Ready ${allReady}`);
            if (allReady)
            {
              // Start game!
              broadcastMessage({ type: "start" }, ws);
              // Allocate tasks
              const imposterIndex = Math.round(Math.random()*(players.length - 1));
              for (let i = 0; i < players.length; i++)
              {
                const isImposter = (i==imposterIndex);
                const role = isImposter ? "imposter" : "crew";
                const tasks = isImposter ? imposterTasks : taskPool;
                sendMessage(players[i].ws, { type: "role", role, tasks })
              }
            }
          }
          // Not ReadyCheck (I.e. object state)
          else
          {
            serverState[messageData.data.target] = messageData.data.value;
            console.dir(serverState);
            broadcastMessage(messageData, ws, true);
            if (messageData.data.timer && messageData.data.timer > 0)
            {
              setTimeout(() =>
              {
                 broadcastMessage({ type: "timer", data: { target: messageData.data.target }}, ws, true);
                 serverState[messageData.data.target] = true;//messageData.data.value; // Not ideal but good enough for now
              }, messageData.data.timer * 1000);
            }
          }
        }
        else if (messageData.type == "move")
        {
          const d = messageData.data;
          broadcastMessage({ type: "move", id, x: d.x, y: d.y, z: d.z, rotation: d.rotation }, ws, true);
          // Store server data?
        }
        else if (messageData.type == "special_key_press")
        {
          console.log(`Player ${id} sent key ${messageData.data.key}`);
          broadcastMessage({ type: "special_key_press", id, special_key: messageData.data.key }, ws, true);
        }
        else if (messageData.type == "player_state")
        {
          broadcastMessage({ type: "player_state", id, state: messageData.data.state, value: messageData.data.value }, ws, true);
        }
        else if (messageData.type == "player_interaction")
        {
          broadcastMessage({ type: "player_interaction", id, target: messageData.data.target, action: messageData.data.action }, ws, true);
        }
        else if (messageData.type == "death")
        {
          broadcastMessage({ type: "death", id }, ws, true);
        }
    }
    catch (err)
    {
        console.log(`Error During Message: ${message}`);
        console.log(err);
    }
  });
});

function playerForWebsocket(ws)
{
  for (let i = 0; i < players.length; i++)
  {
    if (players[i].ws == ws)
    {
      return players[i];
    }
  }
}

function broadcastMessage(object, incomingWebsocket, excludeIncomingWebsocket=false)
{
  for (let i = 0; i < players.length; i++)
  {
    if (excludeIncomingWebsocket && incomingWebsocket == players[i].ws)
    {
      continue;
    }
    sendMessage(players[i].ws, object);
  }
}

function sendMessage(ws, object)
{
  ws.send(JSON.stringify(object));
}