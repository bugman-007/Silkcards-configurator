/**
 * Proofer Payload Types
 * 
 * Data structures for exporting proofer configuration
 */

import { PrintLayerConfig } from './printLayers.js';

/**
 * Proofer Export Payload
 * 
 * Complete configuration payload for export
 */
export interface ProoferPayload {
  // Metadata
  version: string;
  timestamp: string;
  
  // Card dimensions
  dimensions: {
    width: number; // mm
    height: number; // mm
    thickness: number; // mm
    cornerRadius: number; // mm
  };
  
  // Print layer configuration
  layers: PrintLayerConfig;
  
  // Additional metadata
  metadata?: {
    [key: string]: any;
  };
}

