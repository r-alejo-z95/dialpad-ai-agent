"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

// Define the return type
export interface Contact {
  name: string;
  phone: string;
  organization?: string;
}

export async function processScreenshot(formData: FormData): Promise<Contact[]> {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file uploaded");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Image = buffer.toString("base64");

  // Use the requested model. Note: "gemini-2.0-flash-lite-preview-02-05" is the specific preview version for Flash 2.0 Lite.
  // If this specific model ID is not available in your region/tier, fall back to "gemini-1.5-flash".
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05" });

  const prompt = `
    You are an expert OCR assistant specialized in extracting contact information from HubSpot or similar CRM screenshots.
    
    Analyze the provided image. Identify lists of contacts.
    For each contact found, extract:
    - Name
    - Phone Number (format it as a clean string, e.g., "+15550123456" or "555-012-3456")
    - Organization (if visible, otherwise omit)

    Return ONLY a valid JSON array of objects. Do not wrap in markdown code blocks.
    Example format:
    [
      { "name": "John Doe", "phone": "+1234567890", "organization": "Acme Corp" },
      { "name": "Jane Smith", "phone": "987-654-3210" }
    ]
  `;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Image,
          mimeType: file.type || "image/png",
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    // Clean up potential markdown formatting if the model adds it despite instructions
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const contacts: Contact[] = JSON.parse(cleanedText);
    return contacts;
  } catch (error) {
    console.error("Error processing screenshot with Gemini:", error);
    throw new Error("Failed to extract contacts from image.");
  }
}
