const myVideo = document.createElement("video");
// myVideo.muted = true;

let app = new Vue({
  el: "#v-app",
  data: {
    name: "",
    userId: "",
    socket: null,
    peer: null,
    chat: {
      compose: "",
      messages: [],
    },
    videos: {},
    error: "",
    toast: "",
    show_error: false,
    show_toast: false,
    error_timeout: null,
    toast_timeout: null,
    myVideoStream: null,
    audio_muted: false,
    video_muted: false,
    meeting_ended: false,
  },

  methods: {
    sendMessage: function() {
      if (!this.chat.compose) {
        console.log("Can't send empty message.");
        return;
      }
      console.log("Tried to send message!");

      try {
        this.socket.emit("send-chat", {
          text: this.chat.compose,
          name: this.name,
          time: Date.now(),
          userId: this.userId,
        });

        this.chat.compose = "";
      } catch (e) {
        this.setError("Message failed to send.");
      }

    },

    joinRoom: function() {

      if (!(this.name)) {
        this.setError("Please enter your name :)");
        return;
      }


      this.socket = io("/");

      this.peer = new Peer(undefined, {
        path: "/peerjs",
        host: "/",
        port: "3007",
      });

      navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      })
      .then((stream) => {
        this.myVideoStream = stream;
        this.addVideoStream(myVideo, stream, "");

        this.peer.on("call", (call) => {
          call.answer(stream);
          const video = document.createElement("video");
          call.on("stream", (userVideoStream) => {
            this.addVideoStream(video, userVideoStream, call.peer);
          });
        });

        this.socket.on("user-connected", (userId) => {
          this.connectToNewUser(userId, stream);
        });

        this.socket.on("user_disconnected", data => {
          this.disconnectFromUser(data.userId);
        });
      });

      this.peer.on("open", (id) => {
        this.userId = id;
        this.socket.emit("join-room", ROOM_ID, id, this.name);
      });

      this.initSocket();
    },
    initSocket: function() {
      this.socket.on("receive-chat", data => {
        data.time = Date.now();
        this.chat.messages.push(data);
      });

      this.socket.on("download-sync-chat", data => {
        this.chat.messages = data.chat.messages;
      });

      this.socket.on("toast", data => {
        this.setToast(data.text, data.duration);
      });

      this.socket.on("room_destroy", () => {
        this.room_ended = true;
        this.peer.destroy();

        for (let v of this.videos) {
          v.remove();
        }

        this.removeAllSocketListeners();
      });
    },
    addVideoStream: function(video, stream, userId) {
      video.srcObject = stream;
      video.addEventListener("loadedmetadata", () => {
        video.play();
        document.getElementById("video-grid").append(video);
      });
      this.videos[userId] = video;
    },
    connectToNewUser: function(userId, stream) {
      const call = this.peer.call(userId, stream);
      const video = document.createElement("video");
      call.on("stream", (userVideoStream) => {
        this.addVideoStream(video, userVideoStream, userId);
      });
    },
    disconnectFromUser: function(userId) {
      if (Object.keys(this.videos).includes(userId)) {
        this.videos[userId].remove();
        delete this.videos[userId];
      }
    },
    disconnectSocket: function() {
      if (this.socket) {
        this.socket.emit("force_disconnect");
        this.socket = null;
      }
    },
    setToast: function(text, duration=5000) {
      clearTimeout(this.toast_timeout);

      this.toast = text;
      this.show_toast = true;

      this.toast_timeout = setTimeout(() => {
        this.show_toast = false;
      }, duration);
    },
    setError: function(text, duration=5000) {
      clearTimeout(this.error_timeout);

      this.error = text;
      this.show_error = true;

      this.error_timeout = setTimeout(() => {
        this.show_error = false;
      }, duration);
    },
    get_current_time_string: function(date_number) {
      return new Date(date_number).toLocaleTimeString(navigator.language, {hour: '2-digit', minute:'2-digit'});
    },
    toggleMuteMyAudio: function() {
      this.audio_muted = !this.audio_muted; // this needs to be first
      this.myVideoStream.getAudioTracks()[0].enabled = !(this.audio_muted);
    },
    toggleMuteMyVideo: function() {
      this.video_muted = !this.video_muted; // this needs to be first
      this.myVideoStream.getVideoTracks()[0].enabled = !(this.video_muted);

    },
    removeAllSocketListeners: function() {
      this.socket.off("user-connected");
      this.socket.off('receive-chat');
      this.socket.off('toast');
      this.socket.off('room_destroy');
      this.socket.off('user_disconnected');
      this.socket.off("download-sync-chat");
    },
  },

  computed: {

  },
  watch: {

  },

});
