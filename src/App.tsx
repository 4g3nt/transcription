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
import { Editor } from "./components/editor/Editor";
import { MarkdownPreview } from "./components/editor/MarkdownPreview";
import ControlTray from "./components/control-tray/ControlTray";
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

function AppContent() {
  // this video reference is used for displaying the active stream, whether that is the screen capture or the video
  // feel free to style as you see fit
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptionDisplayRef = useRef<HTMLDivElement>(null);
  const transcriptionLogRef = useRef<HTMLDivElement>(null);
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
  // state to track editor text for preview
  const [editorText, setEditorText] = useState<string>("# Laudo de Radiologia\n\n");
  // state to track if preview is shown
  const [showPreview, setShowPreview] = useState<boolean>(true);
  // state to track if transcription log is shown
  const [showTranscriptionLog, setShowTranscriptionLog] = useState<boolean>(true);
  // state to track transcription log entries
  const [transcriptionLog, setTranscriptionLog] = useState<Array<{
    id: string;
    text: string;
    audioBuffer: ArrayBuffer;
    timestamp: Date;
    disliked?: boolean;
    edited?: boolean;
  }>>([]);
  // state to track which entry is being actively edited
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  // state to track editing text for the currently edited entry
  const [editingText, setEditingText] = useState<string>('');
  // Voice activity detection threshold (0.005 = very sensitive, 0.05 = less sensitive)
  const [vadThreshold, setVadThreshold] = useState<number>(0.01);
  
  const { client, connected } = useLiveAPIContext();

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

  // Function to detect voice activity and trim silence from audio buffer
  const trimSilenceFromAudio = (audioBuffer: ArrayBuffer, threshold: number = 0.01, sampleRate: number = 16000): ArrayBuffer => {
    const int16Array = new Int16Array(audioBuffer);
    const samples = int16Array.length;
    
    if (samples === 0) return audioBuffer;
    
    // Convert threshold to int16 range (-32768 to 32767)
    const amplitudeThreshold = threshold * 32767;
    
    // Find the start of voice activity
    let startIndex = 0;
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms window
    
    for (let i = 0; i < samples - windowSize; i += windowSize) {
      // Calculate RMS (Root Mean Square) for current window
      let sum = 0;
      for (let j = i; j < Math.min(i + windowSize, samples); j++) {
        const sample = int16Array[j];
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / windowSize);
      
      // If RMS exceeds threshold, we found voice activity
      if (rms > amplitudeThreshold) {
        startIndex = Math.max(0, i - windowSize); // Include one window before for context
        break;
      }
    }
    
    // If no voice activity found, return original buffer
    if (startIndex === 0) {
      // Check if there's any significant audio at all
      let hasAudio = false;
      for (let i = 0; i < samples; i++) {
        if (Math.abs(int16Array[i]) > amplitudeThreshold) {
          hasAudio = true;
          break;
        }
      }
      if (!hasAudio) {
        console.log("No voice activity detected in entire audio chunk");
        return new ArrayBuffer(0); // Return empty buffer if no voice activity
      }
      return audioBuffer;
    }
    
    // Calculate end index - remove last 2 seconds from the audio
    const samplesToRemoveFromEnd = Math.floor(sampleRate * 2); // 2 seconds worth of samples
    let endIndex = samples - samplesToRemoveFromEnd;
    
    // Make sure we don't remove more than we have
    if (endIndex <= startIndex) {
      // If trimming would remove all audio, keep at least 0.5 seconds
      const minSamples = Math.floor(sampleRate * 0.5);
      endIndex = Math.min(samples, startIndex + minSamples);
    }
    
    const trimmedFromStart = startIndex;
    const trimmedFromEnd = samples - endIndex;
    
    console.log(`Trimming ${trimmedFromStart} samples (${(trimmedFromStart / sampleRate * 1000).toFixed(1)}ms) from beginning and ${trimmedFromEnd} samples (${(trimmedFromEnd / sampleRate * 1000).toFixed(1)}ms) from end of audio`);
    
    // Create new buffer with trimmed audio
    const trimmedSamples = endIndex - startIndex;
    const trimmedBuffer = new ArrayBuffer(trimmedSamples * 2); // 2 bytes per sample (int16)
    const trimmedInt16Array = new Int16Array(trimmedBuffer);
    
    // Copy trimmed audio data
    for (let i = 0; i < trimmedSamples; i++) {
      trimmedInt16Array[i] = int16Array[startIndex + i];
    }
    
    return trimmedBuffer;
  };

  // Function to transcribe audio using Gemini API
  const transcribeAudio = async (audioBuffer: ArrayBuffer): Promise<string> => {
    try {
      console.log("Starting transcription with Gemini API...");
      
      // Trim silence from the beginning of the audio
      const trimmedAudioBuffer = trimSilenceFromAudio(audioBuffer, vadThreshold);
      
      // Skip transcription if no voice activity was detected
      if (trimmedAudioBuffer.byteLength === 0) {
        console.log("No voice activity detected, skipping transcription");
        return "";
      }
      
      // Convert audio to WAV format and then to base64
      const wavBuffer = createWavFile(trimmedAudioBuffer, 16000);
      const base64Audio = arrayBufferToBase64(wavBuffer);
      
      const config = {
        thinkingConfig: {
          thinkingBudget: -1,
        },
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
A palavra "abre parêntese" deve ser transcrita como "(" ao invés de "abre parêntese".
A palavra "fecha parêntese" deve ser transcrita como ")" ao invés de "fecha parêntese".

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

      const transcription = response.text || JSON.parse(response.text || '')?.text || '';
      console.log("Transcription result:", transcription);
      return transcription;
    } catch (error) {
      console.error("Error transcribing audio:", error);
      return "Erro na transcrição";
    }
  };

  // Function to create blob URL and open in new window
  const openInputAudioInNewWindow = (audioBuffer: ArrayBuffer) => {
    if (audioBuffer.byteLength === 0) return;
    
          // Trim silence from the beginning of the audio for playback
      const trimmedAudioBuffer = trimSilenceFromAudio(audioBuffer, vadThreshold);
      
      if (trimmedAudioBuffer.byteLength === 0) {
        console.log("No voice activity detected, skipping audio playback");
        return;
      }
    
    // Convert PCM data to WAV format (16kHz for input audio)
    const wavBuffer = createWavFile(trimmedAudioBuffer, 16000);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    console.log("Audio URL:", url);
    
    // Open in new window
    /* const newWindow = window.open('', '_blank');
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
    } */
  };

  // Listen for turn complete events to process collected input audio
  useEffect(() => {
    const onTurnComplete = async () => {
      console.log("Turn complete! Input audio chunks collected:", currentTurnInputAudioChunks.length);
      
      // Concatenate all input audio chunks from this turn
      if (currentTurnInputAudioChunks.length > 0) {
        console.log("Processing input audio with", currentTurnInputAudioChunks.length, "chunks");
        const concatenatedAudio = concatenateBase64AudioChunks(currentTurnInputAudioChunks);
        console.log("Concatenated input audio size:", concatenatedAudio.byteLength, "bytes");
        
        // Capture the current turn's text to clear only this specific text later
        const currentModelText = modelTurnText;
        const currentTranscriptionText = transcriptionText;
        
        // Also open the audio in a new window for playback
        openInputAudioInNewWindow(concatenatedAudio);

        // Transcribe the audio using Gemini API
        try {
          // setTranscriptionResults("Transcrevendo...");
          const transcription = await transcribeAudio(concatenatedAudio);
          
          // Only add to log if transcription was successful and not empty
          if (transcription && transcription.trim()) {
            // Use trimmed audio for consistent playback in the log
            const trimmedAudio = trimSilenceFromAudio(concatenatedAudio, vadThreshold);
            
            // Add to transcription log
            const logEntry = {
              id: Date.now().toString(),
              text: transcription,
              audioBuffer: trimmedAudio.byteLength > 0 ? trimmedAudio : concatenatedAudio,
              timestamp: new Date(),
              disliked: false,
            };
            setTranscriptionLog(prev => [...prev, logEntry]);
          }
          
          // Concatenate the transcription results with proper formatting (only if transcription is not empty)
          if (transcription && transcription.trim()) {
            setTranscriptionResults(prev => {
              const newResult = prev ? prev + "\n\n" + transcription : transcription;
              return newResult;
            });
            // Update previous transcription for context
            setPreviousTranscription(transcription);
          }
          
          console.log("Turn completed - State before clearing:", {
            currentModelText: currentModelText.substring(0, 50),
            currentTranscriptionText: currentTranscriptionText.substring(0, 50),
            transcriptionResultsLength: transcriptionResults.length
          });
          
          // Clear the modelTurnText completely after turn completion
          // This ensures the Editor can detect the next turn completion
          console.log("Clearing modelTurnText and transcriptionText after turn completion");
          setModelTurnText("");
          setTranscriptionText(current => {
            // Only clear if the text is still the same as when this turn completed
            return current === currentTranscriptionText ? "" : current;
          });
          
          console.log("Transcription completed:", transcription);
        } catch (error) {
          console.error("Transcription failed:", error);
          setTranscriptionResults("Erro na transcrição");
        }
        
      } else {
        console.log("No input audio chunks to process");
      }
      
      // Clear input audio chunks for next turn
      setCurrentTurnInputAudioChunks([]);
    };

    client.on("turncomplete", onTurnComplete);

    return () => {
      client.off("turncomplete", onTurnComplete);
    };
  }, [client, currentTurnInputAudioChunks, previousTranscription, modelTurnText, transcriptionText, vadThreshold]);

  // Listen for transcription events
  useEffect(() => {
    const onTranscription = (text: string) => {
      // Keep previous model text visible during live transcription
      // Only clear it when a new model turn arrives or turn completes
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
        let textParts = data.modelTurn.parts
          .filter((part) => part.text && part.text)
          .map((part) => part.text)
          .join(" ")
          .replaceAll(".", ". ")
          .replaceAll("ponto", ". ")
          .replaceAll("vírgula", ", ")
          .replaceAll(", ,", ", ")
          .replaceAll(".parágrafo", ".\n\n")
          .replaceAll(". parágrafo", ".\n\n")
          .replaceAll("parágrafo", "\n\n")
          .replaceAll(", .", ".")
          .replaceAll("paragrafo", "\n\n")
          .replaceAll("abre parêntese", "(")
          .replaceAll("abre parentese", "(")
          .replaceAll("fecha parêntese", ")")
          .replaceAll("fecha parentese", ")")
          .replaceAll("?", "? ")
          .replaceAll("!", "! ")
          .replaceAll("  ", " ")
          ;
          textParts = textParts.replaceAll("  ", " ");

        if (textParts) {
          // Clear transcription text when AI response arrives to show the AI response
          setTranscriptionText("");
          // Accumulate the modelTurn text instead of replacing it
          setModelTurnText(prev => (prev + textParts)?.trim());
        }
      }
    };

    client.on("content", onContent);

    return () => {
      client.off("content", onContent);
    };
  }, [client]);

  // Clear function that clears all texts
  const clearAllText = () => {
    setTranscriptionText("");
    setModelTurnText("");
    setTranscriptionResults("");
    setPreviousTranscription("");
    setTranscriptionLog([]);
  };

  const handleDislike = (id: string) => {
    setTranscriptionLog(prevLog =>
      prevLog.map(entry => {
        if (entry.id === id) {
          // Prevent undoing dislike if the entry was edited
          if (entry.edited && entry.disliked) {
            return entry;
          }
          return { ...entry, disliked: !entry.disliked };
        }
        return entry;
      })
    );
    // If undoing dislike, stop editing
    if (editingEntryId === id) {
      setEditingEntryId(null);
      setEditingText('');
    }
  };

  const handleTextClick = (id: string, currentText: string) => {
    // Only allow editing if the entry is disliked
    const entry = transcriptionLog.find(e => e.id === id);
    if (entry?.disliked) {
      setEditingEntryId(id);
      setEditingText(currentText);
    }
  };

  const handleTextChange = (newText: string) => {
    setEditingText(newText);
  };

  const handleTextBlur = () => {
    if (editingEntryId) {
      // Save the edited text and mark as edited
      setTranscriptionLog(prevLog =>
        prevLog.map(entry =>
          entry.id === editingEntryId ? { ...entry, text: editingText, edited: true } : entry
        )
      );
      // Clear editing state
      setEditingEntryId(null);
      setEditingText('');
    }
  };

  // Check if any transcription text is available to show the editor
  const hasTranscriptionText = transcriptionText || modelTurnText || transcriptionResults;

  // Determine what text to display: combine accumulated results with current live transcription
  const currentTurnText = transcriptionText 
    ? (modelTurnText + (modelTurnText ? " " : "") + transcriptionText).trim()
    : modelTurnText;
  
  let displayText = "";
  if (transcriptionResults && currentTurnText) {
    // Show both accumulated results and current turn
    displayText = transcriptionResults + "\n\n" + currentTurnText;
  } else if (transcriptionResults) {
    // Only accumulated results
    displayText = transcriptionResults;
  } else if (currentTurnText) {
    // Only current turn
    displayText = currentTurnText;
  }

  // Apply additional punctuation replacements for Portuguese medical transcription
  displayText = displayText
    .replaceAll(".", ". ")
    .replaceAll("ponto", ". ")
    .replaceAll("vírgula", ", ")
    .replaceAll(", ,", ", ")
    .replaceAll(".parágrafo", ".\n\n")
    .replaceAll(". parágrafo", ".\n\n")
    .replaceAll("parágrafo", "\n\n")
    .replaceAll(", .", ".")
    .replaceAll("paragrafo", "\n\n")
    .replaceAll("abre parêntese", "(")
    .replaceAll("abre parentese", "(")
    .replaceAll("fecha parêntese", ")")
    .replaceAll("fecha parentese", ")")
    .replaceAll("?", "? ")
    .replaceAll("!", "! ")
    .replaceAll("  ", " ");
  
  displayText = displayText.replaceAll("  ", " ")?.trim();

  useEffect(() => {
    if (transcriptionDisplayRef.current) {
      transcriptionDisplayRef.current.scrollTop =
        transcriptionDisplayRef.current.scrollHeight;
    }
  }, [displayText]);

  // Auto-scroll transcription log when new entries are added
  const [transcriptionLogLength, setTranscriptionLogLength] = useState(0);
  
  useEffect(() => {
    // Only scroll if the length has increased (new entry added)
    if (transcriptionLog.length > transcriptionLogLength) {
      if (transcriptionLogRef.current) {
        transcriptionLogRef.current.scrollTop = transcriptionLogRef.current.scrollHeight;
      }
    }
    setTranscriptionLogLength(transcriptionLog.length);
  }, [transcriptionLog, transcriptionLogLength]);

  const displayTitle = (() => {
    if (transcriptionResults && currentTurnText) {
      return "Transcrevendo...";
    } else if (transcriptionResults) {
      return "Transcrição finalizada";
    } else if (transcriptionText) {
      return "Transcrevendo em tempo real...";
    } else if (modelTurnText) {
      return "Refinando transcrição...";
    } else {
      return "Aguardando áudio...";
    }
  })();

  return (
    <div className="streaming-console">
      {/* <SidePanel /> */}
      <main>
        <div className="main-app-area">
          {/* APP goes here */}
          <Altair />
          {/* Editor and Preview Container */}
          <div
            className="editor-preview-container"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: showPreview && showTranscriptionLog ? '1400px' : showPreview || showTranscriptionLog ? '1100px' : '800px',
              height: '600px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Editor and Preview Layout */}
            <div
              className="editor-preview-layout"
              style={{
                display: 'flex',
                flex: 1,
                gap: '10px',
                minHeight: 0,
              }}
            >
              {/* Editor for transcription */}
              <div
                className="editor-wrapper"
                style={{
                  flex: 1,
                  height: '100%',
                }}
              >
                <Editor
                  transcriptionText={transcriptionText}
                  modelTurnText={modelTurnText}
                  transcriptionResults={transcriptionResults}
                  onClear={clearAllText}
                  onTextChange={setEditorText}
                  showPreview={showPreview}
                  onTogglePreview={() => setShowPreview(!showPreview)}
                  showTranscriptionLog={showTranscriptionLog}
                  onToggleTranscriptionLog={() => setShowTranscriptionLog(!showTranscriptionLog)}
                />
              </div>
              
              {/* Markdown Preview */}
              {showPreview && (
                <div
                  className="preview-wrapper"
                  style={{
                    flex: 1,
                    height: '100%',
                  }}
                >
                  <MarkdownPreview content={editorText} />
                </div>
              )}
              {/* Transcription Log */}
              {showTranscriptionLog && (
                <div className="transcription-log-wrapper">
                  <div className="transcription-log-header">
                    <span>Transcrições ({transcriptionLog.length})</span>
                  </div>
                  <div className="transcription-log-content" ref={transcriptionLogRef}>
                    {transcriptionLog.length === 0 ? (
                      <div className="transcription-log-empty">
                        Nenhuma transcrição ainda
                      </div>
                    ) : (
                      transcriptionLog.map((entry) => (
                        <div
                          key={entry.id}
                          className={`transcription-log-entry ${entry.disliked ? 'disliked' : ''}`}
                        >
                          <button
                            onClick={() => handleDislike(entry.id)}
                            className={`transcription-log-entry-button ${entry.disliked ? 'disliked' : ''} ${entry.edited && entry.disliked ? 'locked' : ''}`}
                            title={
                              entry.edited && entry.disliked 
                                ? "Transcrição editada (não pode ser revertida)" 
                                : entry.disliked 
                                  ? "Transcrição correta" 
                                  : "Transcrição errônea"
                            }
                          >
                            {entry.disliked ? '👎' : '👍'}
                          </button>
                          <div className="transcription-log-entry-timestamp">
                            {entry.timestamp.toLocaleTimeString()}
                          </div>
                          {editingEntryId === entry.id ? (
                            <div className="transcription-log-entry-edit">
                              <textarea
                                className="transcription-log-entry-textarea"
                                value={editingText}
                                onChange={(e) => handleTextChange(e.target.value)}
                                onBlur={handleTextBlur}
                                placeholder="Corrija a transcrição..."
                                rows={3}
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div 
                              className={`transcription-log-entry-text ${entry.disliked ? 'clickable' : ''}`}
                              onClick={() => handleTextClick(entry.id, entry.text)}
                              title={entry.disliked ? "Editar transcrição" : ""}
                            >
                              {entry.text}
                            </div>
                          )}
                          <audio
                            controls={!connected}
                            className="transcription-log-entry-audio"
                            src={URL.createObjectURL(
                              new Blob([createWavFile(entry.audioBuffer, 16000)], { type: 'audio/wav' })
                            )}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              
            </div>
            
            {/* Original transcription display as a log */}
            {/* <div
              ref={transcriptionDisplayRef}
              className="transcription-display"
              style={{
                background: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                maxHeight: '80px',
                overflow: 'auto',
                fontSize: '14px',
                lineHeight: '1.4',
                display: displayText ? 'block' : 'none',
              }}
            >
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{displayText}</p>
            </div> */}
          </div>
          <video
            className={cn('stream', {
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
