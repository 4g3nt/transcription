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
import Editor from "./components/editor/Editor";
import cn from "classnames";
import { LiveClientOptions } from "./types";
import { LiveServerContent, GoogleGenAI } from "@google/genai";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
};

interface TranscriptionTurn {
  id: number;
  text: string;
  status: 'live' | 'interim' | 'final';
}

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
  // state to track previous transcription for context
  const [previousTranscription, setPreviousTranscription] = useState<string>("");
  // state to track transcription results
  const [transcriptionResults, setTranscriptionResults] = useState<string>("");

  const [turns, setTurns] = useState<TranscriptionTurn[]>([]);
  const turnCounter = useRef(0);
  
  const { client } = useLiveAPIContext();

  // Initialize Gemini AI client for transcription
  const geminiAI = new GoogleGenAI({ apiKey: API_KEY });

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

  // Function to convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Function to transcribe audio using Gemini API
  const transcribeAudio = async (audioBuffer: ArrayBuffer, turnId: number): Promise<string> => {
    try {
      console.log(`Starting transcription for turn ${turnId} with Gemini API...`);
      
      // Convert audio to WAV format and then to base64
      const wavBuffer = createWavFile(audioBuffer, 16000);
      const base64Audio = arrayBufferToBase64(wavBuffer);
      
      const config = {
        responseMimeType: 'text/plain',
        systemInstruction: [
          {
            text: `Você é um sistema de transcrição de voz altamente eficiente, especialmente treinado e otimizado para o ambiente de laudos de radiologia. Sua tarefa exclusiva é transcrever o áudio que está sendo transmitido por um médico radiologista.

Seu vocabulário deve priorizar e reconhecer com precisão a terminologia médica, anatômica e radiológica, incluindo, mas não se limitando a:

*   **Termos de imagem:** hipoatenuante, hipodenso, isodenso, hiperdenso, hipoecogênico, hiperecogênico, anecoico, hipointenso, hiperintenso, isointenso, realce (pós-contraste, anelar, periférico, homogêneo, heterogêneo), difusão restrita, sinal em T1, T2, FLAIR, DWI, ADC.
*   **Anatomia:** parênquima (cerebral, pulmonar, hepático), hilo (pulmonar, renal), mediastino, pleura, peritônio, retroperitônio, córtex, substância branca/cinzenta, corpo caloso, ventrículos, lobos (frontal, parietal, temporal, occipital), giros, sulcos, fígado, baço, pâncreas, rins, adrenais, aorta, veia cava.
*   **Patologias e achados:** nódulo, massa, lesão (expansiva, infiltrativa, focal), cisto, abscesso, hematoma, fratura, luxação, derrame (pleural, pericárdico, articular), edema, isquemia, infarto, estenose, aneurisma, metástase, neoplasia, carcinoma, adenoma, atelectasia, consolidação, opacidade, calcificação, espessamento.
*   **Descrições:** bem delimitado, mal delimitado, regular, irregular, espiculado, lobulado, circunscrito, difuso, focal, homogêneo, heterogêneo.
*   **Abreviações e siglas:** TC (tomografia computadorizada), RM (ressonância magnética), US (ultrassonografia), RX (radiografia), PET-CT, AVC, TEP.

Esteja preparado para transcrever corretamente termos ditados rapidamente, incluindo medidas (ex: "medindo 1,5 por 2,3 centímetros"), e a soletração de nomes ou termos complexos. Reconheça e transcreva corretamente a pontuação ditada, como "vírgula", "ponto", "dois pontos" e "ponto e vírgula".

A palavra "vírgula" deve ser transcrita como "," ao invés de "virgula".
A palavra "ponto" deve ser transcrita como "." ao invés de "ponto".
A palavra "parágrafo" deve ser transcrita como "\n\n" ao invés de "parágrafo".
A palavra "dois pontos" deve ser transcrita como ":" ao invés de "dois pontos".
A palavra "ponto e vírgula" deve ser transcrita como ";" ao invés de "ponto e vírgula".

Tome cuidado ao inserir pontuação, pois o áudio pode conter ou não pontuação falada. Evite repetir pontuação que já foi dita pelo médico.

Exemplos de transcrição:

---

### **Exemplo 1: Raio X de Tórax**

**Ditado:**
Opacidade heterogênea no lobo superior direito vírgula associada a broncogramas aéreos vírgula sugerindo processo consolidativo ponto parágrafo Hilos pulmonares de configuração normal vírgula sem alargamento do mediastino ponto Índice cardiotorácico no limite superior da normalidade ponto

**Transcrito:**
Opacidade heterogênea no lobo superior direito, associada a broncogramas aéreos, sugerindo processo consolidativo.\n\nHilos pulmonares de configuração normal, sem alargamento do mediastino. Índice cardiotorácico no limite superior da normalidade.

---

### **Exemplo 2: Tomografia Computadorizada de Abdome**

**Ditado:**
Nódulo hipodenso no segmento hepático sete vírgula medindo cerca de 2,5 centímetros no maior eixo ponto Após a injeção do meio de contraste iodado vírgula a lesão apresenta realce anelar periférico na fase arterial vírgula com tendência à centrifugação nas fases portal e de equilíbrio ponto parágrafo Demais segmentos hepáticos sem alterações significativas ponto Baço vírgula pâncreas e rins de aspecto tomográfico preservado ponto

**Transcrito:**
Nódulo hipodenso no segmento hepático sete, medindo cerca de 2,5 centímetros no maior eixo. Após a injeção do meio de contraste iodado, a lesão apresenta realce anelar periférico na fase arterial, com tendência à centrifugação nas fases portal e de equilíbrio.\n\nDemais segmentos hepáticos sem alterações significativas. Baço, pâncreas e rins de aspecto tomográfico preservado.

---

### **Exemplo 3: Ressonância Magnética de Crânio**

**Ditado:**
Foco de hipersinal em T2 e FLAIR na substância branca periventricular direita vírgula sem correspondente restrição à difusão ou realce anômalo pelo gadolínio ponto O achado é inespecífico vírgula podendo corresponder a gliose ou microangiopatia crônica ponto parágrafo Sistema ventricular de dimensões normais e centrado na linha média ponto Sulcos corticais de amplitude preservada para a faixa etária ponto

**Transcrito:**
Foco de hipersinal em T2 e FLAIR na substância branca periventricular direita, sem correspondente restrição à difusão ou realce anômalo pelo gadolínio. O achado é inespecífico, podendo corresponder a gliose ou microangiopatia crônica.\n\nSistema ventricular de dimensões normais e centrado na linha média. Sulcos corticais de amplitude preservada para a faixa etária.

---

Seu resultado deve ser estritamente o texto transcrito. Produza apenas as palavras faladas, mantendo o output livre de quaisquer comentários, explicações ou metadados.`,
          }
        ],
      };

      const parts: any[] = [
        {
          inlineData: {
            data: base64Audio,
            mimeType: 'audio/wav',
          },
        },
      ];

      // Add previous transcription context if available
      if (previousTranscription) {
        parts.push({
          text: `Contexto da transcrição anterior: "${previousTranscription}"\n\nTranscreva o áudio atual:`,
        });
      } else {
        parts.push({
          text: 'Transcreva o áudio',
        });
      }

      const contents = [
        {
          role: 'user',
          parts: parts,
        },
      ];

      const response = await geminiAI.models.generateContent({
        model: 'gemini-2.5-pro',
        config,
        contents,
      });

      let transcription = "";
      // The API can return an empty response.text if the audio is silent.
      // We need to handle this gracefully to avoid JSON.parse errors on empty strings.
      if (response && response.text) {
          try {
              // Some models might return a JSON string with a 'text' property.
              const parsed = JSON.parse(response.text);
              transcription = parsed.text || response.text;
          } catch (e) {
              // If it's not valid JSON, it's a plain string.
              transcription = response.text;
          }
      }

      console.log(`Transcription result for turn ${turnId}:`, transcription);

      // If the transcription is not empty, update the turn.
      // Otherwise, keep the interim text.
      if (transcription) {
          setTurns(prevTurns =>
            prevTurns.map(turn =>
              turn.id === turnId ? { ...turn, text: transcription, status: 'final' } : turn
            )
          );
      } else {
          // If the final transcription is empty (e.g., silence), 
          // we can just finalize the turn without changing the text,
          // preserving the interim transcription.
          console.warn(`Received empty transcription for turn ${turnId}. Finalizing turn with interim text.`);
          setTurns(prevTurns =>
            prevTurns.map(turn =>
              turn.id === turnId ? { ...turn, status: 'final' } : turn
            )
          );
      }

      return transcription;
    } catch (error) {
      console.error(`Error transcribing audio for turn ${turnId}:`, error);
      // Optionally update turn status to 'error'
      setTurns(prevTurns =>
        prevTurns.map(turn =>
          turn.id === turnId ? { ...turn, text: "Erro na transcrição.", status: 'final' } : turn
        )
      );
      return "Erro na transcrição";
    }
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
    const onTurnComplete = async () => {
      console.log("Turn complete! Input audio chunks collected:", currentTurnInputAudioChunks.length);
      
      const completedTurn = turns.find(t => t.status === 'live');

      // Concatenate all input audio chunks from this turn
      if (currentTurnInputAudioChunks.length > 0 && completedTurn) {
        console.log(`Processing input audio for turn ${completedTurn.id} with`, currentTurnInputAudioChunks.length, "chunks");
        
        // Mark the turn as 'interim' while waiting for final transcription
        setTurns(prevTurns =>
          prevTurns.map(turn =>
            turn.id === completedTurn.id ? { ...turn, status: 'interim' } : turn
          )
        );

        const concatenatedAudio = concatenateBase64AudioChunks(currentTurnInputAudioChunks);
        console.log("Concatenated input audio size:", concatenatedAudio.byteLength, "bytes");
        
        // Transcribe the audio using Gemini API for the specific turn
        try {
          await transcribeAudio(concatenatedAudio, completedTurn.id);
          console.log(`Transcription request sent for turn ${completedTurn.id}`);
        } catch (error) {
          console.error(`Transcription failed for turn ${completedTurn.id}:`, error);
        }
        
      } else {
        console.log("No input audio chunks or live turn to process");
      }
      
      // Clear input audio chunks and transcription text for next turn
      setCurrentTurnInputAudioChunks([]);
      setTranscriptionText("");
    };

    client.on("turncomplete", onTurnComplete);

    return () => {
      client.off("turncomplete", onTurnComplete);
    };
  }, [client, currentTurnInputAudioChunks, turns]);

  // Listen for transcription events
  useEffect(() => {
    const onTranscription = (text: string) => {
      if (!text) return;

      setTurns(prevTurns => {
        const liveTurn = prevTurns.find(t => t.status === 'live');

        if (liveTurn) {
          // If a live turn exists, append text to it
          return prevTurns.map(turn =>
            turn.id === liveTurn.id
              ? { ...turn, text: turn.text + text }
              : turn
          );
        } else {
          // If no live turn, create a new one
          turnCounter.current += 1;
          const newTurn: TranscriptionTurn = {
            id: turnCounter.current,
            text: text,
            status: 'live',
          };
          return [...prevTurns, newTurn];
        }
      });
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
        
        // Extract text from all text parts for refinement
        const refinedText = data.modelTurn.parts
          .filter((part) => part.text)
          .map((part) => part.text)
          .join(" ");

        if (refinedText) {
          // Find the latest 'interim' turn and update its text as a refinement
          setTurns(prevTurns => {
            // Find the last turn that was marked as 'interim'
            const lastInterimTurnIndex = prevTurns.findLastIndex(t => t.status === 'interim');
            
            if (lastInterimTurnIndex > -1) {
              const newTurns = [...prevTurns];
              newTurns[lastInterimTurnIndex] = {
                ...newTurns[lastInterimTurnIndex],
                text: refinedText,
              };
              return newTurns;
            }
            return prevTurns;
          });
        }
      }
    };

    client.on("content", onContent);

    return () => {
      client.off("content", onContent);
    };
  }, [client]);

  // Combine turns into a single string for display, applying formatting rules
  const displayText = turns
    .map(turn => turn.text)
    .join(' ')
    .replaceAll(".", ". ")
    .replaceAll("ponto", ". ")
    .replaceAll("vírgula", ", ")
    .replaceAll(", ,", ", ")
    .replaceAll(".parágrafo", ".\n\n")
    .replaceAll(". parágrafo", ".\n\n")
    .replaceAll("parágrafo", "\n\n")
    .replaceAll(", .", ".")
    .replaceAll("paragrafo", "\n\n")
    .replaceAll("?", "? ")
    .replaceAll("!", "! ")
    .replaceAll("  ", " ")
    .trim();

  // Clear function that clears all texts
  const clearAllText = () => {
    setTurns([]);
    turnCounter.current = 0;
    setTranscriptionText("");
    setModelTurnText("");
    setTranscriptionResults("");
    setPreviousTranscription("");
  };

  return (
    <div className="streaming-console">
      <SidePanel />
      <main>
        <div className="main-app-area">
          {/* APP goes here */}
          <Altair />
          {/* Editor Component */}
          <Editor 
            transcriptionText={displayText}
            onClear={clearAllText}
          />
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
