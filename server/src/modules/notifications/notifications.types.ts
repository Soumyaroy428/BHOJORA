import { z } from 'zod';
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationStatus,
  NotificationTemplateKey,
  UserNotificationPreferencesDto,
  NotificationRecordDto,
} from '@bhojora/shared';

export interface NotificationRecord {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  templateKey: NotificationTemplateKey;
  recipient: string;
  title: string;
  body: string;
  status: NotificationStatus;
  attemptCount: number;
  maxAttempts: number;
  isRead: boolean;
  failureReason: string | null;
  providerMessageId: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  deliveredAt: Date | null;
  lastAttemptAt: Date | null;
}

export interface NotificationPreferencesRecord {
  userId: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  promotionalOptOut: boolean;
  language: 'en-IN' | 'bn-IN';
  updatedAt: Date;
}

/**
 * PII and Sensitive Data Sanitizer
 * Ensures no credit cards, CVVs, passwords, auth tokens, or bank accounts leak into notification bodies.
 */
export function sanitizeNotificationContent(rawText: string): string {
  if (!rawText) return '';

  return (
    rawText
      // Mask credit/debit card numbers (13-19 digits with optional hyphens/spaces)
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
        const digits = match.replace(/\D/g, '');
        if (digits.length >= 13 && digits.length <= 19) {
          return `****-****-****-${digits.slice(-4)}`;
        }
        return match;
      })
      // Mask CVV / CVC (e.g. CVV: 123)
      .replace(/(?:cvv|cvc|security\s*code)[:\s=]+(\d{3,4})\b/gi, 'CVV: ***')
      // Mask bearer tokens, JWTs, and passwords
      .replace(/(?:bearer\s+(?:token\s+)?)[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/\beyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.?[A-Za-z0-9-_.+/=]*\b/g, '[REDACTED_JWT]')
      .replace(/(?:password|passwd|secret)[:\s=]+([^\s,;]+)/gi, 'password: [REDACTED]')
      // Mask Indian Aadhaar numbers (12 digits)
      .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, 'XXXX-XXXX-[MASKED]')
      // Mask Bank account numbers (>8 consecutive digits labelled account)
      .replace(/(?:ac(?:count)?\s*(?:no|number)?[:\s=]+)(\d{8,18})/gi, 'Account: [REDACTED_AC]')
  );
}

/**
 * Multilingual Templates Catalogue (en-IN and bn-IN)
 */
export interface TemplateDefinition {
  title: Record<'en-IN' | 'bn-IN', string>;
  body: Record<'en-IN' | 'bn-IN', string>;
}

export const NOTIFICATION_TEMPLATES: Record<NotificationTemplateKey, TemplateDefinition> = {
  ORDER_CONFIRMED: {
    title: {
      'en-IN': 'Order Confirmed! — Bhojora',
      'bn-IN': 'অর্ডার নিশ্চিত হয়েছে! — ভোজোরা',
    },
    body: {
      'en-IN':
        'Your order #{orderRef} at {outletName} is confirmed! Estimated preparation: {etaMinutes} mins.',
      'bn-IN':
        'আপনার অর্ডার #{orderRef} ({outletName}) নিশ্চিত করা হয়েছে! রান্নার আনুমানিক সময়: {etaMinutes} মিনিট।',
    },
  },
  ORDER_DISPATCHED: {
    title: {
      'en-IN': 'Order On The Way! — Bhojora',
      'bn-IN': 'খাবার পথে রয়েছে! — ভোজোরা',
    },
    body: {
      'en-IN':
        'Delivery partner {partnerName} is on the way with your order #{orderRef}. Track live on Bhojora.',
      'bn-IN':
        'ডেলিভারি পার্টনার {partnerName} আপনার অর্ডার #{orderRef} নিয়ে বের হয়েছেন। লাইভ ট্র্যাকিং দেখুন ভোজোরা অ্যাপে।',
    },
  },
  DELIVERY_OTP: {
    title: {
      'en-IN': 'Bhojora Delivery OTP',
      'bn-IN': 'ভোজোরা ডেলিভারি ওটিপি',
    },
    body: {
      'en-IN':
        'Your delivery handover OTP is {otp} for order #{orderRef}. Share this with the delivery partner upon arrival. Never share your password or payment PIN.',
      'bn-IN':
        'আপনার ভোজোরা ডেলিভারি ওটিপি হলো {otp} (অর্ডার #{orderRef})। খাবার গ্রহণের সময় ডেলিভারি পার্টনারকে এই কোডটি দিন। পাসওয়ার্ড বা পিন কাউকে দেবেন না।',
    },
  },
  ORDER_DELIVERED: {
    title: {
      'en-IN': 'Order Delivered — Bhojora',
      'bn-IN': 'খাবার পৌঁছে গেছে — ভোজোরা',
    },
    body: {
      'en-IN':
        'Order #{orderRef} was delivered safely. Enjoy your authentic meal! Please rate your dining experience.',
      'bn-IN':
        'অর্ডার #{orderRef} সফলভাবে ডেলিভারি হয়েছে। ভোজোরার সুস্বাদু খাবারের আনন্দ নিন! আপনার অভিজ্ঞতা শেয়ার করুন।',
    },
  },
  ORDER_CANCELLED: {
    title: {
      'en-IN': 'Order Cancelled — Bhojora',
      'bn-IN': 'অর্ডার বাতিল হয়েছে — ভোজোরা',
    },
    body: {
      'en-IN':
        'Order #{orderRef} has been cancelled. Any deducted amount will be refunded within 2-4 business days. Reason: {reason}.',
      'bn-IN':
        'অর্ডার #{orderRef} বাতিল করা হয়েছে। অর্থপ্রদান করা থাকলে তা ২-৪ কার্যদিবসের মধ্যে রিফান্ড করা হবে। কারণ: {reason}।',
    },
  },
  REFUND_CREDITED: {
    title: {
      'en-IN': 'Refund Processed — Bhojora',
      'bn-IN': 'রিফান্ড সম্পন্ন হয়েছে — ভোজোরা',
    },
    body: {
      'en-IN':
        'Refund of ₹{amount} for order #{orderRef} has been credited to your original payment method. Ref: {refundRef}.',
      'bn-IN':
        'অর্ডার #{orderRef}-এর জন্য ₹{amount} রিফান্ড আপনার মূল পেমেন্ট মাধ্যমে পাঠানো হয়েছে। রেফারেন্স: {refundRef}।',
    },
  },
  INSPECTION_COMPLETED: {
    title: {
      'en-IN': 'Hygiene Inspection Published — Bhojora',
      'bn-IN': 'স্বচ্ছ রান্নাঘর পরিদর্শন রিপোর্ট — ভোজোরা',
    },
    body: {
      'en-IN':
        'A new hygiene inspection report has been published for {outletName}. Verified clean trust score: {score}/100.',
      'bn-IN':
        '{outletName}-এর নতুন রান্নাঘর পরিদর্শন রিপোর্ট প্রকাশিত হয়েছে। যাচাইকৃত স্বচ্ছ স্কোর: {score}/১০০।',
    },
  },
  OUTLET_SUSPENDED: {
    title: {
      'en-IN': 'Safety Notice: Outlet Operations Suspended',
      'bn-IN': 'নিরাপত্তা বিজ্ঞপ্তি: আউটলেট স্থগিত করা হয়েছে',
    },
    body: {
      'en-IN':
        'Operational alert: {outletName} has been temporarily suspended due to hygiene review standards.',
      'bn-IN':
        'জরুরি নোটিশ: স্বাস্থ্যবিধি মূল্যায়নের কারণে {outletName}-এর কার্যক্রম সাময়িকভাবে স্থগিত করা হয়েছে।',
    },
  },
  DELIVERY_JOB_OFFER: {
    title: {
      'en-IN': 'New Delivery Job Available! — Bhojora Fleet',
      'bn-IN': 'নতুন ডেলিভারি অফার! — ভোজোরা রাইডার',
    },
    body: {
      'en-IN':
        'New order pickup at {outletLocality}. Payout: ₹{payout}. Distance: {distanceKm} km. Accept within 45s.',
      'bn-IN':
        '{outletLocality} থেকে নতুন ডেলিভারি পিকআপ। আয়: ₹{payout}। দূরত্ব: {distanceKm} কিমি। ৪৫ সেকেন্ডের মধ্যে গ্রহণ করুন।',
    },
  },
  PROMOTIONAL_OFFER: {
    title: {
      'en-IN': 'Special Kolkata Feast Offer! — Bhojora',
      'bn-IN': 'ভোজোরার বিশেষ কলকাতা ভোজ অফার!',
    },
    body: {
      'en-IN':
        'Feast on Kolkata favorites! Enjoy {discountPercent}% off on your next order with code {promoCode}. Valid in {zoneName}.',
      'bn-IN':
        'কলকাতার সেরা খাবারের আনন্দ নিন! {promoCode} কোড ব্যবহার করে পান {discountPercent}% ছাড় ({zoneName} জোনে প্রযোজ্য)।',
    },
  },
};

export function renderTemplate(
  templateKey: NotificationTemplateKey,
  language: 'en-IN' | 'bn-IN',
  variables: Record<string, string | number>,
): { title: string; body: string } {
  const tpl = NOTIFICATION_TEMPLATES[templateKey];
  if (!tpl) {
    throw new Error(`Unknown notification template key: ${templateKey}`);
  }

  const rawTitle = tpl.title[language] || tpl.title['en-IN'];
  let rawBody = tpl.body[language] || tpl.body['en-IN'];

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    rawBody = rawBody.split(placeholder).join(String(value));
  }

  return {
    title: sanitizeNotificationContent(rawTitle),
    body: sanitizeNotificationContent(rawBody),
  };
}

// Zod Validation Schemas
export const dispatchNotificationSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  channels: z
    .array(z.enum(['SMS', 'EMAIL', 'PUSH', 'IN_APP']))
    .min(1, 'At least one channel is required'),
  category: z.enum(['TRANSACTIONAL', 'MARKETING', 'OPERATIONAL', 'SAFETY']),
  templateKey: z.enum([
    'ORDER_CONFIRMED',
    'ORDER_DISPATCHED',
    'DELIVERY_OTP',
    'ORDER_DELIVERED',
    'ORDER_CANCELLED',
    'REFUND_CREDITED',
    'INSPECTION_COMPLETED',
    'OUTLET_SUSPENDED',
    'DELIVERY_JOB_OFFER',
    'PROMOTIONAL_OFFER',
  ]),
  templateVariables: z.record(z.string(), z.union([z.string(), z.number()])),
  recipientEmail: z.string().email().optional(),
  recipientPhone: z.string().min(10).optional(),
  devicePushToken: z.string().min(8).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateNotificationPreferencesSchema = z.object({
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  promotionalOptOut: z.boolean().optional(),
  language: z.enum(['en-IN', 'bn-IN']).optional(),
});

export const notificationOptOutSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  reason: z.string().max(300).optional(),
});

export const deliveryLogQuerySchema = z.object({
  channel: z.enum(['SMS', 'EMAIL', 'PUSH', 'IN_APP']).optional(),
  category: z.enum(['TRANSACTIONAL', 'MARKETING', 'OPERATIONAL', 'SAFETY']).optional(),
  status: z
    .enum([
      'PENDING',
      'DISPATCHING',
      'DELIVERED',
      'FAILED',
      'RETRYING',
      'SUPPRESSED_OPT_OUT',
      'DEAD_LETTER',
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function toNotificationRecordDto(record: NotificationRecord): NotificationRecordDto {
  return {
    notificationId: record.notificationId,
    userId: record.userId,
    channel: record.channel,
    category: record.category,
    templateKey: record.templateKey,
    recipient: record.recipient,
    title: record.title,
    body: record.body,
    status: record.status,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    isRead: record.isRead,
    failureReason: record.failureReason,
    providerMessageId: record.providerMessageId,
    idempotencyKey: record.idempotencyKey,
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
    deliveredAt: record.deliveredAt ? record.deliveredAt.toISOString() : null,
  };
}

export function toUserNotificationPreferencesDto(
  record: NotificationPreferencesRecord,
): UserNotificationPreferencesDto {
  return {
    userId: record.userId,
    smsEnabled: record.smsEnabled,
    emailEnabled: record.emailEnabled,
    pushEnabled: record.pushEnabled,
    inAppEnabled: record.inAppEnabled,
    promotionalOptOut: record.promotionalOptOut,
    language: record.language,
    updatedAt: record.updatedAt.toISOString(),
  };
}
