import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const VideoCallComponent2 = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const [roomId, setRoomId] = useState("F");
  const [isCalling, setIsCalling] = useState(false);
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const [users, setUsers] = useState([]);
  const [hasLocalStream, setHasLocalStream] = useState(false);

  useEffect(() => {
    console.log("inicio useEffect");
    socketRef.current = io("https://192.168.0.59:3443");

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
        if (stream) {
          localVideoRef.current.srcObject = stream;
          setHasLocalStream(true);
        }
      } catch (error) {
        console.error("No media stream available", error);
        setHasLocalStream(false);
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

    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localVideoRef.current.srcObject);
      });
    }

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams.length > 0) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnection.onicecandidate = (event) => {
      console.log("onicecandidate event:", event);
      if (event.candidate) {
        console.log("Enviando candidato ICE:", event.candidate);
        socketRef.current.emit("ice-candidate", event.candidate, roomId);
      } else {
        console.log("Todos los candidatos ICE han sido enviados.");
      }
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
        const offer = await peerConnectionRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await peerConnectionRef.current.setLocalDescription(offer);
        console.log("Enviando oferta:", offer);
        socketRef.current.emit("offer", offer, roomId);
      } catch (error) {
        console.error("Error al crear la oferta:", error);
        setIsCalling(false);
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
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit("answer", answer, roomId);
    } catch (error) {
      console.error("Error al manejar la oferta:", error);
    }
  };

  const handleAnswer = async (answer) => {
    try {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    } catch (error) {
      console.error("Error al manejar la respuesta:", error);
    }
  };

  const handleNewICECandidateMsg = async (candidate) => {
    try {
      console.log("Recibiendo candidato ICE:", candidate);
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
        console.log("Candidato ICE agregado con éxito.");
      }
    } catch (error) {
      console.error("Error al agregar el candidato ICE:", error);
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
      {hasLocalStream ? (
        <video ref={localVideoRef} autoPlay muted playsInline />
      ) : (
        <p>No local media available</p>
      )}
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

export default VideoCallComponent2;
