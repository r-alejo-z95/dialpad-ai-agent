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

// Use the requested model.
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const prompt = `
    You are an expert OCR assistant specialized in extracting contact information from government CRM screenshots.
    
    Analyze the provided image. Identify lists of contacts in a 4-column format: Name, Email, Mobile Phone Number, Phone Number.
    
    For each contact found, extract:
    - Name
    - Email
    - Mobile Phone Number (format it as a clean string)
    - Phone Number (format it as a clean string)

    CRITICAL RULE:
    - Many contacts are government officials. If BOTH phone numbers are general ministry/department switchboards (usually ending in "00", "000", or containing broad extensions like "General Line"), or if no personal numbers are found, flag the contact as "skip: true".
    - Focus on finding direct mobile numbers.

    Return ONLY a valid JSON array of objects.
    Example format:
    [
      { 
        "name": "John Doe", 
        "email": "john@gov.co", 
        "mobile": "+1234567890", 
        "phone": "+1234567000",
        "skip": false 
      }
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
