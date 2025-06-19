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
          // startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          // endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          // prefixPaddingMs: 20,
          silenceDurationMs: 50,
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

Por exemplo:

Leves alterações degenerativas acromioclaviculares vírgula caracterizadas por irregularidades vírgula cistos e focos de edema ósseo subcondral ponto parágrafo acúmulo de líquido na bursa subacromiodeltoidea vírgula decorrente de bursite ponto

Deve ser transcrito como:

Leves alterações degenerativas acromioclaviculares, caracterizadas por irregularidades, cistos e focos de edema ósseo subcondral.\n\nAcúmulo de líquido na bursa subacromiodeltoidea, decorrente de bursite.

Seu resultado deve ser estritamente o texto transcrito. Produza apenas as palavras faladas, mantendo o output livre de quaisquer comentários, explicações ou metadados.

O áudio será fornecido em um fluxo contínuo. A cada 1000 milisegundos de áudio processado, retorne o trecho de texto transcrito correspondente até aquele momento. Inicie a transcrição e o envio dos resultados imediatamente com o início do áudio, processando o fluxo de forma contínua, sem aguardar por pausas ou pelo término da transmissão. Concentre-se em fornecer a transcrição com a máxima velocidade, mesmo que as primeiras versões de um trecho sejam refinadas posteriormente com mais contexto.

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
