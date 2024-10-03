import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const VideoCallComponent = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const [roomId, setRoomId] = useState("F");
  const [isCalling, setIsCalling] = useState(false);
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const [users, setUsers] = useState([]);
  const iceCandidatesQueue = useRef([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    console.log("inicio useEffect");
    socketRef.current = io("https://10.160.30.99:3443");

    socketRef.current.on("usersInRoom", (users) => {
      console.log("users in room", users);
      setUsers(users);
    });

    socketRef.current.on("start_call", startCall);
    socketRef.current.on("offer", handleOffer);
    socketRef.current.on("answer", handleAnswer);
    socketRef.current.on("ice-candidate", handleNewICECandidateMsg);

    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const setupMediaDevices = async () => {
      try {
        const stream = await getMediaStream();
        if (stream && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error setting up media devices:", error);
        setErrorMessage(
          "No se pudo acceder a la cámara o micrófono. La llamada será solo de audio."
        );
      }
    };

    setupMediaDevices();
  }, []);

  const createPeerConnection = () => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
      ],
    });

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams.length > 0) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Enviando candidato ICE:", event.candidate);
        socketRef.current.emit("ice-candidate", event.candidate, roomId);
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peerConnection.iceConnectionState);
    };

    peerConnectionRef.current = peerConnection;
  };

  const joinRoom = () => {
    if (roomId) {
      socketRef.current.emit("join", roomId);
      setIsRoomJoined(true);
    }
  };

  const startCall = async () => {
    if (!isCalling && isRoomJoined) {
      setIsCalling(true);
      createPeerConnection();

      try {
        const stream = await getMediaStream();
        if (stream) {
          stream
            .getTracks()
            .forEach((track) =>
              peerConnectionRef.current.addTrack(track, stream)
            );
        }

        const offer = await peerConnectionRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await peerConnectionRef.current.setLocalDescription(offer);
        console.log("Enviando oferta:", offer);
        socketRef.current.emit("offer", offer, roomId);
      } catch (error) {
        console.error("Error creating offer:", error);
        setIsCalling(false);
        setErrorMessage(
          "Error al iniciar la llamada. Por favor, intente de nuevo."
        );
      }
    }
  };

  const getMediaStream = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (error) {
      console.warn("No video stream available, trying audio only", error);
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        console.error("No media stream available", error);
        return null;
      }
    }
  };

  const handleOffer = async (offer) => {
    if (!peerConnectionRef.current) {
      createPeerConnection();
    }

    try {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const stream = await getMediaStream();
      if (stream) {
        stream
          .getTracks()
          .forEach((track) =>
            peerConnectionRef.current.addTrack(track, stream)
          );
      }

      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit("answer", answer, roomId);
      processIceCandidateQueue();
    } catch (error) {
      console.error("Error handling offer:", error);
      setErrorMessage(
        "Error al responder a la llamada. Por favor, intente de nuevo."
      );
    }
  };

  const handleAnswer = async (answer) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      console.log("Remote description set successfully.");
      processIceCandidateQueue();
    } catch (error) {
      console.error("Error setting remote description:", error);
      setErrorMessage(
        "Error al establecer la conexión. Por favor, intente de nuevo."
      );
    }
  };

  const handleNewICECandidateMsg = (candidate) => {
    console.log("Recibiendo candidato ICE:", candidate);
    const iceCandidate = new RTCIceCandidate(candidate);
    if (
      peerConnectionRef.current &&
      peerConnectionRef.current.remoteDescription &&
      peerConnectionRef.current.remoteDescription.type
    ) {
      peerConnectionRef.current
        .addIceCandidate(iceCandidate)
        .then(() => console.log("ICE candidate added successfully."))
        .catch((error) => console.error("Error adding ICE candidate:", error));
    } else {
      iceCandidatesQueue.current.push(iceCandidate);
      console.log(
        "ICE candidate queued. Queue length:",
        iceCandidatesQueue.current.length
      );
    }
  };

  const processIceCandidateQueue = () => {
    if (
      peerConnectionRef.current &&
      peerConnectionRef.current.remoteDescription &&
      peerConnectionRef.current.remoteDescription.type
    ) {
      console.log(
        "Processing ICE candidate queue. Length:",
        iceCandidatesQueue.current.length
      );
      iceCandidatesQueue.current.forEach((candidate) => {
        peerConnectionRef.current
          .addIceCandidate(candidate)
          .then(() => console.log("Queued ICE candidate added successfully."))
          .catch((error) =>
            console.error("Error adding queued ICE candidate:", error)
          );
      });
      iceCandidatesQueue.current = [];
    } else {
      console.log(
        "Cannot process ICE candidates yet. Remote description not set."
      );
    }
  };

  return (
    <div>
      <input
        type="text"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        placeholder="Enter Room ID"
      />
      <button onClick={joinRoom} disabled={isRoomJoined}>
        Join Room
      </button>
      <button onClick={startCall} disabled={!isRoomJoined || isCalling}>
        Start Call
      </button>
      {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
      <video ref={localVideoRef} autoPlay muted playsInline />
      <video ref={remoteVideoRef} autoPlay playsInline />
      <h2>Users in room:</h2>
      <ul>
        {users.length === 0 && <li>No users in room</li>}
        {users.length > 0 &&
          users.map((user) => <li key={user.socketId}>{user.socketId}</li>)}
      </ul>
    </div>
  );
};

export default VideoCallComponent;
