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

  useEffect(() => {
    // Inicializa la conexión de socket

    //if user is connected do not reconect

    console.log("inicio usefect");
    socketRef.current = io("https://192.168.0.59:3443");

    socketRef.current.on("usersInRoom", (users) => {
      // Actualizar la lista de usuarios en la interfaz
      console.log("users in room", users);
      setUsers(users);
    });

    socketRef.current.on("start_call", startCall);

    socketRef.current.on("offer", handleOffer);
    socketRef.current.on("answer", handleAnswer);
    socketRef.current.on("ice-candidate", handleNewICECandidateMsg);

    // Pedir permiso para acceder a la cámara y el micrófono
  }, []);

  useEffect(() => {
    const setupMediaDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        localVideoRef.current.srcObject = stream;
        return stream;
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    setupMediaDevices();

    // Cleanup cuando el componente se desmonte
    return () => {
      console.log("holi3");
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []); // Solo ejecutar cuando `isRoomJoined` cambie

  const createPeerConnection = (stream) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit("ice-candidate", event.candidate, roomId);
      }
    };

    peerConnectionRef.current = peerConnection;
  };

  // Función para unirse a una sala
  const joinRoom = () => {
    if (roomId) {
      socketRef.current.emit("join", roomId);
    }
  };

  // Iniciar la llamada WebRTC, enviando la oferta
  const startCall = async () => {
    if (!isCalling) {
      // Verificar si peerConnection está configurado
      setIsCalling(true);
      const stream = localVideoRef.current.srcObject;
      createPeerConnection(stream);

      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socketRef.current.emit("offer", offer, roomId);
    }
  };

  const handleOffer = async (offer) => {
    if (!peerConnectionRef.current) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localVideoRef.current.srcObject = stream;
      createPeerConnection(stream);

      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit("answer", answer, roomId);
    }
  };

  const handleAnswer = async (answer) => {
    await peerConnectionRef.current.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
  };

  const handleNewICECandidateMsg = async (candidate) => {
    if (peerConnectionRef.current) {
      await peerConnectionRef.current.addIceCandidate(
        new RTCIceCandidate(candidate)
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
      <button onClick={joinRoom}>Join Room</button>
      <button onClick={startCall}>Start Call</button>
      <video ref={localVideoRef} autoPlay muted playsInline />
      <video ref={remoteVideoRef} autoPlay playsInline />
      <h2>Users in room:</h2>
      <ul>
        {users.length === 0 && <li>No users in room</li>}
        {users.length > 0 &&
          users.map((user) => <li key={user}>{user.socketId}</li>)}
      </ul>
    </div>
  );
};

export default VideoCallComponent;
