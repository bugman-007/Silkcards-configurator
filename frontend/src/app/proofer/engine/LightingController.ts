/**
 * Lighting Controller - Proofer
 * 
 * Manages lighting for Neutral Proof mode only.
 * Simple, consistent lighting for print-accurate proofer.
 */

import * as THREE from 'three';

/**
 * Lighting Controller
 * 
 * Manages directional and ambient lights with Neutral Proof configuration.
 */
export class LightingController {
  private scene: THREE.Scene;
  private keyLight!: THREE.DirectionalLight;

  // NEW: back-side key light (always active)
  private backKeyLight!: THREE.DirectionalLight;

  private fillLight!: THREE.DirectionalLight;
  private backFillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private backRimLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;

  private readonly neutralProofConfig = {
    ambient: 0.65,
    key: 0.8,
    backKey: 0.8, // NEW
    fill: 0.4,
    backFill: 0.4,
    rim: 0.6,
    backRim: 0.6
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

    // Key light (front)
    this.keyLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.key);
    this.keyLight.position.set(60, 70, 60);
    this.scene.add(this.keyLight);

    // NEW: Key light (back)
    this.backKeyLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.backKey);
    this.backKeyLight.position.set(60, 70, -60);
    this.scene.add(this.backKeyLight);

    // Fill light
    this.fillLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.fill);
    this.fillLight.position.set(-40, 40, -30);
    this.scene.add(this.fillLight);

    // Back Fill light
    this.backFillLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.backFill);
    this.backFillLight.position.set(-40, 40, 30);
    this.scene.add(this.backFillLight);

    // Rim light
    this.rimLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.rim);
    this.rimLight.position.set(-50, 50, -70);
    this.scene.add(this.rimLight);

    // Back Rim light
    this.backRimLight = new THREE.DirectionalLight(0xffffff, this.neutralProofConfig.backRim);
    this.backRimLight.position.set(-50, 50, 70);
    this.scene.add(this.backRimLight);
  }

  /**
   * Get light references
   */
  getKeyLight(): THREE.DirectionalLight {
    return this.keyLight;
  }

  getBackKeyLight(): THREE.DirectionalLight {
    return this.backKeyLight;
  }

  getFillLight(): THREE.DirectionalLight {
    return this.fillLight;
  }

  getBackFillLight(): THREE.DirectionalLight {
    return this.backFillLight;
  }

  getRimLight(): THREE.DirectionalLight {
    return this.rimLight;
  }

  getBackRimLight(): THREE.DirectionalLight {
    return this.backRimLight;
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
    if (this.backKeyLight) {
      this.scene.remove(this.backKeyLight);
      this.backKeyLight.dispose();
    }
    if (this.backFillLight) {
      this.scene.remove(this.backFillLight);
      this.backFillLight.dispose();
    }
    if (this.fillLight) {
      this.scene.remove(this.fillLight);
      this.fillLight.dispose();
    }
    if (this.backRimLight) {
      this.scene.remove(this.backRimLight);
      this.backRimLight.dispose();
    }
    if (this.rimLight) {
      this.scene.remove(this.rimLight);
      this.rimLight.dispose();
    }
  }
}
