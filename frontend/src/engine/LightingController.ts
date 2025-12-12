/**
 * Lighting Controller
 * 
 * Manages lighting for Neutral Proof mode only.
 * Simple, consistent lighting for configurator preview.
 */

import * as THREE from 'three';

/**
 * Lighting Controller
 * 
 * Manages directional and ambient lights with Neutral Proof configuration.
 */
export class LightingController {
  private scene: THREE.Scene;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  /**
   * Neutral Proof lighting configuration
   */
  private readonly neutralProofConfig = {
    ambient: 0.25,
    key: 0.8,
    fill: 0.4,
    rim: 0.6
  };

  /**
   * Constructor
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializeLights();
  }

  /**
   * Initialize all lights with Neutral Proof configuration
   */
  private initializeLights(): void {
    // Ambient light
    this.ambientLight = new THREE.AmbientLight(0xffffff, this.neutralProofConfig.ambient);
    this.scene.add(this.ambientLight);

    // Key light
    this.keyLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.key);
    this.keyLight.position.set(60, 70, 60);
    this.scene.add(this.keyLight);

    // Fill light
    this.fillLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.fill);
    this.fillLight.position.set(-40, 40, -30);
    this.scene.add(this.fillLight);

    // Rim light
    this.rimLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.rim);
    this.rimLight.position.set(-50, 50, -70);
    this.scene.add(this.rimLight);
  }

  /**
   * Get light references
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
