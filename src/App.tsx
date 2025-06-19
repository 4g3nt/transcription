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
  
  const { client } = useLiveAPIContext();

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
      if (data.modelTurn && data.modelTurn.parts) {
        // Extract text from all text parts
        const textParts = data.modelTurn.parts
          .filter((part) => part.text && part.text)
          .map((part) => part.text)
          .join(" ")
          .replaceAll(".", ". ")
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
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            maxWidth: '600px',
            maxHeight: '300px',
            overflow: 'auto',
            zIndex: 1000,
            fontSize: '16px',
            lineHeight: '1.5',
            display: displayText ? 'block' : 'none'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>{displayTitle}</h3>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{displayText}</p>
            {/* <button 
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
            </button> */}
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
