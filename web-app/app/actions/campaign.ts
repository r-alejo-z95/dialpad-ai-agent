"use server";

import { prisma } from "../lib/prisma";
import { Contact } from "./process-screenshot";

export async function createCampaign(name: string, conferenceInfo: string, dynamicPrompt: string, contacts: Contact[]) {
  try {
    // Filter out entries that are completely empty to avoid database corruption
    const validContacts = contacts.filter(c => c.name || c.mobile || c.phone);

    const campaign = await prisma.campaign.create({
      data: {
        name,
        conferenceInfo,
        dynamicPrompt,
        contacts: {
          create: validContacts.map(c => ({
            name: c.name || "Unknown Contact", // Prisma requires a string for name
            email: c.email || null,
            mobile: c.mobile || null,
            phone: c.phone || null,
            skip: c.skip || false,
          }))
        }
      },
      include: {
        contacts: {
          orderBy: { createdAt: "asc" }
        }
      }
    });
    return { success: true, campaign };
  } catch (error: any) {
    console.error("Error creating campaign:", error);
    return { success: false, error: error.message };
  }
}

export async function updateContactStatus(contactId: string, status: string, outcome?: string) {
  try {
    await prisma.contact.update({
      where: { id: contactId },
      data: { status, outcome }
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating contact status:", error);
    return { success: false, error: error.message };
  }
}

export async function updateCampaignIndex(campaignId: string, index: number) {
  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { lastIndex: index }
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error updating campaign index:", error);
    return { success: false, error: error.message };
  }
}

export async function getCampaigns() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { contacts: true } } }
    });
    return { success: true, campaigns };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCampaignWithContacts(campaignId: string) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { contacts: { orderBy: { createdAt: "asc" } } }
    });
    return { success: true, campaign };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function addContactsToCampaign(campaignId: string, contacts: Contact[]) {
  try {
    // 1. Get existing contact fingerprints
    const existing = await prisma.contact.findMany({
      where: { campaignId },
      select: { email: true, mobile: true, phone: true }
    });

    const existingKeys = new Set(
      existing.map(e => `${e.email || ""}-${e.mobile || ""}-${e.phone || ""}`)
    );

    // 2. Filter new contacts
    const seenInBatch = new Set();
    const newContacts = contacts.filter(c => {
      if (!c.name && !c.mobile && !c.phone) return false;
      const key = `${c.email || ""}-${c.mobile || ""}-${c.phone || ""}`;
      if (existingKeys.has(key) || seenInBatch.has(key)) return false;
      seenInBatch.add(key);
      return true;
    });

    if (newContacts.length > 0) {
      await prisma.contact.createMany({
        data: newContacts.map(c => ({
          campaignId,
          name: c.name || "Unknown Contact",
          email: c.email || null,
          mobile: c.mobile || null,
          phone: c.phone || null,
          skip: c.skip || false,
        }))
      });
    }

    // Return the full updated list
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { contacts: { orderBy: { createdAt: "asc" } } }
    });

    return { success: true, contacts: updatedCampaign?.contacts || [] };
  } catch (error: any) {
    console.error("Error adding contacts:", error);
    return { success: false, error: error.message };
  }
}

export async function updateContact(contactId: string, data: Partial<{ name: string, email: string, mobile: string, phone: string, skip: boolean, status: string, lastCalledAt: Date }>) {
  try {
    const updated = await prisma.contact.update({
      where: { id: contactId },
      data
    });
    return { success: true, contact: updated };
  } catch (error: any) {
    console.error("Error updating contact:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteCampaign(campaignId: string) {
  try {
    // Delete contacts first (manual cascade)
    await prisma.contact.deleteMany({
      where: { campaignId }
    });

    await prisma.campaign.delete({
      where: { id: campaignId }
    });
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting campaign:", error);
    return { success: false, error: error.message };
  }
}

export async function cleanupEmptyCampaigns() {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        _count: {
          select: { contacts: true }
        }
      }
    });

    const emptyCampaigns = campaigns.filter(c => c._count.contacts === 0);
    const count = emptyCampaigns.length;

    for (const campaign of emptyCampaigns) {
      await prisma.campaign.delete({
        where: { id: campaign.id }
      });
    }

    return { success: true, count };
  } catch (error: any) {
    console.error("Error cleaning up campaigns:", error);
    return { success: false, error: error.message };
  }
}
