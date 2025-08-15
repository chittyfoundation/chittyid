import express, { type Express, type RequestHandler } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

const scryptAsync = promisify(scrypt);

// ChittyAuth Configuration
interface ChittyAuthConfig {
  sessionSecret: string;
  sessionTtl: number;
  dbUrl: string;
}

interface ChittyUser {
  id: string;
  email: string;
  chittyId?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  trustScore?: number;
  isVerified?: boolean;
  createdAt: Date;
}

declare global {
  namespace Express {
    interface User extends ChittyUser {}
  }
}

// Password hashing utilities
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

// Session configuration
function getSessionConfig(config: ChittyAuthConfig) {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: config.dbUrl,
    createTableIfMissing: false,
    ttl: config.sessionTtl,
    tableName: "sessions",
  });

  return session({
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: config.sessionTtl,
    },
  });
}

// ChittyAuth setup
export function setupChittyAuth(app: Express) {
  const config: ChittyAuthConfig = {
    sessionSecret: process.env.SESSION_SECRET || "chittyid-secret-key",
    sessionTtl: 7 * 24 * 60 * 60 * 1000, // 1 week
    dbUrl: process.env.CHITTYID_DB_URL || process.env.DATABASE_URL!,
  };

  // Set up session middleware
  app.set("trust proxy", 1);
  app.use(getSessionConfig(config));

  // Registration endpoint
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user with ChittyID
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      });

      // Set session
      (req.session as any).userId = user.id;
      (req.session as any).user = user;

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          chittyId: user.chittyId,
          firstName: user.firstName,
          lastName: user.lastName,
          trustScore: user.trustScore,
          isVerified: user.isVerified,
        }
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Verify password
      const isValidPassword = await comparePasswords(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Set session
      (req.session as any).userId = user.id;
      (req.session as any).user = user;

      res.json({
        user: {
          id: user.id,
          email: user.email,
          chittyId: user.chittyId,
          firstName: user.firstName,
          lastName: user.lastName,
          trustScore: user.trustScore,
          isVerified: user.isVerified,
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Get current user endpoint
  app.get("/api/auth/user", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          chittyId: user.chittyId,
          firstName: user.firstName,
          lastName: user.lastName,
          trustScore: user.trustScore,
          isVerified: user.isVerified,
        }
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(401).json({ message: "Unauthorized" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  // ChittyID verification endpoint
  app.post("/api/auth/verify-chittyid", async (req, res) => {
    try {
      const { chittyId } = req.body;
      const userId = (req.session as any)?.userId;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify ChittyID exists and is valid
      const isValid = await storage.verifyChittyId(chittyId);
      if (!isValid) {
        return res.status(400).json({ message: "Invalid ChittyID" });
      }

      // Update user verification status
      await storage.updateUserVerification(userId, true);
      
      res.json({ message: "ChittyID verified successfully" });
    } catch (error) {
      console.error("ChittyID verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });
}

// Authentication middleware
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ message: "Unauthorized" });
  }
};

// Optional authentication middleware (doesn't fail if not authenticated)
export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req.session as any)?.userId;
    if (userId) {
      const user = await storage.getUserById(userId);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next();
  }
};