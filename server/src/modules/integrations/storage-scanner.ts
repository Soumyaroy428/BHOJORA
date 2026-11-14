import { createHash } from 'crypto';
import type { StorageScanResultDto } from '@bhojora/shared';

export interface ScanFileInput {
  fileName: string;
  buffer: Buffer;
  declaredMimeType: string;
  maxSizeBytes?: number;
}

export class StorageScannerService {
  private readonly defaultMaxBytes = 10 * 1024 * 1024; // 10MB

  public scanFile(input: ScanFileInput): StorageScanResultDto {
    const { fileName, buffer, declaredMimeType } = input;
    const maxBytes = input.maxSizeBytes ?? this.defaultMaxBytes;
    const size = buffer.length;
    const now = new Date().toISOString();
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // 1. Size bounds
    if (size === 0) {
      return {
        fileName,
        fileSizeBytes: 0,
        detectedMimeType: 'application/x-empty',
        declaredMimeType,
        sha256Checksum: sha256,
        isSafe: false,
        rejectionReason: 'File is empty (0 bytes)',
        scannedAt: now,
      };
    }

    if (size > maxBytes) {
      return {
        fileName,
        fileSizeBytes: size,
        detectedMimeType: declaredMimeType,
        declaredMimeType,
        sha256Checksum: sha256,
        isSafe: false,
        rejectionReason: `File size (${size} bytes) exceeds limit of ${maxBytes} bytes`,
        scannedAt: now,
      };
    }

    // 2. Malware and executable signature checks
    // Windows PE executable (MZ)
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return {
        fileName,
        fileSizeBytes: size,
        detectedMimeType: 'application/x-msdownload',
        declaredMimeType,
        sha256Checksum: sha256,
        isSafe: false,
        rejectionReason: 'Executable binary signature (MZ PE) detected. Upload prohibited.',
        scannedAt: now,
      };
    }

    // Linux ELF binary
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      return {
        fileName,
        fileSizeBytes: size,
        detectedMimeType: 'application/x-executable',
        declaredMimeType,
        sha256Checksum: sha256,
        isSafe: false,
        rejectionReason: 'Linux ELF binary signature detected. Upload prohibited.',
        scannedAt: now,
      };
    }

    // Disguised script payloads (XSS/PHP in documents)
    const headerSlice = buffer.subarray(0, 1024).toString('utf-8').toLowerCase();
    if (
      headerSlice.includes('<script') ||
      headerSlice.includes('javascript:') ||
      headerSlice.includes('<?php')
    ) {
      return {
        fileName,
        fileSizeBytes: size,
        detectedMimeType: 'text/html',
        declaredMimeType,
        sha256Checksum: sha256,
        isSafe: false,
        rejectionReason: 'Active script or executable tags embedded in file header.',
        scannedAt: now,
      };
    }

    // 3. Magic byte detection
    let detectedMime = 'application/octet-stream';

    // JPEG: FF D8 FF
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      detectedMime = 'image/jpeg';
    }
    // PNG: 89 50 4E 47
    else if (
      buffer.length >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      detectedMime = 'image/png';
    }
    // PDF: %PDF (25 50 44 46)
    else if (
      buffer.length >= 4 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      detectedMime = 'application/pdf';
    }
    // WebP: RIFF ... WEBP
    else if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      detectedMime = 'image/webp';
    }

    // Validate MIME match
    const isMimeCompatible =
      detectedMime === declaredMimeType ||
      (detectedMime.startsWith('image/') && declaredMimeType.startsWith('image/'));

    if (!isMimeCompatible && detectedMime === 'application/octet-stream') {
      return {
        fileName,
        fileSizeBytes: size,
        detectedMimeType: detectedMime,
        declaredMimeType,
        sha256Checksum: sha256,
        isSafe: false,
        rejectionReason: `Declared type '${declaredMimeType}' does not match unknown binary payload format`,
        scannedAt: now,
      };
    }

    return {
      fileName,
      fileSizeBytes: size,
      detectedMimeType: detectedMime,
      declaredMimeType,
      sha256Checksum: sha256,
      isSafe: true,
      scannedAt: now,
    };
  }
}
