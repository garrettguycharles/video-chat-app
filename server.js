const express = require("express");
const app = express();
let http = require("http");
const server = http.createServer(app);
const { v4: uuidv4 } = require("uuid");
const cors = require('cors');

app.set('view engine', 'ejs');

const io = require("socket.io")(server);

let ExpressPeerServer = require('peer').ExpressPeerServer;
let peerApp = require('express')();

peerApp.use(cors());

let peerServer = http.createServer(peerApp);

peerApp.use("/peerjs", ExpressPeerServer(peerServer, {
  debug: true
}));

app.use(express.static('./public'));


class User {
  constructor(room, socket, name, userId, room_owner = false) {
    this.name = name;
    this.room = room;
    this.socket = socket;
    this.userId = userId;
    this.room_owner = room_owner;
    this.room.addUser(this);
  }

  toObject() {
    return {
      name: this.name,
      userId: this.userId,
      room_owner: this.room_owner,
    }
  }

  destroy() {
    this.socket.emit("room_destroy");
    this.socket.leave(this.room.roomId);
    this.socket.removeAllListeners();
    this.socket.disconnect(true);
    this.room.removeUser(this);
  }
}

class ChatMessage {
  constructor(room, text, name, userId) {
    this.text = text;
    this.name = name;
    this.time = Date.now();
    this.room = room;
    this.userId = userId;
    this.room.addChatMessage(this);
  }

  toObject() {
    return {
      text: this.text,
      name: this.name,
      time: this.time,
      userId: this.userId,
    }
  }
}

let rooms = {};

class Room {
  constructor(roomId) {
    this.roomId = roomId;

    this.chat = {
      messages: [],
    };

    this.users = {};

    rooms[this.roomId] = this;
  }

  addChatMessage(m) {
    if (!(this.chat.messages.includes(m))) {
      this.chat.messages.push(m);
    }
  }

  addUser(u) {
    if (!(this.users[u.userId])) {
      this.users[u.userId] = u;
    }
  }

  removeUser(u) {
    if (Object.keys(this.users).includes(u.userId)) {
      delete this.users[u.userId];
    }
  }

  assignNewRoomOwner() {
    let foundOwner = null;
    for (let [id, u] of Object.entries(this.users)) {
      u.room_owner = false;

      if (!(foundOwner || u.socket.disconnected)) {
        foundOwner = u;
        u.room_owner = true;
      }
    }

    return foundOwner;
  }

  toObject() {
    let to_return = {
      roomId: this.roomId,
      chat: {
        messages: [],
      },
      users: {},
    };

    for (let c of this.chat.messages.sort((a, b) => a.time < b.time ? -1 : 1)) {
      to_return.chat.messages.push(c.toObject());
    }

    for (let [key, u] of Object.entries(this.users)) {
      to_return.users[u.userId] = u.toObject();
    }

    return to_return;
  }

  destroy() {
    let keys = Object.keys(this.users);

    for (let k of keys) {
      this.users[k].destroy();
    }

    delete rooms[this.roomId];
  }
}


app.get("/", (req, res) => {

  res.redirect(`/${uuidv4()}`);
});

app.get("/:room", (req, res) => {
  console.log(req.params.room);
  res.render("room", { roomId: req.params.room });
});

io.on("connection", (socket) => {
  console.log("A client connected...");
  let room, user;
  socket.on("join-room", (roomId, userId, name) => {

    console.log(`A client is trying to join room ${roomId}`);

    if (Object.keys(rooms).includes(roomId)) {
      room = rooms[roomId];
      console.log(`Joining room.  Id: ${room.roomId}`)
      user = new User(room, socket, name, userId);
    } else {
      room = new Room(roomId);
      console.log(`New room created.  Id: ${room.roomId}`)
      user = new User(room, socket, name, userId, true);
    }

    socket.join(room.roomId);

    setTimeout(() => {
      socket.emit("welcome");
      socket.to(roomId).emit("sync-users", room.toObject().users);
      socket.emit("download-sync-chat", room.toObject().chat);
    }, 250);

  });

  socket.on("send-chat", data => {
    if (room) {
      io.in(room.roomId).emit("receive-chat", new ChatMessage(room, data.text, data.name, data.userId).toObject());
    }
  });

  socket.on('request-sync', () => {
    if (room) {
      console.log("Requested sync: \n", room.toObject());
      socket.emit("sync-users", room.toObject().users);
      socket.emit("download-sync-chat", room.toObject().chat);
    }

  });

  socket.on("leave-meeting", () => {
    if (room && user) {
      if (user.room_owner) {
        user.destroy();
        let newOwner = room.assignNewRoomOwner();

        if (newOwner) {
          console.log(`Transferring room ${this.roomId} ownership to ${newOwner.name}`);
          newOwner.socket.emit("toast", {
            text: "The room owner disconnected.  You are the new room owner!",
            duration: 5000,
          });
        } else {
          room.destroy();
        }
      } else {
        user.destroy();
      }

      io.in(room.roomId).emit("sync-users", room.toObject().users);
    }
  });

  socket.on('disconnect', function() {
    console.log("Lost connection, retrying...");
    setTimeout(() => {
      if (room && user && socket.disconnected) {
        if (user.room_owner) {
          user.destroy();
          let newOwner = room.assignNewRoomOwner();

          if (newOwner) {
            console.log(`Transferring room ${this.roomId} ownership to ${newOwner.name}`);
            newOwner.socket.emit("toast", {
              text: "The room owner disconnected.  You are the new room owner!",
              duration: 5000,
            });
          } else {
            room.destroy();
          }
        } else {
          user.destroy();
        }

        io.in(room.roomId).emit("sync-users", room.toObject().users);

      } else {
        console.log("Successfully reconnected!")
      }
    },30000);
  });

});

server.listen(3010);
console.log("Server listening on port 3010!");
peerServer.listen(3007);
console.log("peerServer listening on port 3007!");
