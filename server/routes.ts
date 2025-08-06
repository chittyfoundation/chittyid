import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertVerificationSchema, insertBusinessSchema, insertVerificationRequestSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Also get the user's ChittyID if it exists
      let chittyId = null;
      if (user) {
        chittyId = await storage.getChittyIdByUserId(user.id);
      }
      
      res.json({ ...user, chittyId });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ChittyID routes
  app.post('/api/chittyid/create', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if user already has a ChittyID
      const existingChittyId = await storage.getChittyIdByUserId(userId);
      if (existingChittyId) {
        return res.status(400).json({ message: "User already has a ChittyID" });
      }

      // Generate a unique ChittyID code
      const chittyIdCode = `CH-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      
      const chittyId = await storage.createChittyId({
        userId,
        chittyIdCode,
        trustScore: 100, // Starting trust score
        trustLevel: 'L0',
        verificationStatus: 'pending',
      });

      res.json(chittyId);
    } catch (error) {
      console.error("Error creating ChittyID:", error);
      res.status(500).json({ message: "Failed to create ChittyID" });
    }
  });

  app.get('/api/chittyid/:code', async (req, res) => {
    try {
      const { code } = req.params;
      const chittyId = await storage.getChittyIdByCode(code);
      
      if (!chittyId) {
        return res.status(404).json({ message: "ChittyID not found" });
      }

      // Only return public information for external verification
      const publicInfo = {
        code: chittyId.chittyIdCode,
        trustScore: chittyId.trustScore,
        trustLevel: chittyId.trustLevel,
        verificationStatus: chittyId.verificationStatus,
        issuedAt: chittyId.issuedAt,
      };

      res.json(publicInfo);
    } catch (error) {
      console.error("Error fetching ChittyID:", error);
      res.status(500).json({ message: "Failed to fetch ChittyID" });
    }
  });

  // Verification routes
  app.post('/api/verifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chittyId = await storage.getChittyIdByUserId(userId);
      
      if (!chittyId) {
        return res.status(400).json({ message: "No ChittyID found for user" });
      }

      const validatedData = insertVerificationSchema.parse({
        ...req.body,
        chittyId: chittyId.id,
      });

      const verification = await storage.createVerification(validatedData);
      
      // Auto-approve basic verifications for demo purposes
      if (['email', 'phone'].includes(validatedData.verificationType)) {
        await storage.updateVerificationStatus(verification.id, 'verified', new Date());
        
        // Update trust score
        const currentTrustScore = chittyId.trustScore || 0;
        const newTrustScore = currentTrustScore + 50;
        let newTrustLevel = chittyId.trustLevel || 'L0';
        if (newTrustScore >= 200 && newTrustLevel === 'L0') newTrustLevel = 'L1';
        if (newTrustScore >= 500 && newTrustLevel === 'L1') newTrustLevel = 'L2';
        
        await storage.updateChittyIdTrustScore(chittyId.id, newTrustScore, newTrustLevel);
      }

      res.json(verification);
    } catch (error) {
      console.error("Error creating verification:", error);
      res.status(500).json({ message: "Failed to create verification" });
    }
  });

  app.get('/api/verifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chittyId = await storage.getChittyIdByUserId(userId);
      
      if (!chittyId) {
        return res.json([]);
      }

      const verifications = await storage.getVerificationsByChittyId(chittyId.id);
      res.json(verifications);
    } catch (error) {
      console.error("Error fetching verifications:", error);
      res.status(500).json({ message: "Failed to fetch verifications" });
    }
  });

  // Business routes
  app.get('/api/businesses', async (req, res) => {
    try {
      const businesses = await storage.getAllBusinesses();
      // Remove sensitive information
      const publicBusinesses = businesses.map(b => ({
        id: b.id,
        name: b.name,
        industry: b.industry,
        trustThreshold: b.trustThreshold,
      }));
      res.json(publicBusinesses);
    } catch (error) {
      console.error("Error fetching businesses:", error);
      res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  app.post('/api/businesses', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertBusinessSchema.parse(req.body);
      const business = await storage.createBusiness(validatedData);
      res.json(business);
    } catch (error) {
      console.error("Error creating business:", error);
      res.status(500).json({ message: "Failed to create business" });
    }
  });

  // Business verification API (for external business partners)
  app.post('/api/verify', async (req, res) => {
    try {
      const { chittyIdCode, requestType, apiKey } = req.body;
      
      if (!apiKey) {
        return res.status(401).json({ message: "API key required" });
      }

      const business = await storage.getBusinessByApiKey(apiKey);
      if (!business) {
        return res.status(401).json({ message: "Invalid API key" });
      }

      const chittyId = await storage.getChittyIdByCode(chittyIdCode);
      if (!chittyId) {
        return res.status(404).json({ message: "ChittyID not found" });
      }

      // Create verification request
      const verificationRequest = await storage.createVerificationRequest({
        businessId: business.id,
        chittyId: chittyId.id,
        requestType,
        trustScoreAtRequest: chittyId.trustScore,
      });

      // Check if ChittyID meets business trust threshold
      const chittyTrustScore = chittyId.trustScore || 0;
      const businessThreshold = business.trustThreshold || 500;
      const approved = chittyTrustScore >= businessThreshold && 
                      chittyId.verificationStatus === 'verified';

      const responseData = {
        approved,
        trustScore: chittyId.trustScore,
        trustLevel: chittyId.trustLevel,
        verificationStatus: chittyId.verificationStatus,
        message: approved ? "Verification approved" : "Trust threshold not met",
      };

      await storage.updateVerificationRequestStatus(
        verificationRequest.id,
        approved ? 'approved' : 'rejected',
        responseData
      );

      res.json(responseData);
    } catch (error) {
      console.error("Error processing verification:", error);
      res.status(500).json({ message: "Failed to process verification" });
    }
  });

  // Dashboard stats
  app.get('/api/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const chittyId = await storage.getChittyIdByUserId(userId);
      
      const stats = {
        trustScore: chittyId?.trustScore || 0,
        trustLevel: chittyId?.trustLevel || 'L0',
        verificationStatus: chittyId?.verificationStatus || 'pending',
        verificationCount: chittyId ? (await storage.getVerificationsByChittyId(chittyId.id)).length : 0,
        businessPartners: (await storage.getAllBusinesses()).length,
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
