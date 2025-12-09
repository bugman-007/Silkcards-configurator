/**
 * Lighting Controller
 * 
 * Manages lighting presets for different view modes.
 * Lighting changes only occur when user explicitly switches view mode.
 * Does NOT automatically react to foil/UV/emboss selections.
 * 
 * All presets use neutral white lights and only adjust intensity.
 * HDR environment and ACES tone mapping remain unchanged.
 */

import * as THREE from 'three';

export type LightingPreset = 
  | 'NeutralProof'      // Default - neutral lighting for accurate color proofing
  | 'ShowcasePreview'   // Enhanced lighting for product showcase
  | 'FoilInspect'       // Optimized for foil inspection
  | 'UVInspect'         // Optimized for UV gloss inspection
  | 'EmbossInspect';    // Optimized for emboss/deboss inspection

/**
 * Lighting intensity configuration for each preset
 */
interface LightingPresetConfig {
  ambient: number;
  key: number;
  fill: number;
  rim: number;
}

/**
 * Lighting Controller
 * 
 * Manages directional and ambient lights with preset intensity configurations.
 * Lights are created once and only their intensities are adjusted.
 */
export class LightingController {
  private scene: THREE.Scene;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  
  private currentPreset: LightingPreset = 'NeutralProof';

  /**
   * Preset intensity configurations
   * All lights remain white (0xffffff) - only intensity changes
   */
  private readonly presets: Record<LightingPreset, LightingPresetConfig> = {
    NeutralProof: {
      ambient: 0.25,  // Subtle base fill
      key: 0.8,       // Balanced main light
      fill: 0.4,      // Soft fill
      rim: 0.6        // Edge definition
    },
    ShowcasePreview: {
      ambient: 0.3,   // Slightly brighter base
      key: 1.0,       // Stronger main light
      fill: 0.5,      // More fill light
      rim: 0.8        // Enhanced rim
    },
    FoilInspect: {
      ambient: 0.2,   // Lower ambient for contrast
      key: 1.2,       // Stronger key for metallic reflection
      fill: 0.3,      // Reduced fill
      rim: 0.9        // Strong rim for edge highlights
    },
    UVInspect: {
      ambient: 0.25,  // Standard ambient
      key: 0.9,       // Good key light
      fill: 0.45,     // Balanced fill
      rim: 1.0        // Strong rim for gloss inspection
    },
    EmbossInspect: {
      ambient: 0.2,   // Lower ambient for depth
      key: 1.1,       // Strong key for shadow definition
      fill: 0.35,     // Moderate fill
      rim: 0.7        // Good rim for edge visibility
    }
  };

  /**
   * Constructor
   * Creates all lights and adds them to the scene
   * 
   * @param scene - Three.js scene to add lights to
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializeLights();
    this.setLightingPreset('NeutralProof'); // Set default preset
  }

  /**
   * Initialize all lights with default positions
   * Lights are created once and only intensities change
   */
  private initializeLights(): void {
    // Ambient light - base fill illumination
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambientLight);

    // Key light - main directional light
    // Positioned to reveal card edges and thickness
    this.keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.keyLight.position.set(60, 70, 60);
    this.scene.add(this.keyLight);

    // Fill light - softens contrast from key light
    // Positioned opposite key light
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    this.fillLight.position.set(-40, 40, -30);
    this.scene.add(this.fillLight);

    // Rim light - enhances silhouette and edge clarity
    // Positioned behind and above
    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.rimLight.position.set(-50, 50, -70);
    this.scene.add(this.rimLight);
  }

  /**
   * Set lighting preset
   * Only adjusts light intensities - colors, positions, and HDR remain unchanged
   * 
   * @param presetName - Name of the preset to apply
   */
  setLightingPreset(presetName: LightingPreset): void {
    const config = this.presets[presetName];
    if (!config) {
      console.warn(`Unknown lighting preset: ${presetName}, using NeutralProof`);
      this.setLightingPreset('NeutralProof');
      return;
    }

    // Update light intensities only
    this.ambientLight.intensity = config.ambient;
    this.keyLight.intensity = config.key;
    this.fillLight.intensity = config.fill;
    this.rimLight.intensity = config.rim;

    this.currentPreset = presetName;
    console.log(`Lighting preset changed to: ${presetName}`);
  }

  /**
   * Get current lighting preset
   */
  getCurrentPreset(): LightingPreset {
    return this.currentPreset;
  }

  /**
   * Get all available preset names
   */
  getAvailablePresets(): LightingPreset[] {
    return Object.keys(this.presets) as LightingPreset[];
  }

  /**
   * Get light references (for EngineController's getLightingInfo)
   */
  getKeyLight(): THREE.DirectionalLight {
    return this.keyLight;
  }

  getFillLight(): THREE.DirectionalLight {
    return this.fillLight;
  }

  getRimLight(): THREE.DirectionalLight {
    return this.rimLight;
  }

  getAmbientLight(): THREE.AmbientLight {
    return this.ambientLight;
  }

  /**
   * Dispose of lights
   */
  dispose(): void {
    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight.dispose();
    }
    if (this.keyLight) {
      this.scene.remove(this.keyLight);
      this.keyLight.dispose();
    }
    if (this.fillLight) {
      this.scene.remove(this.fillLight);
      this.fillLight.dispose();
    }
    if (this.rimLight) {
      this.scene.remove(this.rimLight);
      this.rimLight.dispose();
    }
  }
}

