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
import { useEffect, useRef, useState, memo } from "react";
import vegaEmbed from "vega-embed";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  StartSensitivity,
  EndSensitivity,
  Type,
} from "@google/genai";

const declaration: FunctionDeclaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      json_graph: {
        type: Type.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object",
      },
    },
    required: ["json_graph"],
  },
};

function AltairComponent() {
  const [jsonString, setJSONString] = useState<string>("");
  const { client, setConfig, setModel } = useLiveAPIContext();

  useEffect(() => {
    setModel("models/gemini-2.0-flash-exp");
    setConfig({
      responseModalities: [Modality.TEXT],
      inputAudioTranscription: {
        enabled: true,
        languageCode: "pt-BR",
        model: "nova-2-flash-001",
        enableAutomaticPunctuation: true,
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false, // default
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
          prefixPaddingMs: 20,
          silenceDurationMs: 1000,
        }
      },
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: `Você é um sistema de transcrição de voz em tempo real altamente eficiente, especialmente treinado e otimizado para o ambiente de laudos de radiologia. Sua tarefa exclusiva é transcrever o áudio que está sendo transmitido continuamente por um médico radiologista.

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

Seu resultado deve ser estritamente o texto transcrito. Produza apenas as palavras faladas, mantendo o output livre de quaisquer comentários, explicações ou metadados.

O áudio será fornecido em um fluxo contínuo. A cada 100 milisegundos de áudio processado, retorne o trecho de texto transcrito correspondente até aquele momento. Inicie a transcrição e o envio dos resultados imediatamente com o início do áudio, processando o fluxo de forma contínua, sem aguardar por pausas ou pelo término da transmissão. Concentre-se em fornecer a transcrição com a máxima velocidade, mesmo que as primeiras versões de um trecho sejam refinadas posteriormente com mais contexto.

Se o áudio parar ou a conexão for interrompida, finalize a transcrição do último trecho recebido. Seu output deve ser exclusivamente o texto transcrito.`
          },
        ],
      },
      tools: [
        // there is a free-tier quota for search
        { googleSearch: {} },
        { functionDeclarations: [declaration] },
      ]
    });
  }, [setConfig, setModel]);

  useEffect(() => {
    const onToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) {
        return;
      }
      const fc = toolCall.functionCalls.find(
        (fc) => fc.name === declaration.name
      );
      if (fc) {
        const str = (fc.args as any).json_graph;
        setJSONString(str);
      }
      // send data for the response of your tool call
      // in this case Im just saying it was successful
      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls?.map((fc) => ({
                response: { output: { success: true } },
                id: fc.id,
                name: fc.name,
              })),
            }),
          200
        );
      }
    };
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedRef.current && jsonString) {
      console.log("jsonString", jsonString);
      vegaEmbed(embedRef.current, JSON.parse(jsonString));
    }
  }, [embedRef, jsonString]);
  return <div className="vega-embed" ref={embedRef} />;
}

export const Altair = memo(AltairComponent);
