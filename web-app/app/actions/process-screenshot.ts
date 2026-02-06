"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

// Define the return type
export interface Contact {
  name: string;
  phone: string;
  mobile?: string;
  email?: string;
  skip?: boolean;
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

  // Use gemini-2.0-flash-lite for high quality OCR and reasoning
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

  const prompt = `
    You are an expert OCR assistant specialized in extracting contact information from government CRM screenshots.
    
    Analyze the provided image. Identify lists of contacts in a 4-column format: Name, Email, Mobile Phone Number, Phone Number.
    
    For each contact found, extract:
    - Name
    - Email
    - Mobile Phone Number
    - Phone Number

    PHONE FORMATTING RULES:
    - ALL phone numbers MUST start with the "+" symbol.
    - If a number is 10 digits and from North America (Canada/USA), format it as +1XXXXXXXXXX.
    - Remove all dashes, spaces, and parentheses.

    GOVERNMENT LINE FILTERING RULES:
    - Flag a contact as "skip: true" IF:
        1. Both phone numbers are missing or invalid.
        2. The numbers end in "00", "000", or "0000" (typical for main ministry lines).
        3. The text context suggests it is a "General Line" or "Reception".
        4. Use your knowledge to discern if a number is official or not. For example: +1 613-993-7267 is the Royal Mounted Police number and doesn't end in 00.
    - Focus on finding direct mobile numbers.

    Return ONLY a valid JSON array of objects using these EXACT keys: "name", "email", "mobile", "phone". Do not wrap in markdown.
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

    // Clean up potential markdown formatting
    const cleanedText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let rawContacts: any[] = JSON.parse(cleanedText);
    
    // Normalize keys just in case
    let contacts: Contact[] = rawContacts.map((c: any) => ({
      name: c.name || c.Name || "",
      email: c.email || c.Email || "",
      mobile: c.mobile || c.Mobile || c["Mobile Phone Number"] || "",
      phone: c.phone || c.Phone || c["Phone Number"] || "",
      skip: c.skip || false
    }));

    // Post-processing: Ensure strict formatting and logic redundancy
    contacts = contacts.map(contact => {
      const cleanNumber = (num?: any) => {
        if (!num) return "";
        let cleaned = String(num).replace(/\D/g, ""); // Remove all non-digits
        if (cleaned.length === 10) cleaned = "1" + cleaned; // Add +1 for Canada/USA 10-digit
        return cleaned ? "+" + cleaned : "";
      };

      const mobile = cleanNumber(contact.mobile);
      const phone = cleanNumber(contact.phone);

      // Gov Line Check: End in 00 or 000
      const isGovLine = (n: string) => n.endsWith("00") || n.endsWith("000");
      
      // If the AI flagged it, or if it meets our switchboard criteria
      const shouldSkip = contact.skip || (!mobile && !phone) || (isGovLine(mobile) && isGovLine(phone));

      return {
        ...contact,
        mobile,
        phone,
        skip: !!shouldSkip
      };
    });

    return contacts;
  } catch (error) {
    console.error("Error processing screenshot with Gemini:", error);
    throw new Error("Failed to extract contacts from image.");
  }
}