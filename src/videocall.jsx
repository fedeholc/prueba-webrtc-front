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
    socketRef.current = io("https://10.160.7.86:3443");

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
        const stream = await getMediaStream();
        if (stream) {
          localVideoRef.current.srcObject = stream;
          return stream;
        }
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

    setupMediaDevices();

    // Cleanup cuando el componente se desmonte
    return () => {
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
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302", // STUN server de Google
        },
        {
          urls: "stun:stun1.l.google.com:19302", // Otro servidor STUN de Google
        },
        {
          urls: "stun:stun2.l.google.com:19302", // Servidor STUN adicional
        },
        {
          urls: "stun:stun3.l.google.com:19302", // Puedes agregar más servidores
        },
      ],
    });

    if (stream) {
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });
    }

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams.length > 0) {
        // Establece el flujo de medios recibido (remoto) en el elemento de video
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnection.onicecandidate = (event) => {
      console.log("on ice", event, event.candidate);
      if (event.candidate) {
        console.log("Enviando candidato ICE:", event.candidate); // Agregar log

        socketRef.current.emit("ice-candidate", event.candidate, roomId);
      } else {
        console.log("Todos los candidatos ICE han sido enviados.");
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

      // Intentar obtener el stream local (esto puede retornar null si no hay medios locales)
      const stream = await getMediaStream();

      // Crear la conexión, ya sea con o sin stream local
      createPeerConnection(stream);

      // Crear la oferta para enviar al otro peer
      const offer = await peerConnectionRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      console.log("Enviando oferta:", offer); // Log para depuración
      socketRef.current.emit("offer", offer, roomId);
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
      const stream = await getMediaStream();
      createPeerConnection(stream);
    }

    if (peerConnectionRef.current.signalingState === "stable") {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current.emit("answer", answer, roomId);
    } else {
      console.warn(
        "No se puede establecer la oferta en este estado:",
        peerConnectionRef.current.signalingState
      );
    }
  };

  const iceCandidatesQueue = [];

  const handleAnswer = async (answer) => {
    if (peerConnectionRef.current.signalingState === "have-local-offer") {
      peerConnectionRef.current
        .setRemoteDescription(new RTCSessionDescription(answer))
        .then(() => {
          console.log("Remote description set successfully.");
          // Add all queued ICE candidates
          while (iceCandidatesQueue.length > 0) {
            const candidate = iceCandidatesQueue.shift();
            console.log("Adding queued ICE candidate:", candidate);
            peerConnectionRef.current
              .addIceCandidate(new RTCIceCandidate(candidate))
              .then(() => {
                console.log("Queued ICE candidate added successfully.");
              })
              .catch((error) => {
                console.error("Error adding queued ICE candidate:", error);
              });
          }
        })
        .catch((error) => {
          console.error("Error setting remote description:", error);
        });
    } else {
      console.warn("Attempted to set remote description in stable state.");
    }
  };

  const handleNewICECandidateMsg = async (candidate) => {
    try {
      console.log("Recibiendo candidato ICE:", candidate);
      if (peerConnectionRef.current) {
        if (
          peerConnectionRef.current.remoteDescription &&
          peerConnectionRef.current.remoteDescription.type
        ) {
          console.log(
            "Remote description is set, adding ICE candidate:",
            candidate
          );
          peerConnectionRef.current
            .addIceCandidate(new RTCIceCandidate(candidate))
            .then(() => {
              console.log("ICE candidate added successfully.");
            })
            .catch((error) => {
              console.error("Error adding ICE candidate:", error);
            });
        } else {
          console.log(
            "Remote description not set, queuing ICE candidate:",
            candidate
          );
          // Queue the candidate if remote description is not set
          iceCandidatesQueue.push(candidate);
        }
      } else {
        console.warn("peerConnectionRef.current is null.");
      }
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
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
          users.map((user) => <li key={user.socketId}>{user.socketId}</li>)}
      </ul>
    </div>
  );
};

export default VideoCallComponent;
