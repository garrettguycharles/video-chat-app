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

    this.users = [];

    rooms[this.roomId] = this;
  }

  addChatMessage(m) {
    if (!(this.chat.messages.includes(m))) {
      this.chat.messages.push(m);
    }
  }

  addUser(u) {
    if (!(this.users.includes(u))) {
      this.users.push(u);
    }
  }

  toObject() {
    let to_return = {
      roomId: this.roomId,
      chat: {
        messages: [],
      },
      users: [],
    };

    for (let c of this.chat.messages.sort((a, b) => a.time < b.time ? -1 : 1)) {
      to_return.chat.messages.push(c.toObject());
    }

    for (let u of this.users) {
      to_return.users.push(u.toObject());
    }

    return to_return;
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
      socket.to(roomId).emit("user-connected", userId);
      socket.emit("download-sync-chat", room.toObject());
    }, 250);

  });

  socket.on("send-chat", data => {
    if (room) {
      io.in(room.roomId).emit("receive-chat", new ChatMessage(room, data.text, data.name, data.userId).toObject());
    }
  });

  socket.on('disconnect', function() {
    console.log("Lost connection, retrying...");
    setTimeout(() => {
      if (user && socket.disconnected) {
        if (user.room_owner) {
          console.log("Room owner disconnected.");
          user.room_owner = false;

          let should_destroy = true;
          for (let p of room.users) {
            if (!(p.socket.disconnected)) {
              console.log(`Transferring room ${room.roomId} ownership to ${p.name}`);
              should_destroy = false;
              p.room_owner = true;
              p.socket.emit("toast", {
                text: "The room owner disconnected.  You are the new room owner!",
                duration: 5000,
              });

              break;
            }
          }

          if (should_destroy) {
            console.log(`Ending room ${room.roomId}`);
            io.in(room.roomId).emit("room_destroy");

            delete rooms[room.roomId];
          } else {
            room.users.splice(room.users.indexOf(user), 1);
            user.socket.disconnect(true);
            console.log("Emitting user_disconnected for previous room owner.");
            console.log(user.toObject());
            io.in(room.roomId).emit("user_disconnected", user.toObject());
          }


        } else {
          console.log("Non-owner leaving room");
          room.users.splice(room.users.indexOf(user), 1);
          user.socket.disconnect(true);
          io.in(room.roomId).emit("user_disconnected", user.toObject());
        }

        socket.removeAllListeners();

      } else {
        console.log("Successfully reconnected!")
      }
    },10000);
  });

});

server.listen(3010);
console.log("Server listening on port 3010!");
peerServer.listen(3007);
console.log("peerServer listening on port 3007!");
