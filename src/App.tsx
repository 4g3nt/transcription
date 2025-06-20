/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useRef, useState, useEffect } from "react";
import "./App.scss";
import { LiveAPIProvider, useLiveAPIContext } from "./contexts/LiveAPIContext";
import SidePanel from "./components/side-panel/SidePanel";
import { Altair } from "./components/altair/Altair";
import ControlTray from "./components/control-tray/ControlTray";
import cn from "classnames";
import { LiveClientOptions } from "./types";
import { LiveServerContent } from "@google/genai";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

function AppContent() {
  // this video reference is used for displaying the active stream, whether that is the webcam or screen capture
  // feel free to style as you see fit
  const videoRef = useRef<HTMLVideoElement>(null);
  // either the screen capture, the video or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  // state to track transcription text
  const [transcriptionText, setTranscriptionText] = useState<string>("");
  // state to track modelTurn content
  const [modelTurnText, setModelTurnText] = useState<string>("");
  // state to track input audio chunks for the current turn
  const [currentTurnInputAudioChunks, setCurrentTurnInputAudioChunks] = useState<string[]>([]);
  
  const { client } = useLiveAPIContext();

  // Override client's sendRealtimeInput to capture input audio
  useEffect(() => {
    const originalSendRealtimeInput = client.sendRealtimeInput.bind(client);
    
    client.sendRealtimeInput = (chunks: Array<{ mimeType: string; data: string }>) => {
      // Capture audio chunks before sending them
      chunks.forEach(chunk => {
        if (chunk.mimeType.includes("audio")) {
          console.log("Capturing input audio chunk:", chunk.data.length, "bytes (base64)");
          setCurrentTurnInputAudioChunks(prev => [...prev, chunk.data]);
        }
      });
      
      // Call the original method
      return originalSendRealtimeInput(chunks);
    };

    return () => {
      // Restore original method on cleanup
      client.sendRealtimeInput = originalSendRealtimeInput;
    };
  }, [client]);

  // Function to concatenate base64 audio chunks into one ArrayBuffer
  const concatenateBase64AudioChunks = (base64Chunks: string[]): ArrayBuffer => {
    if (base64Chunks.length === 0) return new ArrayBuffer(0);
    
    // Convert base64 chunks to binary data
    const binaryChunks = base64Chunks.map(chunk => {
      const binaryString = atob(chunk);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });
    
    // Calculate total length
    const totalLength = binaryChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    
    // Concatenate all chunks
    const result = new ArrayBuffer(totalLength);
    const uint8Array = new Uint8Array(result);
    
    let offset = 0;
    for (const chunk of binaryChunks) {
      uint8Array.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  };

  // Function to create WAV file from PCM audio data
  const createWavFile = (pcmData: ArrayBuffer, sampleRate: number = 16000, channels: number = 1, bitsPerSample: number = 16): ArrayBuffer => {
    const dataLength = pcmData.byteLength;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;
    
    const buffer = new ArrayBuffer(totalLength);
    const view = new DataView(buffer);
    
    // WAV header
    // "RIFF" chunk descriptor
    view.setUint32(0, 0x46464952, true); // "RIFF"
    view.setUint32(4, totalLength - 8, true); // File size - 8
    view.setUint32(8, 0x45564157, true); // "WAVE"
    
    // "fmt " sub-chunk
    view.setUint32(12, 0x20746d66, true); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, channels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true); // ByteRate
    view.setUint16(32, channels * bitsPerSample / 8, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample
    
    // "data" sub-chunk
    view.setUint32(36, 0x61746164, true); // "data"
    view.setUint32(40, dataLength, true); // Subchunk2Size
    
    // Copy PCM data
    const pcmView = new Uint8Array(pcmData);
    const bufferView = new Uint8Array(buffer, headerLength);
    bufferView.set(pcmView);
    
    return buffer;
  };

  // Function to create blob URL and open in new window
  const openInputAudioInNewWindow = (audioBuffer: ArrayBuffer) => {
    if (audioBuffer.byteLength === 0) return;
    
    // Convert PCM data to WAV format (16kHz for input audio)
    const wavBuffer = createWavFile(audioBuffer, 16000);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    // Open in new window
    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(`
        <html>
          <head><title>Input Audio Playback</title></head>
          <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f0f0;">
            <div style="text-align: center;">
              <h2>User Input Audio</h2>
              <audio controls autoplay>
                <source src="${url}" type="audio/wav">
                Your browser does not support the audio element.
              </audio>
              <br><br>
              <a href="${url}" download="input-audio.wav" style="text-decoration: none; background: #007bff; color: white; padding: 10px 20px; border-radius: 5px;">Download Audio</a>
            </div>
          </body>
        </html>
      `);
    }
  };

  // Listen for turn complete events to process collected input audio
  useEffect(() => {
    const onTurnComplete = () => {
      console.log("Turn complete! Input audio chunks collected:", currentTurnInputAudioChunks.length);
      
      // Concatenate all input audio chunks from this turn
      if (currentTurnInputAudioChunks.length > 0) {
        console.log("Opening input audio window with", currentTurnInputAudioChunks.length, "chunks");
        const concatenatedAudio = concatenateBase64AudioChunks(currentTurnInputAudioChunks);
        console.log("Concatenated input audio size:", concatenatedAudio.byteLength, "bytes");
        openInputAudioInNewWindow(concatenatedAudio);
      } else {
        console.log("No input audio chunks to play");
      }
      
      // Clear input audio chunks for next turn
      setCurrentTurnInputAudioChunks([]);
    };

    client.on("turncomplete", onTurnComplete);

    return () => {
      client.off("turncomplete", onTurnComplete);
    };
  }, [client, currentTurnInputAudioChunks]);

  // Listen for transcription events
  useEffect(() => {
    const onTranscription = (text: string) => {
      setTranscriptionText(prev => (prev + text).trim());
    };

    client.on("transcription", onTranscription);

    return () => {
      client.off("transcription", onTranscription);
    };
  }, [client]);

  // Listen for content events (modelTurn)
  useEffect(() => {
    const onContent = (data: LiveServerContent) => {
      console.log("Received content:", data);
      
      if (data.modelTurn && data.modelTurn.parts) {
        console.log("ModelTurn parts:", data.modelTurn.parts);
        
        // Check for audio parts
        const audioParts = data.modelTurn.parts.filter(part => 
          part.inlineData && part.inlineData.mimeType?.startsWith("audio/")
        );
        console.log("Audio parts found:", audioParts.length);
        
        // Extract text from all text parts
        const textParts = data.modelTurn.parts
          .filter((part) => part.text && part.text)
          .map((part) => part.text)
          .join(" ")
          .replaceAll(".", ". ")
          .replaceAll("ponto", ". ")
          .replaceAll("vírgula", ", ")
          .replaceAll("virgula", ", ")
          .replaceAll("?", "? ")
          .replaceAll("!", "! ")
          .replaceAll("  ", " ")
          ;
        
        if (textParts) {
          // Accumulate the modelTurn text instead of replacing it
          setModelTurnText(prev => (prev + textParts));
          // Clear transcription text when AI response arrives to show the AI response
          setTranscriptionText("");
        }
      }
    };

    client.on("content", onContent);

    return () => {
      client.off("content", onContent);
    };
  }, [client]);

  // Determine what text to display: show AI response + transcription when transcribing, otherwise just AI response
  const displayText = transcriptionText 
    ? (modelTurnText + (modelTurnText ? "" : "") + transcriptionText).trim()
    : modelTurnText;
  const displayTitle = transcriptionText ? "Live Transcription..." : "Final Transcription:";

  // Clear function that clears both texts
  const clearAllText = () => {
    setTranscriptionText("");
    setModelTurnText("");
  };

  return (
    <div className="streaming-console">
      <SidePanel />
      <main>
        <div className="main-app-area">
          {/* APP goes here */}
          <Altair />
          {/* Transcription display */}
          <div className="transcription-display" style={{
            position: 'fixed',
            top: '50%',
            left: '65%',
            transform: 'translate(-50%, -65%)',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            maxWidth: '600px',
            maxHeight: '400px',
            overflow: 'auto',
            zIndex: 1000,
            fontSize: '16px',
            lineHeight: '1.5',
            display: displayText ? 'block' : 'none'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>{displayTitle}</h3>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{displayText}</p>
            <button 
              onClick={clearAllText}
              style={{
                marginTop: '10px',
                padding: '5px 10px',
                background: '#666',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>
          </div>
          <video
            className={cn("stream", {
              hidden: !videoRef.current || !videoStream,
            })}
            ref={videoRef}
            autoPlay
            playsInline
          />
        </div>

        <ControlTray
          videoRef={videoRef}
          supportsVideo={true}
          onVideoStreamChange={setVideoStream}
          enableEditingSettings={true}
        >
          {/* put your own buttons here */}
        </ControlTray>
      </main>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <AppContent />
      </LiveAPIProvider>
    </div>
  );
}

export default App;
