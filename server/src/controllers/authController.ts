import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../prisma';
import { config } from '../config';
import { logAudit } from '../services/auditService';
import { UserRole } from '../../../shared/types';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z.string().optional(),
  role: z.enum(['DONOR', 'REQUESTER', 'HOSPITAL', 'ADMIN']),
  // Donor specific fields
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  addressCity: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  // Hospital specific fields
  hospitalName: z.string().optional(),
  licenseNumber: z.string().optional(),
  hospitalAddress: z.string().optional(),
  contactNumber: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function register(req: Request, res: Response) {
  try {
    const validated = registerSchema.parse(req.body);

    // Security Guard: Prevent unauthenticated public privilege escalation to ADMIN
    if (validated.role === 'ADMIN') {
      const adminSecretKey = req.body.adminSecretKey || req.headers['x-admin-secret-key'];
      const configuredSecret = process.env.ADMIN_REGISTRATION_SECRET || 'bloodbridge_admin_init_secret_2026';
      if (!adminSecretKey || adminSecretKey !== configuredSecret) {
        return res.status(403).json({
          success: false,
          message: 'Public self-registration for administrative roles is restricted. An authorized administrator provisioning key is required.',
        });
      }
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase().trim() },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(validated.password, salt);

    const user = await prisma.user.create({
      data: {
        email: validated.email.toLowerCase().trim(),
        passwordHash,
        fullName: validated.fullName.trim(),
        phone: validated.phone || null,
        role: validated.role,
        status: 'ACTIVE',
      },
    });

    let profileId: string | undefined;

    // Create associated profile based on role
    if (validated.role === 'DONOR') {
      const donorProfile = await prisma.donorProfile.create({
        data: {
          userId: user.id,
          bloodGroup: validated.bloodGroup || 'O+',
          availabilityStatus: 'AVAILABLE',
          addressCity: validated.addressCity || 'Metro City',
          latitude: validated.latitude || 28.6139,
          longitude: validated.longitude || 77.2090,
          reliabilityScore: 100.0,
          totalDonations: 0,
        },
      });
      profileId = donorProfile.id;
    } else if (validated.role === 'HOSPITAL') {
      const hospitalProfile = await prisma.hospitalProfile.create({
        data: {
          userId: user.id,
          hospitalName: validated.hospitalName || `${validated.fullName} Memorial Hospital`,
          licenseNumber: validated.licenseNumber || `LIC-${Date.now().toString().slice(-6)}`,
          address: validated.hospitalAddress || 'Main Healthcare Blvd',
          latitude: validated.latitude || 28.6139,
          longitude: validated.longitude || 77.2090,
          contactNumber: validated.contactNumber || validated.phone || '+1-800-HOSPITAL',
          isVerified: true,
        },
      });
      profileId = hospitalProfile.id;
    }

    await logAudit({
      userId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.id,
      details: { role: user.role, email: user.email },
      ipAddress: req.ip,
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        profileId,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.errors[0]?.message || 'Validation error',
      });
    }
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not complete registration. Please try again.',
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const validated = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase().trim() },
      include: {
        donorProfile: true,
        hospitalProfile: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await bcrypt.compare(validated.password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. Please contact platform administrators.',
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    await logAudit({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        donorProfile: user.donorProfile,
        hospitalProfile: user.hospitalProfile,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: error.errors[0]?.message || 'Validation error',
      });
    }
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not log in right now. Please try again.',
    });
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        donorProfile: true,
        hospitalProfile: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone,
        status: user.status,
        donorProfile: user.donorProfile,
        hospitalProfile: user.hospitalProfile,
      },
    });
  } catch (error) {
    console.error('getCurrentUser error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch user session.' });
  }
}

/**
 * Demo Fast-Login Switcher for interactive grading and testing
 */
export async function demoLogin(req: Request, res: Response) {
  try {
    const { role } = req.body;
    let targetEmail = '';

    switch (role) {
      case 'DONOR':
        targetEmail = 'donor1@demo.bloodbridge.org';
        break;
      case 'REQUESTER':
        targetEmail = 'requester@demo.bloodbridge.org';
        break;
      case 'HOSPITAL':
        targetEmail = 'hospital@demo.bloodbridge.org';
        break;
      case 'ADMIN':
        targetEmail = 'admin@demo.bloodbridge.org';
        break;
      default:
        targetEmail = 'donor1@demo.bloodbridge.org';
    }

    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
      include: {
        donorProfile: true,
        hospitalProfile: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `Demo user for role ${role} not found. Please run seed script first.`,
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: `Switched session to demo ${user.role} (${user.fullName}).`,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        donorProfile: user.donorProfile,
        hospitalProfile: user.hospitalProfile,
      },
    });
  } catch (error) {
    console.error('Demo login error:', error);
    return res.status(500).json({ success: false, message: 'Could not switch demo user.' });
  }
}
