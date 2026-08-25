import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askGeminiAboutPage(
  prompt: string,
  base64Image: string,
  mimeType: string = "image/png"
): Promise<string> {
  try {
    const imagePart = {
      inlineData: {
        data: base64Image.split(",")[1] || base64Image, // Remove data URI prefix if present
        mimeType,
      },
    };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [imagePart, textPart] },
      config: {
        systemInstruction: "You are an expert study assistant helping a student understand lecture slides and notes. You analyze the provided page image and answer the student's questions concisely and clearly. Format your output in markdown, using bullet points, short sections, and definitions where appropriate. Do not write overly long paragraphs unless explicitly requested.",
      }
    });

    return response.text || "No response generated.";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to get response from AI. Please try again.");
  }
}
