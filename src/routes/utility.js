/**
 * Utility Routes
 *
 * Provides utility endpoints for the application.
 */

import { Router } from 'express';
import QRCode from 'qrcode';

const router = Router();

/**
 * GET /api/utility/qr/:type/:data
 * Generate a QR code image for the provided data
 *
 * Supported types:
 *   - url: Encode a URL (data must start with http:// or https://)
 *
 * Special data values:
 *   - BLANK_PLACEHOLDER: Returns a transparent 1x1 PNG (for layout stability)
 *
 * The :data parameter should be a URL-encoded string
 * Returns a PNG image of the QR code
 *
 * Query params:
 *   - size: QR code size in pixels (default: 200, max: 1000)
 *   - margin: Margin around QR code in modules (default: 2)
 *   - dark: Dark color in hex (default: 000000)
 *   - light: Light color in hex (default: ffffff)
 */
router.get('/qr/:type/:data', async (req, res) => {
  try {
    const { type, data: encodedData } = req.params;
    const data = decodeURIComponent(encodedData);

    // Parse size early for placeholder
    const size = Math.min(Math.max(parseInt(req.query.size) || 200, 50), 1000);

    // Special case: BLANK_PLACEHOLDER returns a transparent PNG
    // This avoids layout jolt when the actual QR code loads
    if (data === 'BLANK_PLACEHOLDER') {
      // Minimal 1x1 transparent PNG (browser will scale to size via CSS)
      // This is a valid PNG with a single transparent pixel
      const transparentPng = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, // IHDR length
        0x49, 0x48, 0x44, 0x52, // IHDR
        0x00, 0x00, 0x00, 0x01, // width: 1
        0x00, 0x00, 0x00, 0x01, // height: 1
        0x08, 0x06,             // bit depth: 8, color type: RGBA
        0x00, 0x00, 0x00,       // compression, filter, interlace
        0x1F, 0x15, 0xC4, 0x89, // IHDR CRC
        0x00, 0x00, 0x00, 0x0A, // IDAT length
        0x49, 0x44, 0x41, 0x54, // IDAT
        0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
        0x0D, 0x0A, 0x2D, 0xB4, // IDAT CRC
        0x00, 0x00, 0x00, 0x00, // IEND length
        0x49, 0x45, 0x4E, 0x44, // IEND
        0xAE, 0x42, 0x60, 0x82  // IEND CRC
      ]);

      res.set({
        'Content-Type': 'image/png',
        'Content-Length': transparentPng.length,
        'Cache-Control': 'public, max-age=86400'
      });
      return res.send(transparentPng);
    }

    // Validate type
    if (type !== 'url') {
      return res.status(400).json({
        error: `Unsupported QR type: ${type}. Supported types: url`
      });
    }

    // Validate URL format
    if (!data.startsWith('http://') && !data.startsWith('https://')) {
      return res.status(400).json({
        error: 'Invalid data: URL must start with http:// or https://'
      });
    }
    const margin = Math.min(Math.max(parseInt(req.query.margin) || 2, 0), 10);
    const dark = req.query.dark ? `#${req.query.dark}` : '#000000';
    const light = req.query.light ? `#${req.query.light}` : '#ffffff';

    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(data, {
      type: 'png',
      width: size,
      margin: margin,
      color: {
        dark: dark,
        light: light
      },
      errorCorrectionLevel: 'M'
    });

    // Set response headers and send image
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': qrBuffer.length,
      'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
    });

    res.send(qrBuffer);

  } catch (err) {
    console.error('Error generating QR code:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

export default router;
